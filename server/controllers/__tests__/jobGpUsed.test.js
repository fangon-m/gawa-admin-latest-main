process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const JOB_ID = '803a938f-775c-4e28-a757-42254100a3ce';
const PROPOSAL_CHARGED = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_LEGACY = '22222222-2222-4222-8222-222222222222';

const mockCalls = [];

const mockJOB = { job_post_id: JOB_ID, job_title: 'A job', client_id: 'client-1' };
const mockMATCH_CHARGED = {
  job_match_id: 'match-charged',
  job_post_id: JOB_ID,
  proposal_id: PROPOSAL_CHARGED,
  client_id: 'client-1',
  user_id: 'talent-1',
  connections: null,
  status: 'accepted',
  agreed_price: 100,
};
const mockMATCH_LEGACY = {
  job_match_id: 'match-legacy',
  job_post_id: JOB_ID,
  proposal_id: PROPOSAL_LEGACY,
  client_id: 'client-1',
  user_id: 'talent-2',
  connections: 9,
  status: 'pending',
  agreed_price: 200,
};
const mockCHARGES = [
  { proposal_id: PROPOSAL_CHARGED, amount: -7 },
  { proposal_id: PROPOSAL_CHARGED, amount: -3 },
];

jest.mock('../../db/supabase', () => {
  const rowsFor = (table) => {
    if (table === 'job_posts') return [mockJOB];
    if (table === 'job_matches') return [mockMATCH_CHARGED, mockMATCH_LEGACY];
    if (table === 'users_table') {
      return [
        { id: 'talent-1', first_name: 'Tess', last_name: 'Talent' },
        { id: 'talent-2', first_name: 'Leo', last_name: 'Legacy' },
      ];
    }
    if (table === 'gawa_points_transactions') return mockCHARGES;
    return [];
  };

  return {
    from: jest.fn((table) => {
      const query = {
        select: jest.fn(() => query),
        eq: jest.fn((column, value) => {
          mockCalls.push({ table, op: 'eq', column, value });
          return query;
        }),
        in: jest.fn((column, values) => {
          mockCalls.push({ table, op: 'in', column, values });
          return query;
        }),
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

const { getJobById } = require('../jobs');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function payloadFrom(res) {
  return res.json.mock.calls[0][0];
}

beforeEach(() => {
  mockCalls.length = 0;
  jest.clearAllMocks();
});

describe('job detail GP used', () => {
  it('sums the proposal charges from the points ledger per match', async () => {
    const res = makeRes();

    await getJobById({ params: { id: JOB_ID } }, res);

    const { matches } = payloadFrom(res).data;
    const charged = matches.find((m) => m.jobMatchId === 'match-charged');
    expect(charged.gpUsed).toBe(10);
  });

  it('queries proposal charges by the matches\' proposal ids', async () => {
    const res = makeRes();

    await getJobById({ params: { id: JOB_ID } }, res);

    const chargeFilter = mockCalls.find(
      (c) => c.table === 'gawa_points_transactions' && c.op === 'in' && c.column === 'proposal_id'
    );
    expect(chargeFilter).toBeDefined();
    expect(chargeFilter.values).toEqual([PROPOSAL_CHARGED, PROPOSAL_LEGACY]);

    const typeFilter = mockCalls.find(
      (c) => c.table === 'gawa_points_transactions' && c.op === 'eq' && c.column === 'transaction_type'
    );
    expect(typeFilter.value).toBe('proposal_charge');
  });

  it('falls back to the legacy connections column when no charge exists', async () => {
    const res = makeRes();

    await getJobById({ params: { id: JOB_ID } }, res);

    const { matches } = payloadFrom(res).data;
    const legacy = matches.find((m) => m.jobMatchId === 'match-legacy');
    expect(legacy.gpUsed).toBe(9);
  });
});
