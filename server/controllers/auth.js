const supabase = require('../db/supabase');
const config = require('../config');
const { createClient } = require('@supabase/supabase-js');
const { toCamelCase, getFullName, sendError } = require('../utilities/helpers');
const { logAdminActivity } = require('../utilities/activityLogger');
const { findAuthUserByEmail } = require('../utilities/authUsers');
const { resolveRoles, ROLES, APP_METADATA_ROLE_KEY } = require('../utilities/permissions');
const { revokeUserSessions } = require('../utilities/sessionRevocation');
const invites = require('../services/invites');
const passwordResets = require('../services/passwordResets');
const { sendEmail } = require('../services/mailer');
const { renderPasswordResetEmail } = require('../services/emailTemplates/passwordReset');

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

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
  if (profileError) return sendError(res, profileError, { status: 500 });
  if (!profile) return res.status(403).json({ error: 'No application profile is linked to this account.' });

  // The role table is the intended source of truth. Until it exists in the
  // database the role comes from the server-managed auth metadata, or from
  // the role recorded on the profile row.
  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('roles(role_name)')
    .eq('user_id', data.user.id);
  if (rolesError) console.warn('[Auth] user_roles lookup unavailable; using auth metadata:', rolesError.message);
  const { roles, role } = resolveRoles({
    roleRows: roleRows || [],
    appMetadata: data.user.app_metadata || {},
    profileRole: profile.role,
  });

  res.json({
    data: {
      token: data.session.access_token,
      user: {
        ...profile,
        name: getFullName(profile),
        role,
        roles,
      },
    },
  });
}

const TEAM_ROLES = [ROLES.ADMIN, ROLES.CUSTOMER_SUPPORT];
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
    if (!profile || profile.is_archived) return respond();

    // Team membership comes from the role table when it exists, otherwise
    // from the server-managed auth metadata, otherwise from the role recorded
    // on the profile row.
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('roles(role_name)')
      .eq('user_id', profile.id);
    const authUser = await findAuthUserByEmail(profile.email || email);
    const { roles } = resolveRoles({
      roleRows: roleRows || [],
      appMetadata: authUser?.app_metadata || {},
      profileRole: profile.role,
    });
    if (!TEAM_ROLES.some((role) => roles.includes(role))) return respond();

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

/**
 * Ends the caller's session.
 *
 * The refresh token is revoked on the server, so the credentials cannot be
 * used to obtain a new access token. The access token itself stays valid
 * until it expires (an hour), which is the usual trade-off; a revocation
 * that has to take effect at once is handled by bumping the session version
 * instead.
 */
async function logout(req, res) {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      // 'local' revokes this session only, leaving the member signed in on
      // their other devices.
      await supabase.auth.admin.signOut(token, 'local');
    } catch (err) {
      // The session may already have expired; either way the caller is
      // signing out, so this is not an error worth reporting.
      console.error('[Logout] Could not revoke the session:', err?.message || err);
    }
  }

  res.status(204).send();
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

  // A password change invalidates every session the member holds, including
  // the one that made the change: a token stolen before the change must not
  // keep working.
  await revokeUserSessions(req.user.id);

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
      // The role is also stored in app_metadata, which only the service role
      // can write. `user_metadata` is writable by the account holder, so it
      // cannot be used to decide what somebody is allowed to do.
      app_metadata: { [APP_METADATA_ROLE_KEY]: invite.role },
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
        app_metadata: { [APP_METADATA_ROLE_KEY]: invite.role },
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

    // The role table is the intended source of truth. It may not exist in the
    // database yet, in which case the role set in app_metadata at account
    // creation carries the role — so a missing table must not fail the signup.
    const { data: roleRow, error: roleLookupError } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', invite.role)
      .maybeSingle();
    if (roleLookupError) {
      console.warn('[Invite] Role table unavailable; the role is held in app_metadata:', roleLookupError.message);
    } else if (roleRow?.role_id) {
      const { error: roleInsertError } = await supabase
        .from('user_roles')
        .insert({ user_id: createdUserId, role_id: roleRow.role_id });
      if (roleInsertError) {
        console.warn('[Invite] Could not write the role row:', roleInsertError.message);
      }
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

module.exports = { login, logout, requestPasswordReset, resetPassword, changePassword, refreshToken, me, acceptInvite };
