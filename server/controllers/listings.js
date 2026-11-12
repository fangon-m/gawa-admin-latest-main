const supabase = require('../db/supabase');
const { toCamelCase, getFullName, calculatePagination, sanitizeSearchTerm, sanitizeEntityFilter, sendError } = require('../utilities/helpers');
const { getArchivedUserIds, applyArchivedOwnerFilter } = require('../utilities/visibility');

async function enrichEquipmentListings(listings) {
  if (!listings || listings.length === 0) return [];
  const userIds = new Set();
  const listingIds = listings.map(l => l.listing_id);
  listings.forEach(l => { if (l.owner_id) userIds.add(l.owner_id); });

  const [userRes, skillsRes] = await Promise.all([
    userIds.size > 0 ? supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]) : { data: [] },
    listingIds.length > 0 ? supabase.from('equipment_listing_skills').select('listing_id, skills(skill_name)').in('listing_id', listingIds) : { data: [] },
  ]);

  const userMap = {};
  (userRes.data || []).forEach(u => { userMap[u.id] = getFullName(u); });
  const skillsByListing = {};
  (skillsRes.data || []).forEach(es => {
    if (!skillsByListing[es.listing_id]) skillsByListing[es.listing_id] = [];
    if (es.skills?.skill_name) skillsByListing[es.listing_id].push(es.skills.skill_name);
  });

  return listings.map(l => ({
    ...toCamelCase(l),
    ownerName: userMap[l.owner_id] || l.owner_id,
    skills: skillsByListing[l.listing_id] || [],
  }));
}

async function listEquipmentListings(req, res) {
  const { page, limit, offset } = calculatePagination(req.query.page, req.query.limit);
  const { status } = req.query;

  // `ownerId` selects a single owner, so it must be a well-formed identifier
  // rather than a free-text filter fragment.
  const ownerId = sanitizeEntityFilter(req.query.ownerId);
  if (req.query.ownerId && !ownerId) {
    return res.status(400).json({ error: 'Invalid ownerId' });
  }

  // Normalised before it reaches the PostgREST filter expression.
  const search = sanitizeSearchTerm(req.query.search);

  const runQuery = async (useArchiveMarker) => {
    let query = supabase.from('equipment_listings').select('*', { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (ownerId) query = query.eq('owner_id', ownerId);
    if (search) query = query.or(`equipment_name.ilike.%${search}%,equipment_description.ilike.%${search}%`);
    // Owner-scoped requests (user detail history) must still show archived accounts.
    if (!ownerId) {
      const archivedUserIds = await getArchivedUserIds();
      query = applyArchivedOwnerFilter(query, 'owner_id', archivedUserIds, useArchiveMarker ? 'archived_at' : null);
    }

    return query
      .order('created_at', { ascending: false })
      .range(offset, offset + +limit - 1);
  };

  let { data, error, count } = await runQuery(true);
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    // Older database without the listing archive marker: retry without it.
    ({ data, error, count } = await runQuery(false));
  }

  if (error) return sendError(res, error, { status: 500 });
  res.json({
    data: await enrichEquipmentListings(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getEquipmentListingById(req, res) {
  const { data: listing, error } = await supabase
    .from('equipment_listings')
    .select('*')
    .eq('listing_id', req.params.id)
    .single();

  if (error || !listing) return res.status(404).json({ error: 'Equipment listing not found' });

  const { data: flags } = await supabase
    .from('entity_flags')
    .select('*')
    .eq('entity_type', 'equipment_listing')
    .eq('entity_id', req.params.id)
    .order('created_at', { ascending: false });

  const enriched = await enrichEquipmentListings([listing]);
  res.json({ data: { ...enriched[0], flags: (flags || []).map(f => toCamelCase(f)) } });
}

async function flagEquipmentListing(req, res) {
  const { data: flag, error } = await supabase
    .from('entity_flags')
    .insert({
      entity_type: 'equipment_listing',
      entity_id: req.params.id,
      flagged_by: req.user?.id || null,
      reason: req.body?.reason || 'Flagged by admin',
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });

  await supabase
    .from('equipment_listings')
    .update({ status: 'flagged', updated_at: new Date().toISOString() })
    .eq('listing_id', req.params.id);

  res.json({ data: toCamelCase(flag), message: 'Equipment listing flagged' });
}

async function removeEquipmentListing(req, res) {
  const { error } = await supabase.from('equipment_listings').delete().eq('listing_id', req.params.id);
  if (error) return sendError(res, error, { status: 500 });
  res.json({ message: 'Equipment listing removed' });
}

module.exports = {
  listListings: listEquipmentListings,
  getListingById: getEquipmentListingById,
  flagListing: flagEquipmentListing,
  removeListing: removeEquipmentListing,
};
