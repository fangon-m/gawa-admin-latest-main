const { renderSuspensionEmail } = require('../emailTemplates/suspension');

describe('suspension email template', () => {
  it('includes the reason, duration, expiry, and appeal contact in both formats', () => {
    const email = renderSuspensionEmail({
      name: 'Jamie User',
      email: 'jamie@example.com',
      reason: 'Policy violation',
      duration: 7,
      suspendedUntil: '2026-11-21T12:30:00.000Z',
      supportEmail: 'support@example.com',
    });

    expect(email.subject).toBe('Your GAWA account has been suspended');
    expect(email.text).toContain('Reason: Policy violation');
    expect(email.text).toContain('Duration: 7 days');
    expect(email.text).toContain('2026-11-21 12:30 UTC');
    expect(email.text).toContain('support@example.com');
    expect(email.html).toContain('Policy violation');
    expect(email.html).toContain('mailto:support@example.com');
  });

  it('escapes user-supplied values in the HTML body', () => {
    const email = renderSuspensionEmail({
      name: '<Jamie>',
      email: 'jamie@example.com',
      reason: '<script>alert(1)</script>',
      duration: 1,
      suspendedUntil: '2026-11-15T12:30:00.000Z',
      supportEmail: 'support@example.com',
    });

    expect(email.html).toContain('&lt;Jamie&gt;');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).not.toContain('<script>');
  });
});
