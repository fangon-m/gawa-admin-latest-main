const { renderTempPasswordEmail } = require('../emailTemplates/tempPassword');

describe('renderTempPasswordEmail', () => {
  it('states the login email and the temporary password in both bodies', () => {
    const { subject, html, text } = renderTempPasswordEmail({
      name: 'Dainiel Support',
      email: 'support@example.com',
      password: 'Ab3!xyZ9Qw2#',
      supportEmail: 'support@gawa.app',
    });

    expect(subject).toBe('Your GAWA Admin temporary password');
    expect(html).toContain('support@example.com');
    expect(html).toContain('Ab3!xyZ9Qw2#');
    expect(text).toContain('support@example.com');
    expect(text).toContain('Ab3!xyZ9Qw2#');
    expect(text).toContain('change it right away');
  });

  it('escapes user-controlled fields', () => {
    const { html } = renderTempPasswordEmail({
      name: '<script>alert(1)</script>',
      email: 'x"@example.com',
      password: '<b>pw</b>',
      supportEmail: 'support@gawa.app',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>pw</b>');
  });
});
