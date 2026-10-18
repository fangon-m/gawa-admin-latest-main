const supabase = require('../db/supabase');
const crypto = require('crypto');
const { toCamelCase, getFullName } = require('../utilities/helpers');
const { logAdminActivity } = require('../utilities/activityLogger');

const USER_SELECT = 'id, email, phone, role, is_verified, is_archived, archived_at, archived_by, archive_reason, suspension_status, suspended_until, suspension_reason, suspension_updated_at, escalated_to_deletion, first_name, middle_name, last_name, birth_date, region, province, municipality, barangay, complete_address, profile_image_url, created_at';

function mapUser(u) {
  const suspensionActive = u.suspension_status === 'active' || u.suspension_status === 'escalated';
  return {
    ...toCamelCase(u),
    name: getFullName(u),
    fullName: getFullName(u),
    status: u.is_archived ? 'archived' : suspensionActive ? 'suspended' : (u.status || (u.is_verified ? 'verified' : 'unverified')),
    location: u.complete_address,
    avatarUrl: u.profile_image_url,
    joinedAt: u.created_at,
  };
}

async function listUsers(req, res) {
  const { page = 1, limit = 20, role, status, verified, search } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('users_table').select(USER_SELECT, { count: 'exact' })
    .not('role', 'in', '("admin","customer_support")');
  if (role) query = query.eq('role', role);
  if (status === 'archived') query = query.eq('is_archived', true);
  if (status && status !== 'archived') query = query.eq('is_archived', false);
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

  const skillsMap = await fetchEntitySkills(userIds, 'profile');

  res.json({
    data: (data || []).map(u => {
      return {
        ...mapUser(u),
        displayId: u.id?.slice(0, 8),
        notes: [],
        roles: rolesByUser[u.id] || [],
        roleProfiles: [],
        skills: skillsMap[u.id] || [],
      };
    }),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function listTeamMembers(req, res) {
  const { data, error } = await supabase
    .from('users_table')
    .select(USER_SELECT)
    .in('role', ['admin', 'customer_support'])
    .order('created_at', { ascending: true });

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

  res.json({
    data: (data || []).map(u => ({
      ...mapUser(u),
      status: u.is_archived ? 'archived' : 'active',
      roles: rolesByUser[u.id] || [],
      isSelf: u.id === req.user?.id,
    })),
  });
}

async function getUserById(req, res) {
  const { data: user, error } = await supabase
    .from('users_table')
    .select(`${USER_SELECT}, profile_image_url, updated_at`)
    .eq('id', req.params.id)
    .single();

  if (error || !user) return res.status(404).json({ error: 'User not found' });

  const [notesRes, rolesRes] = await Promise.all([
    supabase.from('user_notes').select('*').eq('user_id', req.params.id),
    supabase.from('user_roles').select('*, roles(role_name)').eq('user_id', req.params.id),
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

  res.json({
    data: {
      ...mapUser(user),
      notes,
      roles: (rolesRes.data || []).map(r => ({ ...r, roleName: r.roles?.role_name })),
      roleProfiles: [],
      skills: skillsMap[req.params.id] || [],
      suspendedUntil: user.suspended_until || null,
      suspensionReason: user.suspension_reason || null,
      escalatedToDeletion: user.escalated_to_deletion || false,
    },
  });
}

async function suspendUser(req, res) {
  const { duration = 7, reason = '' } = req.body;
  const days = Math.max(1, Math.min(90, Math.round(+duration || 7)));
  const now = new Date();
  const suspendedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data: existingUser, error: fetchErr } = await supabase
    .from('users_table')
    .select('id, is_archived, suspension_status, suspended_until')
    .eq('id', req.params.id)
    .maybeSingle();

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existingUser) return res.status(404).json({ error: 'User not found' });

  if (existingUser.is_archived) {
    return res.status(409).json({ error: 'Archived accounts cannot be suspended. Unarchive the account first.' });
  }

  const alreadySuspended = existingUser.suspension_status === 'active'
    && (existingUser.suspended_until === null || new Date(existingUser.suspended_until) > now);
  if (alreadySuspended) {
    return res.status(409).json({ error: 'User is already suspended' });
  }

  const { data: user, error: updateErr } = await supabase
    .from('users_table')
    .update({
      suspension_status: 'active',
      suspended_until: suspendedUntil,
      suspension_reason: reason || null,
      suspension_updated_at: now.toISOString(),
      escalated_to_deletion: false,
      updated_at: now.toISOString(),
    })
    .eq('id', req.params.id)
    .select(USER_SELECT)
    .single();

  if (updateErr || !user) return res.status(500).json({ error: updateErr?.message || 'Could not suspend user' });

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'user_suspended',
    category: 'user',
    relatedUserId: req.params.id,
    description: `Admin suspended user ${req.params.id} for ${days} day(s): ${reason || 'no reason'}`,
  });

  res.json({
    data: { ...mapUser(user), status: 'suspended', suspendedUntil: user.suspended_until, suspensionReason: user.suspension_reason },
    message: `User suspended for ${days} day(s)`,
  });
}

async function reinstateUser(req, res) {
  const now = new Date().toISOString();
  const { data: user, error } = await supabase
    .from('users_table')
    .update({
      suspension_status: 'resolved',
      suspended_until: null,
      suspension_reason: null,
      suspension_updated_at: now,
      escalated_to_deletion: false,
      updated_at: now,
    })
    .eq('id', req.params.id)
    .select(USER_SELECT)
    .single();

  if (error || !user) return res.status(404).json({ error: 'User not found' });

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'user_reinstated',
    category: 'user',
    relatedUserId: req.params.id,
    description: `Admin reinstated user ${req.params.id}`,
  });

  res.json({ data: mapUser(user), message: 'User reinstated' });
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

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'user_flagged',
    category: 'user',
    relatedUserId: req.params.id,
    description: `Admin flagged user ${req.params.id}`,
  });

  res.json({ data: { ...mapUser(user), status: 'flagged', flag: data }, message: 'User flagged' });
}

async function deleteUser(req, res) {
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(404).json({ error: 'User not found or could not be deleted' });

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'user_deleted',
    category: 'user',
    relatedUserId: req.params.id,
    description: `Admin deleted user ${req.params.id}`,
  });

  res.json({ message: 'User deleted' });
}

async function archiveUser(req, res) {
  const userId = req.params.id;
  if (req.user?.id === userId) {
    return res.status(400).json({ error: 'You cannot archive your own account' });
  }

  const { data: user, error: fetchError } = await supabase
    .from('users_table')
    .select('id, role, is_archived')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (['admin', 'customer_support'].includes(user.role)) {
    return res.status(403).json({ error: 'Staff accounts cannot be archived here' });
  }

  const archivedAt = new Date().toISOString();
  const { data: archivedUser, error: updateError } = await supabase
    .from('users_table')
    .update({
      is_archived: true,
      archived_at: archivedAt,
      archived_by: req.user?.id || null,
      archive_reason: req.body.reason,
      updated_at: archivedAt,
    })
    .eq('id', userId)
    .select(USER_SELECT)
    .single();

  if (updateError || !archivedUser) {
    return res.status(500).json({ error: updateError?.message || 'Could not archive user' });
  }

  const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  });

  if (banError) {
    const { error: rollbackError } = await supabase
      .from('users_table')
      .update({ is_archived: false, archived_at: null, archived_by: null, archive_reason: null, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (rollbackError) {
      return res.status(500).json({
        error: 'Auth ban failed and archive rollback failed; user access remains blocked by the archive flag',
      });
    }
    return res.status(502).json({ error: banError.message });
  }

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'user_archived',
    category: 'user',
    relatedUserId: userId,
    description: `Admin archived and banned user ${userId}: ${req.body.reason || 'no reason'}`,
  });

  res.json({ data: mapUser(archivedUser), message: 'User archived and banned from signing in' });
}

async function unarchiveUser(req, res) {
  const userId = req.params.id;
  const { data: user, error: fetchError } = await supabase
    .from('users_table')
    .select('id, is_archived')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.is_archived) return res.status(409).json({ error: 'User is not archived' });

  const { data: restoredUser, error: updateError } = await supabase
    .from('users_table')
    .update({ is_archived: false, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select(USER_SELECT)
    .single();

  if (updateError || !restoredUser) {
    return res.status(500).json({ error: updateError?.message || 'Could not unarchive user' });
  }

  const { error: unbanError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  });

  if (unbanError) {
    const { error: rollbackError } = await supabase
      .from('users_table')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (rollbackError) {
      return res.status(500).json({
        error: 'Auth unban failed and archive rollback failed; verify the account remains blocked before retrying',
      });
    }
    return res.status(502).json({ error: unbanError.message });
  }

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'user_unarchived',
    category: 'user',
    relatedUserId: userId,
    description: `Admin unarchived and restored access for user ${userId}`,
  });

  res.json({ data: mapUser(restoredUser), message: 'User unarchived and sign-in restored' });
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

async function findAuthUserByEmail(email) {
  if (typeof supabase.auth.admin.listUsers !== 'function') return null;
  const target = (email || '').toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 1000) return null;
  }
  return null;
}

async function inviteUser(req, res) {
  const { name, email, role } = req.body;
  if (!name || !email || !role) return res.status(400).json({ error: 'Name, email, and role are required' });
  if (!['admin', 'customer_support'].includes(role)) return res.status(400).json({ error: 'Role must be admin or customer_support' });

  const normalizedEmail = email.toLowerCase().trim();

  const { data: existing } = await supabase
    .from('users_table')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'User with this email already exists' });

  const generatedPassword = crypto.randomUUID().slice(0, 12);
  const nameParts = name.trim().split(' ');
  const firstName = nameParts[0] || name;
  const lastName = nameParts.slice(1).join(' ') || '';

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { name, first_name: firstName, last_name: lastName, role },
  });

  let userId;
  if (authError) {
    // An auth account with this email may already exist without a users_table
    // profile (e.g. created before the profile row was written). Recover it.
    const alreadyExists = /already (been )?registered|already exists/i.test(authError.message || '');
    const recovered = alreadyExists ? await findAuthUserByEmail(normalizedEmail) : null;
    if (!recovered) return res.status(500).json({ error: authError.message });
    userId = recovered.id;
    await supabase.auth.admin.updateUserById(userId, { password: generatedPassword, email_confirm: true });
  } else if (authUser?.user?.id) {
    userId = authUser.user.id;
  } else {
    return res.status(500).json({ error: 'Failed to create the authentication account' });
  }

  // The auth account and the users_table profile are separate rows; create the
  // profile explicitly instead of relying on a DB trigger, or login fails with
  // "No application profile is linked to this account."
  const { data: existingProfile } = await supabase
    .from('users_table')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileError } = await supabase.from('users_table').insert({
      id: userId,
      email: normalizedEmail,
      first_name: firstName,
      last_name: lastName,
      role,
      is_verified: true,
    });
    if (profileError) {
      // Roll back the orphan auth account so the email can be reused
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: profileError.message });
    }
  }

  // loginWithSupabase resolves the effective role from user_roles, so assign it here too
  const { data: roleRow } = await supabase
    .from('roles')
    .select('role_id')
    .eq('role_name', role)
    .maybeSingle();
  if (roleRow?.role_id) {
    await supabase.from('user_roles').insert({ user_id: userId, role_id: roleRow.role_id });
  }

  const { data: profile } = await supabase
    .from('users_table')
    .select('*')
    .eq('id', userId)
    .single();

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'user_invited',
    category: 'user',
    relatedUserId: userId,
    description: `Admin created ${role} account for ${getFullName(profile) || normalizedEmail}`,
  });

  res.status(201).json({ data: { ...profile, generatedPassword, name: getFullName(profile) }, message: 'Team member created successfully' });
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
  archiveUser, unarchiveUser, adminResetPassword, listUserProposals, listTeamMembers,
};