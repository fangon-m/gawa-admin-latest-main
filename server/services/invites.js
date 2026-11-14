const crypto = require('crypto');
const config = require('../config');
const supabase = require('../db/supabase');

// Invite rows that can still be accepted. 'expired', 'accepted' and 'revoked'
// are terminal and excluded from every lookup.
const ACTIVE_STATUSES = ['pending', 'sent', 'failed'];

class InviteError extends Error {
  constructor(code, status, message, extra = {}) {
    super(message);
    this.name = 'InviteError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

function getPepper() {
  const pepper = config.invites.tokenPepper;
  if (!pepper || pepper.length < 32) {
    throw new InviteError(
      'INVITE_NOT_CONFIGURED',
      503,
      'Team invitations are not configured on this server. Set INVITE_TOKEN_PEPPER (32+ characters) in .env and restart.'
    );
  }
  return pepper;
}

/** 32 random bytes, base64url — 43 chars, 256 bits of entropy. */
function mintToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** HMAC-SHA256 so a leaked DB dump cannot be turned into usable invite links. */
function hashToken(rawToken) {
  return crypto.createHmac('sha256', getPepper()).update(String(rawToken), 'utf8').digest('hex');
}

function tokensMatch(rawToken, storedHash) {
  const candidate = Buffer.from(hashToken(rawToken), 'hex');
  const stored = Buffer.from(String(storedHash || ''), 'hex');
  if (candidate.length !== stored.length || stored.length === 0) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

function expiresAtFromNow() {
  return new Date(Date.now() + config.invites.tokenTtlMinutes * 60 * 1000);
}

function buildAcceptUrl(rawToken) {
  return `${config.invites.linkBaseUrl}/accept-invite#token=${encodeURIComponent(rawToken)}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isExpired(invite) {
  const expiresAt = Date.parse(invite?.expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

/** UI-facing status: pending / expired / failed map to one badge family. */
function inviteStatus(invite) {
  if (!invite) return 'invite_expired';
  if (invite.status === 'failed') return 'invite_failed';
  if (invite.status === 'expired' || isExpired(invite)) return 'invite_expired';
  return 'invite_pending';
}

async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('users_table')
    .select('id, email, role, is_archived')
    .eq('email', normalizeEmail(email))
    .maybeSingle();
  if (error) throw new InviteError('LOOKUP_FAILED', 500, 'Could not check whether that email is already registered');
  return data;
}

async function findActiveInvite(email) {
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('email', normalizeEmail(email))
    .in('status', ACTIVE_STATUSES)
    .maybeSingle();
  if (error) throw new InviteError('LOOKUP_FAILED', 500, 'Could not check for an existing invitation');
  return data;
}

/** Quota is counted from rows, so it survives restarts (unlike the in-memory IP limiter). */
async function assertActorQuota(actorId) {
  if (!actorId) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('team_invites')
    .select('invite_id', { count: 'exact', head: true })
    .eq('invited_by', actorId)
    .gte('created_at', since);
  if (error) return; // never block an invite because the quota probe failed
  if ((count || 0) >= config.invites.rateLimitPerActorPerDay) {
    throw new InviteError('ACTOR_QUOTA_EXCEEDED', 429, 'Daily invitation limit reached. Try again tomorrow.');
  }
}

async function expireStaleInvites() {
  const { error } = await supabase
    .from('team_invites')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .in('status', ACTIVE_STATUSES)
    .lt('expires_at', new Date().toISOString());
  if (error) console.error('[Invites] Failed to expire stale invitations:', error.message);
}

async function insertInvite({ fullName, email, role, invitedBy }) {
  const rawToken = mintToken();
  const { data, error } = await supabase
    .from('team_invites')
    .insert({
      email: normalizeEmail(email),
      full_name: fullName,
      role,
      token_hash: hashToken(rawToken),
      invited_by: invitedBy || null,
      status: 'pending',
      expires_at: expiresAtFromNow().toISOString(),
    })
    .select()
    .single();
  if (error) {
    // Partial unique index on lower(email) for live invites — surface the race as a conflict.
    if (error.code === '23505') {
      throw new InviteError('INVITE_EXISTS', 409, 'An active invitation already exists for this email');
    }
    throw new InviteError('INVITE_CREATE_FAILED', 500, 'Could not create the invitation');
  }
  return { invite: data, rawToken };
}

/**
 * Rotates the token, extends the TTL and resets delivery metadata. The previous
 * link dies the moment token_hash is overwritten.
 */
async function rotateInviteToken(inviteId) {
  const rawToken = mintToken();
  const { data, error } = await supabase
    .from('team_invites')
    .update({
      token_hash: hashToken(rawToken),
      status: 'pending',
      expires_at: expiresAtFromNow().toISOString(),
      delivery_attempts: 0,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq('invite_id', inviteId)
    .in('status', ACTIVE_STATUSES)
    .select()
    .single();
  if (error || !data) {
    throw new InviteError('INVITE_NOT_FOUND', 404, 'Invitation not found or no longer active');
  }
  return { invite: data, rawToken };
}

async function setDeliveryResult(inviteId, { delivered, attempts, errorCode }) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('team_invites')
    .update({
      status: delivered ? 'sent' : 'failed',
      delivery_attempts: attempts,
      last_error_code: errorCode || null,
      last_sent_at: delivered ? now : null,
      updated_at: now,
    })
    .eq('invite_id', inviteId);
  if (error) console.error('[Invites] Failed to record delivery status:', error.message);
}

async function findAcceptableInvite(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('token_hash', hashToken(rawToken))
    .maybeSingle();
  if (error || !data) return null;
  if (!ACTIVE_STATUSES.includes(data.status)) return null;
  if (!tokensMatch(rawToken, data.token_hash)) return null;
  if (isExpired(data)) {
    await supabase
      .from('team_invites')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('invite_id', data.invite_id)
      .in('status', ACTIVE_STATUSES);
    return null;
  }
  return data;
}

/** Atomic claim: the first concurrent accept wins, the rest get zero rows. */
async function claimInvite(inviteId) {
  const { data, error } = await supabase
    .from('team_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('invite_id', inviteId)
    .in('status', ACTIVE_STATUSES)
    .gt('expires_at', new Date().toISOString())
    .select()
    .maybeSingle();
  if (error) throw new InviteError('INVITE_CLAIM_FAILED', 500, 'Could not accept the invitation');
  return data || null;
}

async function releaseClaim(inviteId, previousStatus) {
  const { error } = await supabase
    .from('team_invites')
    .update({
      status: ACTIVE_STATUSES.includes(previousStatus) ? previousStatus : 'pending',
      accepted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('invite_id', inviteId);
  if (error) console.error('[Invites] Failed to release invitation claim:', error.message);
}

async function attachAcceptedUser(inviteId, userId) {
  const { error } = await supabase
    .from('team_invites')
    .update({ accepted_user_id: userId, updated_at: new Date().toISOString() })
    .eq('invite_id', inviteId);
  if (error) console.error('[Invites] Failed to link accepted user:', error.message);
}

async function getInviteById(inviteId) {
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('invite_id', inviteId)
    .maybeSingle();
  if (error) throw new InviteError('LOOKUP_FAILED', 500, 'Could not load the invitation');
  return data;
}

async function revokeInvite(inviteId) {
  const { data, error } = await supabase
    .from('team_invites')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('invite_id', inviteId)
    .in('status', ACTIVE_STATUSES)
    .select()
    .maybeSingle();
  if (error) throw new InviteError('INVITE_REVOKE_FAILED', 500, 'Could not revoke the invitation');
  if (!data) throw new InviteError('INVITE_NOT_FOUND', 404, 'Invitation not found or no longer active');
  return data;
}

module.exports = {
  ACTIVE_STATUSES,
  InviteError,
  mintToken,
  hashToken,
  tokensMatch,
  buildAcceptUrl,
  normalizeEmail,
  isExpired,
  inviteStatus,
  expiresAtFromNow,
  findUserByEmail,
  findActiveInvite,
  assertActorQuota,
  expireStaleInvites,
  insertInvite,
  rotateInviteToken,
  setDeliveryResult,
  findAcceptableInvite,
  claimInvite,
  releaseClaim,
  attachAcceptedUser,
  getInviteById,
  revokeInvite,
};
