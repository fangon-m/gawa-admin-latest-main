process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { getUser: jest.fn() } })),
}));

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const { createClient } = require('@supabase/supabase-js');
const serviceClient = require('../../db/supabase');
const { authenticate } = require('../../middleware/auth');
const anonClient = createClient.mock.results[0].value;

function queryReturning(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('authenticate archive enforcement', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: { authorization: 'Bearer valid-user-token' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    anonClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-uuid', email: 'user@example.com' } }, error: null });
  });

  it('denies API access for archived users', async () => {
    serviceClient.from.mockImplementation((table) => table === 'users_table'
      ? queryReturning({ data: { id: 'user-uuid', is_archived: true }, error: null })
      : queryReturning({ data: [], error: null }));

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'This account is archived and cannot access the application' });
    expect(next).not.toHaveBeenCalled();
  });

  it('continues authentication for users who are not archived', async () => {
    serviceClient.from.mockImplementation((table) => table === 'users_table'
      ? queryReturning({ data: { id: 'user-uuid', is_archived: false }, error: null })
      : queryReturning({ data: [], error: null }));

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
