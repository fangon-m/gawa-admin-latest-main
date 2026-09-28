const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function enrichAppeals(appeals) {
  if (!appeals || appeals.length === 0) return [];
  const userIds = new Set();
  appeals.forEach(a => { if (a.user_id) userIds.add(a.user_id); });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name, role').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = { ...u, fullName: getFullName(u) }; });
  }

  return appeals.map(a => ({
    ...toCamelCase(a),
    userName: userMap[a.user_id]?.fullName || a.user_id,
    userRole: userMap[a.user_id]?.role || null,
    timeline: a.timeline || [],
  }));
}

async function listAppeals(req, res) {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('appeals').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  query = query.order('filed_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichAppeals(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getAppealById(req, res) {
  const { data: a, error } = await supabase
    .from('appeals')
    .select('id, user_id, status, suspension_reason, support_recommendation, support_notes, decision, decision_notes, decided_at, filed_at, timeline, notes')
    .eq('id', req.params.id)
    .single();

  if (error || !a) return res.status(404).json({ error: 'Appeal not found' });
  const enriched = await enrichAppeals([a]);
  res.json({ data: enriched[0] });
}

async function forwardAppeal(req, res) {
  const { recommendation, notes } = req.body;
  const { data: existing, error: fetchErr } = await supabase
    .from('appeals')
    .select('id, user_id, status, suspension_reason, filed_at, timeline')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Appeal not found' });

  const timeline = existing.timeline || [];
  timeline.push({
    date: new Date().toISOString(),
    title: 'Appeal forwarded by support',
    actor: req.user?.name || 'Support',
  });

  const { data, error } = await supabase
    .from('appeals')
    .update({
      support_recommendation: recommendation || null,
      support_notes: notes || '',
      status: 'forwarded',
      timeline,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select('id, user_id, status, suspension_reason, support_recommendation, support_notes, decision, decision_notes, decided_at, filed_at, timeline, notes')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichAppeals([data]);
  res.json({ data: enriched[0], message: 'Appeal forwarded to admin' });
}

async function decideAppeal(req, res) {
  const { decision, decisionNotes } = req.body;
  const { data: existing, error: fetchErr } = await supabase
    .from('appeals')
    .select('id, user_id, status, suspension_reason, filed_at, timeline')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Appeal not found' });

  const timeline = existing.timeline || [];
  timeline.push({
    date: new Date().toISOString(),
    title: `Final decision: ${decision}`,
    actor: req.user?.name || 'Admin',
  });

  const { data, error } = await supabase
    .from('appeals')
    .update({
      decision,
      decision_notes: decisionNotes || '',
      decided_at: new Date().toISOString(),
      status: 'decided',
      timeline,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select('id, user_id, status, suspension_reason, support_recommendation, support_notes, decision, decision_notes, decided_at, filed_at, timeline, notes')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichAppeals([data]);
  res.json({ data: enriched[0], message: `Appeal decision: ${decision}` });
}

module.exports = { listAppeals, getAppealById, forwardAppeal, decideAppeal };
