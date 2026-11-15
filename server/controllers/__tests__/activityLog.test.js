process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { listActivityLog, createActivityLog } = require('../activityLog');

const adminId = '11111111-1111-4111-8111-111111111111';

function makeReq(overrides = {}) {
  return {
    user: { id: adminId, name: 'Admin', email: 'admin@gawa.ph', roles: ['admin'] },
    query: {},
    body: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
}

describe('activityLog controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReset();
  });

  describe('listActivityLog', () => {
    it('returns activity logs ordered by created_at desc with camelCase keys', async () => {
      const req = makeReq({ query: { limit: '10', page: '1' } });
      const res = makeRes();

      const rows = [
        {
          activity_id: 'aaa',
          user_id: adminId,
          activity_type: 'job_posted',
          category: 'job',
          description: 'Job posted',
          created_at: '2026-10-18T10:00:00Z',
          users_table: { first_name: 'Admin', email: 'admin@gawa.ph' },
          target: { first_name: 'Bob', last_name: 'User' },
        },
      ];
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: rows, error: null, count: 1 }),
      };
      supabase.from.mockReturnValue(query);

      await listActivityLog(req, res);

      expect(supabase.from).toHaveBeenCalledWith('activity_log');
      expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              activityId: 'aaa',
              activityType: 'job_posted',
              category: 'job',
              agentName: 'Admin',
              relatedUserName: 'Bob User',
              activityTypeLabel: 'Job Posted',
            }),
          ]),
          pagination: expect.objectContaining({ page: 1, limit: 10, total: 1 }),
        })
      );
    });

    it('applies userId and category filters', async () => {
      const req = makeReq({ query: { userId: adminId, category: 'job', limit: '5', page: '1' } });
      const res = makeRes();

      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      };
      supabase.from.mockReturnValue(query);

      await listActivityLog(req, res);

      expect(query.eq).toHaveBeenCalledWith('user_id', adminId);
      expect(query.eq).toHaveBeenCalledWith('category', 'job');
    });

    it('scopes results to admin activity types when scope=admin', async () => {
      const req = makeReq({ query: { scope: 'admin', limit: '10', page: '1' } });
      const res = makeRes();

      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      };
      supabase.from.mockReturnValue(query);

      await listActivityLog(req, res);

      expect(query.in).toHaveBeenCalledWith(
        'activity_type',
        expect.arrayContaining(['user_suspended', 'user_archived', 'user_warned', 'content_flagged']),
      );
      // Wallet top-ups are not administrative actions and must stay hidden.
      expect(query.in.mock.calls[0][1]).not.toContain('points_topped_up');
    });

    it('filters by staff role through the users table when no agent is selected', async () => {
      const supportId = '33333333-3333-4333-8333-333333333333';
      const req = makeReq({
        query: { scope: 'admin', actorRole: 'customer_support', limit: '10', page: '1' },
      });
      const res = makeRes();

      const activityQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      };
      const actorQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [{ id: supportId }], error: null }),
      };
      supabase.from.mockImplementation((table) => (
        table === 'users_table' ? actorQuery : activityQuery
      ));

      await listActivityLog(req, res);

      expect(supabase.from).toHaveBeenCalledWith('users_table');
      expect(actorQuery.eq).toHaveBeenCalledWith('role', 'customer_support');
      expect(activityQuery.in).toHaveBeenCalledWith('user_id', [supportId]);
    });

    it('returns an empty page when no user matches the role filter', async () => {
      const req = makeReq({ query: { scope: 'admin', actorRole: 'customer_support' } });
      const res = makeRes();

      const activityQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      };
      const actorQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      supabase.from.mockImplementation((table) => (
        table === 'users_table' ? actorQuery : activityQuery
      ));

      await listActivityLog(req, res);

      expect(res.json).toHaveBeenCalledWith({
        data: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
    });

    it('forces support accounts to their own activity only', async () => {
      const supportId = '22222222-2222-4222-8222-222222222222';
      const otherId = '44444444-4444-4444-8444-444444444444';
      const req = makeReq({
        user: { id: supportId, roles: ['customer_support'], email: 'agent@gawa.ph' },
        // A support agent tries to widen the query to another account and to
        // everyone with the admin role; both must be ignored.
        query: { userId: otherId, actorRole: 'admin', limit: '10', page: '1' },
      });
      const res = makeRes();

      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      };
      supabase.from.mockReturnValue(query);

      await listActivityLog(req, res);

      expect(query.eq).toHaveBeenCalledWith('user_id', supportId);
      expect(query.eq).not.toHaveBeenCalledWith('user_id', otherId);
      // No users_table role lookup is performed for a support caller.
      expect(supabase.from).toHaveBeenCalledTimes(1);
      // Staff action types are applied even when the caller omits scope=admin.
      expect(query.in).toHaveBeenCalledWith(
        'activity_type',
        expect.arrayContaining(['content_flagged', 'user_warned']),
      );
    });

    it('normalizes date-only bounds and supports ascending order', async () => {
      const req = makeReq({
        query: { startDate: '2026-11-01', endDate: '2026-11-15', order: 'asc' },
      });
      const res = makeRes();

      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
      };
      supabase.from.mockReturnValue(query);

      await listActivityLog(req, res);

      expect(query.gte).toHaveBeenCalledWith('created_at', '2026-11-01T00:00:00.000Z');
      expect(query.lte).toHaveBeenCalledWith('created_at', '2026-11-15T23:59:59.999Z');
      expect(query.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('returns 500 on database error', async () => {
      const req = makeReq();
      const res = makeRes();

      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
      };
      supabase.from.mockReturnValue(query);

      await listActivityLog(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
      expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('db down'),
      }));
    });
  });

  describe('createActivityLog', () => {
    it('inserts a new activity log and returns 201', async () => {
      const req = makeReq({
        body: {
          activityType: 'points_topped_up',
          category: 'wallet',
          description: 'Admin topped up points',
          relatedUserId: '22222222-2222-4222-8222-222222222222',
          amount: 100,
        },
      });
      const res = makeRes();

      const inserted = {
        activity_id: '999',
        user_id: adminId,
        activity_type: 'points_topped_up',
        category: 'wallet',
        description: 'Admin topped up points',
        related_user_id: '22222222-2222-4222-8222-222222222222',
        amount: 100,
        created_at: '2026-10-18T10:00:00Z',
      };
      const query = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: inserted, error: null }),
      };
      supabase.from.mockReturnValue(query);

      await createActivityLog(req, res);

      expect(supabase.from).toHaveBeenCalledWith('activity_log');
      expect(query.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: adminId,
          activity_type: 'points_topped_up',
          category: 'wallet',
          description: 'Admin topped up points',
          amount: 100,
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activityId: '999',
            agentName: 'Admin',
          }),
        })
      );
    });

    it('defaults user_id to the actor when userId is omitted', async () => {
      const req = makeReq({
        body: { activityType: 'job_cancelled', category: 'job', description: 'Cancelled job' },
      });
      const res = makeRes();

      const query = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      };
      supabase.from.mockReturnValue(query);

      await createActivityLog(req, res);

      expect(query.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: adminId })
      );
    });

    it('returns 500 on insert error', async () => {
      const req = makeReq({
        body: { activityType: 'job_cancelled', category: 'job', description: 'x' },
      });
      const res = makeRes();

      const query = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'constraint failed' } }),
      };
      supabase.from.mockReturnValue(query);

      await createActivityLog(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
      expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('constraint failed'),
      }));
    });
  });
});
