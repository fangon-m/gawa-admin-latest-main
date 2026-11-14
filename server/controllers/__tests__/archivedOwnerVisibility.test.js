process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const { listJobs } = require('../jobs');
const { listListings } = require('../listings');

function makeQuery(result) {
  const query = {
    eq: jest.fn(() => query),
    is: jest.fn(() => query),
    not: jest.fn(() => query),
    in: jest.fn(() => query),
    or: jest.fn(() => query),
    order: jest.fn(() => query),
    range: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function mockTables(contactQuery) {
  supabase.from.mockImplementation((table) => {
    if (table === 'users_table') {
      return { select: () => makeQuery({ data: [{ id: 'archived-owner-1' }], error: null }) };
    }
    return { select: () => contactQuery };
  });
}

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('active views exclude archived account content', () => {
  beforeEach(() => jest.clearAllMocks());

  it('excludes archived clients and owner-archived posts from the jobs list', async () => {
    const posts = makeQuery({ data: [], error: null, count: 0 });
    mockTables(posts);
    const res = makeRes();

    await listJobs({ query: {} }, res);

    expect(posts.is).toHaveBeenCalledWith('client_archived_at', null);
    expect(posts.not).toHaveBeenCalledWith('client_id', 'in', '("archived-owner-1")');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  it('keeps owner-scoped job history intact even when the client is archived', async () => {
    const posts = makeQuery({ data: [], error: null, count: 0 });
    mockTables(posts);
    const res = makeRes();

    await listJobs({ query: { userId: 'archived-owner-1' } }, res);

    expect(posts.is).not.toHaveBeenCalled();
    expect(posts.not).not.toHaveBeenCalled();
  });

  it('excludes archived equipment owners from the listings list', async () => {
    const listings = makeQuery({ data: [], error: null, count: 0 });
    mockTables(listings);
    const res = makeRes();

    await listListings({ query: {} }, res);

    expect(listings.is).toHaveBeenCalledWith('archived_at', null);
    expect(listings.not).toHaveBeenCalledWith('owner_id', 'in', '("archived-owner-1")');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  it('retries the listings query without the archive marker on older databases', async () => {
    const first = makeQuery({ data: null, error: { code: '42703', message: 'column does not exist' }, count: null });
    const second = makeQuery({ data: [], error: null, count: 0 });
    let call = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'users_table') {
        return { select: () => makeQuery({ data: [{ id: 'archived-owner-1' }], error: null }) };
      }
      call += 1;
      return { select: () => (call === 1 ? first : second) };
    });
    const res = makeRes();

    await listListings({ query: {} }, res);

    expect(call).toBe(2);
    expect(second.is).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  it('keeps owner-scoped listing history intact even when the owner is archived', async () => {
    const listings = makeQuery({ data: [], error: null, count: 0 });
    mockTables(listings);
    const res = makeRes();

    await listListings({ query: { ownerId: 'archived-owner-1' } }, res);

    expect(listings.not).not.toHaveBeenCalled();
  });
});
