const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listIncidents(req, res) {
  const { page = 1, limit = 20, agentId, module, action, startDate, endDate } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('incident_logs').select('id, agent_id, agent_name, action, module, description, target_id, target_type, ip_address, created_at', { count: 'exact' });
  if (agentId) query = query.eq('agent_id', agentId);
  if (module) query = query.eq('module', module);
  if (action) query = query.eq('action', action);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  query = query.order('created_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: data.map(toCamelCase),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function exportIncidents(req, res) {
  const { agentId, module, action, startDate, endDate, limit = 5000 } = req.query;
  let query = supabase.from('incident_logs').select('id, agent_id, agent_name, action, module, description, created_at');
  if (agentId) query = query.eq('agent_id', agentId);
  if (module) query = query.eq('module', module);
  if (action) query = query.eq('action', action);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  query = query.order('created_at', { ascending: false }).limit(Math.min(+limit, 10000));

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const csvHeader = 'ID,Agent,Action,Module,Description,Created\n';
  const csvRows = (data || [])
    .map(r => `"${r.id}","${r.agent_name}","${r.action}","${r.module}","${(r.description || '').replace(/"/g, '""')}","${r.created_at}"`)
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="incident-logs.csv"');
  res.send(csvHeader + csvRows);
}

module.exports = { listIncidents, exportIncidents };
