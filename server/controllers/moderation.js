const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listFlaggedContent(req, res) {
  const { page = 1, limit = 20, type, status } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('reports').select('*', { count: 'exact' });
  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);
  else query = query.in('status', ['pending', 'under-review']);
  query = query.order('created_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: data.map(toCamelCase),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function moderateContent(req, res) {
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

  if (error || !data) return res.status(404).json({ error: 'Content not found' });
  res.json({ data: toCamelCase(data), message: `Content moderated: ${decision}` });
}

module.exports = { listFlaggedContent, moderateContent };
