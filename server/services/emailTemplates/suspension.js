const { escapeHtml } = require('./invite');

function renderSuspensionEmail({ name, email, reason, duration, suspendedUntil, supportEmail }) {
  const safeName = name || email;
  const safeReason = reason || 'No reason was provided.';
  const endDate = new Date(suspendedUntil);
  const endLabel = Number.isNaN(endDate.getTime())
    ? 'the end of the suspension period'
    : `${endDate.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  const durationLabel = `${duration} day${duration === 1 ? '' : 's'}`;
  const subject = 'Your GAWA account has been suspended';

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
          <tr>
            <td>
              <h1 style="margin:0 0 16px;font-size:20px;color:#111111">Your account has been suspended</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333">
                Hi ${escapeHtml(safeName)}, an administrator suspended your GAWA account.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f4f5f7;border-radius:8px;padding:16px">
                <tr><td style="font-size:13px;color:#666666;padding-bottom:6px">Reason</td></tr>
                <tr><td style="font-size:14px;color:#111111;padding-bottom:14px">${escapeHtml(safeReason)}</td></tr>
                <tr><td style="font-size:13px;color:#666666;padding-bottom:6px">Duration</td></tr>
                <tr><td style="font-size:14px;color:#111111;padding-bottom:14px">${escapeHtml(durationLabel)}</td></tr>
                <tr><td style="font-size:13px;color:#666666;padding-bottom:6px">Suspended until</td></tr>
                <tr><td style="font-size:14px;color:#111111">${escapeHtml(endLabel)}</td></tr>
              </table>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#333333">
                To appeal, reply to this email or contact support at
                <a href="mailto:${escapeHtml(supportEmail)}" style="color:#1f6feb;text-decoration:none">${escapeHtml(supportEmail)}</a>.
                Include your account email and explain why you believe the suspension should be reviewed.
              </p>
              <p style="margin:0;font-size:12px;color:#666666">Account email: ${escapeHtml(email)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Your GAWA account has been suspended',
    '',
    `Hi ${safeName}, an administrator suspended your GAWA account.`,
    '',
    `Reason: ${safeReason}`,
    `Duration: ${durationLabel}`,
    `Suspended until: ${endLabel}`,
    '',
    'To appeal, reply to this email or contact support at ' + supportEmail + '.',
    'Include your account email and explain why you believe the suspension should be reviewed.',
    `Account email: ${email}`,
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderSuspensionEmail };
