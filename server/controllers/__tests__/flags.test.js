process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

jest.mock('../../utilities/activityLogger', () => ({
  logAdminActivity: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { logAdminActivity } = require('../../utilities/activityLogger');
const { entityIdToken } = require('../../utilities/entityIds');
const { resolveFlag, dismissFlag } = require('../flags');

const FLAG_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
// The job post from the reported activity entry.
const JOB_ID = 'bf80ea53-9266-4d02-bfe7-89528a237da9';

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function makeReq(overrides = {}) {
  return {
    user: { id: ADMIN_ID, name: 'Admin', roles: ['admin'] },
    params: { id: FLAG_ID },
    body: {},
    ...overrides,
  };
}

function mockFlagsTable(status) {
  const flag = {
    flag_id: FLAG_ID,
    entity_type: 'job_post',
    entity_id: JOB_ID,
    status: 'open',
  };
  const updated = { ...flag, status, resolved_by: ADMIN_ID };

  const fetchChain = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: flag, error: null }),
  };
  fetchChain.select.mockReturnValue(fetchChain);
  fetchChain.eq.mockReturnValue(fetchChain);

  const updateChain = {
    eq: jest.fn(),
    select: jest.fn(),
    single: jest.fn().mockResolvedValue({ data: updated, error: null }),
  };
  updateChain.eq.mockReturnValue(updateChain);
  updateChain.select.mockReturnValue(updateChain);

  const table = {
    select: jest.fn(() => fetchChain),
    update: jest.fn(() => updateChain),
  };
  supabase.from.mockReturnValue(table);
  return { table, updateChain };
}

describe('flag moderation activity descriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReset();
  });

  it('logs the friendly JOB id (not the UUID) when an admin dismisses a flag', async () => {
    const { updateChain } = mockFlagsTable('dismissed');
    const res = makeRes();

    await dismissFlag(makeReq({ body: { note: 'Not a violation' } }), res);

    expect(updateChain.eq).toHaveBeenCalledWith('flag_id', FLAG_ID);
    expect(logAdminActivity).toHaveBeenCalledTimes(1);
    const payload = logAdminActivity.mock.calls[0][0];
    expect(payload.description).toBe(
      `Admin dismissed flag for job post ${entityIdToken(JOB_ID, 'JOB-')}: Not a violation`,
    );
    expect(payload.description).not.toContain(JOB_ID);
    expect(payload.relatedJobPostId).toBe(JOB_ID);
  });

  it('logs the friendly JOB id when an admin resolves a flag', async () => {
    mockFlagsTable('resolved');
    const res = makeRes();

    await resolveFlag(makeReq(), res);

    const payload = logAdminActivity.mock.calls[0][0];
    expect(payload.description).toBe(
      `Admin resolved flag for job post ${entityIdToken(JOB_ID, 'JOB-')}`,
    );
    expect(payload.description).not.toContain(JOB_ID);
  });
});
