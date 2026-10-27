const { escapeHtml } = require('./invite');

/**
 * Temporary credential email. Unlike the reset-link flow the password itself
 * travels in the body, so the mailbox is the trust boundary: the mail states
 * the login email, the one-time password, and asks for an immediate change.
 */
function renderTempPasswordEmail({ name, email, password, supportEmail }) {
  const safeName = name || email;
  const subject = 'Your GAWA Admin temporary password';

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
          <tr>
            <td>
              <h1 style="margin:0 0 16px;font-size:20px;color:#111111">Your temporary password</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333">
                Hi ${escapeHtml(safeName)}, an administrator reset the password for your GAWA Admin account.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f4f5f7;border-radius:8px;padding:16px">
                <tr>
                  <td style="font-size:13px;color:#666666;padding-bottom:6px">Login email</td>
                </tr>
                <tr>
                  <td style="font-size:14px;color:#111111;font-family:Consolas,Menlo,monospace;padding-bottom:14px">${escapeHtml(email)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#666666;padding-bottom:6px">Temporary password</td>
                </tr>
                <tr>
                  <td style="font-size:16px;color:#111111;font-family:Consolas,Menlo,monospace;letter-spacing:1px">${escapeHtml(password)}</td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#333333">
                Sign in to the GAWA Admin portal with this password, then change it right away.
              </p>
              <p style="margin:0;font-size:12px;color:#666666">This password replaces your previous one. If you did not expect a reset, contact ${escapeHtml(supportEmail)}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Your GAWA Admin temporary password',
    '',
    `Hi ${safeName}, an administrator reset the password for your GAWA Admin account.`,
    '',
    `Login email: ${email}`,
    `Temporary password: ${password}`,
    '',
    'Sign in with this password, then change it right away.',
    'This password replaces your previous one.',
    `If you did not expect a reset, contact ${supportEmail}.`,
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderTempPasswordEmail };
