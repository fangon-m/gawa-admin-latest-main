const crypto = require('crypto');
const defaultSupabase = require('../db/supabase');
const config = require('../config');
const { logAdminActivity } = require('./activityLogger');
const {
  DAY_MS,
  daysUntil,
  renderModerationNotification,
} = require('./notificationTemplates');

const SETTING_KEYS = [
  'moderation_warning_window_days',
  'moderation_reminder_day',
  'moderation_auto_suspend_days',
];

const DEFAULT_SETTINGS = Object.freeze({
  warningDays: config.moderation.warningDays,
  reminderDay: config.moderation.reminderDay,
  autoSuspendDays: config.moderation.autoSuspendDays,
  enforcementEnabled: config.moderation.enforcementEnabled,
});

const sweepState = {
  lastRunAt: null,
  durationMs: 0,
  consecutiveFailures: 0,
  lastError: null,
  dueBacklog: 0,
  lastCounts: {
    warningNotifications: 0,
    reminders: 0,
    autoSuspensions: 0,
    skippedSuspensions: 0,
    itemErrors: 0,
  },
};

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, resolved));
}

async function getModerationSettings(client = defaultSupabase) {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const { data, error } = await client
      .from('app_settings')
      .select('key, value')
      .in('key', SETTING_KEYS);
    if (error) return settings;

    const values = new Map((data || []).map(row => [row.key, row.value]));
    settings.warningDays = clampInt(values.get('moderation_warning_window_days'), settings.warningDays, 1, 30);
    settings.reminderDay = clampInt(values.get('moderation_reminder_day'), settings.reminderDay, 1, 30);
    settings.autoSuspendDays = clampInt(values.get('moderation_auto_suspend_days'), settings.autoSuspendDays, 1, 90);
    settings.reminderDay = Math.min(settings.reminderDay, settings.warningDays);
  } catch (error) {
    // app_settings may not exist in every environment; env defaults still apply.
  }
  return settings;
}

function notificationDedupeKey(kind, reportId) {
  return `moderation:${kind}:${reportId}`;
}

async function sendModerationNotification(client, {
  kind,
  reportId,
  targetId,
  actorId = null,
  reason,
  dueAt,
  windowDays,
  suspendDays,
  suspensionUntil,
  daysLeft,
  now = Date.now(),
}) {
  const rendered = renderModerationNotification(kind, {
    reportId,
    reason,
    dueAt,
    windowDays,
    suspendDays,
    suspensionUntil,
    daysLeft,
    now,
  });

  const { error } = await client
    .from('notifications')
    .upsert({
      recipient_id: targetId,
      actor_id: actorId,
      event_type: kind,
      title: rendered.title,
      body: rendered.body,
      entity_type: 'user_account',
      entity_id: targetId,
      data: rendered.data,
      dedupe_key: notificationDedupeKey(kind, reportId),
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

  if (error) throw error;
  return rendered;
}

function suspensionReason(reportId, windowDays) {
  return `Automatic suspension: moderation warning #${reportId} was not resolved within ${windowDays} days.`;
}

function requestHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function stamp(client, reportId, column, value) {
  const { error } = await client
    .from('issue_reports')
    .update({ [column]: value })
    .eq('report_id', reportId)
    .is(column, null);
  if (error) throw error;
}

function makeLogger(logger) {
  return logger || console;
}

async function sendWarningNotifications({ client, nowIso, settings, logger, counts }) {
  const { data, error } = await client
    .from('issue_reports')
    .select('report_id, target_id, issue_type, warned_at, warning_due_at, warning_window_days, warning_issued_by')
    .eq('status', 'warned')
    .is('warning_notified_at', null)
    .not('warned_at', 'is', null)
    .limit(100);

  if (error) throw error;

  for (const report of data || []) {
    try {
      await sendModerationNotification(client, {
        kind: 'moderation_warning',
        reportId: report.report_id,
        targetId: report.target_id,
        actorId: report.warning_issued_by || null,
        reason: report.issue_type,
        dueAt: report.warning_due_at,
        windowDays: report.warning_window_days || settings.warningDays,
        suspendDays: settings.autoSuspendDays,
      });
      await stamp(client, report.report_id, 'warning_notified_at', nowIso);
      counts.warningNotifications += 1;
    } catch (itemError) {
      counts.itemErrors += 1;
      makeLogger(logger).error(`[Moderation] warning notification failed for ${report.report_id}:`, itemError.message);
    }
  }
}

async function sendDueReminders({ client, now, nowIso, settings, logger, counts }) {
  // Reminder timing comes from the configured reminder day (not the RPC's
  // default), so changing the setting takes effect without touching reports.
  const reminderThreshold = new Date(now.getTime() - settings.reminderDay * DAY_MS).toISOString();
  const { data, error } = await client
    .from('issue_reports')
    .select('report_id, target_id, warning_due_at, warning_window_days, warning_issued_by')
    .eq('status', 'warned')
    .eq('warning_compliance_flag', false)
    .is('warning_reminder_sent_at', null)
    .not('warned_at', 'is', null)
    .lte('warned_at', reminderThreshold)
    .limit(100);

  if (error) throw error;

  for (const report of data || []) {
    try {
      await sendModerationNotification(client, {
        kind: 'moderation_warning_reminder',
        reportId: report.report_id,
        targetId: report.target_id,
        actorId: report.warning_issued_by || null,
        dueAt: report.warning_due_at,
        windowDays: report.warning_window_days || settings.warningDays,
        suspendDays: settings.autoSuspendDays,
        daysLeft: daysUntil(report.warning_due_at, now.getTime()),
        now: now.getTime(),
      });
      await stamp(client, report.report_id, 'warning_reminder_sent_at', nowIso);
      counts.reminders += 1;
    } catch (itemError) {
      counts.itemErrors += 1;
      makeLogger(logger).error(`[Moderation] reminder failed for ${report.report_id}:`, itemError.message);
    }
  }
}

async function sendSuspensionNotifications({ client, nowIso, settings, logger, counts }) {
  const { data, error } = await client
    .from('issue_reports')
    .select('report_id, target_id, warning_due_at, warning_window_days, warning_issued_by, auto_suspension_until')
    .not('auto_suspended_at', 'is', null)
    .is('auto_suspension_notified_at', null)
    .is('auto_suspension_skipped_reason', null)
    .limit(100);

  if (error) throw error;

  for (const report of data || []) {
    try {
      await sendModerationNotification(client, {
        kind: 'moderation_auto_suspended',
        reportId: report.report_id,
        targetId: report.target_id,
        actorId: report.warning_issued_by || null,
        dueAt: report.warning_due_at,
        windowDays: report.warning_window_days || settings.warningDays,
        suspendDays: settings.autoSuspendDays,
        suspensionUntil: report.auto_suspension_until,
      });
      await stamp(client, report.report_id, 'auto_suspension_notified_at', nowIso);
      counts.autoSuspensions += 1;
    } catch (itemError) {
      counts.itemErrors += 1;
      makeLogger(logger).error(`[Moderation] suspension notification failed for ${report.report_id}:`, itemError.message);
    }
  }
}

async function enforceOverdueWarnings({
  client, nowIso, settings, logger, counts, logActivity,
}) {
  if (!settings.enforcementEnabled) return;

  const { data, error } = await client
    .from('issue_reports')
    .select('report_id, target_id, warning_due_at, warning_window_days, warning_issued_by')
    .eq('status', 'warned')
    .eq('warning_compliance_flag', false)
    .is('auto_suspended_at', null)
    .lte('warning_due_at', nowIso)
    .limit(100);

  if (error) throw error;

  sweepState.dueBacklog = (data || []).length;

  for (const report of data || []) {
    const windowDays = report.warning_window_days || settings.warningDays;
    const reason = suspensionReason(report.report_id, windowDays);
    const hash = requestHash({
      reportId: report.report_id,
      suspendDays: settings.autoSuspendDays,
      reason,
      now: nowIso,
    });

    let result;
    try {
      const response = await client.rpc('apply_warning_auto_suspension', {
        p_report_id: report.report_id,
        p_suspend_days: settings.autoSuspendDays,
        p_reason: reason,
        p_request_hash: hash,
        p_now: nowIso,
      });
      if (response.error) throw response.error;
      result = response.data;
    } catch (itemError) {
      counts.itemErrors += 1;
      makeLogger(logger).error(`[Moderation] auto-suspension failed for ${report.report_id}:`, itemError.message);
      continue;
    }

    const outcome = result?.outcome;
    if (outcome === 'suspended') {
      counts.autoSuspensions += 1;
      makeLogger(logger).info(JSON.stringify({
        event: 'moderation.auto_suspended',
        reportId: report.report_id,
        targetId: report.target_id,
        suspendedUntil: result.suspendedUntil,
      }));

      try {
        await sendModerationNotification(client, {
          kind: 'moderation_auto_suspended',
          reportId: report.report_id,
          targetId: report.target_id,
          actorId: report.warning_issued_by || null,
          dueAt: report.warning_due_at,
          windowDays,
          suspendDays: settings.autoSuspendDays,
          suspensionUntil: result.suspendedUntil,
        });
        await stamp(client, report.report_id, 'auto_suspension_notified_at', nowIso);
      } catch (itemError) {
        counts.itemErrors += 1;
        makeLogger(logger).error(`[Moderation] suspension notification failed for ${report.report_id}:`, itemError.message);
      }

      try {
        await logActivity({
          actorId: report.warning_issued_by || null,
          activityType: 'user_auto_suspended',
          category: 'user',
          relatedUserId: report.target_id,
          description: `System auto-suspended user ${report.target_id} for ${settings.autoSuspendDays} day(s) after warning #${report.report_id} lapsed`,
        });
      } catch (activityError) {
        makeLogger(logger).error('[Moderation] activity log failed:', activityError.message);
      }
    } else {
      counts.skippedSuspensions += 1;
      makeLogger(logger).info(JSON.stringify({
        event: 'moderation.suspension_skipped',
        reportId: report.report_id,
        targetId: report.target_id,
        outcome: outcome || 'unknown',
      }));
    }
  }
}

/**
 * Evaluate warning notifications, the day-3 reminder, and due enforcement.
 * Every phase is idempotent: markers are stamped only after the notification
 * succeeds, and apply_warning_auto_suspension locks the report + user rows.
 */
async function runModerationWarningSweep({
  now = new Date(),
  client = defaultSupabase,
  settings,
  logger = console,
  logActivity = logAdminActivity,
} = {}) {
  const startedAt = Date.now();
  const nowIso = now.toISOString();
  const counts = {
    warningNotifications: 0,
    reminders: 0,
    autoSuspensions: 0,
    skippedSuspensions: 0,
    itemErrors: 0,
  };

  try {
    const resolvedSettings = settings || await getModerationSettings(client);
    sweepState.dueBacklog = 0;
    makeLogger(logger).info(JSON.stringify({ event: 'moderation.sweep_started', now: nowIso }));

    await sendWarningNotifications({ client, nowIso, settings: resolvedSettings, logger, counts });
    await sendDueReminders({ client, now, nowIso, settings: resolvedSettings, logger, counts });
    await enforceOverdueWarnings({
      client, nowIso, settings: resolvedSettings, logger, counts, logActivity,
    });
    await sendSuspensionNotifications({ client, nowIso, settings: resolvedSettings, logger, counts });

    sweepState.lastRunAt = nowIso;
    sweepState.durationMs = Date.now() - startedAt;
    sweepState.consecutiveFailures = 0;
    sweepState.lastError = null;
    sweepState.lastCounts = counts;

    makeLogger(logger).info(JSON.stringify({
      event: 'moderation.sweep_completed',
      durationMs: sweepState.durationMs,
      ...counts,
    }));

    return { ok: true, ...counts };
  } catch (error) {
    sweepState.lastRunAt = nowIso;
    sweepState.durationMs = Date.now() - startedAt;
    sweepState.consecutiveFailures += 1;
    sweepState.lastError = error.message;
    makeLogger(logger).error(JSON.stringify({
      event: 'moderation.sweep_failed',
      message: error.message,
      consecutiveFailures: sweepState.consecutiveFailures,
    }));
    return { ok: false, error: error.message, ...counts };
  }
}

function getModerationHealth() {
  return {
    lastRunAt: sweepState.lastRunAt,
    durationMs: sweepState.durationMs,
    consecutiveFailures: sweepState.consecutiveFailures,
    lastError: sweepState.lastError,
    dueBacklog: sweepState.dueBacklog,
    lastCounts: { ...sweepState.lastCounts },
    enabled: config.moderation.enforcementEnabled,
  };
}

function resetModerationHealth() {
  sweepState.lastRunAt = null;
  sweepState.durationMs = 0;
  sweepState.consecutiveFailures = 0;
  sweepState.lastError = null;
  sweepState.dueBacklog = 0;
  sweepState.lastCounts = {
    warningNotifications: 0,
    reminders: 0,
    autoSuspensions: 0,
    skippedSuspensions: 0,
    itemErrors: 0,
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  getModerationSettings,
  getModerationHealth,
  notificationDedupeKey,
  resetModerationHealth,
  runModerationWarningSweep,
  sendModerationNotification,
  suspensionReason,
};
