process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { getUser: (...args) => mockGetUser(...args) } })),
}));

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  auth: { signInWithPassword: jest.fn() },
}));

const supabase = require('../../db/supabase');
const { login } = require('../auth');
const { authenticate } = require('../../middleware/auth');

function chainable(result) {
  const q = {};
  const chain = () => q;
  Object.assign(q, {
    select: jest.fn(chain),
    eq: jest.fn(chain),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve) => Promise.resolve(result).then(resolve),
  });
  return q;
}

function mockProfile(profile, roleRows) {
  supabase.from.mockImplementation((table) => {
    if (table === 'user_roles') return chainable({ data: roleRows, error: null });
    return chainable({ data: profile, error: null });
  });
}

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'someone@example.com' } },
    error: null,
  });
  mockProfile({ id: 'user-1', email: 'someone@example.com', is_archived: false }, []);
});

describe('local admin backdoor removal', () => {
  it('never issues a local admin token for the hard-coded credentials', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    const res = mockRes();

    await login({ body: { email: 'gawaadmin@email.com', password: 'gawaadmin123' } }, res);

    // The hard-coded credentials must fall through to the real auth provider.
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'gawaadmin@email.com',
      password: 'gawaadmin123',
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ token: 'gawa-local-admin-token' }),
    }));
  });

  it.each(['production', 'development', 'test'])(
    'rejects the hard-coded local admin token in NODE_ENV=%s',
    async (nodeEnv) => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      try {
        // The hard-coded token is not a Supabase JWT, so the provider rejects it.
        mockGetUser.mockResolvedValue({ data: null, error: { message: 'invalid JWT' } });
        const req = { headers: { authorization: 'Bearer gawa-local-admin-token' } };
        const res = mockRes();
        const next = jest.fn();

        await authenticate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        expect(req.user).toBeUndefined();
      } finally {
        process.env.NODE_ENV = previous;
      }
    }
  );

  it('never grants admin to the hard-coded token, even if a provider accepted it', async () => {
    // Defence in depth: the token has no special case in the middleware, so a
    // caller is only ever as privileged as their own role records say.
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'client', is_archived: false },
      []
    );
    const req = { headers: { authorization: 'Bearer gawa-local-admin-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.roles).toEqual([]);
    expect(req.user.role).toBeNull();
  });
});

describe('role resolution precedence', () => {
  it('uses the profile role when no other source is available', async () => {
    // The role lives on the profile row today, so it has to be honoured.
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'admin', is_archived: false },
      []
    );
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.roles).toEqual(['admin']);
    expect(req.user.role).toBe('admin');
  });

  it('lets the role table override the profile role', async () => {
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'admin', is_archived: false },
      [{ roles: { role_name: 'customer_support' } }]
    );
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.roles).toEqual(['customer_support']);
    expect(req.user.role).toBe('customer_support');
  });

  it('derives the role from the role table', async () => {
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'client', is_archived: false },
      [{ roles: { role_name: 'admin' } }]
    );
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.roles).toEqual(['admin']);
    expect(req.user.role).toBe('admin');
  });

  it('falls back to the server-managed auth metadata when the role table is empty', async () => {
    // `app_metadata` can only be written with the service role, so it is a
    // safe carrier for the role while the role table is still missing.
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'someone@example.com',
          app_metadata: { gawa_role: 'customer_support' },
        },
      },
      error: null,
    });
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'client', is_archived: false },
      []
    );
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.roles).toEqual(['customer_support']);
    expect(req.user.role).toBe('customer_support');
  });

  it('ignores a role value that is not a team role', async () => {
    for (const value of ['superuser', 'owner', 'administrator', 'staff']) {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'someone@example.com', app_metadata: { gawa_role: value } } },
        error: null,
      });
      mockProfile(
        { id: 'user-1', email: 'someone@example.com', role: 'client', is_archived: false },
        []
      );
      const req = { headers: { authorization: 'Bearer valid-token' } };
      const res = mockRes();
      const next = jest.fn();

      await authenticate(req, res, next);

      expect(req.user.roles).toEqual([]);
      expect(req.user.role).toBeNull();
    }
  });

  it('accepts a team role written in a different case or with padding', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'someone@example.com', app_metadata: { gawa_role: ' Admin ' } } },
      error: null,
    });
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'client', is_archived: false },
      []
    );
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user.roles).toEqual(['admin']);
    expect(req.user.role).toBe('admin');
  });
});

describe('a revoked session is refused', () => {
  it('rejects a token that was issued before the sessions were revoked', async () => {
    // The token carries the version it was minted with; the account carries
    // the current one. A mismatch means the session was revoked.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: 'user-1', app_metadata: { gawa_role: 'admin', gawa_token_version: 1 },
    })).toString('base64url');
    const staleToken = `${header}.${payload}.sig`;

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'someone@example.com',
          app_metadata: { gawa_role: 'admin', gawa_token_version: 2 },
        },
      },
      error: null,
    });
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'admin', is_archived: false },
      [{ roles: { role_name: 'admin' } }]
    );
    const req = { headers: { authorization: `Bearer ${staleToken}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session revoked. Please sign in again.' });
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('accepts a token whose version matches the account', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: 'user-1', app_metadata: { gawa_role: 'admin', gawa_token_version: 2 },
    })).toString('base64url');
    const freshToken = `${header}.${payload}.sig`;

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'someone@example.com',
          app_metadata: { gawa_role: 'admin', gawa_token_version: 2 },
        },
      },
      error: null,
    });
    mockProfile(
      { id: 'user-1', email: 'someone@example.com', role: 'admin', is_archived: false },
      [{ roles: { role_name: 'admin' } }]
    );
    const req = { headers: { authorization: `Bearer ${freshToken}` } };
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe('admin');
  });
});
