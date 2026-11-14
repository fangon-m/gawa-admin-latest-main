process.env.NODE_ENV = 'test';
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
jest.mock('../../utilities/sessionRevocation', () => ({ revokeUserSessions: jest.fn() }));
jest.mock('../../services/mailer', () => ({ sendEmail: jest.fn() }));

const supabase = require('../../db/supabase');
const { revokeUserSessions } = require('../../utilities/sessionRevocation');
const { sendEmail } = require('../../services/mailer');
const { suspendUser } = require('../users');

const USER_ID = '33333333-3333-4333-8333-333333333333';
const existingUser = {
  id: USER_ID,
  email: 'jamie@example.com',
  first_name: 'Jamie',
  last_name: 'User',
  role: 'client',
  is_archived: false,
  suspension_status: 'resolved',
  suspended_until: null,
};
const suspendedUser = {
  ...existingUser,
  suspension_status: 'active',
  suspended_until: '2026-11-21T12:30:00.000Z',
  suspension_reason: 'Policy violation',
};

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function configureUserQueries() {
  const existingQuery = {};
  Object.assign(existingQuery, {
    select: jest.fn(() => existingQuery),
    eq: jest.fn(() => existingQuery),
    maybeSingle: jest.fn().mockResolvedValue({ data: existingUser, error: null }),
  });

  const updateQuery = {};
  Object.assign(updateQuery, {
    update: jest.fn(() => updateQuery),
    eq: jest.fn(() => updateQuery),
    select: jest.fn(() => updateQuery),
    single: jest.fn().mockResolvedValue({ data: suspendedUser, error: null }),
  });

  supabase.from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(updateQuery);
}

beforeEach(() => {
  jest.clearAllMocks();
  configureUserQueries();
  revokeUserSessions.mockResolvedValue({ revoked: true });
  sendEmail.mockResolvedValue({ delivered: true, attempts: 1, errorCode: null });
});

describe('suspendUser email notification', () => {
  it('sends the suspension details to the registered address before responding', async () => {
    const res = makeRes();
    const req = {
      params: { id: USER_ID },
      body: { duration: 7, reason: 'Policy violation' },
      user: { id: 'admin-1' },
    };

    await suspendUser(req, res);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'jamie@example.com',
      template: 'user_suspension',
      subject: 'Your GAWA account has been suspended',
      text: expect.stringContaining('Reason: Policy violation'),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      emailNotification: { delivered: true, errorCode: null },
    }));
  });

  it('keeps the suspension active and reports failed delivery', async () => {
    sendEmail.mockResolvedValue({ delivered: false, attempts: 3, errorCode: 'SMTP_535' });
    const res = makeRes();

    await suspendUser({
      params: { id: USER_ID },
      body: { duration: 7, reason: 'Policy violation' },
      user: { id: 'admin-1' },
    }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      emailNotification: { delivered: false, errorCode: 'SMTP_535' },
      data: expect.objectContaining({ status: 'suspended' }),
    }));
  });
});
