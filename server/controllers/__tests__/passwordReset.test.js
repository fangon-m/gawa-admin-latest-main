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
jest.mock('../../services/passwordResets', () => ({
  buildResetUrl: jest.fn(() => 'https://admin.test/reset-password#token=raw'),
  countRecent: jest.fn(),
  createReset: jest.fn(),
  findValidReset: jest.fn(),
  consume: jest.fn(),
  release: jest.fn(),
}));

const supabase = require('../../db/supabase');
const config = require('../../config');
const passwordResets = require('../../services/passwordResets');
const { sendEmail } = require('../../services/mailer');
const { requestPasswordReset, resetPassword } = require('../auth');

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
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve) => Promise.resolve(result).then(resolve),
  });
  return q;
}

const TEAM_MEMBER = {
  id: 'user-1',
  email: 'admin@example.com',
  first_name: 'Ada',
  last_name: 'Admin',
  role: 'admin',
  is_archived: false,
};

// Team membership is decided by the `user_roles` table. The legacy
// `users_table.role` column is deliberately ignored, so the mock returns the
// role row from a separate query.
function mockTables({ profile = TEAM_MEMBER, roleNames = ['admin'] } = {}) {
  supabase.from.mockImplementation((table) => {
    if (table === 'user_roles') {
      return queryReturning({
        data: roleNames.map((role_name) => ({ roles: { role_name } })),
        error: null,
      });
    }
    return queryReturning({ data: profile, error: null });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.from.mockImplementation(() => queryReturning({ data: null, error: null }));
  passwordResets.countRecent.mockResolvedValue(0);
  passwordResets.createReset.mockResolvedValue({
    reset: { reset_id: 'reset-1', expires_at: new Date(Date.now() + 3600_000).toISOString() },
    rawToken: 'raw-token',
  });
  sendEmail.mockResolvedValue({ delivered: true, attempts: 1, errorCode: null });
  config.passwordReset.maxPerHour = 3;
});

describe('requestPasswordReset', () => {
  it('answers identically for an unknown email (no enumeration)', async () => {
    const res = mockRes();
    await requestPasswordReset({ body: { email: 'nobody@example.com' }, ip: '::1' }, res);

    expect(res.json).toHaveBeenCalledWith({ message: expect.stringMatching(/If that email belongs to a team member/i) });
    expect(passwordResets.createReset).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not send links to accounts without a team role', async () => {
    mockTables({ profile: { ...TEAM_MEMBER, role: 'client' }, roleNames: [] });
    const res = mockRes();

    await requestPasswordReset({ body: { email: 'client@example.com' }, ip: '::1' }, res);

    expect(passwordResets.createReset).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends a link to a team member recorded only on the profile row', async () => {
    // The role lives on the profile row today, so it is a valid source.
    mockTables({ profile: { ...TEAM_MEMBER, role: 'admin' }, roleNames: [] });
    const res = mockRes();

    await requestPasswordReset({ body: { email: 'admin@example.com' }, ip: '::1' }, res);

    expect(passwordResets.createReset).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.com' }));
  });

  it('does not send a link to an account with no team role anywhere', async () => {
    mockTables({ profile: { ...TEAM_MEMBER, role: 'client' }, roleNames: [] });
    const res = mockRes();

    await requestPasswordReset({ body: { email: 'client@example.com' }, ip: '::1' }, res);

    expect(passwordResets.createReset).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: expect.stringMatching(/If that email belongs to a team member/i) });
  });

  it('does not send links to archived accounts', async () => {
    mockTables({ profile: { ...TEAM_MEMBER, is_archived: true } });
    const res = mockRes();

    await requestPasswordReset({ body: { email: 'admin@example.com' }, ip: '::1' }, res);

    expect(passwordResets.createReset).not.toHaveBeenCalled();
  });

  it('creates a reset and emails the link to a team member', async () => {
    mockTables();
    const res = mockRes();

    await requestPasswordReset({ body: { email: 'Admin@Example.com' }, ip: '::1' }, res);

    expect(passwordResets.createReset).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'admin@example.com',
      ip: '::1',
    });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@example.com',
      template: 'password_reset',
    }));
    // The response never reveals whether an account exists.
    expect(res.json).toHaveBeenCalledWith({ message: expect.stringMatching(/If that email belongs to a team member/i) });
  });

  it('stays quiet once the hourly cap is reached', async () => {
    mockTables();
    passwordResets.countRecent.mockResolvedValue(3);
    const res = mockRes();

    await requestPasswordReset({ body: { email: 'admin@example.com' }, ip: '::1' }, res);

    expect(passwordResets.createReset).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});

describe('resetPassword', () => {
  it('rejects an unknown token', async () => {
    passwordResets.findValidReset.mockResolvedValue(null);
    const res = mockRes();

    await resetPassword({ body: { token: 'x'.repeat(43), newPassword: 'newpass7' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_INVALID' }));
  });

  it('rejects a replayed token', async () => {
    passwordResets.findValidReset.mockResolvedValue({ reset_id: 'reset-1', user_id: 'user-1' });
    passwordResets.consume.mockResolvedValue(null);
    const res = mockRes();

    await resetPassword({ body: { token: 'x'.repeat(43), newPassword: 'newpass7' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('consumes the link and updates the password', async () => {
    passwordResets.findValidReset.mockResolvedValue({ reset_id: 'reset-1', user_id: 'user-1', email: 'admin@example.com' });
    passwordResets.consume.mockResolvedValue({ reset_id: 'reset-1' });
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
    const res = mockRes();

    await resetPassword({ body: { token: 'x'.repeat(43), newPassword: 'newpass7' } }, res);

    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', { password: 'newpass7' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Password reset successful' });
  });

  it('releases the link when the password update fails', async () => {
    passwordResets.findValidReset.mockResolvedValue({ reset_id: 'reset-1', user_id: 'user-1', email: 'admin@example.com' });
    passwordResets.consume.mockResolvedValue({ reset_id: 'reset-1' });
    supabase.auth.admin.updateUserById.mockResolvedValue({ data: null, error: { message: 'weak password' } });
    const res = mockRes();

    await resetPassword({ body: { token: 'x'.repeat(43), newPassword: 'newpass7' } }, res);

    expect(passwordResets.release).toHaveBeenCalledWith('reset-1');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESET_FAILED' }));
  });
});
