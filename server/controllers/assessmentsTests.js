const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function enrichTests(tests) {
  if (!tests || tests.length === 0) return [];
  const skillIds = new Set();
  tests.forEach(t => { if (t.skill_id) skillIds.add(t.skill_id); });

  const skillMap = {};
  if (skillIds.size > 0) {
    const { data: skills } = await supabase.from('skills').select('skill_id, skill_name').in('skill_id', [...skillIds]);
    if (skills) skills.forEach(s => { skillMap[s.skill_id] = s.skill_name; });
  }

  return tests.map(t => ({ ...toCamelCase(t), skillName: skillMap[t.skill_id] || null }));
}

async function listTests(req, res) {
  const { skillId } = req.query;
  let query = supabase.from('assessments_tests').select('*');
  if (skillId) query = query.eq('skill_id', skillId);
  query = query.order('test_name', { ascending: true });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: await enrichTests(data || []) });
}

async function getTestById(req, res) {
  const { data, error } = await supabase.from('assessments_tests').select('*').eq('test_id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Assessment test not found' });
  const enriched = await enrichTests([data]);
  res.json({ data: enriched[0] });
}

async function createTest(req, res) {
  const { skillId, testName, totalItems, timeLimit, retakeCooldownHours } = req.body;
  if (!skillId || !testName || !testName.trim()) return res.status(400).json({ error: 'skillId and testName are required' });

  const { data, error } = await supabase.from('assessments_tests').insert({
    skill_id: skillId,
    test_name: testName.trim(),
    total_items: totalItems || 0,
    time_limit: timeLimit || null,
    retake_cooldown_hours: retakeCooldownHours !== undefined ? retakeCooldownHours : 24,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  const enriched = await enrichTests([data]);
  res.status(201).json({ data: enriched[0] });
}

async function updateTest(req, res) {
  const { skillId, testName, totalItems, timeLimit, retakeCooldownHours } = req.body;
  const updates = {};
  if (skillId) updates.skill_id = skillId;
  if (testName) updates.test_name = testName.trim();
  if (totalItems !== undefined) updates.total_items = totalItems;
  if (timeLimit !== undefined) updates.time_limit = timeLimit;
  if (retakeCooldownHours !== undefined) updates.retake_cooldown_hours = retakeCooldownHours;

  const { data, error } = await supabase.from('assessments_tests').update(updates).eq('test_id', req.params.id).select().single();
  if (error || !data) return res.status(404).json({ error: 'Assessment test not found' });
  const enriched = await enrichTests([data]);
  res.json({ data: enriched[0] });
}

async function deleteTest(req, res) {
  const { error } = await supabase.from('assessments_tests').delete().eq('test_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Assessment test deleted' });
}

module.exports = { listTests, getTestById, createTest, updateTest, deleteTest };
