process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  auth: {
    admin: {
      updateUserById: jest.fn(),
    },
  },
}));

const supabase = require('../../db/supabase');
const { archiveUser, unarchiveUser } = require('../users');

function makeQuery(result, { payload } = {}) {
  const query = {
    eq: jest.fn(() => query),
    is: jest.fn(() => query),
    not: jest.fn(() => query),
    in: jest.fn(() => query),
    lte: jest.fn(() => query),
    select: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  if (payload !== undefined) query.payload = payload;
  return query;
}

function tableMock({ selectResult, updateResult }) {
  return {
    select: jest.fn(() => selectResult),
    update: jest.fn((payload) => {
      updateResult.payload = payload;
      return updateResult;
    }),
  };
}

describe('user archive controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: { id: 'user-uuid-123' },
      body: { reason: 'Policy violation' },
      user: { id: 'admin-uuid', name: 'Admin' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('retains profile data, marks the user archived, and bans future sign-ins', async () => {
    const lookup = makeQuery({ data: { id: req.params.id, role: 'client', is_archived: false }, error: null });
    const saved = makeQuery({
      data: { id: req.params.id, role: 'client', is_archived: true, is_verified: true, first_name: 'Ada', archived_at: '2026-10-04T00:00:00.000Z' },
      error: null,
    });
    const posts = makeQuery({ data: [{ job_post_id: 'post-1' }, { job_post_id: 'post-2' }], error: null });
    const proposals = makeQuery({ data: [{ proposal_id: 'proposal-1' }], error: null });
    const listings = makeQuery({ data: [{ listing_id: 'listing-1' }], error: null });

    supabase.from.mockImplementation((table) => {
      if (table === 'job_posts') return tableMock({ updateResult: posts });
      if (table === 'job_proposals') return tableMock({ updateResult: proposals });
      if (table === 'equipment_listings') return tableMock({ updateResult: listings });
      return tableMock({ selectResult: lookup, updateResult: saved });
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    await archiveUser(req, res);

    expect(saved.payload).toEqual(expect.objectContaining({
      is_archived: true,
      archived_by: 'admin-uuid',
      archive_reason: 'Policy violation',
    }));
    expect(posts.payload).toEqual(expect.objectContaining({ client_archived_at: expect.any(String) }));
    expect(proposals.payload).toEqual(expect.objectContaining({ proposer_archived_at: expect.any(String) }));
    expect(listings.payload).toEqual(expect.objectContaining({ status: 'unavailable' }));
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(req.params.id, { ban_duration: '876000h' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'archived', firstName: 'Ada' }),
      archivedContent: { jobPosts: 2, proposals: 1, listings: 1 },
      message: 'User archived and banned from signing in',
    }));
  });

  it('rejects archiving staff accounts', async () => {
    const lookup = makeQuery({ data: { id: req.params.id, role: 'admin', is_archived: false }, error: null });
    supabase.from.mockReturnValue(tableMock({ selectResult: lookup }));

    await archiveUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('unbans and restores an archived account without deleting its records', async () => {
    const lookup = makeQuery({ data: { id: req.params.id, is_archived: true, archived_at: '2026-10-04T00:00:00.000Z' }, error: null });
    const saved = makeQuery({
      data: { id: req.params.id, role: 'client', is_archived: false, is_verified: true, first_name: 'Ada' },
      error: null,
    });
    const posts = makeQuery({ data: [{ job_post_id: 'post-1' }], error: null });
    const proposals = makeQuery({ data: [], error: null });
    const listings = makeQuery({ data: [{ listing_id: 'listing-1' }], error: null });

    supabase.from.mockImplementation((table) => {
      if (table === 'job_posts') return tableMock({ updateResult: posts });
      if (table === 'job_proposals') return tableMock({ updateResult: proposals });
      if (table === 'equipment_listings') return tableMock({ updateResult: listings });
      return tableMock({ selectResult: lookup, updateResult: saved });
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    await unarchiveUser(req, res);

    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(req.params.id, { ban_duration: 'none' });
    expect(saved.payload).toEqual(expect.objectContaining({ is_archived: false }));
    expect(posts.payload).toEqual(expect.objectContaining({ client_archived_at: null }));
    expect(proposals.payload).toEqual(expect.objectContaining({ proposer_archived_at: null }));
    expect(listings.payload).toEqual(expect.objectContaining({ status: 'available' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'verified' }),
      restoredContent: { jobPosts: 1, proposals: 0, listings: 1 },
      message: 'User unarchived and sign-in restored',
    }));
  });

  it('does not restore content markers that were not set by the account archive', async () => {
    const lookup = makeQuery({ data: { id: req.params.id, is_archived: true, archived_at: null }, error: null });
    const saved = makeQuery({ data: { id: req.params.id, role: 'client', is_archived: false }, error: null });

    supabase.from.mockImplementation(() => tableMock({ selectResult: lookup, updateResult: saved }));
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    await unarchiveUser(req, res);

    expect(supabase.from).not.toHaveBeenCalledWith('job_posts');
    expect(supabase.from).not.toHaveBeenCalledWith('equipment_listings');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      restoredContent: { jobPosts: 0, proposals: 0, listings: 0 },
    }));
  });
});
