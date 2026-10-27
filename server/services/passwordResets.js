const supabase = require('../db/supabase');
const config = require('../config');
const { mintToken, hashToken, normalizeEmail } = require('./invites');

const TABLE = 'password_resets';

function expiresAtFromNow() {
  return new Date(Date.now() + config.passwordReset.ttlMinutes * 60 * 1000);
}

function buildResetUrl(rawToken) {
  return `${config.frontendUrl.replace(/\/+$/, '')}/reset-password#token=${encodeURIComponent(rawToken)}`;
}

/** A new request supersedes any link that has not been used yet. */
async function invalidateActive(userId) {
  const { error } = await supabase
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);
  if (error) console.error('[PasswordReset] Could not invalidate previous links:', error.message);
}

async function countRecent(userId, windowMinutes = 60) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from(TABLE)
    .select('reset_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) return 0; // never block a reset because the probe failed
  return count || 0;
}

async function createReset({ userId, email, ip }) {
  await invalidateActive(userId);

  const rawToken = mintToken();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      email: normalizeEmail(email),
      token_hash: hashToken(rawToken),
      requested_ip: ip || null,
      expires_at: expiresAtFromNow().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[PasswordReset] Could not create reset link:', error.code || 'ERROR');
    return null;
  }
  return { reset: data, rawToken };
}

/** Unused and unexpired only; the hash lookup mirrors the invite flow. */
async function findValidReset(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('token_hash', hashToken(rawToken))
    .maybeSingle();
  if (error || !data) return null;
  if (data.used_at) return null;
  const expiresAt = Date.parse(data.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return data;
}

/** Single use: the first submit wins, a replay updates zero rows. */
async function consume(resetId) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq('reset_id', resetId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Put the link back if the password update failed for a transient reason. */
async function release(resetId) {
  const { error } = await supabase
    .from(TABLE)
    .update({ used_at: null })
    .eq('reset_id', resetId);
  if (error) console.error('[PasswordReset] Could not release reset link:', error.message);
}

module.exports = {
  buildResetUrl,
  countRecent,
  createReset,
  findValidReset,
  consume,
  release,
  expiresAtFromNow,
};
