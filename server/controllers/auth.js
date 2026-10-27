const supabase = require('../db/supabase');
const config = require('../config');
const { createClient } = require('@supabase/supabase-js');
const { toCamelCase, getFullName } = require('../utilities/helpers');
const { logAdminActivity } = require('../utilities/activityLogger');
const { findAuthUserByEmail } = require('../utilities/authUsers');
const invites = require('../services/invites');
const passwordResets = require('../services/passwordResets');
const { sendEmail } = require('../services/mailer');
const { renderPasswordResetEmail } = require('../services/emailTemplates/passwordReset');

const LOCAL_ADMIN_EMAIL = 'gawaadmin@email.com';
const LOCAL_ADMIN_PASSWORD = 'gawaadmin123';
const LOCAL_ADMIN_TOKEN = 'gawa-local-admin-token';
const LOCAL_ADMIN_ID = '00000000-0000-4000-8000-000000000001';

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  if (email === LOCAL_ADMIN_EMAIL && password === LOCAL_ADMIN_PASSWORD) {
    if (process.env.NODE_ENV === 'production') return loginWithSupabase(email, password, res);

    const { data: profile, error: profileError } = await supabase
      .from('users_table')
      .select('id, first_name, last_name, email, role, is_verified, profile_image_url, phone, complete_address, created_at, is_archived')
      .eq('email', LOCAL_ADMIN_EMAIL)
      .maybeSingle();
    if (profileError) return res.status(500).json({ error: profileError.message });
    if (profile?.is_archived) return res.status(403).json({ error: 'This account is archived and cannot access the application' });

    return res.json({
      data: {
        token: LOCAL_ADMIN_TOKEN,
        user: {
          ...(profile || {}),
          id: profile?.id || LOCAL_ADMIN_ID,
          email: LOCAL_ADMIN_EMAIL,
          name: profile ? getFullName(profile) : 'GAWA Admin',
          role: 'admin',
          roles: ['admin'],
        },
      },
    });
  }

  return loginWithSupabase(email, password, res);
}

async function loginWithSupabase(email, password, res) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid email or password' });

  const { data: profile, error: profileError } = await supabase
    .from('users_table')
    .select('id, first_name, last_name, email, role, is_verified, profile_image_url, phone, complete_address, created_at')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) return res.status(500).json({ error: profileError.message });
  if (!profile) return res.status(403).json({ error: 'No application profile is linked to this account.' });

  // user_roles is optional in some deployments; fall back to the legacy
  // users_table.role column when the table (or the join) is unavailable.
  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('roles(role_name)')
    .eq('user_id', data.user.id);
  if (rolesError) console.warn('[Auth] user_roles lookup failed; using users_table.role:', rolesError.message);
  const roles = (roleRows || []).map(row => row.roles?.role_name).filter(Boolean);

  res.json({
    data: {
      token: data.session.access_token,
      user: {
        ...profile,
        name: getFullName(profile),
        role: roles.includes('admin')
          ? 'admin'
          : roles.includes('customer_support')
            ? 'customer_support'
            : profile.role,
        roles,
      },
    },
  });
}

const TEAM_ROLES = ['admin', 'customer_support'];
const RESET_REQUESTED = 'If that email belongs to a team member, a reset link has been sent.';

/**
 * Public, unauthenticated. Always answers the same way so the endpoint cannot
 * be used to enumerate team accounts, and only team members get a link (the
 * consumer app owns client passwords).
 */
async function requestPasswordReset(req, res) {
  const email = invites.normalizeEmail(req.body.email);
  const respond = () => res.json({ message: RESET_REQUESTED });

  try {
    const { data: profile, error } = await supabase
      .from('users_table')
      .select('id, email, first_name, last_name, role, is_archived')
      .eq('email', email)
      .maybeSingle();
    if (error) {
      console.error('[PasswordReset] Profile lookup failed:', error.code || 'ERROR');
      return respond();
    }
    if (!profile || profile.is_archived || !TEAM_ROLES.includes(profile.role)) return respond();

    if ((await passwordResets.countRecent(profile.id)) >= config.passwordReset.maxPerHour) {
      console.warn('[PasswordReset] Hourly cap reached for', email);
      return respond();
    }

    const created = await passwordResets.createReset({
      userId: profile.id,
      email: profile.email || email,
      ip: req.ip,
    });
    if (!created) return respond();

    const { subject, html, text } = renderPasswordResetEmail({
      name: getFullName(profile),
      email: profile.email || email,
      resetUrl: passwordResets.buildResetUrl(created.rawToken),
      expiresAt: created.reset.expires_at,
      supportEmail: config.email.supportEmail,
    });

    const delivery = await sendEmail({
      to: profile.email || email,
      subject,
      html,
      text,
      template: 'password_reset',
    });

    logAdminActivity({
      actorId: profile.id,
      activityType: 'password_reset',
      category: 'user',
      relatedUserId: profile.id,
      description: `Password reset link sent to ${email} (${delivery.delivered ? 'delivered' : `failed: ${delivery.errorCode}`})`,
    });

    return respond();
  } catch (err) {
    console.error('[PasswordReset] Request failed:', err?.code || 'ERROR', err?.message || 'unknown');
    return respond();
  }
}

async function resetPassword(req, res) {
  const { token, accessToken, newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: 'A new password is required' });

  // Legacy Supabase recovery link (access_token in the URL fragment).
  if (!token && accessToken) {
    const anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data: { user }, error: tokenError } = await anonClient.auth.getUser(accessToken);
    if (tokenError || !user) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Password reset successful' });
  }

  const invalidLink = () => res.status(400).json({ error: 'This reset link is invalid or has expired', code: 'RESET_INVALID' });

  const record = await passwordResets.findValidReset(token);
  if (!record) return invalidLink();

  const claimed = await passwordResets.consume(record.reset_id);
  if (!claimed) return invalidLink();

  const { error } = await supabase.auth.admin.updateUserById(record.user_id, { password: newPassword });
  if (error) {
    console.error('[PasswordReset] Password update failed:', error.code || 'ERROR');
    await passwordResets.release(record.reset_id);
    return res.status(400).json({ error: 'Could not update the password. Please try again.', code: 'RESET_FAILED' });
  }

  logAdminActivity({
    actorId: record.user_id,
    activityType: 'password_reset',
    category: 'user',
    relatedUserId: record.user_id,
    description: `Password reset completed for ${record.email}`,
  });

  return res.json({ message: 'Password reset successful' });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const userEmail = req.user.email;

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: userEmail,
    password: currentPassword,
  });
  if (signInError) return res.status(401).json({ error: 'Current password is incorrect' });

  const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password: newPassword });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Password updated successfully' });
}

async function refreshToken(req, res) {
  const { refreshToken: rt } = req.body;
  if (!rt) return res.status(400).json({ error: 'Refresh token is required' });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: rt });
  if (error || !data.session) return res.status(401).json({ error: 'Invalid or expired refresh token' });

  res.json({
    data: {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
  });
}

function me(req, res) {
  res.json({ data: req.user });
}

const INVALID_INVITE = 'This invitation is invalid or has expired';

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

/**
 * Public endpoint: the invitee chooses their own password. The raw token is
 * never stored — it is looked up by HMAC hash, then claimed atomically so two
 * concurrent submissions cannot both create an account.
 */
async function acceptInvite(req, res) {
  const { token, password } = req.body;

  const invite = await invites.findAcceptableInvite(token).catch((err) => {
    console.error('[Invite] Acceptance lookup failed:', err?.code || 'ERROR');
    return null;
  });
  if (!invite) return res.status(400).json({ error: INVALID_INVITE, code: 'INVITE_INVALID' });

  const { data: existingProfile } = await supabase
    .from('users_table')
    .select('id')
    .eq('email', invite.email)
    .maybeSingle();
  if (existingProfile) {
    return res.status(409).json({
      error: 'An account already exists for this email. Sign in or reset your password instead.',
      code: 'ACCOUNT_EXISTS',
    });
  }

  const claimed = await invites.claimInvite(invite.invite_id);
  if (!claimed) return res.status(400).json({ error: INVALID_INVITE, code: 'INVITE_INVALID' });

  const { firstName, lastName } = splitName(invite.full_name);
  let createdUserId = null;

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: invite.full_name,
        first_name: firstName,
        last_name: lastName,
        role: invite.role,
      },
    });

    if (authError) {
      // An orphan auth account (no users_table profile) can be adopted, e.g.
      // left behind by a previously failed invite. A profile would have been
      // caught above.
      const alreadyExists = /already (been )?registered|already exists/i.test(authError.message || '');
      const orphan = alreadyExists ? await findAuthUserByEmail(invite.email) : null;
      if (!orphan) throw authError;

      const { error: updateError } = await supabase.auth.admin.updateUserById(orphan.id, {
        password,
        email_confirm: true,
      });
      if (updateError) throw updateError;
      createdUserId = orphan.id;
    } else if (authUser?.user?.id) {
      createdUserId = authUser.user.id;
    } else {
      throw new Error('Failed to create the authentication account');
    }

    const { error: profileError } = await supabase.from('users_table').insert({
      id: createdUserId,
      email: invite.email,
      first_name: firstName,
      last_name: lastName,
      role: invite.role,
      is_verified: true,
    });

    if (profileError) {
      // Only roll back an account this request created; never delete a
      // pre-existing orphan we merely adopted.
      if (authUser?.user?.id) await supabase.auth.admin.deleteUser(createdUserId);
      throw profileError;
    }

    // loginWithSupabase resolves the effective role from user_roles.
    const { data: roleRow } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', invite.role)
      .maybeSingle();
    if (roleRow?.role_id) {
      await supabase.from('user_roles').insert({ user_id: createdUserId, role_id: roleRow.role_id });
    }

    await invites.attachAcceptedUser(invite.invite_id, createdUserId);

    logAdminActivity({
      actorId: createdUserId,
      activityType: 'invite_accepted',
      category: 'user',
      relatedUserId: createdUserId,
      description: `${invite.email} accepted the ${invite.role} invitation`,
    });

    return res.status(201).json({
      data: { email: invite.email, role: invite.role },
      message: 'Your account is ready. Sign in with your new password.',
    });
  } catch (err) {
    console.error('[Invite] Acceptance failed:', err?.code || 'ERROR', err?.message || 'unknown');
    // Put the invite back so a transient failure does not burn the link.
    await invites.releaseClaim(invite.invite_id, invite.status);
    return res.status(500).json({ error: 'Could not complete your signup. Please try again or contact support.', code: 'INVITE_ACCEPT_FAILED' });
  }
}

module.exports = { login, requestPasswordReset, resetPassword, changePassword, refreshToken, me, acceptInvite };
