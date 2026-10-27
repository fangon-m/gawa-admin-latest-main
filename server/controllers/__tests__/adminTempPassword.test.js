process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.INVITE_TOKEN_PEPPER = 'a'.repeat(64);

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  auth: { admin: { updateUserById: jest.fn() } },
}));
jest.mock('../../utilities/activityLogger', () => ({ logAdminActivity: jest.fn() }));
jest.mock('../../services/mailer', () => ({ sendEmail: jest.fn() }));

const supabase = require('../../db/supabase');
const { sendEmail } = require('../../services/mailer');
const { logAdminActivity } = require('../../utilities/activityLogger');
const { adminResetPassword } = require('../users');

const MEMBER_ID = '44444444-4444-4444-8444-444444444444';

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

function mockLookup(result) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  supabase.from.mockReturnValue({ select });
}

function req(params = { id: MEMBER_ID }) {
  return { params, user: { id: 'admin-1' }, ip: '127.0.0.1' };
}

describe('adminResetPassword (temporary password)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLookup({ data: member, error: null });
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
    sendEmail.mockResolvedValue({ delivered: true, attempts: 1, errorCode: null });
  });

  it('rejects a non-uuid id without touching the auth account', async () => {
    const res = mockRes();
    await adminResetPassword(req({ id: 'not-a-uuid' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuses accounts that are not team members', async () => {
    mockLookup({ data: { ...member, role: 'client' }, error: null });
    const res = mockRes();
    await adminResetPassword(req(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_TEAM_MEMBER' }));
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('refuses archived accounts', async () => {
    mockLookup({ data: { ...member, is_archived: true }, error: null });
    const res = mockRes();
    await adminResetPassword(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_ARCHIVED' }));
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('does not email anything when the password update fails', async () => {
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: { code: 'auth_error' } });
    const res = mockRes();
    await adminResetPassword(req(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_FAILED' }));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sets a generated password and emails the login email plus the password', async () => {
    const res = mockRes();
    await adminResetPassword(req(), res);

    const [, { password }] = supabase.auth.admin.updateUserById.mock.calls[0];
    expect(password).toHaveLength(12);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[!@#$%&*?]/);

    const { escapeHtml } = require('../../services/emailTemplates/invite');

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'support@example.com',
      template: 'temp_password',
      html: expect.stringContaining(escapeHtml(password)),
      text: expect.stringContaining(password),
    }));
    expect(sendEmail.mock.calls[0][0].html).toContain('support@example.com');

    expect(res.json).toHaveBeenCalledWith({
      data: { email: 'support@example.com', delivery: 'sent' },
      message: 'Temporary password emailed to support@example.com',
    });

    const responseBody = JSON.stringify(res.json.mock.calls[0][0]);
    expect(responseBody).not.toContain(password);
    expect(JSON.stringify(logAdminActivity.mock.calls[0][0])).not.toContain(password);
  });

  it('reports a failed delivery while still returning 200', async () => {
    sendEmail.mockResolvedValue({ delivered: false, attempts: 3, errorCode: 'SMTP_535' });
    const res = mockRes();
    await adminResetPassword(req(), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ delivery: 'failed' }),
    }));
    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({
      activityType: 'password_reset',
      description: expect.stringContaining('failed: SMTP_535'),
    }));
  });
});
