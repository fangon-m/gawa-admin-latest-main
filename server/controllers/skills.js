const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listSkills(req, res) {
  const { data, error } = await supabase.from('skills').select('*').order('skill_name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: (data || []).map(toCamelCase) });
}

async function getSkillById(req, res) {
  const { data, error } = await supabase.from('skills').select('*').eq('skill_id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Skill not found' });
  res.json({ data: toCamelCase(data) });
}

async function createSkill(req, res) {
  const { skillName } = req.body;
  if (!skillName || !skillName.trim()) return res.status(400).json({ error: 'skillName is required' });

  const { data, error } = await supabase.from('skills').insert({ skill_name: skillName.trim() }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Skill already exists' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ data: toCamelCase(data) });
}

async function updateSkill(req, res) {
  const { skillName } = req.body;
  if (!skillName || !skillName.trim()) return res.status(400).json({ error: 'skillName is required' });

  const { data, error } = await supabase.from('skills').update({ skill_name: skillName.trim() }).eq('skill_id', req.params.id).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Skill name already exists' });
    if (!data) return res.status(404).json({ error: 'Skill not found' });
    return res.status(500).json({ error: error.message });
  }
  res.json({ data: toCamelCase(data) });
}

async function deleteSkill(req, res) {
  const { error } = await supabase.from('skills').delete().eq('skill_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Skill deleted' });
}

async function listEntitySkills(req, res) {
  const { entityType, entityId } = req.params;

  let table;
  let fkColumn;
  let fkColumn2;
  switch (entityType) {
    case 'job':
      table = 'job_skills';
      fkColumn = 'job_post_id';
      break;
    case 'profile':
      table = 'user_skills';
      fkColumn = 'user_id';
      break;
    case 'listing':
      table = 'equipment_listing_skills';
      fkColumn = 'listing_id';
      break;
    default:
      return res.status(400).json({ error: 'Invalid entity type. Must be one of: job, profile, listing' });
  }

  const { data, error } = await supabase
    .from(table)
    .select(`*, skills(skill_name)`)
    .eq(fkColumn, entityId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: (data || []).map(s => ({
      ...toCamelCase(s),
      skillName: s.skills?.skill_name,
    })),
  });
}

async function assignEntitySkill(req, res) {
  const { entityType, entityId } = req.params;
  const { skillId } = req.body;
  if (!skillId) return res.status(400).json({ error: 'skillId is required' });

  let table;
  let insertData;
  switch (entityType) {
    case 'job':
      table = 'job_skills';
      insertData = { job_post_id: entityId, skill_id: skillId };
      break;
    case 'profile':
      table = 'user_skills';
      insertData = { user_id: entityId, skill_id: skillId };
      break;
    case 'listing':
      table = 'equipment_listing_skills';
      insertData = { listing_id: entityId, skill_id: skillId };
      break;
    default:
      return res.status(400).json({ error: 'Invalid entity type. Must be one of: job, profile, listing' });
  }

  const { data, error } = await supabase
    .from(table)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Entity already has this skill' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ data: toCamelCase(data) });
}

async function removeEntitySkill(req, res) {
  const { entityType, entityId, skillId } = req.params;

  let table;
  let filterKey;
  switch (entityType) {
    case 'job':
      table = 'job_skills';
      filterKey = 'job_post_id';
      break;
    case 'profile':
      table = 'user_skills';
      filterKey = 'user_id';
      break;
    case 'listing':
      table = 'equipment_listing_skills';
      filterKey = 'listing_id';
      break;
    default:
      return res.status(400).json({ error: 'Invalid entity type. Must be one of: job, profile, listing' });
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq(filterKey, entityId)
    .eq('skill_id', skillId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Skill removed from entity' });
}

module.exports = {
  listSkills, getSkillById, createSkill, updateSkill, deleteSkill,
  listEntitySkills, assignEntitySkill, removeEntitySkill,
};
