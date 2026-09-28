const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function enrichAssessments(assessments) {
  if (!assessments || assessments.length === 0) return [];
  const userIds = new Set();
  const categoryIds = new Set();
  assessments.forEach(a => {
    if (a.user_id) userIds.add(a.user_id);
    if (a.category_id) categoryIds.add(a.category_id);
  });

  const [userRes, catRes] = await Promise.all([
    userIds.size > 0 ? supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]) : { data: [] },
    categoryIds.size > 0 ? supabase.from('categories').select('id, name').in('id', [...categoryIds]) : { data: [] },
  ]);

  const userMap = {};
  (userRes.data || []).forEach(u => { userMap[u.id] = getFullName(u); });
  const catMap = {};
  (catRes.data || []).forEach(c => { catMap[c.id] = c.name; });

  return assessments.map(a => ({
    ...toCamelCase(a),
    userName: userMap[a.user_id] || a.user_id,
    categoryName: catMap[a.category_id] || a.category_id,
  }));
}

async function listAssessments(req, res) {
  const { page = 1, limit = 20, userId, categoryId, status } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('assessments').select('id, user_id, category_id, status, score, total_points, is_passed, started_at, completed_at, last_taken_at', { count: 'exact' });
  if (userId) query = query.eq('user_id', userId);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (status) query = query.eq('status', status);
  query = query.order('started_at', { ascending: false }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichAssessments(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getAssessmentById(req, res) {
  const { data: a, error } = await supabase
    .from('assessments')
    .select('id, user_id, category_id, status, score, total_points, is_passed, started_at, completed_at, last_taken_at')
    .eq('id', req.params.id)
    .single();

  if (error || !a) return res.status(404).json({ error: 'Assessment not found' });
  const enriched = await enrichAssessments([a]);
  res.json({ data: enriched[0] });
}

async function getResponsesByAssessment(req, res) {
  const { data, error } = await supabase
    .from('assessment_responses')
    .select('id, assessment_id, question_id, answer, score, feedback, created_at')
    .eq('assessment_id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: (data || []).map(toCamelCase) });
}

async function createAssessment(req, res) {
  const { userId, categoryId } = req.body;
  if (!userId || !categoryId) return res.status(400).json({ error: 'userId and categoryId are required' });

  const { data, error } = await supabase
    .from('assessments')
    .insert({ user_id: userId, category_id: categoryId, status: 'in_progress', score: 0, total_points: 0, started_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichAssessments([data]);
  res.status(201).json({ data: enriched[0] });
}

async function updateAssessment(req, res) {
  const { status, score, totalPoints, completedAt, isPassed, lastTakenAt } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (score !== undefined) updates.score = score;
  if (totalPoints !== undefined) updates.total_points = totalPoints;
  if (completedAt) updates.completed_at = completedAt;
  if (isPassed !== undefined) updates.is_passed = isPassed;
  if (lastTakenAt) updates.last_taken_at = lastTakenAt;

  const { data, error } = await supabase
    .from('assessments')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Assessment not found' });
  const enriched = await enrichAssessments([data]);
  res.json({ data: enriched[0] });
}

async function addResponse(req, res) {
  const { questionId, answer, isCorrect, score, feedback } = req.body;
  if (!questionId || answer === undefined) return res.status(400).json({ error: 'questionId and answer are required' });

  const { data, error } = await supabase
    .from('assessment_responses')
    .insert({ assessment_id: req.params.id, question_id: questionId, answer, is_correct: isCorrect, score: score || 0, feedback: feedback || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: toCamelCase(data) });
}

module.exports = { listAssessments, getAssessmentById, createAssessment, updateAssessment, getResponsesByAssessment, addResponse };
