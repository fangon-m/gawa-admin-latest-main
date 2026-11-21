jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { flagListing, listListings, removeListing } = require('../listings');

describe('flag equipment listing', () => {
  let req;
  let res;
  let listingQuery;
  let existingFlagsQuery;
  let insertedFlagQuery;
  let flagsTable;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: { id: 'listing-id' },
      body: { reason: '  Inappropriate listing  ' },
      user: { id: 'admin-id' },
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    listingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { listing_id: 'listing-id' }, error: null }),
    };
    existingFlagsQuery = {
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    insertedFlagQuery = {
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { flag_id: 'flag-id', entity_type: 'equipment_listing', entity_id: 'listing-id', reason: req.body.reason.trim(), status: 'open' },
        error: null,
      }),
    };
    flagsTable = {
      select: jest.fn().mockReturnValue(existingFlagsQuery),
      insert: jest.fn().mockReturnValue(insertedFlagQuery),
    };
    supabase.from.mockImplementation((table) => (
      table === 'equipment_listings' ? listingQuery : flagsTable
    ));
  });

  it('creates an open moderation flag without changing the listing status', async () => {
    await flagListing(req, res);

    expect(flagsTable.insert).toHaveBeenCalledWith({
      entity_type: 'equipment_listing',
      entity_id: 'listing-id',
      flagged_by: 'admin-id',
      reason: 'Inappropriate listing',
      status: 'open',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Equipment listing flagged',
      data: expect.objectContaining({ flagId: 'flag-id', status: 'open' }),
    }));
    expect(listingQuery.update).toBeUndefined();
  });

  it('requires a reason', async () => {
    req.body.reason = ' ';

    await flagListing(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('prevents a second open flag for the same listing', async () => {
    existingFlagsQuery.limit.mockResolvedValue({
      data: [{ flag_id: 'existing-flag' }],
      error: null,
    });

    await flagListing(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(flagsTable.insert).not.toHaveBeenCalled();
  });

  it('returns no listings when filtering for flags and none are open', async () => {
    req.query = { page: '1', limit: '10', status: 'flagged' };
    const openFlagsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    supabase.from.mockReturnValue(openFlagsQuery);

    await listListings(req, res);

    expect(openFlagsQuery.eq).toHaveBeenCalledWith('entity_type', 'equipment_listing');
    expect(openFlagsQuery.or).toHaveBeenCalledWith('status.eq.open,status.is.null');
    expect(res.json).toHaveBeenCalledWith({
      data: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
  });
});

describe('remove equipment listing audit-trail guard', () => {
  const req = { params: { id: 'listing-id' } };
  let res;
  let rentalsQuery;
  let paymentsQuery;
  let deleteQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    rentalsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    paymentsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ count: 0, error: null }).then(resolve),
    };
    deleteQuery = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ error: null }).then(resolve),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'equipment_rentals') return rentalsQuery;
      if (table === 'transactions') return paymentsQuery;
      return deleteQuery;
    });
  });

  it('allows removing a listing with no rental or payment history', async () => {
    await removeListing(req, res);

    expect(deleteQuery.delete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Equipment listing removed' });
  });

  it('blocks removing a listing with an active rental', async () => {
    rentalsQuery.then = (resolve) => Promise.resolve({
      data: [{ rental_id: 'rental-id', request_id: 'request-id', rental_status: 'active' }],
      error: null,
    }).then(resolve);

    await removeListing(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(deleteQuery.delete).not.toHaveBeenCalled();
  });

  it('blocks removing a listing whose cancelled rentals still have payments', async () => {
    rentalsQuery.then = (resolve) => Promise.resolve({
      data: [{ rental_id: 'rental-id', request_id: 'request-id', rental_status: 'cancelled' }],
      error: null,
    }).then(resolve);
    paymentsQuery.then = (resolve) => Promise.resolve({ count: 1, error: null }).then(resolve);

    await removeListing(req, res);

    expect(paymentsQuery.in).toHaveBeenCalledWith('related_id', ['rental-id']);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(deleteQuery.delete).not.toHaveBeenCalled();
  });
});
