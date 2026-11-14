process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const USER_ID = 'user-1';
const PROPOSAL_CHARGED = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_LEGACY = '22222222-2222-4222-8222-222222222222';

const mockMATCHES = [
  { job_match_id: 'match-charged', proposal_id: PROPOSAL_CHARGED, user_id: USER_ID, connections: null, status: 'completed', job_post: null },
  { job_match_id: 'match-legacy', proposal_id: PROPOSAL_LEGACY, user_id: USER_ID, connections: 6, status: 'completed', job_post: null },
];
const mockCHARGES = [{ proposal_id: PROPOSAL_CHARGED, amount: -4 }];

jest.mock('../../db/supabase', () => {
  const rowsFor = (table) => {
    if (table === 'job_matches') return mockMATCHES;
    if (table === 'gawa_points_transactions') return mockCHARGES;
    return [];
  };

  return {
    from: jest.fn((table) => {
      const query = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        in: jest.fn(() => query),
        order: jest.fn(() => query),
        limit: jest.fn(() => query),
        range: jest.fn(() => query),
        not: jest.fn(() => query),
        or: jest.fn(() => query),
        maybeSingle: jest.fn(() => Promise.resolve({ data: rowsFor(table)[0] || null, error: null })),
        single: jest.fn(() => Promise.resolve({ data: rowsFor(table)[0] || null, error: null })),
        then: (resolve) => Promise.resolve({ data: rowsFor(table), error: null, count: rowsFor(table).length }).then(resolve),
      };
      return query;
    }),
    auth: { admin: {} },
  };
});

const { listUserProposals } = require('../users');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('user proposals GP used', () => {
  it('derives GP used from the points ledger and falls back to connections', async () => {
    const res = makeRes();

    await listUserProposals({ params: { id: USER_ID } }, res);

    const { data } = res.json.mock.calls[0][0];
    const charged = data.find((m) => m.jobMatchId === 'match-charged');
    const legacy = data.find((m) => m.jobMatchId === 'match-legacy');

    expect(charged.gpUsed).toBe(4);
    expect(legacy.gpUsed).toBe(6);
  });
});
