const config = require('../../config');
const supabase = require('../../db/supabase');

const providers = {
  console: () => require('./providers/console'),
  smtp: () => require('./providers/smtp'),
  ses: () => require('./providers/smtp'),
  sendgrid: () => require('./providers/sendgrid'),
};

function getProvider() {
  const factory = providers[config.email.provider];
  if (!factory) {
    const err = new Error(`Unknown EMAIL_PROVIDER "${config.email.provider}"`);
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }
  return factory();
}

/** Error messages can echo provider internals — persist only a short code. */
function safeErrorCode(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (/^[A-Za-z0-9_]{2,40}$/.test(code)) return code.toUpperCase();
  if (typeof err?.status === 'number') return `HTTP_${err.status}`;
  if (err?.name === 'AbortError') return 'TIMEOUT';
  return 'E_MAIL';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordEvent({ inviteId, to, template, status, attempt, errorCode, latencyMs }) {
  try {
    const { error } = await supabase.from('email_events').insert({
      invite_id: inviteId || null,
      email: to,
      provider: config.email.provider,
      template,
      status,
      attempt,
      error_code: errorCode || null,
      latency_ms: latencyMs,
    });
    if (error) console.error('[Mail] Could not record email event:', error.message);
  } catch (err) {
    console.error('[Mail] Could not record email event:', err.message);
  }
}

/**
 * Sends a transactional email with bounded retries. Never throws: the caller
 * gets a delivery verdict so it can mark the invite as failed and offer resend.
 */
async function sendEmail({ to, subject, html, text, template = 'invite', inviteId = null }) {
  const maxAttempts = config.email.maxAttempts;
  let lastErrorCode = 'E_MAIL';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const provider = getProvider();
      // Race the provider against our own deadline so a hung socket cannot
      // pin the invite request open indefinitely.
      await Promise.race([
        provider.send({ to, subject, html, text }),
        new Promise((_, reject) => {
          const timer = setTimeout(() => {
            const err = new Error('Mail provider timed out');
            err.code = 'TIMEOUT';
            reject(err);
          }, config.email.timeoutMs + 500);
          timer.unref?.();
        }),
      ]);

      const latencyMs = Date.now() - startedAt;
      await recordEvent({ inviteId, to, template, status: 'sent', attempt, latencyMs });
      console.log(`[Mail] Sent "${template}" to ${to} via ${config.email.provider} (attempt ${attempt}, ${latencyMs}ms)`);
      return { delivered: true, attempts: attempt, errorCode: null };
    } catch (err) {
      lastErrorCode = safeErrorCode(err);
      const latencyMs = Date.now() - startedAt;
      await recordEvent({ inviteId, to, template, status: 'failed', attempt, errorCode: lastErrorCode, latencyMs });
      // Provider errors are logged by code only: messages and payloads can
      // contain credentials or the one-time link.
      console.error(`[Mail] Delivery failed for "${template}" via ${config.email.provider} (attempt ${attempt}/${maxAttempts}, code ${lastErrorCode})`);
      if (attempt < maxAttempts) await sleep(250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
    }
  }

  return { delivered: false, attempts: maxAttempts, errorCode: lastErrorCode };
}

module.exports = { sendEmail, getProvider, safeErrorCode };
