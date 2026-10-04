const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listSkills(req, res) {
  const { isActive, search } = req.query;
  let query = supabase.from('skills').select('*');
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  if (search) query = query.ilike('skill_name', `%${search}%`);
  query = query.order('skill_name', { ascending: true });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data.map(toCamelCase) });
}

async function getSkillById(req, res) {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('skill_id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Skill not found' });
  res.json({ data: toCamelCase(data) });
}

async function createSkill(req, res) {
  const { skillName, icon } = req.body;
  if (!skillName) return res.status(400).json({ error: 'Skill name is required' });

  const { data, error } = await supabase
    .from('skills')
    .insert({
      skill_name: skillName,
      icon: icon || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: toCamelCase(data), message: 'Skill created' });
}

async function updateSkill(req, res) {
  const { skillName, icon, isActive } = req.body;
  const updates = {};
  if (skillName) updates.skill_name = skillName;
  if (icon !== undefined) updates.icon = icon;
  if (isActive !== undefined) updates.is_active = isActive;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('skills')
    .update(updates)
    .eq('skill_id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Skill not found' });
  res.json({ data: toCamelCase(data), message: 'Skill updated' });
}

async function deleteSkill(req, res) {
  const { error } = await supabase.from('skills').delete().eq('skill_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Skill deleted' });
}

async function listSkillAssessments(req, res) {
  const { skillId } = req.query;
  let query = supabase.from('skill_assessments').select('*');
  if (skillId) query = query.eq('skill_id', skillId);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data.map(toCamelCase) });
}

module.exports = { listSkills, getSkillById, createSkill, updateSkill, deleteSkill, listSkillAssessments };