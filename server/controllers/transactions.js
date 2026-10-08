const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');
const { findEquipmentDepositEscrow, transitionEquipmentDepositEscrow } = require('../utilities/equipmentDepositEscrow');

const CLIENT_FUND_TRANSACTION_TYPES = ['job_payment', 'rental_payment', 'deposit'];
const UNRELEASED_STATUSES = ['pending', 'escrow', 'held'];

async function enrichTransactions(txns) {
  if (!txns || txns.length === 0) return [];
  const userIds = new Set();
  const relatedJobIds = new Set();
  const relatedRentalIds = new Set();
  const counterpartyIds = new Set();

  txns.forEach(t => {
    if (t.user_id) userIds.add(t.user_id);
    if (t.related_type === 'job_post' && t.related_id) relatedJobIds.add(t.related_id);
    if (t.related_type === 'equipment_rental' && t.related_id) relatedRentalIds.add(t.related_id);
  });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
  }

  let jobMap = {};
  if (relatedJobIds.size > 0) {
    const { data: jobs } = await supabase.from('job_posts').select('job_post_id, job_title, client_id, talent_id').in('job_post_id', [...relatedJobIds]);
    if (jobs) jobs.forEach(j => { jobMap[j.job_post_id] = j; });
  }

  let rentalMap = {};
  if (relatedRentalIds.size > 0) {
    const { data: rentals } = await supabase.from('equipment_rentals').select('rental_id, listing_id').in('rental_id', [...relatedRentalIds]);
    if (rentals) rentals.forEach(r => { rentalMap[r.rental_id] = r; });
  }

  const listingIds = new Set();
  Object.values(rentalMap).forEach(r => { if (r.listing_id) listingIds.add(r.listing_id); });
  let listingMap = {};
  if (listingIds.size > 0) {
    const { data: listings } = await supabase.from('equipment_listings').select('listing_id, equipment_name, owner_id').in('listing_id', [...listingIds]);
    if (listings) listings.forEach(l => { listingMap[l.listing_id] = l; });
  }

  Object.values(jobMap).forEach(j => {
    if (j.client_id) counterpartyIds.add(j.client_id);
    if (j.talent_id) counterpartyIds.add(j.talent_id);
  });
  Object.values(listingMap).forEach(l => {
    if (l.owner_id) counterpartyIds.add(l.owner_id);
  });

  let counterpartyMap = {};
  if (counterpartyIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...counterpartyIds]);
    if (users) users.forEach(u => { counterpartyMap[u.id] = getFullName(u); });
  }

  return txns.map(t => {
    let relatedTitle = null;
    let counterpartyName = null;

    if (t.related_type === 'job_post' && t.related_id) {
      const job = jobMap[t.related_id];
      if (job) {
        relatedTitle = job.job_title;
        const counterpartyId = t.type === 'payout' ? job.talent_id : job.client_id;
        counterpartyName = counterpartyId ? counterpartyMap[counterpartyId] : null;
      }
    } else if (t.related_type === 'equipment_rental' && t.related_id) {
      const rental = rentalMap[t.related_id];
      if (rental && rental.listing_id) {
        const listing = listingMap[rental.listing_id];
        if (listing) {
          relatedTitle = listing.equipment_name;
          counterpartyName = listing.owner_id ? counterpartyMap[listing.owner_id] : null;
        }
      }
    }

    return {
      ...toCamelCase(t),
      userName: userMap[t.user_id] || t.user_id,
      relatedTitle,
      counterpartyName,
    };
  });
}

async function listTransactions(req, res) {
  const { page = 1, limit = 20, type, status, userId, startDate, endDate, paymentMethod } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('transactions').select('id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction', { count: 'exact' });
  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);
  if (userId) query = query.eq('user_id', userId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  if (paymentMethod) query = query.eq('payment_method', paymentMethod);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichTransactions(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getTransactionById(req, res) {
  const { data: txn, error } = await supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type, direction')
    .eq('id', req.params.id)
    .single();

  if (error || !txn) return res.status(404).json({ error: 'Transaction not found' });

  const enriched = await enrichTransactions([txn]);
  res.json({ data: enriched[0] });
}

async function releaseEscrow(req, res) {
  const { data: txn, error: fetchErr } = await supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, created_at')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !txn) return res.status(404).json({ error: 'Transaction not found' });
  if (txn.status !== 'escrow' && txn.status !== 'held') {
    return res.status(400).json({ error: 'Transaction is not in escrow' });
  }
  if (CLIENT_FUND_TRANSACTION_TYPES.includes(txn.type)) {
    return res.status(400).json({ error: 'Release client payments and deposits from the trust ledger' });
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'completed' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: toCamelCase(data), message: 'Escrow released' });
}

async function processRefund(req, res) {
  const { data: txn, error: fetchErr } = await supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, created_at, related_id, related_type')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !txn) return res.status(404).json({ error: 'Transaction not found' });
  const escrowResult = await findEquipmentDepositEscrow(txn);
  if (escrowResult.error) return res.status(409).json({ error: escrowResult.error });
  const escrow = escrowResult.escrow;
  if (escrow && escrow.status !== 'held' && escrow.status !== 'refunded') {
    return res.status(409).json({ error: 'This equipment deposit has already been released and cannot be refunded' });
  }
  if (txn.status === 'refunded' && (!escrow || escrow.status === 'refunded')) {
    return res.status(400).json({ error: 'Transaction already refunded' });
  }
  if (txn.status === 'refunded' && escrow?.status === 'held') {
    const escrowUpdate = await transitionEquipmentDepositEscrow(escrow, 'refunded');
    if (escrowUpdate.error) {
      return res.status(500).json({ error: `Transaction was refunded, but its equipment deposit escrow record could not be updated. Retry refund to reconcile it. ${escrowUpdate.error}` });
    }
    return res.json({ data: toCamelCase(txn), message: 'Transaction refunded' });
  }

  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'refunded' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (escrow?.status === 'held') {
    const escrowUpdate = await transitionEquipmentDepositEscrow(escrow, 'refunded');
    if (escrowUpdate.error) {
      return res.status(500).json({ error: `Transaction was refunded, but its equipment deposit escrow record could not be updated. Retry refund to reconcile it. ${escrowUpdate.error}` });
    }
  }
  res.json({ data: toCamelCase(data), message: 'Transaction refunded' });
}

async function approvePayout(req, res) {
  const { data: txn, error: fetchErr } = await supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, created_at')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !txn) return res.status(404).json({ error: 'Transaction not found' });
  if (txn.status !== 'pending') return res.status(400).json({ error: 'Transaction is not pending' });
  if (txn.type !== 'payout') return res.status(400).json({ error: 'Transaction is not a payout' });

  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'completed' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: toCamelCase(data), message: 'Payout approved' });
}

module.exports = { listTransactions, getTransactionById, releaseEscrow, processRefund, approvePayout };
