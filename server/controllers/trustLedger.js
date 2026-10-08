const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');
const { findEquipmentDepositEscrow, transitionEquipmentDepositEscrow } = require('../utilities/equipmentDepositEscrow');

const CLIENT_FUND_TYPES = ['job_payment', 'rental_payment', 'deposit'];
const UNRELEASED_STATUSES = ['pending', 'escrow', 'held'];
const EQUIPMENT_DEPOSIT_ESCROW_TABLE = 'equipment_security_deposit_escrow';

function roundAmount(amount) {
  return Math.round(amount * 100) / 100;
}

async function getUnreleasedTransactions() {
  return supabase
    .from('transactions')
    .select('id, user_id, type, amount, status, payment_method, created_at, related_id, related_type')
    .in('type', CLIENT_FUND_TYPES)
    .in('status', UNRELEASED_STATUSES)
    .order('created_at', { ascending: true });
}

async function getEquipmentDepositEscrows() {
  return supabase
    .from(EQUIPMENT_DEPOSIT_ESCROW_TABLE)
    .select('escrow_id, request_id, renter_id, owner_id, amount, payment_method, status, held_at, released_at, created_at')
    .order('held_at', { ascending: false });
}

function combineLedgerEntries(transactions, escrows) {
  const equipmentTransactionsByRequest = new Map(
    transactions
      .filter((transaction) => transaction.type === 'deposit' &&
        transaction.related_type === 'equipment_rental' && transaction.related_id)
      .map((transaction) => [transaction.related_id, transaction]),
  );
  const escrowRequestIds = new Set(escrows.map((escrow) => escrow.request_id));
  const transactionEntries = transactions
    .filter((transaction) => !(
      transaction.type === 'deposit' &&
      transaction.related_type === 'equipment_rental' &&
      escrowRequestIds.has(transaction.related_id)
    ))
    .map((transaction) => ({
      id: transaction.id,
      displayId: `TXN-${transaction.id.slice(0, 8)}`,
      transactionId: transaction.id,
      releaseTransactionId: transaction.id,
      userId: transaction.user_id,
      ownerId: null,
      userName: transaction.user_id,
      ownerName: null,
      type: transaction.type,
      amount: Math.abs(Number(transaction.amount) || 0),
      balance: null,
      status: transaction.status === 'escrow' ? 'held' : transaction.status,
      paymentMethod: transaction.payment_method,
      releaseDate: null,
      createdAt: transaction.created_at,
      isEquipmentEscrow: false,
    }));
  const escrowEntries = escrows.map((escrow) => {
    const transaction = equipmentTransactionsByRequest.get(escrow.request_id);
    return {
      id: transaction?.id || escrow.escrow_id,
      displayId: `ESC-${escrow.escrow_id.slice(0, 8)}`,
      transactionId: transaction?.id || null,
      releaseTransactionId: transaction?.id && escrow.status === 'held' ? transaction.id : null,
      escrowId: escrow.escrow_id,
      requestId: escrow.request_id,
      userId: escrow.renter_id,
      ownerId: escrow.owner_id,
      userName: escrow.renter_id,
      ownerName: escrow.owner_id,
      type: 'deposit',
      amount: Math.abs(Number(escrow.amount) || 0),
      balance: null,
      status: escrow.status,
      paymentMethod: escrow.payment_method,
      releaseDate: escrow.released_at,
      createdAt: escrow.held_at || escrow.created_at,
      isEquipmentEscrow: true,
    };
  });
  return [...transactionEntries, ...escrowEntries];
}

async function getSummary(req, res) {
  const [transactionsResult, escrowsResult] = await Promise.all([
    getUnreleasedTransactions(),
    getEquipmentDepositEscrows(),
  ]);
  if (transactionsResult.error) return res.status(500).json({ error: transactionsResult.error.message });
  if (escrowsResult.error) return res.status(500).json({ error: escrowsResult.error.message });
  const entries = combineLedgerEntries(transactionsResult.data || [], escrowsResult.data || []);
  const escrows = escrowsResult.data || [];
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
    (sum, transaction) => sum + (
      transaction.status === 'pending' || transaction.status === 'held' || transaction.status === 'escrow'
        ? Math.abs(Number(transaction.amount) || 0)
        : 0
    ),
    0,
  );

  res.json({
    data: {
      totalDeposits: roundAmount(totalDeposits),
      totalPayouts: roundAmount(escrows
        .filter((escrow) => escrow.status === 'released')
        .reduce((sum, escrow) => sum + (Number(escrow.amount) || 0), 0)),
      totalRefunds: roundAmount(escrows
        .filter((escrow) => escrow.status === 'refunded')
        .reduce((sum, escrow) => sum + (Number(escrow.amount) || 0), 0)),
      totalHeld: roundAmount(totalHeld),
      totalPending: roundAmount(totalPending),
      currentBalance: roundAmount(currentBalance),
      totalEntries: entries.length,
    },
  });
}

async function listEntries(req, res) {
  const { page = 1, limit = 20, type, status, userId, startDate, endDate } = req.query;
  const [transactionsResult, escrowsResult] = await Promise.all([
    getUnreleasedTransactions(),
    getEquipmentDepositEscrows(),
  ]);
  if (transactionsResult.error) return res.status(500).json({ error: transactionsResult.error.message });
  if (escrowsResult.error) return res.status(500).json({ error: escrowsResult.error.message });

  let entries = combineLedgerEntries(transactionsResult.data || [], escrowsResult.data || []);
  if (type) entries = entries.filter((transaction) => transaction.type === type);
  if (status) {
    entries = entries.filter((transaction) => (
      status === 'held'
        ? transaction.status === 'held' || transaction.status === 'escrow'
        : transaction.status === status
    ));
  }
  if (userId) entries = entries.filter((transaction) => transaction.userId === userId || transaction.ownerId === userId);
  if (startDate) entries = entries.filter((transaction) => transaction.createdAt >= startDate);
  if (endDate) entries = entries.filter((transaction) => transaction.createdAt <= endDate);

  entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = entries.length;
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Number(limit) || 20);
  const offset = (pageNumber - 1) * pageSize;
  const pageEntries = entries.slice(offset, offset + pageSize);

  const userIds = [...new Set(pageEntries.flatMap((entry) => [entry.userId, entry.ownerId]).filter(Boolean))];
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
    ...entry,
    userName: userMap[entry.userId] || entry.userId,
    ownerName: entry.ownerId ? userMap[entry.ownerId] || entry.ownerId : null,
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
