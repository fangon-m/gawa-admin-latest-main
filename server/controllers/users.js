const supabase = require('../db/supabase');
const crypto = require('crypto');
const { toCamelCase, getFullName } = require('../utilities/helpers');

const USER_SELECT = 'id, email, phone, role, is_verified, first_name, middle_name, last_name, birth_date, region, province, municipality, barangay, complete_address, profile_image_url, created_at';

function mapUser(u) {
  return {
    ...toCamelCase(u),
    name: getFullName(u),
    fullName: getFullName(u),
    status: u.status || (u.is_verified ? 'verified' : 'unverified'),
    location: u.complete_address,
    avatarUrl: u.profile_image_url,
    joinedAt: u.created_at,
  };
}

async function fetchSuspensionData(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const { data } = await supabase
    .from('user_suspensions')
    .select('user_id, suspended_until, suspension_reason, escalated_to_deletion, suspension_status')
    .in('user_id', userIds)
    .in('suspension_status', ['active', 'escalated']);
  const map = {};
  (data || []).forEach(s => { map[s.user_id] = s; });
  return map;
}

async function listUsers(req, res) {
  const { page = 1, limit = 20, role, status, verified, search } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('users_table').select(USER_SELECT, { count: 'exact' })
    .not('role', 'in', '("admin","customer_support")');
  if (role) query = query.eq('role', role);
  if (status === 'verified') query = query.eq('is_verified', true);
  if (status === 'unverified') query = query.eq('is_verified', false);
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  const userIds = (data || []).map(u => u.id);
  const rolesByUser = {};
  if (userIds.length > 0) {
    const { data: rolesRes } = await supabase.from('user_roles').select('user_id, roles(role_name)').in('user_id', userIds);
    (rolesRes || []).forEach(r => {
      if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
      rolesByUser[r.user_id].push(r.roles?.role_name);
    });
  }

  const suspensionMap = await fetchSuspensionData(userIds);
  const skillsMap = await fetchEntitySkills(userIds, 'profile');

  res.json({
    data: (data || []).map(u => {
      const susp = suspensionMap[u.id] || {};
      return {
        ...mapUser(u),
        displayId: u.id?.slice(0, 8),
        notes: [],
        roles: rolesByUser[u.id] || [],
        roleProfiles: [],
        skills: skillsMap[u.id] || [],
        suspendedUntil: susp.suspended_until || null,
        suspensionReason: susp.suspension_reason || null,
      };
    }),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getUserById(req, res) {
  const { data: user, error } = await supabase
    .from('users_table')
    .select(`${USER_SELECT}, profile_image_url, updated_at`)
    .eq('id', req.params.id)
    .single();

  if (error || !user) return res.status(404).json({ error: 'User not found' });

  const [notesRes, rolesRes, suspensionRes] = await Promise.all([
    supabase.from('user_notes').select('*').eq('user_id', req.params.id),
    supabase.from('user_roles').select('*, roles(role_name)').eq('user_id', req.params.id),
    supabase.from('user_suspensions').select('*').eq('user_id', req.params.id).in('suspension_status', ['active', 'escalated']).maybeSingle(),
  ]);

  const rawNotes = notesRes.data || [];
  const noteAuthorIds = [...new Set(rawNotes.map(n => n.author_id).filter(Boolean))];
  let authorMap = {};
  if (noteAuthorIds.length > 0) {
    const { data: authors } = await supabase.from('users_table').select('id, first_name, last_name').in('id', noteAuthorIds);
    if (authors) authors.forEach(a => { authorMap[a.id] = getFullName(a); });
  }
  const notes = rawNotes.map(n => ({ ...n, authorName: authorMap[n.author_id] || 'Admin' }));

  const skillsMap = await fetchEntitySkills([req.params.id], 'profile');

  const susp = suspensionRes.data || {};
  res.json({
    data: {
      ...mapUser(user),
      notes,
      roles: (rolesRes.data || []).map(r => ({ ...r, roleName: r.roles?.role_name })),
      roleProfiles: [],
      skills: skillsMap[req.params.id] || [],
      suspendedUntil: susp.suspended_until || null,
      suspensionReason: susp.suspension_reason || null,
      escalatedToDeletion: susp.escalated_to_deletion || false,
      status: susp.escalated_to_deletion ? 'archived' : susp.suspension_status ? 'suspended' : (user.is_verified ? 'verified' : 'unverified'),
    },
  });
}

async function suspendUser(req, res) {
  const { duration = 7, reason = '' } = req.body;
  const days = Math.max(1, Math.min(90, Math.round(+duration || 7)));
  const suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data: existingSusp } = await supabase
    .from('user_suspensions')
    .select('suspension_id')
    .eq('user_id', req.params.id)
    .eq('suspension_status', 'active')
    .maybeSingle();

  const { data: existingUser } = await supabase
    .from('users_table')
    .select('id')
    .eq('id', req.params.id)
    .single();

  if (!existingUser) return res.status(404).json({ error: 'User not found' });

  if (existingSusp) {
    const { error: updateErr } = await supabase
      .from('user_suspensions')
      .update({ suspended_until: suspendedUntil, suspension_reason: reason || null })
      .eq('suspension_id', existingSusp.suspension_id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });
  } else {
    const { error: insertErr } = await supabase
      .from('user_suspensions')
      .insert({
        user_id: req.params.id,
        suspended_until: suspendedUntil,
        suspension_reason: reason || null,
        suspension_status: 'active',
      });
    if (insertErr) return res.status(500).json({ error: insertErr.message });
  }

  const { data: user } = await supabase.from('users_table').select(USER_SELECT).eq('id', req.params.id).single();
  const { data: suspension } = await supabase.from('user_suspensions').select('*').eq('user_id', req.params.id).eq('suspension_status', 'active').maybeSingle();

  res.json({
    data: { ...mapUser(user), status: 'suspended', suspendedUntil: suspension?.suspended_until, suspensionReason: suspension?.suspension_reason },
    message: `User suspended for ${days} day(s)`,
  });
}

async function reinstateUser(req, res) {
  await Promise.all([
    supabase.from('user_suspensions')
      .update({ suspension_status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('user_id', req.params.id)
      .eq('suspension_status', 'active'),
  ]);

  const { data: user } = await supabase.from('users_table').select(USER_SELECT).eq('id', req.params.id).single();
  res.json({ data: { ...mapUser(user), status: user?.is_verified ? 'verified' : 'unverified' }, message: 'User reinstated' });
}

async function flagUser(req, res) {
  const { data: user, error: fetchErr } = await supabase
    .from('users_table')
    .select('id')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !user) return res.status(404).json({ error: 'User not found' });

  const { data, error } = await supabase
    .from('entity_flags')
    .insert({ entity_type: 'user', entity_id: req.params.id, flagged_by: req.user.id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: { ...mapUser(user), status: 'flagged', flag: data }, message: 'User flagged' });
}

async function deleteUser(req, res) {
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(404).json({ error: 'User not found or could not be deleted' });
  res.json({ message: 'User deleted' });
}

async function listEscalatedUsers(req, res) {
  const now = new Date().toISOString();

  const { data: expired, error: expiredErr } = await supabase
    .from('user_suspensions')
    .select('*, users_table!inner(*)')
    .eq('suspension_status', 'active')
    .lt('suspended_until', now)
    .not('suspended_until', 'is', null)
    .order('suspended_until', { ascending: false });

  if (expiredErr) return res.status(500).json({ error: expiredErr.message });

  const { data: escalated, error: escalatedErr } = await supabase
    .from('user_suspensions')
    .select('*, users_table!inner(*)')
    .eq('escalated_to_deletion', true);

  if (escalatedErr) return res.status(500).json({ error: escalatedErr.message });

  const mapUser = (s) => ({
    ...mapUser(s.users_table),
    suspendedUntil: s.suspended_until,
    suspensionReason: s.suspension_reason,
  });

  res.json({
    data: {
      expiredSuspensions: (expired || []).map(mapUser),
      escalatedToDeletion: (escalated || []).map(mapUser),
    },
    pagination: { total: (expired?.length || 0) + (escalated?.length || 0) },
  });
}

async function escalateToDeletion(req, res) {
  const { data: susp, error: fetchErr } = await supabase
    .from('user_suspensions')
    .select('suspension_id, user_id')
    .eq('user_id', req.params.id)
    .eq('suspension_status', 'active')
    .maybeSingle();

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!susp) return res.status(400).json({ error: 'User is not suspended' });

  await Promise.all([
    supabase.from('user_suspensions')
      .update({ escalated_to_deletion: true, suspension_status: 'escalated' })
      .eq('suspension_id', susp.suspension_id),
  ]);

  const { data: user } = await supabase.from('users_table').select(USER_SELECT).eq('id', req.params.id).single();
  res.json({ data: { ...mapUser(user) }, message: 'User escalated to deletion queue' });
}

async function removeFromEscalation(req, res) {
  const { action } = req.body;

  if (action === 'delete_permanently') {
    const { error } = await supabase.auth.admin.deleteUser(req.params.id);
    if (error) return res.status(404).json({ error: 'User not found or could not be deleted' });
    return res.json({ message: 'User permanently deleted' });
  }

  if (action === 'reinstate') {
    await Promise.all([
      supabase.from('user_suspensions')
        .update({ escalated_to_deletion: false, suspension_status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('user_id', req.params.id)
        .eq('escalated_to_deletion', true),
    ]);
  } else {
    await supabase.from('user_suspensions')
      .update({ escalated_to_deletion: false, suspension_status: 'expired' })
      .eq('user_id', req.params.id)
      .eq('escalated_to_deletion', true);
    await supabase.from('users_table')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
  }

  const { data: user } = await supabase.from('users_table').select(USER_SELECT).eq('id', req.params.id).single();
  res.json({ data: { ...mapUser(user) }, message: action === 'reinstate' ? 'User reinstated from escalation' : 'User removed from escalation queue' });
}

async function updateUser(req, res) {
  const { name, phone, location, firstName, lastName, middleName, completeAddress } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) {
    const parts = name.trim().split(' ');
    updates.first_name = parts[0] || '';
    updates.last_name = parts.slice(1).join(' ') || '';
  }
  if (firstName !== undefined) updates.first_name = firstName;
  if (lastName !== undefined) updates.last_name = lastName;
  if (middleName !== undefined) updates.middle_name = middleName;
  if (phone !== undefined) updates.phone = phone;
  if (location !== undefined) updates.complete_address = location;
  if (completeAddress !== undefined) updates.complete_address = completeAddress;

  const { data, error } = await supabase
    .from('users_table')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'User not found' });
  res.json({ data: { ...mapUser(data) }, message: 'Profile updated successfully' });
}

async function adminResetPassword(req, res) {
  const { newPassword } = req.body;
  const { error } = await supabase.auth.admin.updateUserById(req.params.id, { password: newPassword });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Password reset successful' });
}

async function inviteUser(req, res) {
  const { name, email, role } = req.body;
  if (!name || !email || !role) return res.status(400).json({ error: 'Name, email, and role are required' });
  if (!['admin', 'customer_support'].includes(role)) return res.status(400).json({ error: 'Role must be admin or customer_support' });

  const { data: existing } = await supabase
    .from('users_table')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'User with this email already exists' });

  const generatedPassword = crypto.randomUUID().slice(0, 12);
  const nameParts = name.trim().split(' ');
  const firstName = nameParts[0] || name;
  const lastName = nameParts.slice(1).join(' ') || '';

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { name, first_name: firstName, last_name: lastName, role },
  });
  if (authError) return res.status(500).json({ error: authError.message });

  const { data: profile } = await supabase
    .from('users_table')
    .select('*')
    .eq('id', authUser.user.id)
    .single();

  res.status(201).json({ data: { ...profile, generatedPassword, name: getFullName(profile) }, message: 'User invited successfully' });
}

async function fetchEntitySkills(entityIds, entityType = 'profile') {
  if (!entityIds || entityIds.length === 0) return {};
  let table;
  let fkColumn;
  switch (entityType) {
    case 'profile':
      table = 'user_skills';
      fkColumn = 'user_id';
      break;
    case 'job':
      table = 'job_skills';
      fkColumn = 'job_post_id';
      break;
    case 'listing':
      table = 'equipment_listing_skills';
      fkColumn = 'listing_id';
      break;
    default:
      return {};
  }

  const { data } = await supabase
    .from(table)
    .select(`${fkColumn}, skills(skill_name)`)
    .in(fkColumn, entityIds);

  const map = {};
  (data || []).forEach(es => {
    const id = es[fkColumn];
    if (!map[id]) map[id] = [];
    if (es.skills?.skill_name) map[id].push(es.skills.skill_name);
  });
  return map;
}

async function listUserProposals(req, res) {
  const { id } = req.params;

  const { data: matches, error } = await supabase
    .from('job_matches')
    .select(`
      *,
      job_post:job_post_id ( job_title, hiring_option, job_status, client_id )
    `)
    .eq('user_id', id)
    .order('matched_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const clientIds = [...new Set((matches || []).map(m => m.job_post?.client_id).filter(Boolean))];
  const clientNameMap = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', clientIds);
    for (const c of clients || []) {
      clientNameMap[c.id] = getFullName(c);
    }
  }

  const enriched = (matches || []).map(m => ({
    ...toCamelCase(m),
    jobPost: m.job_post ? {
      ...toCamelCase(m.job_post),
      clientName: clientNameMap[m.job_post.client_id] || m.job_post.client_id,
    } : null,
  }));

  res.json({ data: enriched });
}

module.exports = { listUsers, getUserById, updateUser, suspendUser, reinstateUser, deleteUser, inviteUser, flagUser,
  listEscalatedUsers, escalateToDeletion, removeFromEscalation, adminResetPassword, listUserProposals,
};