jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { flagListing, listListings } = require('../listings');

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
