jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  rpc: jest.fn(),
}));
jest.mock('../../utilities/activityLogger', () => ({
  logAdminActivity: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { logAdminActivity } = require('../../utilities/activityLogger');
const { getReportActions, executeReportAction } = require('../reportActions');

const reportId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const actionKey = '33333333-3333-4333-8333-333333333333';
const targetVersion = '2026-10-12T00:00:00.000Z';

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function reportQuery(report) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: report, error: null }),
  };
}

describe('issue report moderation actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns only target- and role-appropriate profile actions', async () => {
    const report = {
      report_id: reportId,
      target_type: 'profile',
      target_id: targetId,
      status: 'open',
    };
    const reports = reportQuery(report);
    const target = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: targetId,
          updated_at: targetVersion,
          is_archived: false,
          suspension_status: 'none',
        },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reports : target);
    const res = response();

    await getReportActions({
      params: { id: reportId },
      user: { id: targetId, roles: ['admin'] },
    }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      reportId,
      target: { type: 'profile', id: targetId, exists: true, version: targetVersion, state: false },
      actions: expect.arrayContaining([
        expect.objectContaining({ id: 'mark_irrelevant', allowed: true }),
        expect.objectContaining({ id: 'warn', allowed: true }),
        expect.objectContaining({ id: 'suspend', allowed: true, adminOnly: true }),
      ]),
    }));
  });

  it('disables administrator-only actions for customer support', async () => {
    const report = {
      report_id: reportId,
      target_type: 'job_post',
      target_id: targetId,
      status: 'open',
    };
    const reports = reportQuery(report);
    const target = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { job_post_id: targetId, updated_at: targetVersion, job_status: 'closed' },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reports : target);
    const res = response();

    await getReportActions({
      params: { id: reportId },
      user: { id: targetId, roles: ['customer_support'] },
    }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      actions: expect.arrayContaining([
        expect.objectContaining({ id: 'relist', allowed: false, adminOnly: true }),
      ]),
    }));
  });

  it('offers only an audited unavailable-target resolution for a dangling target', async () => {
    const report = {
      report_id: reportId,
      target_type: 'job_match',
      target_id: targetId,
      status: 'open',
    };
    const reports = reportQuery(report);
    const target = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reports : target);
    const res = response();

    await getReportActions({
      params: { id: reportId },
      user: { id: targetId, roles: ['customer_support'] },
    }, res);

    expect(res.json).toHaveBeenCalledWith({
      reportId,
      target: { type: 'job_match', id: targetId, exists: false, version: null, state: null },
      actions: [
        expect.objectContaining({ id: 'resolve_target_unavailable', allowed: true }),
      ],
    });
  });

  it('returns an explicit action-loading error and logs the failing query step', async () => {
    const reports = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: { code: '42P01', message: 'relation is unavailable' },
      }),
    };
    supabase.from.mockReturnValue(reports);
    const res = response();
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await getReportActions({ params: { id: reportId } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'REPORT_ACTIONS_UNAVAILABLE' });
    expect(logError).toHaveBeenCalledWith(
      '[IssueReportActions] Could not load report actions:',
      expect.objectContaining({ operation: 'load_report', databaseCode: '42P01' })
    );
    logError.mockRestore();
  });

  it('uses users_table suspension columns and offers suspension when the profile is not suspended', async () => {
    const report = {
      report_id: reportId,
      target_type: 'profile',
      target_id: targetId,
      status: 'open',
    };
    const reports = reportQuery(report);
    const target = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: targetId,
          updated_at: targetVersion,
          is_archived: false,
          suspension_status: 'none',
        },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reports : target);
    const res = response();

    await getReportActions({
      params: { id: reportId },
      user: { id: targetId, roles: ['admin'] },
    }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mark_irrelevant', allowed: true }),
      expect.objectContaining({ id: 'warn', allowed: true }),
      expect.objectContaining({ id: 'suspend', allowed: true }),
    ]));
    expect(supabase.from).toHaveBeenCalledWith('users_table');
    expect(target.select).toHaveBeenCalledWith('id, updated_at, is_archived, suspension_status, suspended_until');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('hides suspend for a profile already marked active in users_table', async () => {
    const reports = reportQuery({
      report_id: reportId,
      target_type: 'profile',
      target_id: targetId,
      status: 'open',
    });
    const target = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: targetId,
          updated_at: targetVersion,
          is_archived: false,
          suspension_status: 'active',
        },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reports : target);
    const res = response();

    await getReportActions({ params: { id: reportId }, user: { id: targetId, role: 'admin' } }, res);

    const actions = res.json.mock.calls[0][0].actions;
    expect(actions.map(item => item.id)).toContain('warn');
    expect(actions.map(item => item.id)).not.toContain('suspend');
  });

  it('executes the audited warning and sends its message to the reported user', async () => {
    supabase.rpc.mockResolvedValue({
      data: {
        result: { reportId, action: 'warn', reportStatus: 'open' },
        replayed: false,
      },
      error: null,
    });
    const report = reportQuery({
      report_id: reportId,
      target_type: 'profile',
      target_id: targetId,
      issue_type: 'Harassment',
    });
    const recipientQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: targetId, role: 'client' },
        error: null,
      }),
    };
    const warningMessage = {
      message_id: '44444444-4444-4444-8444-444444444444',
      sender_id: '55555555-5555-4555-8555-555555555555',
      receiver_id: targetId,
      message_text: `Please reply to report #${reportId} to appeal.`,
      created_at: '2026-10-12T00:00:00.000Z',
    };
    const messages = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: warningMessage, error: null }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return report;
      if (table === 'users_table') return recipientQuery;
      return messages;
    });
    const res = response();

    await executeReportAction({
      params: { id: reportId, actionId: 'warn' },
      body: { messageText: warningMessage.message_text },
      user: { id: '55555555-5555-4555-8555-555555555555', role: 'customer_support' },
      get: jest.fn(name => name === 'Idempotency-Key' ? actionKey : targetVersion),
    }, res);

    expect(supabase.rpc).toHaveBeenCalledWith('execute_issue_report_action', expect.objectContaining({
      p_report_id: reportId,
      p_action_id: 'warn',
      p_actor_id: '55555555-5555-4555-8555-555555555555',
      p_actor_role: 'customer_support',
      p_reason: 'Automated warning sent to reported user',
      p_idempotency_key: actionKey,
      p_target_version: targetVersion,
    }));
    expect(messages.insert).toHaveBeenCalledWith(expect.objectContaining({
      sender_id: '55555555-5555-4555-8555-555555555555',
      receiver_id: targetId,
      message_text: warningMessage.message_text,
      message_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(logAdminActivity).toHaveBeenCalledWith({
      actorId: '55555555-5555-4555-8555-555555555555',
      activityType: 'user_warned',
      category: 'user',
      relatedUserId: targetId,
      description: `Admin sent a moderation warning for report ${reportId}`,
    });
    expect(res.json).toHaveBeenCalledWith({
      reportId,
      action: 'warn',
      reportStatus: 'open',
      warningMessage: { id: warningMessage.message_id, createdAt: warningMessage.created_at },
      replayed: false,
    });

  });

  it('rejects a warning addressed to the moderator before recording the action', async () => {
    const reports = reportQuery({
      report_id: reportId,
      target_type: 'profile',
      target_id: targetId,
      issue_type: 'Harassment',
    });
    const userQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: targetId, role: 'admin' },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reports : userQuery);
    const res = response();

    await executeReportAction({
      params: { id: reportId, actionId: 'warn' },
      body: { messageText: 'Please reply to appeal.' },
      user: { id: targetId, role: 'admin' },
      get: jest.fn(name => name === 'Idempotency-Key' ? actionKey : undefined),
    }, res);

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_MESSAGE_RECIPIENT' });
  });

  it('returns the resolved report status after a suspension action', async () => {
    supabase.rpc.mockResolvedValue({
      data: {
        result: { reportId, action: 'suspend', reportStatus: 'resolved' },
        replayed: false,
      },
      error: null,
    });
    const res = response();

    await executeReportAction({
      params: { id: reportId, actionId: 'suspend' },
      body: { reason: 'Repeated policy violations', durationDays: 7 },
      user: { id: targetId, roles: ['admin'] },
      get: jest.fn(name => name === 'Idempotency-Key' ? actionKey : targetVersion),
    }, res);

    expect(res.json).toHaveBeenCalledWith({
      reportId,
      action: 'suspend',
      reportStatus: 'resolved',
      replayed: false,
    });
  });

  it('uses the dedicated transactional RPC to resolve a missing target', async () => {
    supabase.rpc.mockResolvedValue({
      data: {
        result: { reportId, action: 'resolve_target_unavailable', reportStatus: 'resolved' },
        replayed: false,
      },
      error: null,
    });
    const res = response();

    await executeReportAction({
      params: { id: reportId, actionId: 'resolve_target_unavailable' },
      body: { reason: 'The job match no longer exists' },
      user: { id: targetId, role: 'customer_support' },
      get: jest.fn(name => name === 'Idempotency-Key' ? actionKey : undefined),
    }, res);

    expect(supabase.rpc).toHaveBeenCalledWith('resolve_issue_report_target_missing', expect.objectContaining({
      p_report_id: reportId,
      p_actor_id: targetId,
      p_actor_role: 'customer_support',
      p_reason: 'The job match no longer exists',
      p_idempotency_key: actionKey,
    }));
    expect(res.json).toHaveBeenCalledWith({
      reportId,
      action: 'resolve_target_unavailable',
      reportStatus: 'resolved',
      replayed: false,
    });
  });

  it('rejects requests without a UUID idempotency key before touching the database', async () => {
    const res = response();
    await executeReportAction({
      params: { id: reportId, actionId: 'warn' },
      body: { reason: 'Verified policy violation' },
      user: { id: targetId, role: 'admin' },
      get: jest.fn(name => name === 'Idempotency-Key' ? 'missing' : undefined),
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'INVALID_IDEMPOTENCY_KEY' });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
