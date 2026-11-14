process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.INVITE_TOKEN_PEPPER = 'a'.repeat(64);

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  auth: { admin: {} },
}));
jest.mock('../../utilities/activityLogger', () => ({ logAdminActivity: jest.fn() }));
jest.mock('../../services/mailer', () => ({ sendEmail: jest.fn() }));
jest.mock('../../services/passwordResets', () => ({
  buildResetUrl: jest.fn(() => 'https://admin.test/reset-password#token=raw'),
  countRecent: jest.fn(),
  createReset: jest.fn(),
}));

const supabase = require('../../db/supabase');
const config = require('../../config');
const passwordResets = require('../../services/passwordResets');
const { sendEmail } = require('../../services/mailer');
const { logAdminActivity } = require('../../utilities/activityLogger');
const { sendPasswordResetEmail } = require('../users');

const MEMBER_ID = '33333333-3333-4333-8333-333333333333';

const member = {
  id: MEMBER_ID,
  email: 'support@example.com',
  first_name: 'Dainiel',
  last_name: 'Support',
  role: 'customer_support',
  is_archived: false,
};

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function queryReturning(result) {
  const q = {};
  const chain = () => q;
  Object.assign(q, {
    select: jest.fn(chain),
    eq: jest.fn(chain),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve) => Promise.resolve(result).then(resolve),
  });
  return q;
}

function req(params = { id: MEMBER_ID }) {
  return { params, ip: '::1', user: { id: 'actor-1' } };
}

beforeEach(() => {
  jest.clearAllMocks();
  config.passwordReset.maxPerHour = 3;
  supabase.from.mockImplementation(() => queryReturning({ data: member, error: null }));
  passwordResets.countRecent.mockResolvedValue(0);
  passwordResets.createReset.mockResolvedValue({
    reset: { reset_id: 'reset-1', expires_at: new Date(Date.now() + 3600_000).toISOString() },
    rawToken: 'raw-token',
  });
  sendEmail.mockResolvedValue({ delivered: true, attempts: 1, errorCode: null });
});

describe('sendPasswordResetEmail', () => {
  it('404s on a non-uuid id without touching the database', async () => {
    const res = mockRes();
    await sendPasswordResetEmail(req({ id: 'nope' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('404s for an unknown member', async () => {
    supabase.from.mockImplementation(() => queryReturning({ data: null, error: null }));
    const res = mockRes();

    await sendPasswordResetEmail(req(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuses consumer accounts', async () => {
    supabase.from.mockImplementation(() => queryReturning({ data: { ...member, role: 'client' }, error: null }));
    const res = mockRes();

    await sendPasswordResetEmail(req(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuses archived accounts', async () => {
    supabase.from.mockImplementation(() => queryReturning({ data: { ...member, is_archived: true }, error: null }));
    const res = mockRes();

    await sendPasswordResetEmail(req(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('emails a one-time link and audits it', async () => {
    const res = mockRes();

    await sendPasswordResetEmail(req(), res);

    expect(passwordResets.createReset).toHaveBeenCalledWith({
      userId: MEMBER_ID,
      email: 'support@example.com',
      ip: '::1',
    });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'support@example.com',
      template: 'password_reset',
    }));
    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ activityType: 'password_reset' }));

    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toMatchObject({ email: 'support@example.com', delivery: 'sent' });
    expect(JSON.stringify(payload)).not.toContain('raw-token');
  });

  it('reports a failed delivery without losing the reset row', async () => {
    sendEmail.mockResolvedValue({ delivered: false, attempts: 3, errorCode: 'SMTP_535' });
    const res = mockRes();

    await sendPasswordResetEmail(req(), res);

    expect(res.json.mock.calls[0][0].data.delivery).toBe('failed');
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('429s once the hourly cap is reached', async () => {
    passwordResets.countRecent.mockResolvedValue(3);
    const res = mockRes();

    await sendPasswordResetEmail(req(), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(passwordResets.createReset).not.toHaveBeenCalled();
  });
});
