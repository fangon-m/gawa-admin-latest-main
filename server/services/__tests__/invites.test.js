process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.INVITE_TOKEN_PEPPER = 'a'.repeat(64);

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const invites = require('../invites');

let nextResult;

function makeQuery() {
  const q = {};
  const chain = () => q;
  Object.assign(q, {
    select: jest.fn(chain),
    insert: jest.fn(chain),
    update: jest.fn(chain),
    delete: jest.fn(chain),
    eq: jest.fn(chain),
    in: jest.fn(chain),
    gt: jest.fn(chain),
    gte: jest.fn(chain),
    lt: jest.fn(chain),
    lte: jest.fn(chain),
    is: jest.fn(chain),
    order: jest.fn(chain),
    limit: jest.fn(chain),
    maybeSingle: jest.fn(() => Promise.resolve(nextResult)),
    single: jest.fn(() => Promise.resolve(nextResult)),
    then: (resolve, reject) => Promise.resolve(nextResult).then(resolve, reject),
  });
  return q;
}

beforeEach(() => {
  nextResult = { data: null, error: null };
  supabase.from.mockReset();
  supabase.from.mockImplementation(() => makeQuery());
});

describe('invite token handling', () => {
  it('mints 256-bit base64url tokens that never repeat', () => {
    const tokens = new Set();
    for (let i = 0; i < 200; i += 1) {
      const token = invites.mintToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      tokens.add(token);
    }
    expect(tokens.size).toBe(200);
  });

  it('stores only an HMAC hash and never the raw token', () => {
    const token = invites.mintToken();
    const hash = invites.hashToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(invites.hashToken(token)).toBe(hash);
  });

  it('compares tokens in constant time', () => {
    const token = invites.mintToken();
    expect(invites.tokensMatch(token, invites.hashToken(token))).toBe(true);
    expect(invites.tokensMatch(invites.mintToken(), invites.hashToken(token))).toBe(false);
    expect(invites.tokensMatch(token, '')).toBe(false);
  });

  it('builds the accept URL with the token in the fragment', () => {
    const url = invites.buildAcceptUrl('abc123');
    expect(url).toContain('/accept-invite#token=abc123');
    expect(url).not.toContain('?token=');
  });

  it('normalizes emails for lookups', () => {
    expect(invites.normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com');
  });
});

describe('findAcceptableInvite', () => {
  const rawToken = 'token-value';
  const baseInvite = {
    invite_id: 'invite-1',
    status: 'sent',
    token_hash: invites.hashToken(rawToken),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

  it('rejects a missing token without touching the database', async () => {
    await expect(invites.findAcceptableInvite('')).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns null for terminal statuses', async () => {
    nextResult = { data: { ...baseInvite, status: 'revoked' }, error: null };
    await expect(invites.findAcceptableInvite(rawToken)).resolves.toBeNull();
  });

  it('returns the invite when valid', async () => {
    nextResult = { data: baseInvite, error: null };
    await expect(invites.findAcceptableInvite(rawToken)).resolves.toBe(baseInvite);
  });

  it('expires a stale invite on read', async () => {
    nextResult = {
      data: { ...baseInvite, expires_at: new Date(Date.now() - 1000).toISOString() },
      error: null,
    };
    await expect(invites.findAcceptableInvite(rawToken)).resolves.toBeNull();

    const query = supabase.from.mock.results.at(-1).value;
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }));
  });
});

describe('claimInvite', () => {
  it('returns null when another request already claimed the invite', async () => {
    nextResult = { data: null, error: null };
    await expect(invites.claimInvite('invite-1')).resolves.toBeNull();
  });

  it('marks only live invites as accepted', async () => {
    nextResult = { data: { invite_id: 'invite-1', status: 'accepted' }, error: null };
    const claimed = await invites.claimInvite('invite-1');

    expect(claimed.status).toBe('accepted');
    const query = supabase.from.mock.results.at(-1).value;
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    expect(query.in).toHaveBeenCalledWith('status', ['pending', 'sent', 'failed']);
  });
});

describe('assertActorQuota', () => {
  it('throws a 429 once the daily per-actor cap is reached', async () => {
    nextResult = { count: 50, error: null };
    await expect(invites.assertActorQuota('actor-1')).rejects.toMatchObject({ status: 429 });
  });

  it('allows invites below the cap', async () => {
    nextResult = { count: 3, error: null };
    await expect(invites.assertActorQuota('actor-1')).resolves.toBeUndefined();
  });
});

describe('expireStaleInvites', () => {
  it('flips expired live invites without throwing', async () => {
    await expect(invites.expireStaleInvites()).resolves.toBeUndefined();
    const query = supabase.from.mock.results.at(-1).value;
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }));
    expect(query.lt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });
});
