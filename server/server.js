require('express-async-errors');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');

const app = express();

// Trusting a proxy unconditionally lets any client choose its own IP by
// sending X-Forwarded-For, which is enough to walk straight past the rate
// limiters below. Trust is therefore opt-in: TRUST_PROXY_HOPS must say how
// many proxies actually sit in front of the app. With the default of 0 the
// header is ignored and the socket address is used.
if (config.trustProxyHops > 0) {
  app.set('trust proxy', config.trustProxyHops);
} else if (config.nodeEnv === 'production' && !config.trustProxyConfigured) {
  console.warn(
    '  [Security] TRUST_PROXY_HOPS is not set: every request is attributed to the ' +
    'socket address. If a reverse proxy or load balancer sits in front of this app, ' +
    'set TRUST_PROXY_HOPS to the number of proxies so rate limiting stays per-client.'
  );
}

// Rate limiting
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// When proxy headers are deliberately not trusted, express-rate-limit must not
// warn about them on every request: that would let a caller flood the logs.
const limiterValidate = config.trustProxyHops > 0
  ? undefined
  : { xForwardedForHeader: false, forwardedHeader: false };

/**
 * Budgets are counted per signed-in administrator rather than per address.
 *
 * The portal issues around fifteen requests per page load, so a single shared
 * address — an office, a NAT gateway, a mobile carrier — would exhaust a
 * shared budget after a handful of page loads and lock everybody out with
 * "429" for the rest of the window. Keying on the session instead gives each
 * administrator their own allowance.
 *
 * The token is hashed rather than used as-is: the key only has to be stable
 * and unique, and a bearer token should not be sitting in a map key.
 */
function sessionKeyGenerator(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const hash = crypto.createHash('sha256').update(header.slice(7)).digest('hex').slice(0, 32);
    return `session:${hash}`;
  }
  return `ip:${ipKeyGenerator(req.ip)}`;
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Per administrator. The portal makes many calls per page, so this has to
  // be generous enough for a working day without becoming meaningless.
  max: 600,
  keyGenerator: sessionKeyGenerator,
  // The health probe must always answer, otherwise a monitor sees the app as
  // down the moment it is busy.
  skip: (req) => req.path === '/health' || req.path === '/assessment-questions/import',
  standardHeaders: true,
  legacyHeaders: false,
  validate: limiterValidate,
  message: { error: 'Too many requests, please try again later' },
});
const assessmentImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: sessionKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  validate: limiterValidate,
  message: { error: 'Too many assessment imports, please try again later' },
});

/**
 * Sign-in is limited twice: once per account and once per address.
 *
 * The per-account limit stops a password being guessed one account at a
 * time. The per-address limit stops one account after another being sprayed
 * from the same machine. Neither limit alone covers both, and both are
 * needed so that one person's failed attempts cannot lock out everybody
 * behind the same address.
 *
 * The account window is deliberately shorter than the address window: a
 * mistyped password should only cost a few minutes, while a sustained spray
 * from one machine stays blocked for the full quarter of an hour.
 */
function tooManyAttempts(req, res) {
  const retryAfterSeconds = Math.max(1, Math.ceil((req.rateLimit?.resetTime - Date.now()) / 1000));
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return res.status(429).json({
    error: `Too many login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    retryAfterSeconds,
  });
}

const authAccountLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return email ? `account:${email}` : `account-ip:${ipKeyGenerator(req.ip)}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: limiterValidate,
  handler: tooManyAttempts,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip)}`,
  standardHeaders: true,
  legacyHeaders: false,
  validate: limiterValidate,
  handler: tooManyAttempts,
});

// Security & parsing middleware
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: false, // CSP managed by frontend
}));
app.use(cors({ origin: config.corsOrigins.split(','), credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Apply rate limiting: generous for general API, strict for auth.
//
// The sign-in limits are mounted on the endpoints that actually take a
// password. Mounting them on the whole /api/auth path would also count
// ordinary `GET /api/auth/me` polling — the portal calls it on every page
// load — and a working session would lock itself out of signing in.
app.use('/api', apiLimiter);
app.use('/api/assessment-questions/import', assessmentImportLimiter);
for (const credentialPath of ['/api/auth/login', '/api/auth/request-reset', '/api/auth/reset-password', '/api/auth/accept-invite']) {
  app.use(credentialPath, authAccountLimiter);
  app.use(credentialPath, authLimiter);
}

// API routes
app.use('/api', routes);

// In production, serve the built client app.
//
// The Vite build writes to the repository's `dist/` directory (see
// vite.config.js). `client/dist/` is kept as a fallback for deployments that
// copy the bundle there. Serving the right directory matters for more than
// convenience: `emptyOutDir` only clears the directory the build writes to, so
// pointing the server at a stale copy would keep shipping old bundles.
if (config.nodeEnv === 'production') {
  const staticDir = [
    path.join(__dirname, '../dist'),
    path.join(__dirname, '../client/dist'),
  ].find((dir) => fs.existsSync(path.join(dir, 'index.html')));

  if (!staticDir) {
    console.warn(
      '  [Security] No built client bundle found. Run `npm run build` before starting ' +
      'the server in production, otherwise the admin UI is not served.'
    );
  } else {
    app.use(express.static(staticDir));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(staticDir, 'index.html'));
      }
    });
  }
}

// 404 handler (only for API routes in production)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Route not found' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({ error: 'Internal server error', message: config.nodeEnv === 'development' ? err.message : 'Something went wrong' });
});

// Auto-process expired completion reviews every 5 minutes
const supabase = require('./db/supabase');
const { runModerationWarningSweep } = require('./utilities/moderationWarnings');
const { reconcileArchivedAccounts } = require('./utilities/archiveContent');
const REVIEW_DAYS = 3;
async function autoProcessExpiredReviews() {
  try {
    // Ensure database connection is alive
    await supabase.ensureConnection();
    
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - REVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: expired } = await supabase
      .from('job_matches')
      .select('*, job_posts(*)')
      .eq('status', 'completed')
      .is('confirmed_at', null)
      .lt('completed_at', cutoff);

    if (!expired || expired.length === 0) return;

    for (const match of expired) {
      try {
        const post = match.job_posts;
        const { error: txnErr } = await supabase
          .from('transactions')
          .insert({
            type: 'job_payment',
            amount: match.agreed_price || 0,
            status: 'completed',
            payment_method: 'wallet',
            user_id: match.user_id,
            related_id: post.job_post_id,
            related_type: 'job_post',
            description: `Auto-payment for job "${post.job_title}" — client did not respond within ${REVIEW_DAYS}-day window`,
            net_amount: match.agreed_price || 0,
          });
        if (txnErr) { console.error('[Auto-complete] Payment error:', txnErr.message); continue; }

        await supabase.from('job_posts').update({ job_status: 'finished', updated_at: now }).eq('job_post_id', post.job_post_id);
        await supabase.from('job_matches').update({ status: 'verified', confirmed_at: now, updated_at: now }).eq('job_match_id', match.job_match_id);
        await supabase.from('job_completion').update({ confirmed_at: now, updated_at: now }).eq('job_match_id', match.job_match_id).is('confirmed_at', null);

        console.log(`[Auto-complete] Job "${post.job_title}" auto-completed — payment released.`);
      } catch (err) {
        console.error(`[Auto-complete] Failed for match ${match.job_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Auto-complete] Error:', err.message);
  }
}

function scheduleAutoProcessExpiredReviews({ startupDelayMs = 30_000, intervalMs = 5 * 60 * 1000, onTick = autoProcessExpiredReviews } = {}) {
  if (process.env.DISABLE_AUTO_REVIEWS === 'true') {
    console.log('  Auto-complete: disabled by environment');
    return null;
  }

  setTimeout(() => {
    onTick();
    setInterval(() => {
      onTick();
    }, intervalMs);
  }, startupDelayMs);

  return { startupDelayMs, intervalMs };
}

// Auto-resolve expired user suspensions every 5 minutes
async function autoResolveExpiredSuspensions() {
  try {
    await supabase.ensureConnection();

    const now = new Date().toISOString();
    const { data: expired, error } = await supabase
      .from('users_table')
      .select('id, first_name, last_name, email, suspended_until')
      .eq('suspension_status', 'active')
      .not('suspended_until', 'is', null)
      .lt('suspended_until', now);

    if (error) throw error;
    if (!expired || expired.length === 0) return;

    for (const user of expired) {
      try {
        await supabase
          .from('users_table')
          .update({
            suspension_status: 'resolved',
            suspended_until: null,
            suspension_reason: null,
            suspension_updated_at: now,
            updated_at: now,
          })
          .eq('id', user.id);
        console.log(`[Auto-resolve] Suspension expired for user ${user.id} (${user.email})`);
      } catch (err) {
        console.error(`[Auto-resolve] Failed for user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Auto-resolve] Error:', err.message);
  }
}

function scheduleAutoResolveExpiredSuspensions({ startupDelayMs = 30_000, intervalMs = 5 * 60 * 1000, onTick = autoResolveExpiredSuspensions } = {}) {
  setTimeout(() => {
    onTick();
    setInterval(() => {
      onTick();
    }, intervalMs);
  }, startupDelayMs);

  return { startupDelayMs, intervalMs };
}

// Warn -> compliance window -> automatic suspension. Runs in-process, exactly
// like the timers above. The sweep is idempotent and safe to retry.
async function runModerationSweepTick() {
  try {
    await supabase.ensureConnection();
  } catch (err) {
    console.error('[Moderation] Database connection unavailable:', err.message);
  }
  await runModerationWarningSweep();
}

function scheduleModerationWarningSweep({
  startupDelayMs = 30_000,
  intervalMs = config.moderation.sweepIntervalMs,
  onTick = runModerationSweepTick,
} = {}) {
  if (process.env.DISABLE_MODERATION_SWEEP === 'true') {
    console.log('  Moderation sweep: disabled by environment');
    return null;
  }

  setTimeout(() => {
    onTick();
    setInterval(() => {
      onTick();
    }, intervalMs);
  }, startupDelayMs);

  return { startupDelayMs, intervalMs };
}

// One-shot pass that re-stamps content for accounts archived before the
// archive markers existed, so their listings stop showing as available.
async function runArchiveReconcile() {
  try {
    await supabase.ensureConnection();
  } catch (err) {
    console.error('[Archive] Database connection unavailable:', err.message);
  }

  const totals = await reconcileArchivedAccounts();
  if (totals) {
    console.log(
      `  Archive reconcile: ${totals.accounts} account(s), ${totals.jobPosts} job post(s), ` +
      `${totals.proposals} proposal(s), ${totals.listings} listing(s)`
    );
  }
}

function scheduleArchiveReconcile({ startupDelayMs = 30_000, onTick = runArchiveReconcile } = {}) {
  if (process.env.DISABLE_ARCHIVE_RECONCILE === 'true') {
    console.log('  Archive reconcile: disabled by environment');
    return null;
  }

  setTimeout(() => {
    onTick();
  }, startupDelayMs);

  return { startupDelayMs };
}

function startServer(port = Number(config.port) || 4000, attempt = 0, maxAttempts = 10) {
  const candidatePort = port + attempt;
  const server = app.listen(candidatePort, () => {
    const actualPort = server.address().port;
    console.log(`\n  GAWA Admin API Server`);
    console.log(`  ${'='.repeat(30)}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Port:        ${actualPort}`);
    console.log(`  API Base:    http://localhost:${actualPort}/api`);
    console.log(`  ${'='.repeat(30)}\n`);

    scheduleAutoProcessExpiredReviews();
    scheduleAutoResolveExpiredSuspensions();
    scheduleModerationWarningSweep();
    scheduleArchiveReconcile();
    console.log(`  Auto-complete: starting after a 30s warm-up and then running every 5 minutes`);
    console.log(`  Moderation sweep: starting after a 30s warm-up and then running every ${Math.round(config.moderation.sweepIntervalMs / 60000)} minute(s)`);
    console.log(`  Archive reconcile: one pass after a 30s warm-up`);

    // A missing role table or an unassigned team account does not crash the
    // server, it just produces a portal nobody can use. Report it at boot.
    const { checkRoleSetup, reportRoleSetup } = require('./utilities/roleSetup');
    checkRoleSetup().then(reportRoleSetup).catch(() => {});
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      server.close(() => {});

      if (config.nodeEnv === 'production') {
        // Moving to another port in production is worse than not starting:
        // the reverse proxy keeps sending traffic to the expected port, so
        // the site would fail to load while the log claimed all was well.
        console.error(
          `  Port ${candidatePort} is already in use. Stop the other process or set PORT ` +
          'to a free port — the server will not move to a different port in production.'
        );
        process.exit(1);
      }

      if (attempt < maxAttempts) {
        const nextPort = candidatePort + 1;
        console.warn(`Port ${candidatePort} is busy, trying ${nextPort} instead.`);
        return startServer(port, attempt + 1, maxAttempts);
      }

      console.error(`Unable to find a free port after ${maxAttempts + 1} attempts.`);
      process.exit(1);
    }

    throw error;
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  scheduleAutoProcessExpiredReviews,
  scheduleAutoResolveExpiredSuspensions,
  scheduleModerationWarningSweep,
  scheduleArchiveReconcile,
  runModerationSweepTick,
};
