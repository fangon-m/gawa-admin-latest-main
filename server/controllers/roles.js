const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listRoles(req, res) {
  const { data, error } = await supabase.from('roles').select('*').order('role_name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: (data || []).map(toCamelCase) });
}

async function getRoleById(req, res) {
  const { data, error } = await supabase.from('roles').select('*').eq('role_id', req.params.id).single();
  if (error || !data) return res.status(404).json({ error: 'Role not found' });
  res.json({ data: toCamelCase(data) });
}

async function createRole(req, res) {
  const { roleName } = req.body;
  if (!roleName || !roleName.trim()) return res.status(400).json({ error: 'roleName is required' });

  const { data, error } = await supabase.from('roles').insert({ role_name: roleName.trim() }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Role already exists' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ data: toCamelCase(data) });
}

async function updateRole(req, res) {
  const { roleName } = req.body;
  if (!roleName || !roleName.trim()) return res.status(400).json({ error: 'roleName is required' });

  const { data, error } = await supabase.from('roles').update({ role_name: roleName.trim() }).eq('role_id', req.params.id).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Role name already exists' });
    if (!data) return res.status(404).json({ error: 'Role not found' });
    return res.status(500).json({ error: error.message });
  }
  res.json({ data: toCamelCase(data) });
}

async function deleteRole(req, res) {
  const { error } = await supabase.from('roles').delete().eq('role_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Role deleted' });
}

async function listUserRoles(req, res) {
  const { page = 1, limit = 20, userId } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('user_roles').select('*, roles(role_name)', { count: 'exact' });
  if (userId) query = query.eq('user_id', userId);
  query = query.range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: (data || []).map(r => ({ ...toCamelCase(r), roleName: r.roles?.role_name })),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function assignUserRole(req, res) {
  const { userId, roleId } = req.body;
  if (!userId || !roleId) return res.status(400).json({ error: 'userId and roleId are required' });

  const { data, error } = await supabase.from('user_roles').insert({ user_id: userId, role_id: roleId }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'User already has this role' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ data: toCamelCase(data) });
}

async function removeUserRole(req, res) {
  const { error } = await supabase.from('user_roles').delete().eq('user_role_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'User role removed' });
}

module.exports = { listRoles, getRoleById, createRole, updateRole, deleteRole, listUserRoles, assignUserRole, removeUserRole };
