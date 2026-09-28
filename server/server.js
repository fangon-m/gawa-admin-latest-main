require('express-async-errors');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');
const { auditMiddleware } = require('./middleware/auditLogger');

const app = express();

// Rate limiting
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// Security & parsing middleware
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: false, // CSP managed by frontend
}));
app.use(cors({ origin: config.corsOrigins.split(','), credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting: generous for general API, strict for auth
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// Audit logging middleware for non-GET requests
app.use(auditMiddleware);

// API routes
app.use('/api', routes);

// In production, serve the built client app
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    }
  });
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
const REVIEW_DAYS = 3;
async function autoProcessExpiredReviews() {
  try {
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
    console.log(`  Auto-complete: starting after a 30s warm-up and then running every 5 minutes`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      server.close(() => {});

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

module.exports = { app, startServer, scheduleAutoProcessExpiredReviews };
