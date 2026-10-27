process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.INVITE_TOKEN_PEPPER = 'a'.repeat(64);

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const passwordResets = require('../passwordResets');
const invites = require('../invites');

let nextResult;
let lastQuery;

function makeQuery() {
  const q = {};
  const chain = () => q;
  Object.assign(q, {
    select: jest.fn(chain),
    insert: jest.fn(chain),
    update: jest.fn(chain),
    eq: jest.fn(chain),
    in: jest.fn(chain),
    is: jest.fn(chain),
    gt: jest.fn(chain),
    gte: jest.fn(chain),
    lt: jest.fn(chain),
    order: jest.fn(chain),
    limit: jest.fn(chain),
    maybeSingle: jest.fn(() => Promise.resolve(nextResult)),
    single: jest.fn(() => Promise.resolve(nextResult)),
    then: (resolve, reject) => Promise.resolve(nextResult).then(resolve, reject),
  });
  lastQuery = q;
  return q;
}

beforeEach(() => {
  nextResult = { data: null, error: null };
  supabase.from.mockReset();
  supabase.from.mockImplementation(() => makeQuery());
});

describe('buildResetUrl', () => {
  it('puts the token in the fragment, never the query string', () => {
    const url = passwordResets.buildResetUrl('abc123');
    expect(url).toContain('/reset-password#token=abc123');
    expect(url).not.toContain('?token=');
  });
});

describe('createReset', () => {
  it('invalidates previous links and stores only the hash', async () => {
    nextResult = { data: { reset_id: 'reset-1', expires_at: new Date(Date.now() + 60000).toISOString() }, error: null };

    const created = await passwordResets.createReset({ userId: 'user-1', email: ' Admin@Example.com ', ip: '127.0.0.1' });

    expect(created.rawToken).toBeTruthy();
    expect(invites.hashToken(created.rawToken)).toHaveLength(64);

    const insertCall = supabase.from.mock.results[1].value.insert.mock.calls[0][0];
    expect(insertCall).toMatchObject({ user_id: 'user-1', email: 'admin@example.com', requested_ip: '127.0.0.1' });
    expect(insertCall.token_hash).toBe(invites.hashToken(created.rawToken));
    expect(JSON.stringify(insertCall)).not.toContain(created.rawToken);
  });

  it('returns null instead of throwing when the insert fails', async () => {
    nextResult = { data: null, error: { code: '23505', message: 'duplicate' } };
    await expect(passwordResets.createReset({ userId: 'user-1', email: 'a@b.co' })).resolves.toBeNull();
  });
});

describe('findValidReset', () => {
  const rawToken = 'raw-token-value';
  const base = {
    reset_id: 'reset-1',
    user_id: 'user-1',
    email: 'admin@example.com',
    token_hash: null,
    used_at: null,
    expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  base.token_hash = invites.hashToken(rawToken);

  it('rejects a missing token without hitting the database', async () => {
    await expect(passwordResets.findValidReset('')).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns the row for a live link', async () => {
    nextResult = { data: base, error: null };
    await expect(passwordResets.findValidReset(rawToken)).resolves.toBe(base);
  });

  it('rejects used and expired links', async () => {
    nextResult = { data: { ...base, used_at: new Date().toISOString() }, error: null };
    await expect(passwordResets.findValidReset(rawToken)).resolves.toBeNull();

    nextResult = { data: { ...base, expires_at: new Date(Date.now() - 1000).toISOString() }, error: null };
    await expect(passwordResets.findValidReset(rawToken)).resolves.toBeNull();
  });
});

describe('consume', () => {
  it('returns null when the link was already used', async () => {
    nextResult = { data: null, error: null };
    await expect(passwordResets.consume('reset-1')).resolves.toBeNull();
    expect(lastQuery.is).toHaveBeenCalledWith('used_at', null);
    expect(lastQuery.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });
});

describe('countRecent', () => {
  it('reports zero instead of blocking when the count probe fails', async () => {
    nextResult = { count: null, error: { message: 'boom' } };
    await expect(passwordResets.countRecent('user-1')).resolves.toBe(0);
  });

  it('returns the number of links created in the window', async () => {
    nextResult = { count: 2, error: null };
    await expect(passwordResets.countRecent('user-1')).resolves.toBe(2);
  });
});
