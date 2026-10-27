jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  rpc: jest.fn(),
}));
jest.mock('../../utilities/activityLogger', () => ({
  logAdminActivity: jest.fn(),
}));

const { logAdminActivity } = require('../../utilities/activityLogger');
const {
  getModerationHealth,
  getModerationSettings,
  resetModerationHealth,
  runModerationWarningSweep,
  sendModerationNotification,
} = require('../../utilities/moderationWarnings');
const {
  renderModerationNotification,
} = require('../../utilities/notificationTemplates');

function makeQueueClient(responses) {
  const queue = [...responses];
  const calls = [];

  function next(state) {
    calls.push(state);
    const response = queue.shift();
    if (!response) throw new Error(`Unexpected database call: ${state.table}:${state.op}`);
    return Promise.resolve(response);
  }

  function from(table) {
    const state = {
      table,
      op: 'select',
      payload: null,
      options: null,
      filters: [],
    };

    const builder = {
      select() { state.op = 'select'; return builder; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return builder; },
      upsert(payload, options) { state.op = 'upsert'; state.payload = payload; state.options = options; return builder; },
      update(payload) { state.op = 'update'; state.payload = payload; return builder; },
      eq(column, value) { state.filters.push(['eq', column, value]); return builder; },
      neq(column, value) { state.filters.push(['neq', column, value]); return builder; },
      is(column, value) { state.filters.push(['is', column, value]); return builder; },
      not(column, operator, value) { state.filters.push(['not', column, operator, value]); return builder; },
      lte(column, value) { state.filters.push(['lte', column, value]); return builder; },
      gte(column, value) { state.filters.push(['gte', column, value]); return builder; },
      in(column, value) { state.filters.push(['in', column, value]); return builder; },
      limit() { return builder; },
      maybeSingle() { return next(state); },
      single() { return next(state); },
      then(resolve, reject) { return next(state).then(resolve, reject); },
    };
    return builder;
  }

  return {
    from,
    rpc: jest.fn((name, args) => {
      const state = { table: 'rpc', op: name, args };
      return next(state);
    }),
    calls,
  };
}

function filters(state, name, column, value) {
  return state.filters.some(filter => filter[0] === name && filter[1] === column && filter[2] === value);
}

const settings = {
  warningDays: 7,
  reminderDay: 3,
  autoSuspendDays: 3,
  enforcementEnabled: true,
};

const overdueReport = {
  report_id: '11111111-1111-4111-8111-111111111111',
  target_id: '22222222-2222-4222-8222-222222222222',
  warning_due_at: '2026-10-01T00:00:00.000Z',
  warning_window_days: 7,
  warning_issued_by: '33333333-3333-4333-8333-333333333333',
};

describe('moderation warning sweep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetModerationHealth();
  });

  it('reminds, then atomically suspends an overdue non-compliant warning once', async () => {
    const client = makeQueueClient([
      { data: [], error: null },              // warning notification retry
      { data: [], error: null },              // reminders
      { data: [overdueReport], error: null }, // overdue
      { data: { outcome: 'suspended', suspendedUntil: '2026-10-12T00:00:00.000Z' }, error: null },
      { error: null },                        // suspension notification upsert
      { error: null },                        // auto_suspension_notified_at stamp
      { data: [], error: null },              // suspension notification retry
    ]);
    const logActivity = jest.fn().mockResolvedValue(undefined);

    const result = await runModerationWarningSweep({
      now: new Date('2026-10-09T00:00:00.000Z'),
      client,
      settings,
      logActivity,
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, autoSuspensions: 1 }));
    expect(client.rpc).toHaveBeenCalledWith('apply_warning_auto_suspension', expect.objectContaining({
      p_report_id: overdueReport.report_id,
      p_suspend_days: 3,
      p_now: '2026-10-09T00:00:00.000Z',
      p_request_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));

    const notification = client.calls.find(call => call.table === 'notifications' && call.op === 'upsert');
    expect(notification.payload).toEqual(expect.objectContaining({
      recipient_id: overdueReport.target_id,
      event_type: 'moderation_auto_suspended',
      entity_type: 'user_account',
      dedupe_key: `moderation:moderation_auto_suspended:${overdueReport.report_id}`,
    }));

    const suspensionStamp = client.calls.find(call => (
      call.table === 'issue_reports'
      && call.op === 'update'
      && filters(call, 'is', 'auto_suspension_notified_at', null)
    ));
    expect(suspensionStamp.payload).toEqual({ auto_suspension_notified_at: '2026-10-09T00:00:00.000Z' });

    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      actorId: overdueReport.warning_issued_by,
      activityType: 'user_auto_suspended',
      relatedUserId: overdueReport.target_id,
    }));
  });

  it('does not enforce when the feature is disabled', async () => {
    const client = makeQueueClient([
      { data: [], error: null }, // warnings
      { data: [], error: null }, // reminders
      { data: [], error: null }, // suspension notification retry
    ]);

    const result = await runModerationWarningSweep({
      now: new Date('2026-10-09T00:00:00.000Z'),
      client,
      settings: { ...settings, enforcementEnabled: false },
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(result.ok).toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('sends one day-3 reminder with a deterministic dedupe key', async () => {
    const client = makeQueueClient([
      { data: [], error: null }, // warning notifications
      { data: [{ ...overdueReport, warning_due_at: '2026-10-12T00:00:00.000Z' }], error: null }, // reminders
      { error: null }, // notification upsert
      { error: null }, // reminder stamp
      { data: [], error: null }, // overdue (compliance/due filters)
      { data: [], error: null }, // suspension notification retry
    ]);

    const result = await runModerationWarningSweep({
      now: new Date('2026-10-09T00:00:00.000Z'),
      client,
      settings,
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(result.reminders).toBe(1);
    const reminder = client.calls.find(call => (
      call.table === 'notifications' && call.op === 'upsert'
      && call.payload.event_type === 'moderation_warning_reminder'
    ));
    expect(reminder.payload.dedupe_key).toBe(`moderation:moderation_warning_reminder:${overdueReport.report_id}`);
    expect(reminder.payload.title).toContain('3 days left');
    expect(reminder.options).toEqual({ onConflict: 'dedupe_key', ignoreDuplicates: true });
  });

  it('skips already-suspended users without sending a suspension notification', async () => {
    const client = makeQueueClient([
      { data: [], error: null },              // warnings
      { data: [], error: null },              // reminders
      { data: [overdueReport], error: null }, // overdue
      { data: { outcome: 'already_suspended', suspendedUntil: null }, error: null },
      { data: [], error: null },              // suspension notification retry
    ]);
    const logActivity = jest.fn();

    const result = await runModerationWarningSweep({
      now: new Date('2026-10-09T00:00:00.000Z'),
      client,
      settings,
      logActivity,
      logger: { info: jest.fn(), error: jest.fn() },
    });

    expect(result.skippedSuspensions).toBe(1);
    expect(result.autoSuspensions).toBe(0);
    expect(logActivity).not.toHaveBeenCalled();
    expect(client.calls.some(call => call.table === 'notifications')).toBe(false);
    expect(getModerationHealth().dueBacklog).toBe(1);
  });

  it('keeps the report unsettled when the suspension RPC fails so the next tick retries', async () => {
    const client = makeQueueClient([
      { data: [], error: null },
      { data: [], error: null },
      { data: [overdueReport], error: null },
      { data: null, error: { message: 'deadlock detected', code: '40P01' } },
      { data: [], error: null },
    ]);
    const logger = { info: jest.fn(), error: jest.fn() };

    const result = await runModerationWarningSweep({
      now: new Date('2026-10-09T00:00:00.000Z'),
      client,
      settings,
      logger,
    });

    expect(result.itemErrors).toBe(1);
    expect(result.autoSuspensions).toBe(0);
    expect(client.calls.some(call => (
      call.table === 'issue_reports'
      && call.op === 'update'
      && call.payload?.auto_suspended_at
    ))).toBe(false);
  });
});

describe('moderation settings and templates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses app_settings overrides and clamps unsafe values', async () => {
    const client = makeQueueClient([{
      data: [
        { key: 'moderation_warning_window_days', value: '99' },
        { key: 'moderation_reminder_day', value: '12' },
        { key: 'moderation_auto_suspend_days', value: '0' },
      ],
      error: null,
    }]);

    const resolved = await getModerationSettings(client);

    expect(resolved.warningDays).toBe(30);
    expect(resolved.reminderDay).toBe(12);
    expect(resolved.autoSuspendDays).toBe(1);
  });

  it('falls back to environment defaults when app_settings is unavailable', async () => {
    const client = makeQueueClient([{ data: null, error: { message: 'relation missing' } }]);
    const resolved = await getModerationSettings(client);
    expect(resolved).toEqual(expect.objectContaining({
      warningDays: expect.any(Number),
      reminderDay: expect.any(Number),
      autoSuspendDays: expect.any(Number),
    }));
  });

  it('renders warning, reminder, suspension, and compliance templates', () => {
    const warning = renderModerationNotification('moderation_warning', {
      reportId: 'r1',
      reason: 'Harassment',
      dueAt: '2026-10-12T00:00:00.000Z',
      windowDays: 7,
      suspendDays: 3,
    });
    expect(warning.title).toBe('Moderation warning');
    expect(warning.body).toContain('Harassment');
    expect(warning.data).toEqual(expect.objectContaining({ reportId: 'r1', link: '/reports/r1' }));

    const reminder = renderModerationNotification('moderation_warning_reminder', {
      reportId: 'r1',
      dueAt: '2026-10-12T00:00:00.000Z',
      daysLeft: 1,
      suspendDays: 3,
    });
    expect(reminder.title).toContain('1 day left');

    const suspended = renderModerationNotification('moderation_auto_suspended', {
      reportId: 'r1',
      dueAt: '2026-10-12T00:00:00.000Z',
      suspensionUntil: '2026-10-15T00:00:00.000Z',
    });
    expect(suspended.title).toBe('Account suspended');

    const complied = renderModerationNotification('moderation_complied', { reportId: 'r1' });
    expect(complied.title).toBe('Warning resolved');
  });

  it('uses an idempotent upsert for notifications', async () => {
    const client = makeQueueClient([{ error: null }]);
    await sendModerationNotification(client, {
      kind: 'moderation_warning',
      reportId: 'r1',
      targetId: 'u1',
      actorId: 'a1',
      reason: 'Harassment',
      dueAt: '2026-10-12T00:00:00.000Z',
      windowDays: 7,
      suspendDays: 3,
    });

    expect(client.calls[0].options).toEqual({ onConflict: 'dedupe_key', ignoreDuplicates: true });
    expect(client.calls[0].payload).toEqual(expect.objectContaining({
      recipient_id: 'u1',
      entity_type: 'user_account',
      dedupe_key: 'moderation:moderation_warning:r1',
    }));
  });
});
