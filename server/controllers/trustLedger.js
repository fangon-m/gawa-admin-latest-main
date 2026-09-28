const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');

async function getSummary(req, res) {
  const [depositsRes, payoutsRes, refundsRes, feesRes, heldRes, pendingRes, countRes] = await Promise.all([
    supabase.from('trust_ledger').select('amount.sum()').in('type', ['deposit', 'payment_in']).single(),
    supabase.from('trust_ledger').select('amount.sum()').in('type', ['payout', 'payment_out']).single(),
    supabase.from('trust_ledger').select('amount.sum()').eq('type', 'refund').single(),
    supabase.from('trust_ledger').select('amount.sum()').eq('type', 'fee').single(),
    supabase.from('trust_ledger').select('amount.sum()').eq('status', 'held').single(),
    supabase.from('trust_ledger').select('amount.sum()').eq('status', 'pending').single(),
    supabase.from('trust_ledger').select('*', { count: 'exact', head: true }),
  ]);

  if (depositsRes.error || payoutsRes.error || refundsRes.error || feesRes.error || heldRes.error || pendingRes.error) {
    return res.status(500).json({ error: 'Failed to compute trust ledger summary' });
  }

  const totalDeposits = Number(depositsRes.data?.sum?.amount) || 0;
  const payoutSum = Number(payoutsRes.data?.sum?.amount) || 0;
  const refundSum = Number(refundsRes.data?.sum?.amount) || 0;
  const feeSum = Number(feesRes.data?.sum?.amount) || 0;

  const totalPayouts = payoutSum;
  const totalRefunds = refundSum;
  const currentBalance = totalDeposits - payoutSum - refundSum - feeSum;

  const totalHeld = Math.abs(Number(heldRes.data?.sum?.amount) || 0);
  const totalPending = Math.abs(Number(pendingRes.data?.sum?.amount) || 0);

  res.json({
    data: {
      totalDeposits: Math.round(totalDeposits * 100) / 100,
      totalPayouts: Math.round(totalPayouts * 100) / 100,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
      totalHeld: Math.round(totalHeld * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      currentBalance: Math.round(currentBalance * 100) / 100,
      totalEntries: countRes.count || 0,
    },
  });
}

async function listEntries(req, res) {
  const { page = 1, limit = 20, type, status, userId, startDate, endDate } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('trust_ledger').select('*', { count: 'exact' });
  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);
  if (userId) query = query.eq('user_id', userId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  // Enrich with user names
  const userIds = new Set();
  (data || []).forEach(e => { if (e.user_id) userIds.add(e.user_id); });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
  }

  const enriched = (data || []).map(e => ({
    id: e.id,
    displayId: e.display_id,
    transactionId: e.transaction_id,
    userId: e.user_id,
    userName: userMap[e.user_id] || e.user_id,
    type: e.type,
    amount: Number(e.amount) || 0,
    balance: Number(e.balance) || 0,
    status: e.status || 'pending',
    releaseDate: e.release_date,
    releaseCondition: e.release_condition,
    notes: e.notes,
    createdAt: e.created_at,
  }));

  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function createEntry(req, res) {
  const { transactionId, userId, type, amount, notes } = req.body;

  if (!userId || !type || amount === undefined) {
    return res.status(400).json({ error: 'userId, type, and amount are required' });
  }

  // Get the latest balance for running total
  const [latest, countRes] = await Promise.all([
    supabase.from('trust_ledger').select('balance').order('created_at', { ascending: false }).limit(1),
    supabase.from('trust_ledger').select('*', { count: 'exact', head: true }),
  ]);

  const prevBalance = (latest.data && latest.data[0]?.balance) ? Number(latest.data[0].balance) : 0;
  const newBalance = prevBalance + Number(amount);
  const nextNum = (countRes.count || 0) + 1;

  const { data, error } = await supabase
    .from('trust_ledger')
    .insert({
      display_id: `TL-${String(nextNum).padStart(3, '0')}`,
      transaction_id: transactionId || null,
      user_id: userId,
      type,
      amount: Number(amount),
      balance: newBalance,
      status: 'completed',
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({
    data: {
      id: data.id,
      displayId: data.display_id,
      transactionId: data.transaction_id,
      userId: data.user_id,
      type: data.type,
      amount: Number(data.amount),
      balance: Number(data.balance),
      status: data.status,
      releaseDate: data.release_date,
      releaseCondition: data.release_condition,
      notes: data.notes,
      createdAt: data.created_at,
    },
    message: 'Trust ledger entry created',
  });
}

async function releaseHeldFunds(req, res) {
  const { id } = req.params;

  const { data: entry, error: fetchErr } = await supabase
    .from('trust_ledger')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !entry) return res.status(404).json({ error: 'Entry not found' });
  if (entry.status !== 'pending' && entry.status !== 'held') {
    return res.status(400).json({ error: 'Entry must be pending or held to release' });
  }

  const { data, error } = await supabase
    .from('trust_ledger')
    .update({ status: 'completed', release_date: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    data: {
      id: data.id,
      displayId: data.display_id,
      transactionId: data.transaction_id,
      userId: data.user_id,
      type: data.type,
      amount: Number(data.amount),
      balance: Number(data.balance),
      status: data.status,
      releaseDate: data.release_date,
      notes: data.notes,
      createdAt: data.created_at,
    },
    message: 'Funds released',
  });
}

async function backfillTrustLedger(req, res) {
  // Replicates the 001_backfill_trust_ledger.sql migration logic in JS
  const MAPPED_TYPES = ['job_payment', 'rental_payment', 'deposit', 'galaw_purchase', 'payout', 'refund', 'fee'];
  const SKIP_STATUSES = ['cancelled', 'failed'];

  // Fetch all eligible transactions (status not cancelled/failed, type in mapped set)
  const { data: transactions, error: txnErr } = await supabase
    .from('transactions')
    .select('*')
    .not('status', 'in', `(${SKIP_STATUSES.join(',')})`)
    .in('type', MAPPED_TYPES)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (txnErr) return res.status(500).json({ error: txnErr.message });

  // Get existing trust_ledger entries to skip and initialize balance
  const { data: existingEntries } = await supabase
    .from('trust_ledger')
    .select('transaction_id, amount');

  const existingTxnIds = new Set((existingEntries || []).map(e => e.transaction_id));
  let runningBalance = (existingEntries || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const toInsert = [];
  let skipped = 0;

  for (const txn of transactions || []) {
    if (existingTxnIds.has(txn.id)) {
      skipped++;
      continue;
    }

    let trustType, trustAmount;

    if (['job_payment', 'rental_payment'].includes(txn.type)) {
      trustType = 'payment_in';
      trustAmount = Math.abs(Number(txn.amount));
    } else if (['deposit', 'galaw_purchase'].includes(txn.type)) {
      trustType = 'deposit';
      trustAmount = Math.abs(Number(txn.amount));
    } else if (txn.type === 'payout') {
      trustType = 'payout';
      trustAmount = -Math.abs(Number(txn.amount));
    } else if (txn.type === 'refund') {
      trustType = 'refund';
      trustAmount = -Math.abs(Number(txn.amount));
    } else if (txn.type === 'fee') {
      trustType = 'fee';
      trustAmount = -Math.abs(Number(txn.amount));
    } else {
      skipped++;
      continue;
    }

    const trustStatus = ['escrow', 'held'].includes(txn.status) ? 'held' : txn.status;

    let releaseCondition = null;
    if (txn.type === 'job_payment' && ['escrow', 'held'].includes(txn.status)) {
      releaseCondition = 'job_completion';
    } else if (txn.type === 'rental_payment' && ['escrow', 'held'].includes(txn.status)) {
      releaseCondition = 'rental_completion';
    }

    runningBalance += trustAmount;

    toInsert.push({
      transaction_id: txn.id,
      user_id: txn.user_id,
      type: trustType,
      amount: trustAmount,
      balance: Math.round(runningBalance * 100) / 100,
      status: trustStatus,
      release_date: txn.status === 'completed' ? txn.created_at : null,
      release_condition: releaseCondition,
      notes: 'Backfilled from API endpoint',
      created_at: txn.created_at,
      updated_at: new Date().toISOString(),
    });
  }

  if (toInsert.length === 0) {
    return res.json({ message: 'No transactions to backfill', created: 0, skipped });
  }

  // Insert in batches of 100 to avoid payload limits
  let created = 0;
  const batchSize = 100;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    const { error: insertErr } = await supabase.from('trust_ledger').insert(batch);
    if (insertErr) return res.status(500).json({ error: insertErr.message, progress: created });
    created += batch.length;
  }

  res.json({
    message: `Backfill complete: ${created} entries created`,
    created,
    skipped,
  });
}

module.exports = { getSummary, listEntries, createEntry, releaseHeldFunds, backfillTrustLedger };
