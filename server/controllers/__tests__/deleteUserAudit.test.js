process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const callOrder = [];

jest.mock('../../utilities/activityLogger', () => ({
  logAdminActivity: jest.fn(async () => { callOrder.push('activity'); }),
}));

jest.mock('../../db/supabase', () => ({
  from: jest.fn(() => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn(() => Promise.resolve({
        data: { id: 'target-user', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
        error: null,
      })),
      then: (resolve) => Promise.resolve({
        data: { id: 'target-user', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
        error: null,
      }).then(resolve),
    };
    return query;
  }),
  auth: {
    admin: {
      deleteUser: jest.fn(async () => { callOrder.push('delete'); return { error: null }; }),
    },
  },
}));

const { deleteUser } = require('../users');
const { logAdminActivity } = require('../../utilities/activityLogger');

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

beforeEach(() => {
  callOrder.length = 0;
  jest.clearAllMocks();
});

describe('deleting a user keeps its audit record', () => {
  it('writes the activity record before the account is removed', async () => {
    // `activity_log.related_user_id` is a foreign key with ON DELETE SET NULL.
    // A record written after the deletion is rejected outright, so the trail
    // of a deletion would be lost.
    const res = makeRes();

    await deleteUser({ params: { id: 'target-user' }, user: { id: 'admin-1' } }, res);

    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({
      activityType: 'user_deleted',
      relatedUserId: 'target-user',
    }));
    expect(callOrder).toEqual(['activity', 'delete']);
  });

  it('still reports a failed deletion', async () => {
    const supabase = require('../../db/supabase');
    supabase.auth.admin.deleteUser.mockResolvedValueOnce({ error: new Error('nope') });
    const res = makeRes();

    await deleteUser({ params: { id: 'target-user' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found or could not be deleted' });
  });

  it('names the account in the description even after it is gone', async () => {
    const res = makeRes();

    await deleteUser({ params: { id: 'target-user' }, user: { id: 'admin-1' } }, res);

    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Admin deleted user Ada Lovelace',
    }));
  });
});
