const supabase = require('../db/supabase');
const { toCamelCase, getFullName, calculatePagination, sanitizeSearchTerm, sanitizeEntityFilter, sendError } = require('../utilities/helpers');
const { getArchivedUserIds, applyArchivedOwnerFilter } = require('../utilities/visibility');

async function enrichEquipmentListings(listings) {
  if (!listings || listings.length === 0) return [];
  const userIds = new Set();
  const listingIds = listings.map(l => l.listing_id);
  listings.forEach(l => { if (l.owner_id) userIds.add(l.owner_id); });

  const [userRes, skillsRes, flagRes] = await Promise.all([
    userIds.size > 0 ? supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]) : { data: [] },
    listingIds.length > 0 ? supabase.from('equipment_listing_skills').select('listing_id, skills(skill_name)').in('listing_id', listingIds) : { data: [] },
    listingIds.length > 0
      ? supabase.from('entity_flags').select('entity_id, status').eq('entity_type', 'equipment_listing').in('entity_id', listingIds)
      : { data: [] },
  ]);

  const userMap = {};
  (userRes.data || []).forEach(u => { userMap[u.id] = getFullName(u); });
  const skillsByListing = {};
  (skillsRes.data || []).forEach(es => {
    if (!skillsByListing[es.listing_id]) skillsByListing[es.listing_id] = [];
    if (es.skills?.skill_name) skillsByListing[es.listing_id].push(es.skills.skill_name);
  });
  const openFlagCount = {};
  (flagRes.data || []).forEach(flag => {
    if (flag.status && flag.status !== 'open') return;
    openFlagCount[flag.entity_id] = (openFlagCount[flag.entity_id] || 0) + 1;
  });

  return listings.map(l => ({
    ...toCamelCase(l),
    ownerName: userMap[l.owner_id] || l.owner_id,
    skills: skillsByListing[l.listing_id] || [],
    openFlagCount: openFlagCount[l.listing_id] || 0,
  }));
}

async function listEquipmentListings(req, res) {
  const { page, limit, offset } = calculatePagination(req.query.page, req.query.limit);
  const { status } = req.query;
  const moderationFlagged = status === 'flagged';

  // `ownerId` selects a single owner, so it must be a well-formed identifier
  // rather than a free-text filter fragment.
  const ownerId = sanitizeEntityFilter(req.query.ownerId);
  if (req.query.ownerId && !ownerId) {
    return res.status(400).json({ error: 'Invalid ownerId' });
  }

  // Normalised before it reaches the PostgREST filter expression.
  const search = sanitizeSearchTerm(req.query.search);

  let flaggedListingIds = null;
  if (moderationFlagged) {
    const { data: flaggedRows, error: flaggedErr } = await supabase
      .from('entity_flags')
      .select('entity_id')
      .eq('entity_type', 'equipment_listing')
      .or('status.eq.open,status.is.null');
    if (flaggedErr) return sendError(res, flaggedErr, { status: 500 });
    flaggedListingIds = [...new Set((flaggedRows || []).map(row => row.entity_id).filter(Boolean))];
    if (flaggedListingIds.length === 0) {
      return res.json({
        data: [],
        pagination: { total: 0, page: +page, limit: +limit, totalPages: 0 },
      });
    }
  }

  const runQuery = async (useArchiveMarker) => {
    let query = supabase.from('equipment_listings').select('*', { count: 'exact' });
    if (status && !moderationFlagged) query = query.eq('status', status);
    if (moderationFlagged) query = query.in('listing_id', flaggedListingIds);
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
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required to flag an equipment listing' });
  }

  const listingId = req.params.id;
  const { data: listing, error: listingErr } = await supabase
    .from('equipment_listings')
    .select('listing_id')
    .eq('listing_id', listingId)
    .maybeSingle();
  if (listingErr) return sendError(res, listingErr, { status: 500 });
  if (!listing) return res.status(404).json({ error: 'Equipment listing not found' });

  const { data: existing, error: existingErr } = await supabase
    .from('entity_flags')
    .select('flag_id')
    .eq('entity_type', 'equipment_listing')
    .eq('entity_id', listingId)
    .or('status.eq.open,status.is.null')
    .limit(1);
  if (existingErr) return sendError(res, existingErr, { status: 500 });
  if (existing?.length) {
    return res.status(409).json({ error: 'This equipment listing already has an open flag' });
  }

  const { data: flag, error } = await supabase
    .from('entity_flags')
    .insert({
      entity_type: 'equipment_listing',
      entity_id: listingId,
      flagged_by: req.user?.id || null,
      reason,
      status: 'open',
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });
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
