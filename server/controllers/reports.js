const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');

async function listReports(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  let query = supabase.from('issue_reports').select(
    'report_id, reporter_id, target_type, target_id, issue_type, comment, attachment_paths, status, created_at',
    { count: 'exact' }
  );
  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
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
    })),
    pagination: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
}

module.exports = { listReports };
