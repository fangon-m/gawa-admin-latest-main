const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function enrichDisputes(disputes) {
  if (!disputes || disputes.length === 0) return [];
  const userIds = new Set();
  disputes.forEach(d => {
    if (d.reporter_id) userIds.add(d.reporter_id);
    if (d.respondent_id) userIds.add(d.respondent_id);
    if (d.assigned_to) userIds.add(d.assigned_to);
  });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
  }

  return disputes.map(d => ({
    ...toCamelCase(d),
    reporterName: userMap[d.reporter_id] || d.reporter_id,
    respondentName: userMap[d.respondent_id] || d.respondent_id,
    assignedName: userMap[d.assigned_to] || null,
  }));
}

async function listDisputes(req, res) {
  const { page = 1, limit = 20, status, type, severity } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('disputes').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (severity) query = query.eq('severity', severity);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichDisputes(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getDisputeById(req, res) {
  const { data: dispute, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !dispute) return res.status(404).json({ error: 'Dispute not found' });
  const enriched = await enrichDisputes([dispute]);
  res.json({ data: enriched[0] });
}

async function updateDisputeStatus(req, res) {
  const { status, resolution, assignedTo, notes } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  const updates = { status, updated_at: new Date().toISOString() };
  if (resolution) updates.resolution = resolution;
  if (assignedTo) updates.assigned_to = assignedTo;
  if (notes !== undefined) updates.notes = notes;
  if (status === 'resolved' || status === 'dismissed') updates.resolved_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('disputes')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Dispute not found' });
  const enriched = await enrichDisputes([data]);
  res.json({ data: enriched[0], message: `Dispute status updated to ${status}` });
}

module.exports = { listDisputes, getDisputeById, updateDisputeStatus };
