process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const mockInsert = jest.fn();

jest.mock('../../db/supabase', () => ({
  from: jest.fn(() => ({ insert: mockInsert })),
}));

jest.mock('../mailer/providers/smtp', () => ({ name: 'smtp', send: jest.fn() }));

const config = require('../../config');
const smtp = require('../mailer/providers/smtp');
const { sendEmail, safeErrorCode } = require('../mailer');

const message = {
  to: 'maria@example.com',
  subject: 'Invite',
  html: '<p>hi</p>',
  text: 'hi',
  template: 'team_invite',
  inviteId: 'invite-1',
};

beforeAll(() => {
  config.email.provider = 'smtp';
  config.email.maxAttempts = 3;
  config.email.timeoutMs = 1_000;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
});

describe('sendEmail', () => {
  it('delivers on the first attempt and records one event', async () => {
    smtp.send.mockResolvedValueOnce({ providerMessageId: 'msg-1' });

    await expect(sendEmail(message)).resolves.toEqual({ delivered: true, attempts: 1, errorCode: null });
    expect(smtp.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'maria@example.com' }));
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', attempt: 1 }));
  });

  it('retries with backoff and succeeds', async () => {
    smtp.send
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce({ providerMessageId: 'msg-2' });

    await expect(sendEmail(message)).resolves.toEqual({ delivered: true, attempts: 3, errorCode: null });
    expect(smtp.send).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('gives up after maxAttempts and reports only the error code', async () => {
    smtp.send.mockRejectedValue(Object.assign(new Error('535 auth failed for user secret'), { code: 'SMTP_535' }));

    const result = await sendEmail(message);

    expect(result).toEqual({ delivered: false, attempts: 3, errorCode: 'SMTP_535' });
    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(mockInsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', attempt: 3, error_code: 'SMTP_535' }));
  }, 10_000);

  it('never records provider messages or credentials', async () => {
    smtp.send.mockRejectedValue(new Error('api key SG.secret-value rejected'));

    await sendEmail(message);

    const recorded = JSON.stringify(mockInsert.mock.calls);
    expect(recorded).not.toContain('SG.secret-value');
    expect(recorded).not.toContain('api key');
  }, 10_000);
});

describe('safeErrorCode', () => {
  it('keeps short provider codes', () => {
    expect(safeErrorCode({ code: 'SENDGRID_401' })).toBe('SENDGRID_401');
    expect(safeErrorCode({ status: 503 })).toBe('HTTP_503');
    expect(safeErrorCode({ name: 'AbortError' })).toBe('TIMEOUT');
  });

  it('falls back to a generic code instead of an error message', () => {
    expect(safeErrorCode(new Error('token=abc leaked'))).toBe('E_MAIL');
  });
});
