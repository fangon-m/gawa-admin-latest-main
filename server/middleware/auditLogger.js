const supabase = require('../db/supabase');

async function createAuditLog({ agentId, agentName, action, module, targetId, targetType, description, ipAddress, userAgent }) {
  try {
    const { data, error } = await supabase.from('incident_logs').insert({
      agent_id: agentId || null,
      agent_name: agentName || 'System',
      action,
      module: module || 'unknown',
      target_id: targetId || null,
      target_type: targetType || null,
      description: description || '',
      ip_address: ipAddress || '0.0.0.0',
      user_agent: userAgent || 'unknown',
    }).select().single();

    if (error) {
      console.error('[AUDIT] Failed to persist audit log:', error.message);
      return null;
    }

    console.log(`[AUDIT] ${agentName || 'System'} - ${action} on ${targetType || ''} ${targetId || ''}`);
    return data;
  } catch (err) {
    console.error('[AUDIT] Failed to persist audit log:', err.message);
    return null;
  }
}

function auditMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (req.method !== 'GET' && res.statusCode < 400) {
      const action = `${req.method} ${req.originalUrl}`;
      // Fire and forget — don't block the response
      createAuditLog({
        agentId: req.user?.id,
        agentName: req.user?.name,
        action,
        module: req.originalUrl.split('/')[1] || 'unknown',
        targetId: req.params?.id,
        targetType: req.originalUrl.split('/')[1] || 'unknown',
        description: `${req.method} on ${req.originalUrl}`,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
    }
    return originalJson(body);
  };
  next();
}

async function getAuditLogs(filters = {}) {
  let query = supabase.from('incident_logs').select('*', { count: 'exact' });

  if (filters.agentId) query = query.eq('agent_id', filters.agentId);
  if (filters.module) query = query.eq('module', filters.module);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);

  query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], total: count };
}

module.exports = { createAuditLog, auditMiddleware, getAuditLogs };
