const supabase = require('../db/supabase');
const { getFullName, sendError } = require('../utilities/helpers');
const { getModerationHealth } = require('../utilities/moderationWarnings');
const { entityIdToken } = require('../utilities/entityIds');
const { signAttachmentPath } = require('../utilities/reportAttachments');
const { loadTargetLabels } = require('../utilities/reportTargetLabels');

const REPORT_BASE_COLUMNS = 'report_id, reporter_id, target_type, target_id, issue_type, comment, attachment_paths, status, created_at';
const REPORT_REPORTED_USER_COLUMN = 'reported_user_id';
const REPORT_WARNING_COLUMNS = [
  'warned_at, warning_due_at, warning_window_days, warning_compliance_flag',
  'warning_complied_at, warning_closed_at, auto_suspended_at',
  'auto_suspension_until, auto_suspension_skipped_reason',
].join(', ');

const ATTACHMENT_BUCKET = process.env.SUPABASE_REPORT_ATTACHMENTS_BUCKET || 'issue-reports';
const ATTACHMENT_BUCKETS = [...new Set([
  process.env.SUPABASE_REPORT_ATTACHMENTS_BUCKET,
  'issue-reports', 'report-attachments', 'attachments', 'reports',
].filter(Boolean))];

// A report's target is not always a user profile: follow the entity back to
// the account that was actually reported.
const TARGET_USER_LOOKUPS = {
  job_post: { table: 'job_posts', idColumn: 'job_post_id', userColumns: ['client_id'] },
  job_proposal: { table: 'job_proposals', idColumn: 'proposal_id', userColumns: ['proposer_id'] },
  job_match: { table: 'job_matches', idColumn: 'job_match_id', userColumns: ['user_id', 'client_id'] },
  equipment_listing: { table: 'equipment_listings', idColumn: 'listing_id', userColumns: ['owner_id'] },
  equipment_rental: { table: 'equipment_rentals', idColumn: 'rental_id', userColumns: ['renter_id', 'owner_id'] },
  equipment_request: { table: 'equipment_requests', idColumn: 'request_id', userColumns: ['requester_id', 'owner_id'] },
};

function normalizeStoragePath(value) {
  if (!value) return value;
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const marker = '/storage/v1/object/';
    const index = value.indexOf(marker);
    if (index === -1) return value;
    path = value.slice(index + marker.length).replace(/^\/?(public|sign|authenticated)\//, '');
    path = path.replace(new RegExp(`^${ATTACHMENT_BUCKET}/`), '');
  }
  return path.replace(/^\/+/, '');
}

function storagePathCandidates(value) {
  const normalized = normalizeStoragePath(value);
  const candidates = [normalized];
  const prefixes = [
    ...ATTACHMENT_BUCKETS,
    ...ATTACHMENT_BUCKETS.map(bucket => bucket.replace(/-/g, '_')),
    'issue_reports',
    'attachments',
    'reports',
  ].map(prefix => `${prefix}/`);
  prefixes.forEach((prefix) => {
    if (normalized.startsWith(prefix)) candidates.push(normalized.slice(prefix.length));
  });
  return [...new Set(candidates.filter(Boolean))];
}

async function signAttachmentUrl(path) {
  if (!path || !supabase.storage?.from) return path;
  const candidates = storagePathCandidates(path);

  for (const bucketName of ATTACHMENT_BUCKETS) {
    let bucket;
    try {
      bucket = supabase.storage.from(bucketName);
    } catch {
      continue;
    }
    for (const candidate of candidates) {
      try {
        const { data, error } = await bucket.createSignedUrl?.(candidate, 60 * 60) || {};
        if (!error && data?.signedUrl) return data.signedUrl;
      } catch {
        // Try the next path variant.
      }
    }
  }

  console.warn('[Reports] Could not create an attachment URL for', path);
  return path;
}

async function getReportedUserIds(reports) {
  const idsByType = new Map();
  for (const report of reports) {
    const lookup = TARGET_USER_LOOKUPS[report.target_type];
    if (!lookup || !report.target_id) continue;
    if (!idsByType.has(lookup.table)) idsByType.set(lookup.table, { lookup, ids: new Set() });
    idsByType.get(lookup.table).ids.add(report.target_id);
  }

  const usersByTarget = new Map();
  await Promise.all([...idsByType.values()].map(async ({ lookup, ids }) => {
    const columns = [lookup.idColumn, ...lookup.userColumns].join(', ');
    const { data, error } = await supabase
      .from(lookup.table)
      .select(columns)
      .in(lookup.idColumn, [...ids]);
    if (error || !data) return;
    data.forEach((row) => {
      const candidates = lookup.userColumns.map(column => row[column]).filter(Boolean);
      if (candidates.length) usersByTarget.set(row[lookup.idColumn], candidates);
    });
  }));

  const reportedUserIds = reports.map((report) => {
    if (report.reported_user_id) return report.reported_user_id;
    if (report.target_type === 'profile') return report.target_id || null;
    const candidates = usersByTarget.get(report.target_id) || [];
    // The reporter is one party to a match/rental/request; the other party is
    // the account that was actually reported.
    return candidates.find(id => id !== report.reporter_id) || candidates[0] || null;
  });

  // A deleted job_match leaves no row to resolve the reported user from, but
  // job_completion keeps client_id/user_id keyed by the same job_match_id
  // (there is no FK cascade on that column). Recover the counterparty there.
  const unresolvedMatchIds = reports
    .filter((report, index) => !reportedUserIds[index] && report.target_type === 'job_match' && report.target_id)
    .map((report) => report.target_id);
  if (unresolvedMatchIds.length) {
    const { data: completions } = await supabase
      .from('job_completion')
      .select('job_match_id, client_id, user_id')
      .in('job_match_id', unresolvedMatchIds);
    const usersByMatch = new Map();
    (completions || []).forEach((completion) => {
      usersByMatch.set(completion.job_match_id, [completion.client_id, completion.user_id].filter(Boolean));
    });
    reports.forEach((report, index) => {
      if (reportedUserIds[index] || report.target_type !== 'job_match') return;
      const candidates = usersByMatch.get(report.target_id) || [];
      reportedUserIds[index] = candidates.find(id => id !== report.reporter_id) || candidates[0] || null;
    });
  }

  return reportedUserIds;
}

async function listReports(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const buildQuery = (columns) => {
    let query = supabase.from('issue_reports').select(columns, { count: 'exact' });
    if (req.query.status) query = query.eq('status', req.query.status);
    return query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
  };

  const withAllOptional = `${REPORT_BASE_COLUMNS}, ${REPORT_REPORTED_USER_COLUMN}, ${REPORT_WARNING_COLUMNS}`;
  const withReportedUser = `${REPORT_BASE_COLUMNS}, ${REPORT_REPORTED_USER_COLUMN}`;
  let result = await buildQuery(withAllOptional);
  if (result.error?.code === '42703') {
    // Migration 008 not applied yet: serve the report list without warning fields.
    result = await buildQuery(withReportedUser);
  }
  if (result.error?.code === '42703') {
    // reported_user_id migration not applied yet: use target inference only.
    result = await buildQuery(REPORT_BASE_COLUMNS);
  }
  const { data, error, count } = result;
  if (error) return sendError(res, error, { status: 500 });

  const reports = data || [];
  const targetLabels = await loadTargetLabels(reports);
  const reportedUserIds = await getReportedUserIds(reports);
  const userIds = [...new Set(reports.flatMap((report, index) => [
    report.reporter_id,
    report.reported_user_id,
    // In practice target_id is often the reported account's id directly, even
    // when target_type names a job/rental. Prefer that when it resolves.
    report.target_id,
    reportedUserIds[index],
  ]).filter(Boolean))];
  let userNames = new Map();
  if (userIds.length) {
    const { data: users, error: usersError } = await supabase
      .from('users_table')
      .select('id, first_name, middle_name, last_name, email')
      .in('id', userIds);
    if (usersError) return sendError(res, usersError, { status: 500 });
    userNames = new Map((users || []).map(user => [user.id, getFullName(user)]));
  }

  // Some accounts exist only in Supabase Auth. Use the admin API as a last
  // resort so a legitimate reported user never shows up as "Unknown user".
  const unresolvedUserIds = [...new Set(reports.map((report, index) =>
    (report.reported_user_id && userNames.get(report.reported_user_id))
      || userNames.get(report.target_id)
      ? null
      : (report.reported_user_id || reportedUserIds[index] || report.target_id)
  ).filter(Boolean))].slice(0, 20);
  await Promise.all(unresolvedUserIds.map(async (userId) => {
    if (userNames.has(userId) || !supabase.auth?.admin?.getUserById) return;
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      const authUser = data?.user;
      if (authUser) {
        userNames.set(userId, authUser.user_metadata?.full_name
          || authUser.user_metadata?.name
          || authUser.email
          || 'Unknown user');
      }
    } catch {
      // Not a valid auth user id (e.g. a deleted content id) — leave unresolved.
    }
  }));

  const attachmentPaths = [...new Set(reports.flatMap(report => report.attachment_paths || []))];
  const signedUrls = new Map(await Promise.all(attachmentPaths.map(async (path) => [path, await signAttachmentUrl(path)])));

  res.json({
    data: reports.map((report, index) => {
      const resolvedUserId = report.reported_user_id
        || (report.target_id && userNames.get(report.target_id)
          ? report.target_id
          : reportedUserIds[index] || null);
      return {
        id: report.report_id,
      reporterId: report.reporter_id,
      reporterName: userNames.get(report.reporter_id) || report.reporter_id,
      targetType: report.target_type,
      targetId: report.target_id,
      targetLabel: targetLabels.get(report.target_id) || null,
      reportedUserId: resolvedUserId || null,
      reportedName: (resolvedUserId && userNames.get(resolvedUserId))
        || (resolvedUserId ? entityIdToken(resolvedUserId, 'USR-') : '')
        || 'Unknown user',
      issueType: report.issue_type,
      comment: report.comment,
      attachmentPaths: report.attachment_paths || [],
      attachmentUrls: (report.attachment_paths || []).map(path => signedUrls.get(path) || path),
      attachmentTokens: (report.attachment_paths || []).map(path => signAttachmentPath(path)),
      status: report.status,
      createdAt: report.created_at,
      warnedAt: report.warned_at || null,
      warningDueAt: report.warning_due_at || null,
      warningWindowDays: report.warning_window_days ?? null,
      warningComplianceFlag: report.warning_compliance_flag === true,
      warningCompliedAt: report.warning_complied_at || null,
      warningClosedAt: report.warning_closed_at || null,
      autoSuspendedAt: report.auto_suspended_at || null,
      autoSuspensionUntil: report.auto_suspension_until || null,
      autoSuspensionSkippedReason: report.auto_suspension_skipped_reason || null,
      };
    }),
    pagination: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
}

async function getModerationMetrics(req, res) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const days = Math.min(365, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const now = new Date().toISOString();

  const count = async (applyFilters) => {
    let query = supabase
      .from('issue_reports')
      .select('report_id', { count: 'exact', head: true });
    query = applyFilters(query);
    const { count: total, error } = await query;
    if (error) throw error;
    return total || 0;
  };

  try {
    const [warned, complied, autoSuspended, skipped, pending, overdue] = await Promise.all([
      count(query => query.not('warned_at', 'is', null).gte('warned_at', since)),
      count(query => query.eq('warning_compliance_flag', true).gte('warning_complied_at', since)),
      count(query => query.not('auto_suspended_at', 'is', null).gte('auto_suspended_at', since)),
      count(query => query.not('auto_suspension_skipped_reason', 'is', null).gte('auto_suspended_at', since)),
      count(query => query.eq('status', 'warned').eq('warning_compliance_flag', false).is('auto_suspended_at', null)),
      count(query => query
        .eq('status', 'warned')
        .eq('warning_compliance_flag', false)
        .is('auto_suspended_at', null)
        .lte('warning_due_at', now)),
    ]);

    const { data: compliedRows, error: complyError } = await supabase
      .from('issue_reports')
      .select('warned_at, warning_complied_at')
      .eq('warning_compliance_flag', true)
      .gte('warning_complied_at', since)
      .not('warned_at', 'is', null)
      .limit(1000);
    if (complyError) throw complyError;

    const complyHours = (compliedRows || [])
      .map(row => (Date.parse(row.warning_complied_at) - Date.parse(row.warned_at)) / 3_600_000)
      .filter(hours => Number.isFinite(hours) && hours >= 0);
    const avgComplyHours = complyHours.length
      ? Math.round((complyHours.reduce((sum, hours) => sum + hours, 0) / complyHours.length) * 10) / 10
      : null;

    res.json({
      data: {
        windowDays: days,
        since,
        warned,
        complied,
        autoSuspended,
        skipped,
        pending,
        overdue,
        avgComplyHours,
        suspensionRate: warned ? Math.round((autoSuspended / warned) * 1000) / 10 : 0,
      },
    });
  } catch (error) {
    console.error('[ModerationMetrics] Query failed:', error.message);
    res.status(500).json({ error: 'MODERATION_METRICS_UNAVAILABLE' });
  }
}

async function getModerationStatus(req, res) {
  res.json({ data: getModerationHealth() });
}

module.exports = { listReports, getModerationMetrics, getModerationStatus };
