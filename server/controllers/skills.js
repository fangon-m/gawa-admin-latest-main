const supabase = require('../db/supabase');
const { toCamelCase, sanitizeSearchTerm, sendError } = require('../utilities/helpers');

async function listSkills(req, res) {
  // Normalised before it reaches the PostgREST filter expression.
  const search = sanitizeSearchTerm(req.query.search);
  let query = supabase.from('skills').select('*');
  if (search) query = query.ilike('skill_name', `%${search}%`);
  query = query.order('skill_name', { ascending: true });

  const { data, error } = await query;
  if (error) return sendError(res, error, { status: 500 });
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

  if (error) return sendError(res, error, { status: 500 });
  res.status(201).json({ data: toCamelCase(data), message: 'Skill created' });
}

async function updateSkill(req, res) {
  const { skillName, icon } = req.body;
  const updates = {};
  if (skillName) updates.skill_name = skillName;
  if (icon !== undefined) updates.icon = icon;
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

const SKILL_REFERENCES = [
  { table: 'job_skills', label: 'job posts', singular: 'job post' },
  { table: 'equipment_listing_skills', label: 'listings', singular: 'listing' },
  { table: 'user_skills', label: 'profiles', singular: 'profile' },
  { table: 'skill_assessments', label: 'assessments', singular: 'assessment' },
  { table: 'assessment_attempts', label: 'assessment attempts', singular: 'assessment attempt' },
];

async function deleteSkill(req, res) {
  const skillId = req.params.id;
  const usage = await Promise.all(SKILL_REFERENCES.map(async (reference) => {
    const { count, error } = await supabase
      .from(reference.table)
      .select('*', { count: 'exact', head: true })
      .eq('skill_id', skillId);
    if (error) throw error;
    return { ...reference, count: count || 0 };
  }));
  const blockers = usage.filter(reference => reference.count > 0);
  if (blockers.length) {
    const details = blockers
      .map(reference => `${reference.count} ${reference.count === 1 ? reference.singular : reference.label}`)
      .join(', ');
    return res.status(409).json({
      error: `This skill is used by ${details}. Remove those references or rename the skill instead.`,
    });
  }

  const { error } = await supabase.from('skills').delete().eq('skill_id', skillId);
  if (error) return sendError(res, error, { status: 500 });
  res.json({ message: 'Skill deleted' });
}

async function listSkillAssessments(req, res) {
  const { skillId } = req.query;
  let query = supabase.from('skill_assessments').select('*');
  if (skillId) query = query.eq('skill_id', skillId);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return sendError(res, error, { status: 500 });
  res.json({ data: data.map(toCamelCase) });
}

module.exports = { listSkills, getSkillById, createSkill, updateSkill, deleteSkill, listSkillAssessments };