const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function listUserIncidents(req, res) {
  const { page = 1, limit = 20, status, type, severity } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('user_incidents').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (severity) query = query.eq('severity', severity);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  // Enrich assigned_to UUID → name; respondent_name & reporter are already text names
  const assigneeIds = new Set();
  data.forEach((r) => {
    if (r.assigned_to) assigneeIds.add(r.assigned_to);
  });

  let userMap = {};
  if (assigneeIds.size > 0) {
    const { data: users } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', [...assigneeIds]);
    if (users) {
      users.forEach((u) => { userMap[u.id] = getFullName(u); });
    }
  }

  const enriched = (data || []).map((r) => ({
    ...toCamelCase(r),
    assignedName: userMap[r.assigned_to] || null,
    reporterName: r.reporter,
  }));

  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function updateUserIncident(req, res) {
  const { status, assignedTo, resolution } = req.body;
  if (!status && !assignedTo && resolution === undefined) {
    return res.status(400).json({ error: 'At least one field (status, assignedTo, resolution) is required' });
  }

  const updates = {};
  if (status) updates.status = status;
  if (assignedTo) updates.assigned_to = assignedTo;
  if (resolution !== undefined) updates.resolution = resolution;
  if (status === 'resolved') updates.resolved_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('user_incidents')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'User incident not found' });
  res.json({ data: toCamelCase(data), message: `User incident updated: ${status || 'modified'}` });
}

async function exportUserIncidents(req, res) {
  const { status, type, severity, limit = 5000 } = req.query;
  let query = supabase.from('user_incidents').select('id, type, severity, status, module, title, reporter, respondent_name, resolution, created_at');
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (severity) query = query.eq('severity', severity);
  query = query.order('created_at', { ascending: false }).limit(Math.min(+limit, 10000));

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const csvHeader = 'ID,Type,Severity,Status,Module,Title,Reporter,User Involved,Resolution,Created\n';
  const csvRows = (data || [])
    .map(r => `"${r.id}","${r.type}","${r.severity}","${r.status}","${r.module}","${(r.title || '').replace(/"/g, '""')}","${(r.reporter || '').replace(/"/g, '""')}","${(r.respondent_name || '').replace(/"/g, '""')}","${(r.resolution || '').replace(/"/g, '""')}","${r.created_at}"`)
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="user-incidents.csv"');
  res.send(csvHeader + csvRows);
}

module.exports = { listUserIncidents, updateUserIncident, exportUserIncidents };
