const crypto = require('crypto');
const supabase = require('../db/supabase');

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
    warn: 'Record a durable moderation warning for this profile.',
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
  const { data, error } = await supabase
    .from('issue_reports')
    .select('report_id, target_type, target_id, status')
    .eq('report_id', reportId)
    .maybeSingle();
  if (error) throw error;
  return data;
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
  }

  res.json({
    reportId: report.report_id,
    target: {
      type: report.target_type,
      id: report.target_id,
      exists: Boolean(target),
      version: target?.version || null,
      state: target?.state ?? null,
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

function mapActionError(error) {
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

async function executeReportAction(req, res) {
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
    reason: req.body.reason,
    durationDays: req.body.durationDays ?? null,
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
      p_reason: req.body.reason,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
    }
    : {
    p_report_id: req.params.id,
    p_action_id: req.params.actionId,
    p_actor_id: req.user.id,
    p_actor_role: hasRole(req, 'admin') ? 'admin' : 'customer_support',
    p_reason: req.body.reason,
    p_duration_days: req.body.durationDays ?? null,
    p_target_version: targetVersion,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    };
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
  console.info(JSON.stringify({
    event: 'moderation.action_succeeded',
    actionId: req.params.actionId,
    role: hasRole(req, 'admin') ? 'admin' : 'customer_support',
    replayed: data?.replayed === true,
  }));
  res.json({ ...result, replayed: data?.replayed === true });
}

module.exports = { getReportActions, executeReportAction };
