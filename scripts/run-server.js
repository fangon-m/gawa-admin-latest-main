#!/usr/bin/env node
/**
 * Cross-platform entrypoint that pins NODE_ENV before the server boots.
 *
 * The server refuses to start without an explicit NODE_ENV, because that
 * variable decides which security guards are active (required secrets, the
 * banned console mailer, and so on). Setting it here — rather than inline in
 * an npm script — keeps `npm start` working identically on Windows, macOS and
 * Linux, where `NODE_ENV=production node server/server.js` only works on the
 * last two.
 *
 * Usage:
 *   node scripts/run-server.js development
 *   node scripts/run-server.js production
 */
const VALID_NODE_ENVS = ['development', 'production', 'test'];

const requested = (process.argv[2] || process.env.NODE_ENV || '').trim();

if (!requested) {
  console.error(
    '[start] NODE_ENV is required.\n' +
    '        Use: node scripts/run-server.js development   (local work)\n' +
    '             node scripts/run-server.js production    (deployment)\n' +
    '             node scripts/run-server.js test          (automated tests)'
  );
  process.exit(1);
}

if (!VALID_NODE_ENVS.includes(requested)) {
  console.error(`[start] NODE_ENV must be one of: ${VALID_NODE_ENVS.join(', ')} (received "${requested}").`);
  process.exit(1);
}

process.env.NODE_ENV = requested;

const { startServer } = require('../server/server.js');
startServer();
