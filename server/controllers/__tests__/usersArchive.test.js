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

function makeQuery(result) {
  const query = {
    eq: jest.fn(() => query),
    select: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
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
    const update = jest.fn(() => saved);
    supabase.from.mockReturnValue({ select: jest.fn(() => lookup), update });
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    await archiveUser(req, res);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      is_archived: true,
      archived_by: 'admin-uuid',
      archive_reason: 'Policy violation',
    }));
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(req.params.id, { ban_duration: '876000h' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'archived', firstName: 'Ada' }),
      message: 'User archived and banned from signing in',
    }));
  });

  it('rejects archiving staff accounts', async () => {
    const lookup = makeQuery({ data: { id: req.params.id, role: 'admin', is_archived: false }, error: null });
    supabase.from.mockReturnValue({ select: jest.fn(() => lookup) });

    await archiveUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('unbans and restores an archived account without deleting its records', async () => {
    const lookup = makeQuery({ data: { id: req.params.id, is_archived: true }, error: null });
    const saved = makeQuery({
      data: { id: req.params.id, role: 'client', is_archived: false, is_verified: true, first_name: 'Ada' },
      error: null,
    });
    const update = jest.fn(() => saved);
    supabase.from.mockReturnValue({ select: jest.fn(() => lookup), update });
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

    await unarchiveUser(req, res);

    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(req.params.id, { ban_duration: 'none' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_archived: false }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'verified' }),
      message: 'User unarchived and sign-in restored',
    }));
  });
});
