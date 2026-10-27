const DAY_MS = 24 * 60 * 60 * 1000;

function formatTimestamp(value) {
  if (!value) return 'the deadline';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'the deadline';
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function daysUntil(dueAt, now = Date.now()) {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return 0;
  return Math.max(0, Math.ceil((due - now) / DAY_MS));
}

/**
 * Render an in-app moderation notification. Delivery is intentionally limited
 * to public.notifications; email/push transports live outside this repo.
 */
function renderModerationNotification(kind, context = {}) {
  const {
    reportId,
    reason,
    dueAt,
    windowDays,
    suspendDays,
    suspensionUntil,
    daysLeft,
    now = Date.now(),
  } = context;

  const reportLabel = reportId ? `#${reportId}` : 'this moderation warning';
  const link = reportId ? `/reports/${reportId}` : null;
  const data = {
    ...(reportId ? { reportId } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(windowDays ? { windowDays } : {}),
    ...(suspendDays ? { suspendDays } : {}),
    ...(suspensionUntil ? { suspensionUntil } : {}),
    ...(link ? { link } : {}),
  };

  if (kind === 'moderation_warning') {
    return {
      title: 'Moderation warning',
      body: `A report about your account was upheld. Reason: ${reason || 'policy violation'}. `
        + `Resolve warning ${reportLabel} by ${formatTimestamp(dueAt)} (${windowDays || 7} days). `
        + `If you do not, your account will be automatically suspended for ${suspendDays || 3} days.`,
      data,
    };
  }

  if (kind === 'moderation_warning_reminder') {
    const remaining = Number.isFinite(Number(daysLeft)) ? Number(daysLeft) : daysUntil(dueAt, now);
    return {
      title: `Moderation warning — ${remaining} day${remaining === 1 ? '' : 's'} left`,
      body: `Your moderation warning ${reportLabel} is due on ${formatTimestamp(dueAt)}. `
        + `If it is not resolved, your account will be automatically suspended for ${suspendDays || 3} days.`,
      data: { ...data, daysLeft: remaining },
    };
  }

  if (kind === 'moderation_auto_suspended') {
    return {
      title: 'Account suspended',
      body: `Your account has been suspended until ${formatTimestamp(suspensionUntil)} because moderation warning `
        + `${reportLabel} was not resolved by ${formatTimestamp(dueAt)}. Contact support to appeal.`,
      data,
    };
  }

  if (kind === 'moderation_complied') {
    return {
      title: 'Warning resolved',
      body: `Moderation warning ${reportLabel} has been marked resolved. No further action is required.`,
      data,
    };
  }

  throw new Error(`UNKNOWN_NOTIFICATION_TEMPLATE:${kind}`);
}

module.exports = {
  DAY_MS,
  daysUntil,
  formatTimestamp,
  renderModerationNotification,
};
