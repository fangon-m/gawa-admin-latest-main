const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function enrichReports(reports) {
  if (!reports || reports.length === 0) return [];
  const userIds = new Set();
  reports.forEach(r => { if (r.reporter_id) userIds.add(r.reporter_id); });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
  }

  return reports.map(r => ({
    ...toCamelCase(r),
    reporterName: userMap[r.reporter_id] || r.reporter_id,
  }));
}

async function listReports(req, res) {
  const { page = 1, limit = 20, status, type, severity } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('reports').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (severity) query = query.eq('severity', severity);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichReports(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function moderateReport(req, res) {
  const { decision, decisionNotes } = req.body;
  if (!decision || !['keep', 'remove', 'warn'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be keep, remove, or warn' });
  }

  const { data, error } = await supabase
    .from('reports')
    .update({
      status: 'resolved',
      decision,
      decision_notes: decisionNotes || '',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Report not found' });
  const enriched = await enrichReports([data]);
  res.json({ data: enriched[0], message: `Report moderated: ${decision}` });
}

module.exports = { listReports, moderateReport };
