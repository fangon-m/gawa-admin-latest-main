const config = require('../../../config');

/**
 * SendGrid v3 REST API. Uses the global fetch (Node 18+) so no extra SDK is
 * required; the API key is only ever read from env, never logged.
 */
const name = 'sendgrid';
const ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

function parseFrom(value) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value || '');
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: String(value || '').trim() };
}

async function send({ to, subject, html, text }) {
  const { apiKey, sandbox } = config.email.sendgrid;
  if (!apiKey) {
    const err = new Error('SENDGRID_API_KEY is not configured');
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.email.timeoutMs);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: parseFrom(config.email.from),
        reply_to: config.email.replyTo ? { email: config.email.replyTo } : undefined,
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
        mail_settings: sandbox ? { sandbox_mode: { enable: true } } : undefined,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`SendGrid rejected the message with status ${res.status}`);
      err.code = `SENDGRID_${res.status}`;
      throw err;
    }

    return { providerMessageId: res.headers.get('x-message-id') || null };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { name, send };
