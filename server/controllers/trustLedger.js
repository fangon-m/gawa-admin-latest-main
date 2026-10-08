const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');
const { findEquipmentDepositEscrow, transitionEquipmentDepositEscrow } = require('../utilities/equipmentDepositEscrow');

const CLIENT_FUND_TYPES = ['job_payment', 'rental_payment', 'deposit'];
const UNRELEASED_STATUSES = ['pending', 'escrow', 'held'];

function roundAmount(amount) {
  return Math.round(amount * 100) / 100;
}

async function getUnreleasedTransactions() {
  return supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, created_at')
    .in('type', CLIENT_FUND_TYPES)
    .in('status', UNRELEASED_STATUSES)
    .order('created_at', { ascending: true });
}

async function getSummary(req, res) {
  const { data: transactions, error } = await getUnreleasedTransactions();
  if (error) return res.status(500).json({ error: error.message });

  const entries = transactions || [];
  const totalDeposits = entries
    .filter((transaction) => transaction.type === 'deposit')
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const totalHeld = entries
    .filter((transaction) => transaction.status === 'held' || transaction.status === 'escrow')
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const totalPending = entries
    .filter((transaction) => transaction.status === 'pending')
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const currentBalance = entries.reduce(
    (sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0),
    0,
  );

  res.json({
    data: {
      totalDeposits: roundAmount(totalDeposits),
      totalPayouts: 0,
      totalRefunds: 0,
      totalHeld: roundAmount(totalHeld),
      totalPending: roundAmount(totalPending),
      currentBalance: roundAmount(currentBalance),
      totalEntries: entries.length,
    },
  });
}

async function listEntries(req, res) {
  const { page = 1, limit = 20, type, status, userId, startDate, endDate } = req.query;
  const { data: transactions, error } = await getUnreleasedTransactions();
  if (error) return res.status(500).json({ error: error.message });

  let entries = transactions || [];
  if (type) entries = entries.filter((transaction) => transaction.type === type);
  if (status) {
    entries = entries.filter((transaction) => (
      status === 'held'
        ? transaction.status === 'held' || transaction.status === 'escrow'
        : transaction.status === status
    ));
  }
  if (userId) entries = entries.filter((transaction) => transaction.user_id === userId);
  if (startDate) entries = entries.filter((transaction) => transaction.created_at >= startDate);
  if (endDate) entries = entries.filter((transaction) => transaction.created_at <= endDate);

  entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const total = entries.length;
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Number(limit) || 20);
  const offset = (pageNumber - 1) * pageSize;
  const pageEntries = entries.slice(offset, offset + pageSize);

  const userIds = [...new Set(pageEntries.map((entry) => entry.user_id).filter(Boolean))];
  let userMap = {};
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', userIds);
    if (usersError) return res.status(500).json({ error: usersError.message });
    if (users) users.forEach((user) => { userMap[user.id] = getFullName(user); });
  }

  const data = pageEntries.map((entry) => ({
    id: entry.id,
    displayId: `TXN-${entry.id.slice(0, 8)}`,
    transactionId: entry.id,
    userId: entry.user_id,
    userName: userMap[entry.user_id] || entry.user_id,
    type: entry.type,
    amount: Math.abs(Number(entry.amount) || 0),
    balance: null,
    status: entry.status === 'escrow' ? 'held' : entry.status,
    releaseDate: null,
    createdAt: entry.created_at,
  }));

  res.json({
    data,
    pagination: {
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

async function releaseHeldFunds(req, res) {
  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, payment_method, reference, created_at, related_id, related_type, direction')
    .eq('id', req.params.id)
    .single();

  if (fetchError || !transaction) return res.status(404).json({ error: 'Transaction not found' });
  if (!CLIENT_FUND_TYPES.includes(transaction.type)) {
    return res.status(400).json({ error: 'Only client payments and deposits can be released here' });
  }
  const escrowResult = await findEquipmentDepositEscrow(transaction);
  if (escrowResult.error) return res.status(409).json({ error: escrowResult.error });
  const escrow = escrowResult.escrow;
  if (escrow && escrow.status !== 'held' && escrow.status !== 'released') {
    return res.status(409).json({ error: 'This equipment deposit has already been refunded and cannot be released' });
  }
  if (!UNRELEASED_STATUSES.includes(transaction.status) &&
      !(transaction.status === 'completed' && escrow?.status === 'held')) {
    return res.status(400).json({ error: 'Transaction must be pending or held to release' });
  }

  let data = transaction;
  if (transaction.status !== 'completed') {
    const { data: updatedTransaction, error } = await supabase
      .from('transactions')
      .update({ status: 'completed' })
      .eq('id', req.params.id)
      .in('status', UNRELEASED_STATUSES)
      .select('id, user_id, type, amount, status, payment_method, reference, created_at, related_id, related_type, direction')
      .single();

    if (error || !updatedTransaction) {
      return res.status(500).json({ error: error?.message || 'Transaction release failed' });
    }
    data = updatedTransaction;
  }

  if (escrow?.status === 'held') {
    const escrowUpdate = await transitionEquipmentDepositEscrow(escrow, 'released');
    if (escrowUpdate.error) {
      return res.status(500).json({
        error: `Transaction was released, but its equipment deposit escrow record could not be updated. Retry release to reconcile it. ${escrowUpdate.error}`,
      });
    }
  }

  res.json({ data, message: 'Funds released' });
}

module.exports = { getSummary, listEntries, releaseHeldFunds };
