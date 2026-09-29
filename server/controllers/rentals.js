const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');
const { createAuditLog } = require('../middleware/auditLogger');

async function enrichRentals(rentals) {
  if (!rentals || rentals.length === 0) return [];
  const userIds = new Set();
  const listingIds = new Set();
  rentals.forEach(r => {
    if (r.renter_id) userIds.add(r.renter_id);
    if (r.owner_id) userIds.add(r.owner_id);
    if (r.listing_id) listingIds.add(r.listing_id);
  });

  const [userRes, listingRes] = await Promise.all([
    userIds.size > 0 ? supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]) : { data: [] },
    listingIds.size > 0 ? supabase.from('equipment_listings').select('listing_id, equipment_name').in('listing_id', [...listingIds]) : { data: [] },
  ]);

  const userMap = {};
  (userRes.data || []).forEach(u => { userMap[u.id] = getFullName(u); });
  const listingMap = {};
  (listingRes.data || []).forEach(l => { listingMap[l.listing_id] = l.equipment_name; });

  return rentals.map(r => ({
    ...toCamelCase(r),
    renterName: userMap[r.renter_id] || r.renter_id,
    ownerName: userMap[r.owner_id] || r.owner_id,
    listingTitle: listingMap[r.listing_id] || r.listing_id,
    equipmentName: listingMap[r.listing_id] || null,
  }));
}

async function listRentals(req, res) {
  const { page = 1, limit = 20, status, renterId, ownerId, listingId } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('equipment_rentals').select('*', { count: 'exact' });
  if (status) query = query.eq('rental_status', status);
  if (renterId) query = query.eq('renter_id', renterId);
  if (ownerId) query = query.eq('owner_id', ownerId);
  if (listingId) query = query.eq('listing_id', listingId);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichRentals(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getRentalById(req, res) {
  const { data: rental, error } = await supabase
    .from('equipment_rentals')
    .select('*')
    .eq('rental_id', req.params.id)
    .single();

  if (error || !rental) return res.status(404).json({ error: 'Rental not found' });

  const enriched = await enrichRentals([rental]);
  res.json({ data: enriched[0] });
}

async function flagRental(req, res) {
  const { reason } = req.body;
  const rentalId = req.params.id;

  // Try entity_flags (PostgREST cache may not have it)
  let flagged = false;
  const flagInsert = await supabase
    .from('entity_flags')
    .insert({
      entity_type: 'equipment_rental',
      entity_id: rentalId,
      flagged_by: req.user?.id,
      reason: reason || 'Flagged by admin',
    })
    .select()
    .single();

  if (flagInsert.error) {
    // Fallback: use audit log
    await createAuditLog({
      req,
      action: 'flag_rental',
      targetType: 'equipment_rental',
      targetId: rentalId,
      description: `Rental flagged: ${reason || 'Flagged by admin'}`,
    });
  } else {
    flagged = true;
  }

  const { data: rental, error: fetchErr } = await supabase
    .from('equipment_rentals')
    .select('*')
    .eq('rental_id', rentalId)
    .single();

  if (fetchErr || !rental) return res.status(404).json({ error: 'Rental not found' });

  const enriched = await enrichRentals([rental]);
  res.json({ 
    data: enriched[0], 
    message: flagged ? 'Rental flagged' : 'Rental flagged (logged to audit)' 
  });
}

async function removeRental(req, res) {
  const rentalId = req.params.id;

  // Audit log before deletion
  const { data: rental } = await supabase
    .from('equipment_rentals')
    .select('*')
    .eq('rental_id', rentalId)
    .single();

  if (rental) {
    await createAuditLog({
      req,
      action: 'remove_rental',
      targetType: 'equipment_rental',
      targetId: rentalId,
      description: `Rental removed: ${rental.listing_id} by ${rental.renter_id}, total: ${rental.total_price}`,
      metadata: rental,
    });
  }

  const { error } = await supabase
    .from('equipment_rentals')
    .delete()
    .eq('rental_id', rentalId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: 'Rental removed' });
}

module.exports = { listRentals, getRentalById, flagRental, removeRental };