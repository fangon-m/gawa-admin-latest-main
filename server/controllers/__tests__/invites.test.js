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

jest.mock('../../services/invites', () => {
  class InviteError extends Error {
    constructor(code, status, message) {
      super(message);
      this.name = 'InviteError';
      this.code = code;
      this.status = status;
    }
  }
  return {
    InviteError,
    ACTIVE_STATUSES: ['pending', 'sent', 'failed'],
    normalizeEmail: (value) => String(value || '').trim().toLowerCase(),
    inviteStatus: jest.fn(),
    isExpired: jest.fn(),
    buildAcceptUrl: jest.fn(() => 'https://admin.test/accept-invite#token=raw-token'),
    assertActorQuota: jest.fn(),
    findUserByEmail: jest.fn(),
    findActiveInvite: jest.fn(),
    expireStaleInvites: jest.fn(),
    insertInvite: jest.fn(),
    rotateInviteToken: jest.fn(),
    setDeliveryResult: jest.fn(),
    getInviteById: jest.fn(),
    revokeInvite: jest.fn(),
  };
});

const config = require('../../config');
const invites = require('../../services/invites');
const { sendEmail } = require('../../services/mailer');
const { logAdminActivity } = require('../../utilities/activityLogger');
const { inviteUser, resendInvite, revokeInvite } = require('../users');

const INVITE_ID = '11111111-1111-4111-8111-111111111111';

const baseInvite = {
  invite_id: INVITE_ID,
  email: 'maria@example.com',
  full_name: 'Maria Santos',
  role: 'admin',
  status: 'pending',
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function adminReq(body = {}, params = {}) {
  return {
    body,
    params,
    user: { id: 'actor-1', email: 'admin@example.com', first_name: 'Ada', last_name: 'Admin' },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  config.invites.enabled = true;

  invites.assertActorQuota.mockResolvedValue(undefined);
  invites.findUserByEmail.mockResolvedValue(null);
  invites.findActiveInvite.mockResolvedValue(null);
  invites.expireStaleInvites.mockResolvedValue(undefined);
  invites.insertInvite.mockResolvedValue({ invite: baseInvite, rawToken: 'raw-token' });
  invites.setDeliveryResult.mockResolvedValue(undefined);
  invites.getInviteById.mockResolvedValue(baseInvite);
  invites.rotateInviteToken.mockResolvedValue({ invite: baseInvite, rawToken: 'new-raw-token' });
  invites.revokeInvite.mockResolvedValue({ ...baseInvite, status: 'revoked' });
  invites.isExpired.mockReturnValue(false);
  invites.inviteStatus.mockReturnValue('invite_pending');
  sendEmail.mockResolvedValue({ delivered: true, attempts: 1, errorCode: null });
});

afterAll(() => {
  config.invites.enabled = true;
});

describe('inviteUser', () => {
  it('refuses to create invites when the feature is disabled', async () => {
    config.invites.enabled = false;
    const res = mockRes();

    await inviteUser(adminReq({ name: 'Maria', email: 'maria@example.com', role: 'admin' }), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(invites.insertInvite).not.toHaveBeenCalled();
  });

  it('rejects an email that already belongs to a team member', async () => {
    invites.findUserByEmail.mockResolvedValue({ id: 'user-1', is_archived: false });
    const res = mockRes();

    await inviteUser(adminReq({ name: 'Maria', email: 'maria@example.com', role: 'admin' }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_EXISTS' }));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a second live invite for the same email', async () => {
    invites.findActiveInvite.mockResolvedValue(baseInvite);
    const res = mockRes();

    await inviteUser(adminReq({ name: 'Maria', email: 'maria@example.com', role: 'admin' }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITE_EXISTS', inviteId: INVITE_ID }));
    expect(invites.insertInvite).not.toHaveBeenCalled();
  });

  it('creates a pending invite and emails a link without ever returning a credential', async () => {
    const res = mockRes();

    await inviteUser(adminReq({ name: 'Maria Santos', email: ' Maria@Example.com ', role: 'admin' }), res);

    expect(invites.assertActorQuota).toHaveBeenCalledWith('actor-1');
    expect(invites.insertInvite).toHaveBeenCalledWith({
      fullName: 'Maria Santos',
      email: 'maria@example.com',
      role: 'admin',
      invitedBy: 'actor-1',
    });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'maria@example.com',
      template: 'team_invite',
      inviteId: INVITE_ID,
    }));

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toMatchObject({ inviteId: INVITE_ID, email: 'maria@example.com', delivery: 'sent' });
    expect(JSON.stringify(payload)).not.toContain('raw-token');
    expect(JSON.stringify(payload)).not.toMatch(/password/i);

    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ activityType: 'user_invited' }));
  });

  it('keeps the invite and flags it when the email cannot be delivered', async () => {
    sendEmail.mockResolvedValue({ delivered: false, attempts: 3, errorCode: 'SMTP_535' });
    const res = mockRes();

    await inviteUser(adminReq({ name: 'Maria', email: 'maria@example.com', role: 'admin' }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.delivery).toBe('failed');
    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ activityType: 'invite_delivery_failed' }));
  });

  it('surfaces a per-actor quota as 429', async () => {
    invites.assertActorQuota.mockRejectedValue(new invites.InviteError('ACTOR_QUOTA_EXCEEDED', 429, 'Daily limit reached'));
    const res = mockRes();

    await inviteUser(adminReq({ name: 'Maria', email: 'maria@example.com', role: 'admin' }), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(invites.insertInvite).not.toHaveBeenCalled();
  });
});

describe('resendInvite', () => {
  it('404s on a non-uuid invite id before hitting the database', async () => {
    const res = mockRes();

    await resendInvite(adminReq({}, { inviteId: 'not-a-uuid' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(invites.getInviteById).not.toHaveBeenCalled();
  });

  it('refuses to resend a terminal invite', async () => {
    invites.getInviteById.mockResolvedValue({ ...baseInvite, status: 'accepted' });
    const res = mockRes();

    await resendInvite(adminReq({}, { inviteId: INVITE_ID }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(invites.rotateInviteToken).not.toHaveBeenCalled();
  });

  it('rotates the token and re-sends the email', async () => {
    const res = mockRes();

    await resendInvite(adminReq({}, { inviteId: INVITE_ID }), res);

    expect(invites.rotateInviteToken).toHaveBeenCalledWith(INVITE_ID);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'maria@example.com' }));
    expect(res.json).toHaveBeenCalled();
    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ activityType: 'invite_resent' }));
  });
});

describe('revokeInvite', () => {
  it('revokes a live invite and audits the action', async () => {
    const res = mockRes();

    await revokeInvite(adminReq({}, { inviteId: INVITE_ID }), res);

    expect(invites.revokeInvite).toHaveBeenCalledWith(INVITE_ID);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invitation revoked' }));
    expect(logAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ activityType: 'invite_revoked' }));
  });
});
