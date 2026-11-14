process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.INVITE_TOKEN_PEPPER = 'a'.repeat(64);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { getUser: jest.fn() } })),
}));

jest.mock('../../db/supabase', () => {
  const query = {
    select: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    eq: () => query,
    in: () => query,
    gt: () => query,
    gte: () => query,
    lt: () => query,
    is: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return {
    from: () => query,
    auth: {
      admin: {
        createUser: jest.fn(),
        updateUserById: jest.fn(),
        deleteUser: jest.fn(),
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  };
});

jest.mock('../../services/mailer', () => ({ sendEmail: jest.fn() }));

const express = require('express');
const request = require('supertest');
const authRoutes = require('../auth');
const userRoutes = require('../users');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  return app;
}

const STRONG_PASSWORD = 'StrongPassw0rd!';
const INVITE_ID = '22222222-2222-4222-8222-222222222222';

describe('invite routes', () => {
  const app = buildApp();

  it('requires authentication to create an invitation', async () => {
    const res = await request(app)
      .post('/api/users/invite')
      .send({ name: 'Maria', email: 'maria@example.com', role: 'admin' });

    expect(res.status).toBe(401);
  });

  it('requires authentication to resend an invitation', async () => {
    const res = await request(app).post(`/api/users/invites/${INVITE_ID}/resend`);

    // 401 (not 404) proves the three-segment route is registered and not
    // shadowed by /:id handlers.
    expect(res.status).toBe(401);
  });

  it('requires authentication to revoke an invitation', async () => {
    const res = await request(app).post(`/api/users/invites/${INVITE_ID}/revoke`);
    expect(res.status).toBe(401);
  });

  it('requires authentication to send a reset link to a member', async () => {
    const res = await request(app).post(`/api/users/${INVITE_ID}/send-password-reset`);
    expect(res.status).toBe(401);
  });

  it('enforces the password policy at validation time', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: 'a'.repeat(43), password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'password' })]));
  });

  it('accepts any password of at least 7 characters', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: 'a'.repeat(43), password: 'simple7' });

    // Validation passes; the unknown token is what rejects the request.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVITE_INVALID');
    expect(res.body.details).toBeUndefined();
  });

  it('rejects a 6-character password', async () => {
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: 'a'.repeat(43), password: 'sixchr' });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'password', message: expect.stringMatching(/at least 7/i) }),
    ]));
  });

  it('returns a generic error for an unknown token and never echoes it', async () => {
    const token = 'b'.repeat(43);
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, password: STRONG_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'This invitation is invalid or has expired', code: 'INVITE_INVALID' });
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});
