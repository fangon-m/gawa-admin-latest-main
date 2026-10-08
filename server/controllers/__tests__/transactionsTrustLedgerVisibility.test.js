process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const { listTransactions, getTransactionById, processRefund } = require('../transactions');
const { releaseHeldFunds } = require('../trustLedger');

function makeQuery(result) {
  const query = {
    calls: {},
    select: jest.fn(() => query),
    in: jest.fn(() => query),
    not: jest.fn(() => query),
    or: jest.fn((...args) => { query.calls.or = args; return query; }),
    eq: jest.fn(() => query),
    update: jest.fn(() => query),
    order: jest.fn(() => query),
    range: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('transactions and trust ledger visibility', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists client funds in every transaction status', async () => {
    const transactionsQuery = makeQuery({
      data: [
        { id: 'pending-id', type: 'deposit', status: 'pending' },
        { id: 'held-id', type: 'job_payment', status: 'held' },
        { id: 'cancelled-id', type: 'rental_payment', status: 'cancelled' },
        { id: 'refunded-id', type: 'deposit', status: 'refunded' },
      ],
      count: 4,
      error: null,
    });
    supabase.from.mockReturnValueOnce(transactionsQuery);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await listTransactions({ query: {} }, res);

    expect(transactionsQuery.or).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith('transactions');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'pending-id', status: 'pending' }),
        expect.objectContaining({ id: 'held-id', status: 'held' }),
        expect.objectContaining({ id: 'cancelled-id', status: 'cancelled' }),
        expect.objectContaining({ id: 'refunded-id', status: 'refunded' }),
      ]),
    }));
  });

  it('allows transaction detail lookup for held client funds', async () => {
    const transaction = {
      id: 'held-transaction-id',
      type: 'job_payment',
      status: 'held',
    };
    const transactionQuery = makeQuery({ data: transaction, error: null });
    supabase.from.mockReturnValueOnce(transactionQuery);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await getTransactionById({ params: { id: transaction.id } }, res);

    expect(transactionQuery.or).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: transaction.id, status: 'held' }),
    }));
  });

  it('lists pending payments from the existing transactions table on the trust ledger', async () => {
    const transactionsQuery = makeQuery({
      data: [{
        id: 'transaction-id',
        user_id: 'user-id',
        type: 'job_payment',
        amount: 250,
        status: 'escrow',
        created_at: '2026-10-06T10:00:00.000Z',
      }],
      error: null,
    });
    const usersQuery = makeQuery({
      data: [{ id: 'user-id', first_name: 'Client', last_name: 'Name' }],
      error: null,
    });
    const escrowsQuery = makeQuery({ data: [], error: null });
    supabase.from
      .mockReturnValueOnce(transactionsQuery)
      .mockReturnValueOnce(escrowsQuery)
      .mockReturnValueOnce(usersQuery);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    const { listEntries } = require('../trustLedger');
    await listEntries({ query: {} }, res);

    expect(supabase.from).toHaveBeenNthCalledWith(1, 'transactions');
    expect(transactionsQuery.in).toHaveBeenNthCalledWith(1, 'type', ['job_payment', 'rental_payment', 'deposit']);
    expect(transactionsQuery.in).toHaveBeenNthCalledWith(2, 'status', ['pending', 'escrow', 'held']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        id: 'transaction-id',
        type: 'job_payment',
        status: 'held',
        userName: 'Client Name',
      })],
    }));
  });

  it('lists equipment deposit escrow details once alongside transaction entries', async () => {
    const transactionsQuery = makeQuery({
      data: [{
        id: 'transaction-id',
        user_id: 'renter-id',
        type: 'deposit',
        amount: 100,
        status: 'held',
        payment_method: 'gcash',
        related_id: 'request-id',
        related_type: 'equipment_rental',
        created_at: '2026-10-06T10:00:00.000Z',
      }],
      error: null,
    });
    const escrowsQuery = makeQuery({
      data: [{
        escrow_id: 'escrow-id',
        request_id: 'request-id',
        renter_id: 'renter-id',
        owner_id: 'owner-id',
        amount: 100,
        payment_method: 'gcash',
        status: 'held',
        held_at: '2026-10-06T10:00:00.000Z',
        released_at: null,
        created_at: '2026-10-06T10:00:00.000Z',
      }],
      error: null,
    });
    const usersQuery = makeQuery({
      data: [
        { id: 'renter-id', first_name: 'Renter', last_name: 'Name' },
        { id: 'owner-id', first_name: 'Owner', last_name: 'Name' },
      ],
      error: null,
    });
    supabase.from
      .mockReturnValueOnce(transactionsQuery)
      .mockReturnValueOnce(escrowsQuery)
      .mockReturnValueOnce(usersQuery);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await require('../trustLedger').listEntries({ query: {} }, res);

    expect(supabase.from).toHaveBeenNthCalledWith(2, 'equipment_security_deposit_escrow');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        id: 'transaction-id',
        displayId: 'ESC-escrow-i',
        type: 'deposit',
        isEquipmentEscrow: true,
        userName: 'Renter Name',
        ownerName: 'Owner Name',
        paymentMethod: 'gcash',
        status: 'held',
        releaseTransactionId: 'transaction-id',
      })],
    }));
  });

  it('includes equipment escrow balances and completed outcomes in the ledger summary', async () => {
    const transactionsQuery = makeQuery({ data: [], error: null });
    const escrowsQuery = makeQuery({
      data: [
        { escrow_id: 'held-id', request_id: 'held-request', amount: 25, status: 'held' },
        { escrow_id: 'released-id', request_id: 'released-request', amount: 100, status: 'released' },
        { escrow_id: 'refunded-id', request_id: 'refunded-request', amount: 50, status: 'refunded' },
      ],
      error: null,
    });
    supabase.from
      .mockReturnValueOnce(transactionsQuery)
      .mockReturnValueOnce(escrowsQuery);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await require('../trustLedger').getSummary({}, res);

    expect(res.json).toHaveBeenCalledWith({
      data: {
        totalDeposits: 175,
        totalPayouts: 100,
        totalRefunds: 50,
        totalHeld: 25,
        totalPending: 0,
        currentBalance: 25,
        totalEntries: 3,
      },
    });
  });

  it('releases the transaction record used by both pages', async () => {
    const transaction = {
      id: 'transaction-id',
      user_id: 'user-id',
      type: 'job_payment',
      amount: 250,
      status: 'held',
    };
    const fetchEntry = makeQuery({ data: transaction, error: null });
    const updateTransaction = makeQuery({
      data: { ...transaction, status: 'completed' },
      error: null,
    });
    supabase.from
      .mockReturnValueOnce(fetchEntry)
      .mockReturnValueOnce(updateTransaction);
    const req = { params: { id: transaction.id } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await releaseHeldFunds(req, res);

    expect(supabase.from).toHaveBeenNthCalledWith(1, 'transactions');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'transactions');
    expect(updateTransaction.update).toHaveBeenCalledWith({ status: 'completed' });
    expect(updateTransaction.eq).toHaveBeenCalledWith('id', transaction.id);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Funds released' }));
  });

  it('marks the matching equipment deposit escrow as released', async () => {
    const transaction = {
      id: 'transaction-id',
      user_id: 'renter-id',
      type: 'deposit',
      amount: 100,
      status: 'held',
      related_id: 'request-id',
      related_type: 'equipment_rental',
    };
    const escrow = {
      escrow_id: 'escrow-id',
      request_id: 'request-id',
      renter_id: 'renter-id',
      amount: 100,
      status: 'held',
    };
    const fetchEntry = makeQuery({ data: transaction, error: null });
    const findEscrow = makeQuery({ data: escrow, error: null });
    const updateTransaction = makeQuery({ data: { ...transaction, status: 'completed' }, error: null });
    const updateEscrow = makeQuery({ data: { escrow_id: 'escrow-id', status: 'released' }, error: null });
    supabase.from
      .mockReturnValueOnce(fetchEntry)
      .mockReturnValueOnce(findEscrow)
      .mockReturnValueOnce(updateTransaction)
      .mockReturnValueOnce(updateEscrow);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await releaseHeldFunds({ params: { id: transaction.id } }, res);

    expect(findEscrow.eq).toHaveBeenCalledWith('request_id', 'request-id');
    expect(updateEscrow.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'released',
      released_at: expect.any(String),
    }));
    expect(updateEscrow.eq).toHaveBeenCalledWith('status', 'held');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Funds released' }));
  });

  it('marks the matching equipment deposit escrow as refunded', async () => {
    const transaction = {
      id: 'transaction-id',
      user_id: 'renter-id',
      type: 'deposit',
      amount: 100,
      status: 'held',
      related_id: 'request-id',
      related_type: 'equipment_rental',
    };
    const escrow = {
      escrow_id: 'escrow-id',
      request_id: 'request-id',
      renter_id: 'renter-id',
      amount: 100,
      status: 'held',
    };
    const fetchEntry = makeQuery({ data: transaction, error: null });
    const findEscrow = makeQuery({ data: escrow, error: null });
    const updateTransaction = makeQuery({ data: { ...transaction, status: 'refunded' }, error: null });
    const updateEscrow = makeQuery({ data: { escrow_id: 'escrow-id', status: 'refunded' }, error: null });
    supabase.from
      .mockReturnValueOnce(fetchEntry)
      .mockReturnValueOnce(findEscrow)
      .mockReturnValueOnce(updateTransaction)
      .mockReturnValueOnce(updateEscrow);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await processRefund({ params: { id: transaction.id } }, res);

    expect(findEscrow.eq).toHaveBeenCalledWith('request_id', 'request-id');
    expect(updateEscrow.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'refunded',
      updated_at: expect.any(String),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Transaction refunded' }));
  });
});
