const {
  currentTokenVersion,
  tokenVersionFromJwt,
  isRevoked,
  DEFAULT_TOKEN_VERSION,
} = require('../sessionRevocation');

/** Builds an unsigned JWT-shaped token carrying the given app_metadata. */
function makeToken(appMetadata) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', app_metadata: appMetadata })).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('session revocation', () => {
  it('reads the version an account currently has', () => {
    expect(currentTokenVersion(undefined)).toBe(DEFAULT_TOKEN_VERSION);
    expect(currentTokenVersion({})).toBe(DEFAULT_TOKEN_VERSION);
    expect(currentTokenVersion({ gawa_token_version: 4 })).toBe(4);
  });

  it('ignores a nonsense version', () => {
    expect(currentTokenVersion({ gawa_token_version: 'abc' })).toBe(DEFAULT_TOKEN_VERSION);
    expect(currentTokenVersion({ gawa_token_version: 0 })).toBe(DEFAULT_TOKEN_VERSION);
    expect(currentTokenVersion({ gawa_token_version: -3 })).toBe(DEFAULT_TOKEN_VERSION);
  });

  it('reads the version a token was minted with', () => {
    const token = makeToken({ gawa_token_version: 3 });
    expect(tokenVersionFromJwt(token)).toBe(3);
  });

  it('treats an unreadable token as the default version', () => {
    expect(tokenVersionFromJwt('not-a-jwt')).toBe(DEFAULT_TOKEN_VERSION);
    expect(tokenVersionFromJwt('')).toBe(DEFAULT_TOKEN_VERSION);
  });

  it('accepts a token whose version matches the account', () => {
    const token = makeToken({ gawa_token_version: 3 });
    expect(isRevoked(token, { gawa_token_version: 3 })).toBe(false);
  });

  it('rejects a token that predates a revocation', () => {
    const token = makeToken({ gawa_token_version: 3 });
    expect(isRevoked(token, { gawa_token_version: 4 })).toBe(true);
  });

  it('rejects a token issued before the account had a version at all', () => {
    const token = makeToken({ provider: 'email' });
    expect(tokenVersionFromJwt(token)).toBe(DEFAULT_TOKEN_VERSION);
    expect(isRevoked(token, { gawa_token_version: 2 })).toBe(true);
  });
});
