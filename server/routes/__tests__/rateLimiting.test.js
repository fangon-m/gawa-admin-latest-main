process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(() => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      in: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      range: jest.fn(() => query),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
    };
    return query;
  }),
  auth: { signInWithPassword: jest.fn(() => Promise.resolve({ data: null, error: { message: 'nope' } })) },
  testConnection: jest.fn(() => Promise.resolve(true)),
  ensureConnection: jest.fn(() => Promise.resolve({})),
}));

const request = require('supertest');
const { app } = require('../../server');

/**
 * The portal makes around fifteen calls per page load, so a budget of a
 * hundred requests for the whole API meant the site locked itself out with
 * "429" after a handful of page loads. These tests pin the behaviour that
 * stopped that happening, and the sign-in limits that must still hold.
 */
describe('rate limiting', () => {
  it('serves many requests without locking the caller out', async () => {
    const responses = [];
    for (let i = 0; i < 150; i += 1) {
      const response = await request(app).get('/api/health');
      responses.push(response.status);
    }
    expect(responses.filter((s) => s === 429)).toHaveLength(0);
  });

  it('never limits the health probe', async () => {
    for (let i = 0; i < 120; i += 1) {
      const response = await request(app).get('/api/health');
      expect(response.status).not.toBe(429);
    }
  });

  it('still limits repeated sign-in attempts for the same account', async () => {
    const statuses = [];
    for (let i = 0; i < 14; i += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'wrong-password' });
      statuses.push(response.status);
    }
    // The per-account budget must hold: ten attempts, then locked out.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses[statuses.length - 1]).toBe(429);
  });

  it('counts each account separately', async () => {
    const first = [];
    for (let i = 0; i < 12; i += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'first@example.com', password: 'wrong-password' });
      first.push(response.status);
    }
    expect(first[first.length - 1]).toBe(429);

    // A different account is not locked out by the first one's failures.
    const other = await request(app)
      .post('/api/auth/login')
      .send({ email: 'second@example.com', password: 'wrong-password' });
    expect(other.status).not.toBe(429);
  });

  it('does not spend the sign-in budget on ordinary session calls', async () => {
    // The portal calls /api/auth/me on every page load. Counting those
    // against the sign-in limit would lock a working session out of signing
    // in again.
    for (let i = 0; i < 30; i += 1) {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).not.toBe(429);
    }
  });
});
