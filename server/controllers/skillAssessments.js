const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listSkillAssessments(req, res) {
  const { skillId, isActive } = req.query;
  let query = supabase.from('skill_assessments').select('*');
  if (skillId) query = query.eq('skill_id', skillId);
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data.map(toCamelCase) });
}

async function getSkillAssessmentById(req, res) {
  const { data, error } = await supabase
    .from('skill_assessments')
    .select('*')
    .eq('assessment_id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Assessment not found' });
  res.json({ data: toCamelCase(data) });
}

async function createSkillAssessment(req, res) {
  const { skillId, title, description, passingPercent, questionsPerCategory, timeLimitMinutes } = req.body;
  if (!skillId || !title) return res.status(400).json({ error: 'Skill ID and title are required' });

  const { data, error } = await supabase
    .from('skill_assessments')
    .insert({
      skill_id: skillId,
      title,
      description: description || null,
      passing_percent: passingPercent || 75,
      questions_per_category: questionsPerCategory || 5,
      time_limit_minutes: timeLimitMinutes || 40,
      is_active: true,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: toCamelCase(data), message: 'Assessment created' });
}

async function updateSkillAssessment(req, res) {
  const { title, description, passingPercent, questionsPerCategory, timeLimitMinutes, isActive } = req.body;
  const updates = {};
  if (title) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (passingPercent) updates.passing_percent = passingPercent;
  if (questionsPerCategory) updates.questions_per_category = questionsPerCategory;
  if (timeLimitMinutes) updates.time_limit_minutes = timeLimitMinutes;
  if (isActive !== undefined) updates.is_active = isActive;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('skill_assessments')
    .update(updates)
    .eq('assessment_id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Assessment not found' });
  res.json({ data: toCamelCase(data), message: 'Assessment updated' });
}

async function deleteSkillAssessment(req, res) {
  const { error } = await supabase.from('skill_assessments').delete().eq('assessment_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Assessment deleted' });
}

module.exports = { listSkillAssessments, getSkillAssessmentById, createSkillAssessment, updateSkillAssessment, deleteSkillAssessment };