const ROLE_LABELS = {
  admin: 'Administrator',
  customer_support: 'Customer Support',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatExpiry(expiresAt) {
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'in 48 hours';
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

/**
 * One-time-link invitation. No password is generated or transmitted here — the
 * recipient picks their own password on the accept page.
 */
function renderInviteEmail({
  inviteeName,
  inviterName,
  email,
  role,
  acceptUrl,
  expiresAt,
  supportEmail,
}) {
  const roleLabel = ROLE_LABELS[role] || 'Team Member';
  const expiry = formatExpiry(expiresAt);
  const safeName = inviteeName || email;
  const subject = "You've been invited to the GAWA Admin Portal";

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
          <tr>
            <td>
              <h1 style="margin:0 0 16px;font-size:20px;color:#111111">You're invited to GAWA Admin</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333">
                <strong>${escapeHtml(inviterName)}</strong> invited <strong>${escapeHtml(safeName)}</strong>
                (<a href="mailto:${escapeHtml(email)}" style="color:#1f6feb;text-decoration:none">${escapeHtml(email)}</a>)
                to join as <strong>${escapeHtml(roleLabel)}</strong>.
              </p>
              <p style="margin:0 0 24px">
                <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;padding:12px 20px;background:#1f6feb;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Set your password</a>
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#666666">This link can be used once and expires ${escapeHtml(expiry)}.</p>
              <p style="margin:0;font-size:12px;color:#666666">If you weren't expecting this invitation, ignore this email or contact ${escapeHtml(supportEmail)}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "You're invited to GAWA Admin",
    '',
    `${inviterName} invited ${safeName} (${email}) to join as ${roleLabel}.`,
    '',
    'Set your password (single use):',
    acceptUrl,
    '',
    `This link expires ${expiry}.`,
    `If you weren't expecting this invitation, ignore this email or contact ${supportEmail}.`,
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderInviteEmail, escapeHtml, ROLE_LABELS };
