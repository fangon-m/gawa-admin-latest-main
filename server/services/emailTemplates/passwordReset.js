const { escapeHtml } = require('./invite');

function formatExpiry(expiresAt) {
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'in 1 hour';
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

/**
 * Password reset for team members. Same one-time-link contract as invitations:
 * the raw token lives only in the emailed URL fragment and the database keeps
 * an HMAC hash.
 */
function renderPasswordResetEmail({ name, email, resetUrl, expiresAt, supportEmail }) {
  const expiry = formatExpiry(expiresAt);
  const safeName = name || email;
  const subject = 'Reset your GAWA Admin password';

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
          <tr>
            <td>
              <h1 style="margin:0 0 16px;font-size:20px;color:#111111">Reset your password</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333">
                Hi ${escapeHtml(safeName)}, we received a request to reset the password for
                <a href="mailto:${escapeHtml(email)}" style="color:#1f6feb;text-decoration:none">${escapeHtml(email)}</a>.
              </p>
              <p style="margin:0 0 24px">
                <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;background:#1f6feb;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Choose a new password</a>
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#666666">This link works once and expires ${escapeHtml(expiry)}.</p>
              <p style="margin:0;font-size:12px;color:#666666">If you did not request this, no action is needed — your password stays unchanged. Contact ${escapeHtml(supportEmail)} if you are unsure.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Reset your GAWA Admin password',
    '',
    `Hi ${safeName}, we received a request to reset the password for ${email}.`,
    '',
    'Choose a new password (single use):',
    resetUrl,
    '',
    `This link expires ${expiry}.`,
    `If you did not request this, no action is needed — your password stays unchanged. Contact ${supportEmail} if you are unsure.`,
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderPasswordResetEmail };
