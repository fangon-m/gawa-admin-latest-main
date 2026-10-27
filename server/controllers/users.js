const supabase = require('../db/supabase');
const config = require('../config');
const { toCamelCase, getFullName } = require('../utilities/helpers');
const { logAdminActivity } = require('../utilities/activityLogger');
const invites = require('../services/invites');
const passwordResets = require('../services/passwordResets');
const tempPasswords = require('../services/tempPasswords');
const { sendEmail } = require('../services/mailer');
const { renderInviteEmail, ROLE_LABELS } = require('../services/emailTemplates/invite');
const { renderPasswordResetEmail } = require('../services/emailTemplates/passwordReset');
const { renderTempPasswordEmail } = require('../services/emailTemplates/tempPassword');

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
  // Keep the badge honest without a background job: any live invite past its
  // expiry is flipped to 'expired' before we read the list.
  await invites.expireStaleInvites();

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

  const members = (data || []).map((u) => {
    const suspensionActive = u.suspension_status === 'active' || u.suspension_status === 'escalated';
    return {
      kind: 'member',
      ...mapUser(u),
      status: u.is_archived ? 'archived' : suspensionActive ? 'suspended' : 'active',
      roles: rolesByUser[u.id] || [],
      isSelf: u.id === req.user?.id,
      resendable: false,
    };
  });

  const { data: inviteRows, error: inviteError } = await supabase
    .from('team_invites')
    .select('*')
    .in('status', invites.ACTIVE_STATUSES)
    .order('created_at', { ascending: true });

  if (inviteError) {
    // A missing migration must not take down the whole team page.
    console.error('[Team] Could not load pending invitations:', inviteError.message);
  }

  const inviterIds = [...new Set((inviteRows || []).map(i => i.invited_by).filter(Boolean))];
  const inviterNames = {};
  if (inviterIds.length > 0) {
    const { data: inviters } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', inviterIds);
    (inviters || []).forEach((u) => { inviterNames[u.id] = getFullName(u) || u.email || null; });
  }

  const pending = (inviteRows || []).map(invite => ({
    kind: 'invite',
    id: invite.invite_id,
    inviteId: invite.invite_id,
    name: invite.full_name,
    email: invite.email,
    role: invite.role,
    roles: [invite.role],
    status: invites.inviteStatus(invite),
    expiresAt: invite.expires_at,
    invitedBy: inviterNames[invite.invited_by] || null,
    createdAt: invite.created_at,
    isSelf: false,
    resendable: true,
  }));

  const combined = [...members, ...pending]
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));

  res.json({ data: combined });
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
      suspension_source: 'manual',
      suspended_at: now.toISOString(),
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

/**
 * Admin-triggered password reset. The server mints the temporary password,
 * applies it to the team member's auth account, and emails the login email
 * plus that password. The credential is never returned to the caller, shown in
 * the portal, or written to logs.
 */
async function adminResetPassword(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id || '')) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    const { data: member, error } = await supabase
      .from('users_table')
      .select('id, email, first_name, last_name, role, is_archived')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[TempPassword] Member lookup failed:', error.code || 'ERROR');
      return res.status(500).json({ error: 'Could not load that team member' });
    }
    if (!member) return res.status(404).json({ error: 'User not found' });
    if (!['admin', 'customer_support'].includes(member.role)) {
      return res.status(400).json({
        error: 'Only team members can receive a temporary password',
        code: 'NOT_TEAM_MEMBER',
      });
    }
    if (member.is_archived) {
      return res.status(409).json({ error: 'This account is archived. Unarchive it first.', code: 'USER_ARCHIVED' });
    }
    if (!member.email) {
      return res.status(400).json({
        error: 'That account has no email address to send the password to',
        code: 'NO_EMAIL',
      });
    }

    const tempPassword = tempPasswords.generateTempPassword();
    const { error: updateError } = await supabase.auth.admin.updateUserById(member.id, { password: tempPassword });
    if (updateError) {
      console.error('[TempPassword] Password update failed:', updateError.code || 'ERROR');
      return res.status(400).json({ error: 'Could not set the temporary password. Please try again.', code: 'RESET_FAILED' });
    }

    const { subject, html, text } = renderTempPasswordEmail({
      name: getFullName(member),
      email: member.email,
      password: tempPassword,
      supportEmail: config.email.supportEmail,
    });

    const delivery = await sendEmail({ to: member.email, subject, html, text, template: 'temp_password' });

    logAdminActivity({
      actorId: req.user?.id,
      activityType: 'password_reset',
      category: 'user',
      relatedUserId: member.id,
      description: `Issued a temporary password to ${member.email} (${delivery.delivered ? 'delivered' : `failed: ${delivery.errorCode}`})`,
    });

    return res.json({
      data: {
        email: member.email,
        delivery: delivery.delivered ? 'sent' : 'failed',
      },
      message: delivery.delivered
        ? `Temporary password emailed to ${member.email}`
        : 'Temporary password set, but the email could not be delivered.',
    });
  } catch (err) {
    console.error('[TempPassword] Reset failed:', err?.code || 'ERROR');
    return res.status(500).json({ error: 'Could not reset the password' });
  }
}

const UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function inviteActorName(req) {
  return getFullName(req.user) || req.user?.name || req.user?.email || 'A GAWA administrator';
}

function handleInviteError(res, err, fallback = 'Could not process the invitation') {
  if (err instanceof invites.InviteError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  }
  // Never echo raw driver/provider messages: they can contain connection
  // strings or provider feedback. Log the code only.
  console.error('[Invites] Unexpected error:', err?.code || 'ERROR', err?.message || 'unknown');
  return res.status(500).json({ error: fallback });
}

async function deliverInvite({ invite, rawToken, inviterName }) {
  const { subject, html, text } = renderInviteEmail({
    inviteeName: invite.full_name,
    inviterName,
    email: invite.email,
    role: invite.role,
    acceptUrl: invites.buildAcceptUrl(rawToken),
    expiresAt: invite.expires_at,
    supportEmail: config.email.supportEmail,
  });

  const result = await sendEmail({
    to: invite.email,
    subject,
    html,
    text,
    template: 'team_invite',
    inviteId: invite.invite_id,
  });

  await invites.setDeliveryResult(invite.invite_id, {
    delivered: result.delivered,
    attempts: result.attempts,
    errorCode: result.errorCode,
  });

  return result;
}

function inviteResponse(invite, delivery) {
  return {
    inviteId: invite.invite_id,
    email: invite.email,
    name: invite.full_name,
    role: invite.role,
    status: invites.inviteStatus(invite),
    expiresAt: invite.expires_at,
    delivery: delivery.delivered ? 'sent' : 'failed',
  };
}

async function inviteUser(req, res) {
  if (!config.invites.enabled) {
    return res.status(503).json({ error: 'Team invitations are currently disabled', code: 'INVITES_DISABLED' });
  }

  const { name, email, role } = req.body;
  if (!['admin', 'customer_support'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or customer_support' });
  }
  const normalizedEmail = invites.normalizeEmail(email);

  try {
    await invites.assertActorQuota(req.user?.id);

    // Invites are pending records only — the auth account and profile are
    // created when the invitee accepts, so this must not collide with either.
    const existingUser = await invites.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({
        error: existingUser.is_archived
          ? 'A team member with this email already exists but is archived. Unarchive that account instead.'
          : 'A team member with this email already exists',
        code: 'USER_EXISTS',
      });
    }

    const activeInvite = await invites.findActiveInvite(normalizedEmail);
    if (activeInvite && !invites.isExpired(activeInvite)) {
      return res.status(409).json({
        error: 'An active invitation already exists for this email. Resend it instead.',
        code: 'INVITE_EXISTS',
        inviteId: activeInvite.invite_id,
        expiresAt: activeInvite.expires_at,
      });
    }
    if (activeInvite) await invites.expireStaleInvites();

    const { invite, rawToken } = await invites.insertInvite({
      fullName: name,
      email: normalizedEmail,
      role,
      invitedBy: req.user?.id,
    });

    const delivery = await deliverInvite({ invite, rawToken, inviterName: inviteActorName(req) });
    const status = inviteResponse(invite, delivery);

    logAdminActivity({
      actorId: req.user?.id,
      activityType: 'user_invited',
      category: 'user',
      description: `Invited ${normalizedEmail} as ${ROLE_LABELS[role] || role} (email ${delivery.delivered ? 'sent' : 'failed'})`,
    });
    if (!delivery.delivered) {
      logAdminActivity({
        actorId: req.user?.id,
        activityType: 'invite_delivery_failed',
        category: 'user',
        description: `Invitation email to ${normalizedEmail} failed after ${delivery.attempts} attempt(s)`,
      });
    }

    return res.status(201).json({
      data: status,
      message: delivery.delivered
        ? 'Invitation email sent'
        : 'Invitation created, but the email could not be delivered. Use resend.',
    });
  } catch (err) {
    return handleInviteError(res, err, 'Could not create the invitation');
  }
}

async function resendInvite(req, res) {
  const { inviteId } = req.params;
  if (!UUID_RE.test(inviteId || '')) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  try {
    const existing = await invites.getInviteById(inviteId);
    if (!existing) return res.status(404).json({ error: 'Invitation not found' });
    if (!invites.ACTIVE_STATUSES.includes(existing.status)) {
      return res.status(409).json({ error: 'This invitation can no longer be resent', code: 'INVITE_INACTIVE' });
    }

    // Rotating the hash invalidates the previously emailed link immediately.
    const { invite, rawToken } = await invites.rotateInviteToken(inviteId);
    const delivery = await deliverInvite({ invite, rawToken, inviterName: inviteActorName(req) });

    logAdminActivity({
      actorId: req.user?.id,
      activityType: 'invite_resent',
      category: 'user',
      description: `Resent invitation to ${invite.email} (email ${delivery.delivered ? 'sent' : 'failed'})`,
    });

    return res.json({
      data: inviteResponse(invite, delivery),
      message: delivery.delivered ? 'Invitation email resent' : 'Resend failed. Check the mail provider configuration.',
    });
  } catch (err) {
    return handleInviteError(res, err, 'Could not resend the invitation');
  }
}

async function revokeInvite(req, res) {
  const { inviteId } = req.params;
  if (!UUID_RE.test(inviteId || '')) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  try {
    const revoked = await invites.revokeInvite(inviteId);

    logAdminActivity({
      actorId: req.user?.id,
      activityType: 'invite_revoked',
      category: 'user',
      description: `Revoked pending invitation for ${revoked.email}`,
    });

    return res.json({
      data: { inviteId: revoked.invite_id, email: revoked.email, status: 'revoked' },
      message: 'Invitation revoked',
    });
  } catch (err) {
    return handleInviteError(res, err, 'Could not revoke the invitation');
  }
}

/**
 * Admin-triggered reset link for an existing team member. Same token model as
 * the self-service flow; the password is never set or shown here.
 */
async function sendPasswordResetEmail(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id || '')) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    const { data: member, error } = await supabase
      .from('users_table')
      .select('id, email, first_name, last_name, role, is_archived')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[PasswordReset] Member lookup failed:', error.code || 'ERROR');
      return res.status(500).json({ error: 'Could not load that team member' });
    }
    if (!member) return res.status(404).json({ error: 'User not found' });
    if (!['admin', 'customer_support'].includes(member.role)) {
      return res.status(400).json({ error: 'Only team members can receive a reset link', code: 'NOT_TEAM_MEMBER' });
    }
    if (member.is_archived) {
      return res.status(409).json({ error: 'This account is archived. Unarchive it first.', code: 'USER_ARCHIVED' });
    }
    if ((await passwordResets.countRecent(member.id)) >= config.passwordReset.maxPerHour) {
      return res.status(429).json({
        error: 'Too many reset emails for this account. Try again in an hour.',
        code: 'RESET_QUOTA',
      });
    }

    const created = await passwordResets.createReset({ userId: member.id, email: member.email, ip: req.ip });
    if (!created) return res.status(500).json({ error: 'Could not create the reset link' });

    const { subject, html, text } = renderPasswordResetEmail({
      name: getFullName(member),
      email: member.email,
      resetUrl: passwordResets.buildResetUrl(created.rawToken),
      expiresAt: created.reset.expires_at,
      supportEmail: config.email.supportEmail,
    });

    const delivery = await sendEmail({ to: member.email, subject, html, text, template: 'password_reset' });

    logAdminActivity({
      actorId: req.user?.id,
      activityType: 'password_reset',
      category: 'user',
      relatedUserId: member.id,
      description: `Sent a password reset link to ${member.email} (${delivery.delivered ? 'delivered' : `failed: ${delivery.errorCode}`})`,
    });

    return res.json({
      data: {
        email: member.email,
        delivery: delivery.delivered ? 'sent' : 'failed',
        expiresAt: created.reset.expires_at,
      },
      message: delivery.delivered
        ? `Reset link emailed to ${member.email}`
        : 'Reset link created, but the email could not be delivered.',
    });
  } catch (err) {
    console.error('[PasswordReset] Send failed:', err?.code || 'ERROR');
    return res.status(500).json({ error: 'Could not send the reset link' });
  }
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
  resendInvite, revokeInvite, sendPasswordResetEmail,
};