const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

// `npm run dev` runs from the repo root, but some checkouts keep credentials in
// server/.env only. Load the cwd .env first, then that file as a fallback
// (dotenv never overrides already-set variables).
dotenv.config();
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const requiredEnvVars = [
  ['JWT_SECRET', 'JWT_SECRET is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'],
  ['SUPABASE_URL', 'SUPABASE_URL is required'],
  ['SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY is required'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY is required'],
];

for (const [key, message] of requiredEnvVars) {
  if (!process.env[key] && isProduction) {
    console.error(`[Config] Missing required environment variable: ${message}`);
    process.exit(1);
  }
}

const invitesEnabled = process.env.INVITE_EMAIL_ENABLED !== 'false';
const emailProvider = (process.env.EMAIL_PROVIDER || (isProduction ? 'smtp' : 'console')).toLowerCase();

// Team invitations are impossible to honour without a signer and a real
// transport. Fail fast instead of silently creating invites nobody can accept.
if (invitesEnabled && isProduction) {
  if (!process.env.INVITE_TOKEN_PEPPER || process.env.INVITE_TOKEN_PEPPER.length < 32) {
    console.error('[Config] INVITE_TOKEN_PEPPER (min 32 chars) is required when team invitations are enabled. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  if (emailProvider === 'console') {
    console.error('[Config] EMAIL_PROVIDER=console is not allowed in production. Set EMAIL_PROVIDER to smtp, sendgrid or ses.');
    process.exit(1);
  }
}

// Local development convenience: without a pepper every invite endpoint would
// answer 503, which makes the feature impossible to try out of the box. Derive
// an ephemeral one and say so loudly — links die on restart, so this can never
// silently become a production signer (production exits above).
let invitePepper = process.env.INVITE_TOKEN_PEPPER || '';
if (invitesEnabled && !isProduction && invitePepper.length < 32) {
  invitePepper = crypto.randomBytes(32).toString('hex');
  console.warn('[Config] INVITE_TOKEN_PEPPER is not set — generated an ephemeral development pepper. Invite links will stop working after a restart. Add INVITE_TOKEN_PEPPER to .env to make them stable.');
}

function intEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name], 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, value));
}

const config = {
  port: process.env.PORT || 4000,
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  corsOrigins: process.env.CORS_ORIGINS || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  bcryptSaltRounds: 10,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Moderation warning lifecycle (DB app_settings override at runtime)
  moderation: {
    warningDays: intEnv('MODERATION_WARNING_DAYS', 7, 1, 30),
    reminderDay: intEnv('MODERATION_REMINDER_DAY', 3, 1, 30),
    autoSuspendDays: intEnv('MODERATION_AUTO_SUSPEND_DAYS', 3, 1, 90),
    sweepIntervalMs: intEnv('MODERATION_SWEEP_INTERVAL_MS', 5 * 60 * 1000, 1000, 60 * 60 * 1000),
    enforcementEnabled: process.env.MODERATION_ENFORCEMENT_ENABLED !== 'false',
  },

  // Team invitations (one-time link, no password ever travels by email)
  invites: {
    enabled: invitesEnabled,
    linkBaseUrl: (process.env.INVITE_LINK_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    tokenTtlMinutes: intEnv('INVITE_TOKEN_TTL_MINUTES', 48 * 60, 5, 30 * 24 * 60),
    tokenPepper: invitePepper,
    rateLimitPerIp: intEnv('INVITE_RATE_LIMIT_PER_IP', 10, 1, 1000),
    rateLimitPerActorPerDay: intEnv('INVITE_RATE_LIMIT_PER_ACTOR_PER_DAY', 50, 1, 5000),
  },

  // Self-service password reset for team members
  passwordReset: {
    ttlMinutes: intEnv('PASSWORD_RESET_TTL_MINUTES', 60, 5, 24 * 60),
    maxPerHour: intEnv('PASSWORD_RESET_MAX_PER_HOUR', 3, 1, 20),
  },

  // Admin-issued temporary credentials (emailed, changed by the member later)
  tempPassword: {
    length: intEnv('TEMP_PASSWORD_LENGTH', 12, 10, 64),
    maxPerHour: intEnv('TEMP_PASSWORD_MAX_PER_HOUR', 3, 1, 20),
  },

  // Transactional email
  email: {
    provider: emailProvider,
    from: process.env.MAIL_FROM || 'GAWA Admin <no-reply@gawa.local>',
    replyTo: process.env.MAIL_REPLY_TO || '',
    supportEmail: process.env.SUPPORT_EMAIL || process.env.MAIL_REPLY_TO || 'support@gawa.app',
    timeoutMs: intEnv('MAIL_TIMEOUT_MS', 10_000, 1_000, 60_000),
    maxAttempts: intEnv('MAIL_MAX_ATTEMPTS', 3, 1, 5),
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: intEnv('SMTP_PORT', 587, 1, 65535),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || '',
      sandbox: process.env.SENDGRID_SANDBOX === 'true',
    },
  },
};

module.exports = config;
