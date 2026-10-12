process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  auth: {
    signInWithPassword: jest.fn(),
  },
}));

const supabase = require('../../db/supabase');
const { login } = require('../auth');
const { authenticate } = require('../../middleware/auth');

describe('local admin login', () => {
  it('returns the registered profile ID for the local session', async () => {
    const adminId = '11111111-1111-4111-8111-111111111111';
    const profileQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: adminId,
          first_name: 'GAWA',
          last_name: 'Admin',
          email: 'gawaadmin@email.com',
          role: 'client',
        },
        error: null,
      }),
    };
    supabase.from.mockReturnValue(profileQuery);
    const res = { json: jest.fn() };

    await login({
      body: { email: 'gawaadmin@email.com', password: 'gawaadmin123' },
    }, res);

    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(profileQuery.eq).toHaveBeenCalledWith('email', 'gawaadmin@email.com');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        token: 'gawa-local-admin-token',
        user: expect.objectContaining({
          id: adminId,
          role: 'admin',
          roles: ['admin'],
        }),
      }),
    }));
  });

  it('still creates a local session when no matching profile row is available', async () => {
    const profileQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    supabase.from.mockReturnValue(profileQuery);
    const res = { json: jest.fn() };

    await login({
      body: { email: 'gawaadmin@email.com', password: 'gawaadmin123' },
    }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        token: 'gawa-local-admin-token',
        user: expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001', role: 'admin' }),
      }),
    }));
  });

  it('resolves the local auth token to the registered profile for API requests', async () => {
    const adminId = '11111111-1111-4111-8111-111111111111';
    const profileQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: adminId,
          first_name: 'GAWA',
          last_name: 'Admin',
          email: 'gawaadmin@email.com',
          role: 'client',
          is_archived: false,
        },
        error: null,
      }),
    };
    supabase.from.mockReturnValue(profileQuery);
    const req = { headers: { authorization: 'Bearer gawa-local-admin-token' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user).toEqual(expect.objectContaining({ id: adminId, role: 'admin', roles: ['admin'] }));
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
