const crypto = require('crypto');
const supabase = require('../db/supabase');
const { logAdminActivity } = require('../utilities/activityLogger');
const { getModerationSettings, sendModerationNotification } = require('../utilities/moderationWarnings');

const MESSAGE_COLUMNS = 'message_id, sender_id, receiver_id, message_text, created_at';
const STAFF_ROLES = new Set(['admin', 'customer_support']);

const TARGETS = {
  profile: {
    table: 'users_table',
    idColumn: 'id',
    stateColumn: 'is_archived',
    suspensionStatusColumn: 'suspension_status',
    suspensionUntilColumn: 'suspended_until',
  },
  job_post: { table: 'job_posts', idColumn: 'job_post_id', stateColumn: 'job_status' },
  job_proposal: { table: 'job_proposals', idColumn: 'proposal_id', stateColumn: 'status' },
  job_match: { table: 'job_matches', idColumn: 'job_match_id', stateColumn: 'status' },
  equipment_listing: { table: 'equipment_listings', idColumn: 'listing_id', stateColumn: 'status' },
  equipment_rental: { table: 'equipment_rentals', idColumn: 'rental_id', stateColumn: 'rental_status' },
  equipment_request: { table: 'equipment_requests', idColumn: 'request_id', stateColumn: 'request_status' },
};

function hasRole(req, role) {
  const roles = req.user?.roles?.length ? req.user.roles : [req.user?.role].filter(Boolean);
  return roles.includes(role);
}

function actionDescription(id) {
  const descriptions = {
    mark_irrelevant: 'Dismiss this report as irrelevant. This does not change the target.',
    resolve_target_unavailable: 'Resolve this report because its reported target no longer exists.',
    relist: 'Reopen this closed job post.',
    flag_job_match: 'Add a moderation flag to this job match.',
    warn: 'Send a moderation warning to this profile in chat and start the compliance window.',
    mark_compliant: 'Resolve this warning because the reported user complied. Administrator only.',
    suspend: 'Suspend this profile for the selected number of days.',
  };
  return descriptions[id];
}

function action(id, req, adminOnly = false) {
  return {
    id,
    description: actionDescription(id),
    requiresReason: true,
    allowed: !adminOnly || hasRole(req, 'admin'),
    adminOnly,
  };
}

async function loadReport(reportId) {
  const buildQuery = (columns) => supabase
    .from('issue_reports')
    .select(columns)
    .eq('report_id', reportId)
    .maybeSingle();

  let { data, error } = await buildQuery([
    'report_id, target_type, target_id, status, issue_type',
    'warned_at, warning_due_at, warning_reminder_at, warning_reminder_sent_at',
    'warning_window_days, warning_compliance_flag, warning_complied_at',
    'warning_closed_at, warning_issued_by',
    'auto_suspended_at, auto_suspension_until, auto_suspension_skipped_reason',
  ].join(', '));

  if (error?.code === '42703') {
    // Migration 008 not applied yet: warning fields are absent from the schema.
    ({ data, error } = await buildQuery('report_id, target_type, target_id, status, issue_type'));
  }
  if (error) throw error;
  return data;
}

function mapWarning(report) {
  if (!report) return null;
  const dueAt = report.warning_due_at || null;
  const due = dueAt ? Date.parse(dueAt) : null;
  return {
    warnedAt: report.warned_at || null,
    dueAt,
    windowDays: report.warning_window_days ?? null,
    reminderAt: report.warning_reminder_at || null,
    remindedAt: report.warning_reminder_sent_at || null,
    complianceFlag: report.warning_compliance_flag === true,
    compliedAt: report.warning_complied_at || null,
    closedAt: report.warning_closed_at || null,
    issuedBy: report.warning_issued_by || null,
    autoSuspendedAt: report.auto_suspended_at || null,
    autoSuspensionUntil: report.auto_suspension_until || null,
    autoSuspensionSkippedReason: report.auto_suspension_skipped_reason || null,
    remainingSeconds: due && Number.isFinite(due)
      ? Math.max(0, Math.ceil((due - Date.now()) / 1000))
      : null,
  };
}

async function loadTarget(report) {
  const definition = TARGETS[report.target_type];
  if (!definition) return null;

  const { data, error } = await supabase
    .from(definition.table)
    .select([
      definition.idColumn,
      'updated_at',
      definition.stateColumn,
      ...(definition.suspensionStatusColumn ? [definition.suspensionStatusColumn] : []),
      ...(definition.suspensionUntilColumn ? [definition.suspensionUntilColumn] : []),
    ].join(', '))
    .eq(definition.idColumn, report.target_id)
    .maybeSingle();
  if (error) throw error;
  return data ? {
    id: data[definition.idColumn],
    version: data.updated_at || null,
    state: data[definition.stateColumn] ?? null,
    suspensionStatus: definition.suspensionStatusColumn
      ? data[definition.suspensionStatusColumn] ?? 'none'
      : null,
    suspendedUntil: definition.suspensionUntilColumn
      ? data[definition.suspensionUntilColumn] ?? null
      : null,
  } : null;
}

async function getReportActions(req, res) {
  let operation = 'load_report';
  try {
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });

  operation = `load_target:${report.target_type}`;
  const target = await loadTarget(report);
  const moderation = await getModerationSettings(supabase);
  const open = ['open', 'under_review'].includes(report.status);
  const actions = [];

  if (open) {
    if (!target) {
      actions.push(action('resolve_target_unavailable', req));
    } else {
      actions.push(action('mark_irrelevant', req));

      if (report.target_type === 'job_post' && target.state === 'closed') {
        actions.push(action('relist', req, true));
      }

      if (report.target_type === 'job_match') {
        operation = 'load_existing_job_match_flags';
        const { data: existingFlags, error } = await supabase
          .from('entity_flags')
          .select('flag_id')
          .eq('entity_type', 'job_match')
          .eq('entity_id', report.target_id)
          .limit(1);
        if (error) throw error;
        if (!existingFlags?.length) actions.push(action('flag_job_match', req));
      }

      if (report.target_type === 'profile' && target.state !== true) {
        actions.push(action('warn', req));
        if (hasRole(req, 'admin')) {
          operation = 'read_profile_suspension_state';
          const suspensionExpiry = target.suspendedUntil ? Date.parse(target.suspendedUntil) : null;
          const suspensionIsActive = target.suspensionStatus === 'active'
            && (suspensionExpiry === null
              || !Number.isFinite(suspensionExpiry)
              || suspensionExpiry > Date.now());
          if (!suspensionIsActive) {
            actions.push(action('suspend', req, true));
          }
        }
      }
    }
  } else if (report.status === 'warned') {
    const warningActive = report.warning_compliance_flag !== true && !report.auto_suspended_at;
    if (warningActive) {
      actions.push(action('mark_compliant', req, true));
      if (target && target.state !== true) {
        operation = 'read_profile_suspension_state';
        const suspensionExpiry = target.suspendedUntil ? Date.parse(target.suspendedUntil) : null;
        const suspensionIsActive = target.suspensionStatus === 'active'
          && (suspensionExpiry === null
            || !Number.isFinite(suspensionExpiry)
            || suspensionExpiry > Date.now());
        if (!suspensionIsActive) actions.push(action('suspend', req, true));
      }
    }
  }

  res.json({
    reportId: report.report_id,
    reportStatus: report.status,
    target: {
      type: report.target_type,
      id: report.target_id,
      exists: Boolean(target),
      version: target?.version || null,
      state: target?.state ?? null,
    },
    warning: mapWarning(report),
    moderation: {
      warningDays: moderation.warningDays,
      reminderDay: moderation.reminderDay,
      autoSuspendDays: moderation.autoSuspendDays,
    },
    actions,
  });
  } catch (error) {
  console.error('[IssueReportActions] Could not load report actions:', {
    operation,
    reportId: req.params.id,
    databaseCode: error.code || null,
    databaseMessage: error.message,
  });
  return res.status(500).json({ error: 'REPORT_ACTIONS_UNAVAILABLE' });
  }
}

async function getReportWarning(req, res) {
  try {
    const report = await loadReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
    return res.json({
      reportId: report.report_id,
      reportStatus: report.status,
      warning: mapWarning(report),
    });
  } catch (error) {
    console.error('[IssueReportWarning] Could not load warning:', {
      reportId: req.params.id,
      databaseCode: error.code || null,
      databaseMessage: error.message,
    });
    return res.status(500).json({ error: 'REPORT_WARNING_UNAVAILABLE' });
  }
}

function mapActionError(error) {
  if (['42703', '42P01', 'PGRST202'].includes(error?.code)) {
    return { status: 503, code: 'MODERATION_SCHEMA_NOT_READY' };
  }
  const message = String(error?.message || '');
  const knownCodes = [
    'TARGET_DELETED',
    'TARGET_CHANGED',
    'REPORT_ALREADY_HANDLED',
    'TARGET_STILL_EXISTS',
    'ALREADY_FLAGGED',
    'IDEMPOTENCY_CONFLICT',
    'ACTION_NOT_ALLOWED_FOR_TARGET',
    'ACTION_FORBIDDEN',
    'INVALID_ACTION_INPUT',
    'REPORT_NOT_FOUND',
  ];
  const code = knownCodes.find(candidate => message.includes(candidate));
  if (code) {
    const status = code === 'REPORT_NOT_FOUND' ? 404
      : code === 'ACTION_FORBIDDEN' ? 403
      : code === 'TARGET_DELETED' ? 409
        : code === 'TARGET_STILL_EXISTS' ? 409
        : code === 'ALREADY_FLAGGED' ? 409
        : code === 'ACTION_NOT_ALLOWED_FOR_TARGET' || code === 'INVALID_ACTION_INPUT' ? 422
          : 409;
    return { status, code };
  }
  return null;
}

async function loadWarningTarget(reportId, senderId) {
  const { data: report, error: reportError } = await supabase
    .from('issue_reports')
    .select('report_id, target_type, target_id, issue_type')
    .eq('report_id', reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report || report.target_type !== 'profile') throw new Error('INVALID_WARNING_TARGET');

  const { data: recipient, error: recipientError } = await supabase
    .from('users_table')
    .select('id, role')
    .eq('id', report.target_id)
    .maybeSingle();
  if (recipientError) throw recipientError;
  if (!recipient || STAFF_ROLES.has(recipient.role) || recipient.id === senderId) {
    throw new Error('INVALID_MESSAGE_RECIPIENT');
  }
  return { report, recipient };
}

async function sendWarningMessage(report, recipient, senderId, messageText, moderation = {}) {
  const windowDays = moderation.warningDays || 7;
  const suspendDays = moderation.autoSuspendDays || 3;
  const draftedText = messageText
    || `Automated moderation warning for report #${report.report_id}. Reason: ${report.issue_type}. `
      + `If you believe this warning is mistaken, reply here to appeal within ${windowDays} days. `
      + `If the warning is not resolved, your account will be automatically suspended for ${suspendDays} days.`;
  const text = draftedText.includes(report.report_id)
    ? draftedText
    : `${draftedText}\n\nReport #${report.report_id}`;
  const messageHash = crypto.createHash('sha256').update(text).digest('hex');
  const { data: existingMessages, error: existingError } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('sender_id', senderId)
    .eq('receiver_id', recipient.id)
    .eq('message_hash', messageHash)
    .limit(1);
  if (existingError) throw existingError;
  if (existingMessages?.length) return { message: existingMessages[0], created: false };

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      receiver_id: recipient.id,
      message_text: text,
      message_hash: messageHash,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (messageError) throw messageError;
  return { message, created: true };
}

async function executeReportAction(req, res) {
  const reason = req.params.actionId === 'warn'
    ? 'Automated warning sent to reported user'
    : req.body.reason;
  if (!reason) return res.status(400).json({ error: 'INVALID_ACTION_INPUT' });

  const moderationSettings = await getModerationSettings(supabase);
  const idempotencyKey = req.get('Idempotency-Key');
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return res.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY' });
  }
  const targetVersion = req.get('If-Match')?.replace(/^"|"$/g, '') || null;
  if (targetVersion && Number.isNaN(Date.parse(targetVersion))) {
    return res.status(400).json({ error: 'INVALID_TARGET_VERSION' });
  }

  const payload = {
    reportId: req.params.id,
    actionId: req.params.actionId,
    reason,
    durationDays: req.body.durationDays ?? null,
    ...(req.params.actionId === 'warn' ? { messageText: req.body.messageText ?? null } : {}),
    targetVersion,
  };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const rpcName = req.params.actionId === 'resolve_target_unavailable'
    ? 'resolve_issue_report_target_missing'
    : 'execute_issue_report_action';
  const rpcArgs = req.params.actionId === 'resolve_target_unavailable'
    ? {
      p_report_id: req.params.id,
      p_actor_id: req.user.id,
      p_actor_role: hasRole(req, 'admin') ? 'admin' : 'customer_support',
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
    }
    : {
    p_report_id: req.params.id,
    p_action_id: req.params.actionId,
    p_actor_id: req.user.id,
    p_actor_role: hasRole(req, 'admin') ? 'admin' : 'customer_support',
    p_reason: reason,
    p_duration_days: req.params.actionId === 'warn'
      ? moderationSettings.warningDays
      : (req.body.durationDays ?? null),
    p_target_version: targetVersion,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    };

  let warningTarget;
  if (req.params.actionId === 'warn') {
    try {
      warningTarget = await loadWarningTarget(req.params.id, req.user.id);
    } catch (targetError) {
      if (targetError.message === 'INVALID_MESSAGE_RECIPIENT') {
        return res.status(422).json({ error: 'INVALID_MESSAGE_RECIPIENT' });
      }
      if (targetError.message === 'INVALID_WARNING_TARGET') {
        return res.status(422).json({ error: 'ACTION_NOT_ALLOWED_FOR_TARGET' });
      }
      console.error('[IssueReportAction] Could not validate warning recipient:', {
        reportId: req.params.id,
        databaseCode: targetError.code || null,
      });
      return res.status(500).json({ error: 'WARNING_RECIPIENT_UNAVAILABLE' });
    }
  }

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);

  if (error) {
    const mapped = mapActionError(error);
    if (mapped) {
      console.warn(JSON.stringify({
        event: 'moderation.action_failed',
        actionId: req.params.actionId,
        role: hasRole(req, 'admin') ? 'admin' : 'customer_support',
        errorCode: mapped.code,
      }));
      return res.status(mapped.status).json({ error: mapped.code });
    }
    console.error(JSON.stringify({
      event: 'moderation.action_failed',
      actionId: req.params.actionId,
      role: hasRole(req, 'admin') ? 'admin' : 'customer_support',
      errorCode: 'ACTION_FAILED',
    }));
    console.error('[IssueReportAction] Execution failed:', error.message);
    return res.status(500).json({ error: 'ACTION_FAILED' });
  }

  const result = data?.result || data;
  const actionResult = result.result || {};
  let warningMessage;
  if (req.params.actionId === 'warn') {
    try {
      const delivery = await sendWarningMessage(
        warningTarget.report,
        warningTarget.recipient,
        req.user.id,
        req.body.messageText,
        moderationSettings
      );
      warningMessage = { id: delivery.message.message_id, createdAt: delivery.message.created_at };
      if (delivery.created) {
        logAdminActivity({
          actorId: req.user.id,
          activityType: 'user_warned',
          category: 'user',
          relatedUserId: warningTarget.recipient.id,
          description: `Admin sent a moderation warning for report ${warningTarget.report.report_id}`,
        });
      }
    } catch (messageError) {
      console.error('[IssueReportAction] Warning was recorded but chat delivery failed:', {
        reportId: req.params.id,
        databaseCode: messageError.code || null,
      });
      return res.status(500).json({ error: 'WARNING_MESSAGE_FAILED', warningRecorded: true });
    }

    try {
      await sendModerationNotification(supabase, {
        kind: 'moderation_warning',
        reportId: warningTarget.report.report_id,
        targetId: warningTarget.recipient.id,
        actorId: req.user.id,
        reason: warningTarget.report.issue_type,
        dueAt: actionResult.warningDueAt,
        windowDays: actionResult.windowDays || moderationSettings.warningDays,
        suspendDays: moderationSettings.autoSuspendDays,
      });
      await supabase
        .from('issue_reports')
        .update({ warning_notified_at: new Date().toISOString() })
        .eq('report_id', warningTarget.report.report_id)
        .is('warning_notified_at', null);
    } catch (notificationError) {
      // Non-fatal: the sweep retries un-notified warnings on its next tick.
      console.error('[IssueReportAction] Warning notification could not be stored; sweep will retry:', {
        reportId: req.params.id,
        databaseCode: notificationError.code || null,
      });
    }
  }

  if (req.params.actionId === 'mark_compliant' && data?.replayed !== true) {
    try {
      await sendModerationNotification(supabase, {
        kind: 'moderation_complied',
        reportId: req.params.id,
        targetId: actionResult.targetId || result.target?.id,
        actorId: req.user.id,
        dueAt: null,
      });
    } catch (notificationError) {
      console.error('[IssueReportAction] Compliance notification failed:', {
        reportId: req.params.id,
        databaseCode: notificationError.code || null,
      });
    }

    logAdminActivity({
      actorId: req.user.id,
      activityType: 'user_warning_complied',
      category: 'user',
      relatedUserId: result.target?.id || null,
      description: `Admin marked warning for report ${req.params.id} as compliant`,
    });
  }

  console.info(JSON.stringify({
    event: 'moderation.action_succeeded',
    actionId: req.params.actionId,
    role: hasRole(req, 'admin') ? 'admin' : 'customer_support',
    replayed: data?.replayed === true,
  }));
  const warning = req.params.actionId === 'warn'
    ? {
      warnedAt: actionResult.warnedAt || null,
      dueAt: actionResult.warningDueAt || null,
      windowDays: actionResult.windowDays || moderationSettings.warningDays,
      complianceFlag: false,
    }
    : req.params.actionId === 'mark_compliant'
      ? { complianceFlag: true, compliedAt: actionResult.compliedAt || null }
      : undefined;

  res.json({
    ...result,
    ...(warning ? { warning } : {}),
    ...(warningMessage ? { warningMessage } : {}),
    replayed: data?.replayed === true,
  });
}

module.exports = { getReportActions, getReportWarning, executeReportAction };
