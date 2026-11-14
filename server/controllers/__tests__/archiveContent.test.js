process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const {
  stampArchivedContent,
  clearArchivedContentMarkers,
  reconcileArchivedAccounts,
} = require('../../utilities/archiveContent');

function updateQuery(result) {
  const query = {
    payload: null,
    filters: [],
    update: jest.fn((payload) => { query.payload = payload; return query; }),
    eq: jest.fn((column, value) => { query.filters.push([column, 'eq', value]); return query; }),
    is: jest.fn((column, value) => { query.filters.push([column, 'is', value]); return query; }),
    lte: jest.fn((column, value) => { query.filters.push([column, 'lte', value]); return query; }),
    gte: jest.fn((column, value) => { query.filters.push([column, 'gte', value]); return query; }),
    not: jest.fn((column, value) => { query.filters.push([column, 'not', value]); return query; }),
    select: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function readQuery(result) {
  const query = {
    select: jest.fn(() => query),
    not: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('archive content helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stamps a listing archive marker together with the status flip', async () => {
    const listings = updateQuery({ data: [{ listing_id: 'listing-1' }], error: null });
    supabase.from.mockImplementation((table) => {
      if (table === 'equipment_listings') return listings;
      return updateQuery({ data: [], error: null });
    });

    const result = await stampArchivedContent('user-1', '2026-11-12T00:00:00.000Z');

    expect(listings.payload).toEqual(expect.objectContaining({
      status: 'unavailable',
      archived_at: '2026-11-12T00:00:00.000Z',
      archive_removed_at: null,
    }));
    expect(result.listings).toBe(1);
  });

  it('restores listings by archive marker instead of timestamp equality', async () => {
    const listings = updateQuery({ data: [{ listing_id: 'listing-1' }], error: null });
    supabase.from.mockImplementation((table) => {
      if (table === 'equipment_listings') return listings;
      return updateQuery({ data: [], error: null });
    });

    const result = await clearArchivedContentMarkers('user-1', '2026-11-12T00:00:00.000Z');

    expect(listings.payload).toEqual(expect.objectContaining({
      status: 'available',
      archived_at: null,
      archive_removed_at: expect.any(String),
    }));
    expect(listings.filters).toContainEqual(['archived_at', 'eq', '2026-11-12T00:00:00.000Z']);
    expect(result.listings).toBe(1);
  });

  it('restores listings by timestamp when marker columns are missing', async () => {
    const marked = updateQuery({ data: null, error: { code: 'PGRST204', message: 'column missing' } });
    const legacy = updateQuery({ data: [{ listing_id: 'listing-1' }], error: null });
    const listingCalls = [marked, legacy];
    let listingIndex = 0;

    supabase.from.mockImplementation((table) => {
      if (table === 'equipment_listings') return listingCalls[listingIndex++];
      return updateQuery({ data: [], error: null });
    });

    const result = await clearArchivedContentMarkers('user-1', '2026-11-12T00:00:00.000Z');

    expect(listingIndex).toBe(2);
    expect(legacy.payload).toEqual(expect.objectContaining({ status: 'available' }));
    expect(legacy.payload).not.toHaveProperty('archive_removed_at');
    expect(legacy.filters).toContainEqual(['updated_at', 'gte', '2026-11-12T00:00:00.000Z']);
    expect(result.listings).toBe(1);
  });

  it('clears job post and proposal markers stamped with a different timestamp', async () => {
    const postsFirst = updateQuery({ data: [], error: null });
    const postsAll = updateQuery({ data: [{ job_post_id: 'post-1' }], error: null });
    const proposalsFirst = updateQuery({ data: [], error: null });
    const proposalsAll = updateQuery({ data: [{ proposal_id: 'proposal-1' }], error: null });
    const calls = { job_posts: 0, job_proposals: 0 };

    supabase.from.mockImplementation((table) => {
      if (table === 'job_posts') return calls.job_posts++ === 0 ? postsFirst : postsAll;
      if (table === 'job_proposals') return calls.job_proposals++ === 0 ? proposalsFirst : proposalsAll;
      return updateQuery({ data: [], error: null });
    });

    const result = await clearArchivedContentMarkers('user-1', '2026-11-12T00:00:00.000Z');

    expect(postsAll.filters).toContainEqual(['client_archived_at', 'not', 'is']);
    expect(proposalsAll.filters).toContainEqual(['proposer_archived_at', 'not', 'is']);
    expect(result).toEqual(expect.objectContaining({ jobPosts: 1, proposals: 1 }));
  });

  it('heals legacy unavailable listings for accounts that are no longer archived', async () => {
    const users = readQuery({
      data: [
        { id: 'archived-user', is_archived: true, archived_at: '2026-10-01T00:00:00.000Z' },
        { id: 'restored-user', is_archived: false, archived_at: '2026-09-01T00:00:00.000Z' },
      ],
      error: null,
    });
    const stampCall = updateQuery({ data: [{ listing_id: 'archive-listing' }], error: null });
    const markedCall = updateQuery({ data: [], error: null });
    const legacyCall = updateQuery({ data: [], error: null });
    const lastResortCall = updateQuery({ data: [{ listing_id: 'legacy-listing' }], error: null });
    const listingCalls = [stampCall, markedCall, legacyCall, lastResortCall];
    let listingIndex = 0;

    supabase.from.mockImplementation((table) => {
      if (table === 'users_table') return users;
      if (table === 'equipment_listings') return listingCalls[listingIndex++];
      return updateQuery({ data: [], error: null });
    });

    const totals = await reconcileArchivedAccounts();

    expect(listingIndex).toBe(4);
    expect(legacyCall.filters).toContainEqual(['updated_at', 'gte', '2026-09-01T00:00:00.000Z']);
    expect(lastResortCall.filters).not.toContainEqual(['updated_at', 'gte', '2026-09-01T00:00:00.000Z']);
    expect(lastResortCall.filters).toContainEqual(['archived_at', 'is', null]);
    expect(totals).toEqual(expect.objectContaining({
      accounts: 1,
      healedAccounts: 1,
      listings: 2,
    }));
  });
});
