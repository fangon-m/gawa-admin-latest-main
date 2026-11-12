process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const updateCalls = [];

jest.mock('../../db/supabase', () => ({
  from: jest.fn((table) => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      update: jest.fn((values) => {
        updateCalls.push({ table, values });
        return query;
      }),
      single: jest.fn(() => Promise.resolve({
        data: { id: 'target-user', email: 'target@example.com', role: 'client' },
        error: null,
      })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve) => Promise.resolve({
        data: { id: 'target-user', email: 'target@example.com', role: 'client' },
        error: null,
      }).then(resolve),
    };
    return query;
  }),
  auth: { admin: { updateUserById: jest.fn() } },
}));

const { updateUser } = require('../users');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => {
  updateCalls.length = 0;
  jest.clearAllMocks();
});

describe('role cannot be changed through the API', () => {
  it('ignores a role in the request body', async () => {
    const res = makeRes();

    await updateUser(
      {
        params: { id: 'target-user' },
        body: { name: 'Renamed Person', role: 'admin', is_archived: true, is_verified: true },
        user: { id: 'admin-1' },
      },
      res
    );

    const update = updateCalls.find((call) => call.table === 'users_table');
    expect(update).toBeDefined();
    expect(update.values).not.toHaveProperty('role');
    expect(update.values).not.toHaveProperty('is_archived');
    expect(update.values).not.toHaveProperty('is_verified');
    // The fields that are allowed are still written.
    expect(update.values).toHaveProperty('first_name', 'Renamed');
    expect(update.values).toHaveProperty('last_name', 'Person');
  });

  it('never writes the role column, whatever the body contains', async () => {
    const res = makeRes();

    await updateUser(
      {
        params: { id: 'target-user' },
        body: { role: 'customer_support', firstName: 'A', lastName: 'B' },
        user: { id: 'admin-1' },
      },
      res
    );

    const update = updateCalls.find((call) => call.table === 'users_table');
    expect(Object.keys(update.values)).not.toContain('role');
  });
});
