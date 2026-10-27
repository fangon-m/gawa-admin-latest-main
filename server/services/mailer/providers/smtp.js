const config = require('../../../config');

/**
 * SMTP transport. Also used for AWS SES (point SMTP_HOST at
 * email-smtp.<region>.amazonaws.com with SES SMTP credentials) and the
 * SendGrid SMTP relay (smtp.sendgrid.net:587, user "apikey").
 *
 * nodemailer is required lazily so the server can still boot with the console
 * provider before dependencies are installed.
 */
const name = 'smtp';
let cachedTransport;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  const { host, port, secure, user, pass } = config.email.smtp;
  if (!host) {
    const err = new Error('SMTP_HOST is not configured');
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  let nodemailer;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch {
    const err = new Error('The nodemailer package is required for SMTP delivery');
    err.code = 'PROVIDER_NOT_INSTALLED';
    throw err;
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: config.email.timeoutMs,
    greetingTimeout: config.email.timeoutMs,
    socketTimeout: config.email.timeoutMs,
    pool: true,
    maxConnections: 3,
  });
  return cachedTransport;
}

async function send({ to, subject, html, text }) {
  const transport = getTransport();
  const info = await transport.sendMail({
    from: config.email.from,
    to,
    subject,
    text,
    html,
    replyTo: config.email.replyTo || undefined,
  });
  return { providerMessageId: info?.messageId || null };
}

module.exports = { name, send };
