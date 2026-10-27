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
});
