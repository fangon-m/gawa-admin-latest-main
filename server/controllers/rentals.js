const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

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
  const { page = 1, limit = 20, status, renterId, ownerId, listingId, depositStatus } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('rentals').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (renterId) query = query.eq('renter_id', renterId);
  if (ownerId) query = query.eq('owner_id', ownerId);
  if (listingId) query = query.eq('listing_id', listingId);
  if (depositStatus) query = query.eq('deposit_status', depositStatus);

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
    .from('rentals')
    .select('*, return_records(*)')
    .eq('id', req.params.id)
    .single();

  if (error || !rental) return res.status(404).json({ error: 'Rental not found' });

  const { return_records, ...rest } = rental;
  const enriched = await enrichRentals([rest]);
  const result = { ...enriched[0] };
  if (return_records?.length) {
    const rr = toCamelCase(return_records[0]);
    result.returnRecord = rr;
  }
  res.json({ data: result });
}

async function releaseDeposit(req, res) {
  const { data, error } = await supabase
    .from('rentals')
    .update({ deposit_status: 'returned' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Rental not found' });
  const enriched = await enrichRentals([data]);
  res.json({ data: enriched[0], message: 'Deposit released' });
}

async function receiveEquipment(req, res) {
  const { data: rental, error: fetchErr } = await supabase
    .from('rentals')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !rental) return res.status(404).json({ error: 'Rental not found' });
  if (rental.status !== 'pending') return res.status(400).json({ error: 'Rental must be pending to receive equipment' });

  const { data: checkIn, error: ciErr } = await supabase
    .from('rental_check_ins')
    .insert({
      rental_id: req.params.id,
      user_id: rental.renter_id,
      type: 'receive',
      ip_address: req.ip,
    })
    .select()
    .single();

  if (ciErr) return res.status(500).json({ error: ciErr.message });

  const { data, error } = await supabase
    .from('rentals')
    .update({ status: 'active' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichRentals([data]);
  res.json({ data: { ...enriched[0], receiveCheckIn: toCamelCase(checkIn) }, message: 'Equipment received' });
}

async function returnEquipment(req, res) {
  const { itemCondition, supportingImages } = req.body;

  const { data: rental, error: fetchErr } = await supabase
    .from('rentals')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !rental) return res.status(404).json({ error: 'Rental not found' });
  if (rental.status !== 'active') return res.status(400).json({ error: 'Rental must be active to return equipment' });

  const { data: checkIn, error: ciErr } = await supabase
    .from('rental_check_ins')
    .insert({
      rental_id: req.params.id,
      user_id: rental.renter_id,
      type: 'return',
      ip_address: req.ip,
      notes: itemCondition || null,
    })
    .select()
    .single();

  if (ciErr) return res.status(500).json({ error: ciErr.message });

  const { data: existingReturn } = await supabase
    .from('return_records')
    .select('return_id')
    .eq('rental_id', req.params.id)
    .maybeSingle();

  if (existingReturn) {
    await supabase
      .from('return_records')
      .update({
        item_condition: itemCondition || null,
        supporting_images_url: supportingImages || null,
        returned_at: new Date().toISOString(),
      })
      .eq('rental_id', req.params.id);
  } else {
    await supabase
      .from('return_records')
      .insert({
        rental_id: req.params.id,
        renter_id: rental.renter_id,
        item_condition: itemCondition || null,
        supporting_images_url: supportingImages || null,
        returned_at: new Date().toISOString(),
      });
  }

  const { data, error } = await supabase
    .from('rentals')
    .update({ status: 'completed' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichRentals([data]);
  res.json({ data: { ...enriched[0], returnCheckIn: toCamelCase(checkIn) }, message: 'Equipment returned' });
}

async function deductDeposit(req, res) {
  const { amount, reason } = req.body;

  const damageParts = [];
  if (reason) damageParts.push(reason);
  if (amount) damageParts.push(`Amount deducted: ${amount}`);
  const damageReport = damageParts.length > 0 ? damageParts.join(' | ') : 'Deposit deducted';

  const { data, error } = await supabase
    .from('rentals')
    .update({ deposit_status: 'deducted', damage_report: damageReport })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Rental not found' });
  const enriched = await enrichRentals([data]);
  res.json({ data: enriched[0], message: 'Deposit deducted' });
}

module.exports = { listRentals, getRentalById, releaseDeposit, deductDeposit, receiveEquipment, returnEquipment };
