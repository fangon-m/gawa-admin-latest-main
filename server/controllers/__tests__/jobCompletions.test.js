process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const JOB_ID = '803a938f-775c-4e28-a757-42254100a3ce';
const MATCH_ID = 'cbcae146-6c3e-46b0-93cc-67570900e5a4';
const OTHER_MATCH_ID = 'dc66ed75-dae6-4ce7-b96c-211222c8f762';

const mockCalls = [];
const mockJOB = { job_post_id: JOB_ID, job_title: 'A job', client_id: 'client-1' };
const mockMATCH = { job_match_id: MATCH_ID, job_post_id: JOB_ID, user_id: 'talent-1', client_id: 'client-1', status: 'completed' };
const mockOTHER_MATCH = { job_match_id: OTHER_MATCH_ID, job_post_id: JOB_ID, user_id: 'talent-2', client_id: 'client-1', status: 'accepted' };

jest.mock('../../db/supabase', () => {
  const rowsFor = (table) => {
    if (table === 'job_posts') return [mockJOB];
    if (table === 'job_matches') return [mockMATCH, mockOTHER_MATCH];
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

beforeEach(() => {
  mockCalls.length = 0;
  jest.clearAllMocks();
});

describe('job completions', () => {
  it('collects the completions of the job\'s matches, not of the post id', async () => {
    const res = makeRes();

    await getJobById({ params: { id: JOB_ID } }, res);

    // The job has two matches; the completions of both are wanted.
    const completionCall = mockCalls.find((c) => c.table === 'job_completion');
    expect(completionCall).toBeDefined();
    expect(completionCall.op).toBe('in');
    expect(completionCall.column).toBe('job_match_id');
    expect(completionCall.values).toEqual([MATCH_ID, OTHER_MATCH_ID]);
  });

  it('never filters the completion table by the job post id', async () => {
    // Filtering `job_completion` by the post id compares two different keys
    // and silently matches nothing, so the tab was always empty.
    const res = makeRes();

    await getJobById({ params: { id: JOB_ID } }, res);

    const wrong = mockCalls.find(
      (c) => c.table === 'job_completion' && c.op === 'eq' && c.column === 'job_match_id' && c.value === JOB_ID
    );
    expect(wrong).toBeUndefined();
  });

  it('asks for the matches of the job', async () => {
    const res = makeRes();

    await getJobById({ params: { id: JOB_ID } }, res);

    const matchesCall = mockCalls.find((c) => c.table === 'job_matches' && c.column === 'job_post_id');
    expect(matchesCall).toBeDefined();
    expect(matchesCall.value).toBe(JOB_ID);
  });
});
