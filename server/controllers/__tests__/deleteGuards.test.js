jest.mock('../../db/supabase', () => ({ from: jest.fn() }));
jest.mock('../../utilities/activityLogger', () => ({ logAdminActivity: jest.fn() }));
jest.mock('../../utilities/roleSetup', () => ({
  isRoleTableReady: jest.fn().mockResolvedValue(true),
  ensureStaffRoles: jest.fn().mockResolvedValue(undefined),
}));

const supabase = require('../../db/supabase');
const { deleteSkillAssessment } = require('../skillAssessments');
const { deleteCompletion } = require('../tasks');
const { deleteUser } = require('../users');
const { deleteRole, removeUserRole } = require('../roles');
const { removeFlag } = require('../flags');

function query(result) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    delete: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
}

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('additional delete guards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks deleting an assessment that still has questions', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'assessment_questions') return query({ count: 4, error: null });
      return query({ count: 0, error: null });
    });
    const res = response();

    await deleteSkillAssessment({ params: { id: 'assessment-id' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toContain('4 questions');
  });

  it('blocks deleting a confirmed job completion', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'job_completion') return query({ data: { job_completion_id: 'completion-id', job_match_id: 'match-id', confirmed_at: '2026-01-01T00:00:00Z' }, error: null });
      return query({ count: 0, error: null, data: null });
    });
    const res = response();

    await deleteCompletion({ params: { id: 'completion-id' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('blocks deleting a user with transaction history', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'transactions') return query({ count: 2, error: null });
      if (table === 'users_table') return query({ data: { id: 'target-user', first_name: 'Ada' }, error: null });
      return query({ count: 0, error: null });
    });
    const res = response();

    await deleteUser({ params: { id: 'target-user' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toContain('2 transactions');
    expect(supabase.auth?.admin?.deleteUser).toBeUndefined();
  });

  it('blocks deleting a role that is still assigned', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'user_roles') return query({ count: 1, error: null });
      return query({ error: null });
    });
    const res = response();

    await deleteRole({ params: { id: 'role-id' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('blocks removing the last admin role', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'user_roles') {
        return query({ data: { user_role_id: 'assignment-id', user_id: 'user-id', role_id: 'admin-role' }, count: 1, error: null });
      }
      if (table === 'roles') return query({ data: { role_id: 'admin-role' }, error: null });
      return query({ error: null });
    });
    const res = response();

    await removeUserRole({ params: { id: 'assignment-id' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Cannot remove the last administrator role. Assign another admin first.' });
  });

  it('blocks removing an open flag', async () => {
    supabase.from.mockImplementation(() => query({ data: { flag_id: 'flag-id', status: 'open' }, error: null }));
    const res = response();

    await removeFlag({ params: { id: 'flag-id' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Resolve or dismiss this flag before removing it.' });
  });
});
