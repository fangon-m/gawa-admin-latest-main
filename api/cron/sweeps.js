// Cron entrypoint for the background work that `server/server.js` normally
// drives with setInterval.
//
// A serverless function has no long-lived process, so those timers never fire
// in a Vercel deployment. Instead the same one-shot ticks are invoked here by
// a scheduled job:
//
//   GET /api/cron/sweeps                → all sweeps
//   GET /api/cron/sweeps?task=reviews   → expired completion reviews only
//   GET /api/cron/sweeps?task=suspensions
//   GET /api/cron/sweeps?task=moderation
//   GET /api/cron/sweeps?task=archive
//
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
// CRON_SECRET is set in the project environment. An external scheduler can
// pass the same secret as `?secret=`. If CRON_SECRET is not configured the
// endpoint refuses to run — an unauthenticated endpoint that releases escrow
// and suspends accounts must never be publicly triggerable.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const crypto = require('crypto');
const {
  autoProcessExpiredReviews,
  autoResolveExpiredSuspensions,
  runModerationSweepTick,
  runArchiveReconcile,
} = require('../../server/server');

const TASKS = {
  reviews: autoProcessExpiredReviews,
  suspensions: autoResolveExpiredSuspensions,
  moderation: runModerationSweepTick,
  archive: runArchiveReconcile,
};

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const supplied = bearer || (req.query && req.query.secret) || '';

  return supplied ? safeEqual(supplied, secret) : false;
}

module.exports = async function handler(req, res) {
  if (!process.env.CRON_SECRET) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const requested = String((req.query && req.query.task) || 'all').toLowerCase();
  if (requested !== 'all' && !TASKS[requested]) {
    return res.status(400).json({
      error: `Unknown task "${requested}"`,
      available: ['all', ...Object.keys(TASKS)],
    });
  }

  const names = requested === 'all' ? Object.keys(TASKS) : [requested];
  const results = {};

  for (const name of names) {
    const startedAt = Date.now();
    try {
      await TASKS[name]();
      results[name] = { ok: true, ms: Date.now() - startedAt };
    } catch (err) {
      // One failing sweep must not stop the others: they are independent.
      console.error(`[cron] ${name} failed:`, err && err.message);
      results[name] = { ok: false, ms: Date.now() - startedAt, error: err && err.message };
    }
  }

  const failed = Object.values(results).some((r) => !r.ok);
  return res.status(failed ? 500 : 200).json({ ranAt: new Date().toISOString(), results });
};
