process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

// These providers are required for real (nothing mocked) so a broken relative
// require path fails here instead of at send time in production.
const config = require('../../config');
const consoleProvider = require('../mailer/providers/console');
const smtpProvider = require('../mailer/providers/smtp');
const sendgridProvider = require('../mailer/providers/sendgrid');
const { getProvider } = require('../mailer');

describe('mail provider modules', () => {
  it('load their config from server/config, not a sibling path', () => {
    expect(config.email).toBeDefined();
    expect(typeof config.email.provider).toBe('string');
  });

  it.each([
    ['console', consoleProvider],
    ['smtp', smtpProvider],
    ['sendgrid', sendgridProvider],
  ])('exposes a send() for %s', (name, provider) => {
    expect(provider.name).toBe(name);
    expect(typeof provider.send).toBe('function');
  });

  it('resolves the configured provider through the factory', () => {
    const previous = config.email.provider;
    config.email.provider = 'console';
    expect(getProvider().name).toBe('console');
    config.email.provider = previous;
  });

  it('delivers through the console provider without throwing', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      consoleProvider.send({ to: 'maria@example.com', subject: 'Invite', text: 'body', html: '<p>body</p>' })
    ).resolves.toEqual({ providerMessageId: null });
    log.mockRestore();
  });

  it('builds the SMTP transport with file and URL access disabled', () => {
    // A message body must never be able to pull in a local file or a remote
    // URL: that turns the mailer into a file-disclosure and SSRF primitive.
    const previousHost = config.email.smtp.host;
    config.email.smtp.host = 'smtp.example.com';

    try {
      const options = smtpProvider.buildTransportOptions();
      expect(options.disableFileAccess).toBe(true);
      expect(options.disableUrlAccess).toBe(true);
    } finally {
      config.email.smtp.host = previousHost;
    }
  });

  it('refuses to build a transport without a host', () => {
    const previousHost = config.email.smtp.host;
    config.email.smtp.host = '';
    try {
      expect(() => smtpProvider.buildTransportOptions()).toThrow(/SMTP_HOST/);
    } finally {
      config.email.smtp.host = previousHost;
    }
  });
});
