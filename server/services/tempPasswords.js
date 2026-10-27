const crypto = require('crypto');
const config = require('../config');

// Ambiguous glyphs (0/O, 1/l/I) are omitted so a password copied out of an
// email can be typed back without transcription errors.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

function randomChar(pool) {
  return pool[crypto.randomInt(pool.length)];
}

/**
 * One-time credential handed to a team member by an admin. Cryptographically
 * random, always contains every character class Supabase policies expect, and
 * is shuffled so the guaranteed characters are not stuck at fixed positions.
 */
function generateTempPassword(length = config.tempPassword.length) {
  const size = Math.max(8, Number(length) || config.tempPassword.length);
  const chars = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)];

  while (chars.length < size) chars.push(randomChar(ALPHABET));

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

module.exports = { generateTempPassword };
