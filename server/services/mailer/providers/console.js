const config = require('../../../config');

/**
 * Local development transport. Prints the rendered message (including the
 * one-time accept link) to the terminal so `npm run dev` needs no SMTP creds.
 * The config layer refuses this provider when NODE_ENV=production.
 */
const name = 'console';

async function send({ to, subject, text }) {
  console.log(`[mail:console] to=${to} subject="${subject}"`);
  if (config.nodeEnv !== 'production') {
    console.log('----- mail body (console provider) -----');
    console.log(text);
    console.log('----------------------------------------');
  }
  return { providerMessageId: null };
}

module.exports = { name, send };
