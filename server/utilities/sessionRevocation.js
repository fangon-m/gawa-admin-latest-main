const supabase = require('../db/supabase');
const { APP_METADATA_TOKEN_VERSION_KEY } = require('./permissions');

/**
 * Server-side session revocation.
 *
 * Revoking a refresh token stops new access tokens being issued, but an
 * access token that was already handed out stays valid until it expires
 * (an hour by default). For an administrator account that is too long: a
 * dismissed member, a reset password or a changed role should take effect
 * immediately, not in up to an hour.
 *
 * The mechanism is a counter in `auth.users.app_metadata`. Supabase copies
 * app_metadata into every access token when it issues it, so the token
 * carries the version it was minted with. The server compares that with the
 * current version; a mismatch means the token predates a revocation and is
 * refused. No schema change is needed, and `app_metadata` can only be
 * written with the service role — an account holder cannot bump its own
 * counter.
 */

const DEFAULT_TOKEN_VERSION = 1;

/** The version currently recorded for an account. */
function currentTokenVersion(appMetadata) {
  const raw = appMetadata?.[APP_METADATA_TOKEN_VERSION_KEY];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKEN_VERSION;
}

/**
 * The version a token was minted with.
 *
 * The token has already been verified against the auth provider by the time
 * this is called, so reading the payload is safe here — it is only ever
 * compared against the live counter, never used to decide a permission.
 */
function tokenVersionFromJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return currentTokenVersion(payload.app_metadata);
  } catch {
    // A token we cannot read is not trusted with an elevated version.
    return DEFAULT_TOKEN_VERSION;
  }
}

/**
 * True when the token was issued before the last revocation.
 */
function isRevoked(token, appMetadata) {
  return tokenVersionFromJwt(token) !== currentTokenVersion(appMetadata);
}

/**
 * Invalidates every session an account holds.
 *
 * Bumping the counter makes every access token already issued fail the
 * version check, and the refresh tokens are revoked with them, so the account
 * has to sign in again.
 */
async function revokeUserSessions(userId, appMetadata) {
  if (!userId) return { revoked: false };

  let metadata = appMetadata;
  if (!metadata) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) throw new Error(error.message);
      metadata = data?.user?.app_metadata || {};
    } catch (err) {
      // Failing to revoke must never break the operation that triggered it —
      // archiving an account cannot fail because the sessions could not be
      // revoked. The account is still blocked by the archive flag and the
      // auth ban.
      console.error('[Sessions] Could not read the account to revoke sessions for', userId, '-', err?.message || err);
      return { revoked: false, error: err?.message || String(err) };
    }
  }

  const nextVersion = currentTokenVersion(metadata) + 1;

  let error = null;
  try {
    const result = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { ...metadata, [APP_METADATA_TOKEN_VERSION_KEY]: nextVersion },
    });
    error = result.error;
  } catch (err) {
    error = err;
  }

  if (error) {
    console.error('[Sessions] Could not revoke sessions for', userId, '-', error.message || error);
    return { revoked: false, error: error.message || String(error) };
  }

  // Drop the refresh tokens too, so the account cannot mint a new access
  // token even though it still holds the (now stale) ones.
  try {
    await supabase.auth.admin.signOut(userId);
  } catch (err) {
    console.error('[Sessions] Could not sign out refresh tokens for', userId, '-', err?.message || err);
  }

  console.log('[Sessions] Revoked all sessions for', userId, '(token version ->', nextVersion + ')');
  return { revoked: true, version: nextVersion };
}

module.exports = {
  DEFAULT_TOKEN_VERSION,
  currentTokenVersion,
  tokenVersionFromJwt,
  isRevoked,
  revokeUserSessions,
};
