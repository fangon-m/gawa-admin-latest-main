const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');
const { getModerationHealth } = require('../utilities/moderationWarnings');

const REPORT_BASE_COLUMNS = 'report_id, reporter_id, target_type, target_id, issue_type, comment, attachment_paths, status, created_at';
const REPORT_WARNING_COLUMNS = [
  'warned_at, warning_due_at, warning_window_days, warning_compliance_flag',
  'warning_complied_at, warning_closed_at, auto_suspended_at',
  'auto_suspension_until, auto_suspension_skipped_reason',
].join(', ');

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

  let result = await buildQuery(`${REPORT_BASE_COLUMNS}, ${REPORT_WARNING_COLUMNS}`);
  if (result.error?.code === '42703') {
    // Migration 008 not applied yet: serve the report list without warning fields.
    result = await buildQuery(REPORT_BASE_COLUMNS);
  }
  const { data, error, count } = result;
  if (error) return res.status(500).json({ error: error.message });

  const reports = data || [];
  const userIds = [...new Set(reports.flatMap(report => [
    report.reporter_id,
    report.target_type === 'profile' ? report.target_id : null,
  ]).filter(Boolean))];
  let userNames = new Map();
  if (userIds.length) {
    const { data: users, error: usersError } = await supabase
      .from('users_table')
      .select('id, first_name, middle_name, last_name, email')
      .in('id', userIds);
    if (usersError) return res.status(500).json({ error: usersError.message });
    userNames = new Map((users || []).map(user => [user.id, getFullName(user)]));
  }

  res.json({
    data: reports.map(report => ({
      id: report.report_id,
      reporterId: report.reporter_id,
      reporterName: userNames.get(report.reporter_id) || report.reporter_id,
      targetType: report.target_type,
      targetId: report.target_id,
      reportedName: report.target_type === 'profile'
        ? userNames.get(report.target_id) || report.target_id
        : null,
      issueType: report.issue_type,
      comment: report.comment,
      attachmentPaths: report.attachment_paths || [],
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
    })),
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
