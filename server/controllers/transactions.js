const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function enrichTransactions(txns) {
  if (!txns || txns.length === 0) return [];
  const userIds = new Set();
  txns.forEach(t => { if (t.user_id) userIds.add(t.user_id); });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
  }

  return txns.map(t => ({
    ...toCamelCase(t),
    userName: userMap[t.user_id] || t.user_id,
  }));
}

async function listTransactions(req, res) {
  const { page = 1, limit = 20, type, status, userId, startDate, endDate } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('transactions').select('id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type', { count: 'exact' });
  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);
  if (userId) query = query.eq('user_id', userId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

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
    .select('id, user_id, type, amount, status, payment_method, reference, fee, description, net_amount, created_at, related_id, related_type')
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
    .select('id, user_id, type, amount, status, created_at')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !txn) return res.status(404).json({ error: 'Transaction not found' });
  if (txn.status === 'refunded') return res.status(400).json({ error: 'Transaction already refunded' });

  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'refunded' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
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
