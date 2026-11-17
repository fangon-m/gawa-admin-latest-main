jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { sendMessage } = require('../messages');
const { schemas } = require('../../middleware/validate');

function resolvedQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    is: jest.fn(() => query),
    update: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('messages controller', () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: adminId, name: 'Admin', roles: ['admin'] },
      body: { conversationId: userId, text: '  Hello there  ' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('sends a direct message using the messages table schema', async () => {
    const userQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: userId, first_name: 'Sam', last_name: 'User', role: 'client', is_verified: true, is_archived: false },
        error: null,
      }),
    };
    const messageQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          message_id: '33333333-3333-4333-8333-333333333333',
          sender_id: adminId,
          receiver_id: userId,
          message_text: 'Hello there',
          created_at: '2026-10-12T00:00:00.000Z',
          read_at: null,
        },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'users_table' ? userQuery : messageQuery);

    await sendMessage(req, res);

    expect(supabase.from).toHaveBeenCalledWith('messages');
    expect(messageQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      sender_id: adminId,
      receiver_id: userId,
      message_text: 'Hello there',
      message_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ senderId: adminId, receiverId: userId, text: 'Hello there' }),
    }));
  });

  it('rejects a non-UUID sender identity because it cannot be stored as a message sender', async () => {
    req.user.id = 'not-a-uuid';

    await sendMessage(req, res);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Messaging requires a registered admin account.' });
  });

  it('accepts canonical PostgreSQL UUIDs with non-RFC variant bits as recipients', async () => {
    const reportedUserId = 'b2222222-2222-2222-2222-222222222201';
    req.body.conversationId = reportedUserId;
    const userQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: reportedUserId, first_name: 'Rasti', last_name: 'Lopez', role: 'client', is_verified: true, is_archived: false },
        error: null,
      }),
    };
    const messageQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          message_id: '33333333-3333-4333-8333-333333333333',
          sender_id: adminId,
          receiver_id: reportedUserId,
          message_text: 'Warning notice',
          created_at: '2026-10-12T00:00:00.000Z',
        },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'users_table' ? userQuery : messageQuery);

    await sendMessage(req, res);

    expect(userQuery.eq).toHaveBeenCalledWith('id', reportedUserId);
    expect(messageQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      sender_id: adminId,
      receiver_id: reportedUserId,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(schemas.sendMessage.safeParse({
      conversationId: reportedUserId,
      text: 'Reply to the warning',
    }).success).toBe(true);
  });

  it('returns an unread message count for each conversation', async () => {
    const sentQuery = resolvedQuery({ data: [], error: null });
    const receivedQuery = resolvedQuery({
      data: [
        { message_id: 'm1', sender_id: userId, receiver_id: adminId, message_text: 'First', created_at: '2026-10-12T00:00:00.000Z', read_at: null },
        { message_id: 'm2', sender_id: userId, receiver_id: adminId, message_text: 'Second', created_at: '2026-10-12T00:01:00.000Z', read_at: null },
        { message_id: 'm3', sender_id: userId, receiver_id: adminId, message_text: 'Read', created_at: '2026-10-12T00:02:00.000Z', read_at: '2026-10-12T00:03:00.000Z' },
      ],
      error: null,
    });
    const usersQuery = resolvedQuery({
      data: [{ id: userId, first_name: 'Sam', last_name: 'User', role: 'client' }],
      error: null,
    });
    let messageQueryCount = 0;
    supabase.from.mockImplementation(table => {
      if (table === 'users_table') return usersQuery;
      return messageQueryCount++ === 0 ? sentQuery : receivedQuery;
    });
    req.query = {};

    const { listConversations } = require('../messages');
    await listConversations(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      unreadCount: 2,
      data: [expect.objectContaining({ id: userId, unread: true, unreadCount: 2 })],
    }));
  });

  it('marks incoming messages read when opening a conversation and returns their read receipt', async () => {    const userQuery = resolvedQuery({
      data: { id: userId, first_name: 'Sam', last_name: 'User', role: 'client' },
      error: null,
    });
    const sentQuery = resolvedQuery({
      data: [{
        message_id: 'sent-message',
        sender_id: adminId,
        receiver_id: userId,
        message_text: 'Reply',
        created_at: '2026-10-12T00:01:00.000Z',
        read_at: null,
      }],
      error: null,
    });
    const receivedQuery = resolvedQuery({
      data: [{
        message_id: 'received-message',
        sender_id: userId,
        receiver_id: adminId,
        message_text: 'Question',
        created_at: '2026-10-12T00:00:00.000Z',
        read_at: null,
      }],
      error: null,
    });
    const updateQuery = resolvedQuery({ data: null, error: null });
    let messageQueryCount = 0;
    supabase.from.mockImplementation(table => {
      if (table === 'users_table') return userQuery;
      const queries = [sentQuery, receivedQuery, updateQuery];
      return queries[messageQueryCount++];
    });
    req.params = { id: userId };

    const { getConversation } = require('../messages');
    await getConversation(req, res);

    const response = res.json.mock.calls[0][0].data;
    const receivedMessage = response.messages.find(message => message.id === 'received-message');
    expect(response.unread).toBe(false);
    expect(response.unreadCount).toBe(0);
    expect(receivedMessage.readAt).toEqual(expect.any(String));
    expect(updateQuery.update).toHaveBeenCalledWith({ read_at: receivedMessage.readAt });
  });

  it('lets support message an administrator', async () => {
    const staffId = '44444444-4444-4444-8444-444444444444';
    req.user = { id: userId, name: 'Support Agent', roles: ['customer_support'] };
    req.body = { conversationId: staffId, text: '  Need a ruling on this case  ' };

    const userQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: staffId,
          first_name: 'Ana',
          last_name: 'Admin',
          role: 'admin',
          is_archived: false,
          is_verified: false,
        },
        error: null,
      }),
    };
    const messageQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          message_id: '55555555-5555-4555-8555-555555555555',
          sender_id: userId,
          receiver_id: staffId,
          message_text: 'Need a ruling on this case',
          created_at: '2026-11-17T00:00:00.000Z',
          read_at: null,
        },
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'users_table' ? userQuery : messageQuery);

    await sendMessage(req, res);

    expect(messageQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      sender_id: userId,
      receiver_id: staffId,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('refuses to message an unverified customer, because chat is gated on verification', async () => {
    const userQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: userId, first_name: 'Sam', last_name: 'User', role: 'client', is_verified: false, is_archived: false },
        error: null,
      }),
    };
    const messageQuery = { insert: jest.fn().mockReturnThis() };
    supabase.from.mockImplementation(table => table === 'users_table' ? userQuery : messageQuery);

    await sendMessage(req, res);

    expect(messageQuery.insert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This account is not verified yet, so it cannot receive messages.',
    });
  });

  it('keeps refusing to message an archived account', async () => {
    const userQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: userId, first_name: 'Sam', last_name: 'User', role: 'client', is_verified: true, is_archived: true },
        error: null,
      }),
    };
    supabase.from.mockImplementation(() => userQuery);

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Archived accounts cannot receive messages. Unarchive the account first.',
    });
  });

  it('lists team recipients for staff-to-staff messaging', async () => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      neq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      in: jest.fn(() => query),
      not: jest.fn(() => query),
      then: (resolve) => Promise.resolve({
        data: [{
          id: 'staff-1',
          first_name: 'Ana',
          last_name: 'Admin',
          email: 'ana@gawa.local',
          role: 'admin',
          is_archived: false,
          is_verified: false,
        }],
        error: null,
      }).then(resolve),
    };
    supabase.from.mockImplementation(() => query);
    req.query = { scope: 'team' };

    const { listRecipients } = require('../messages');
    await listRecipients(req, res);

    expect(query.in).toHaveBeenCalledWith('role', ['admin', 'customer_support']);
    expect(query.neq).toHaveBeenCalledWith('id', adminId);
    expect(res.json).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: 'staff-1', name: 'Ana Admin', isStaff: true })],
      scope: 'team',
    });
  });

  it('lists only verified customers by default, never staff', async () => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      neq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      in: jest.fn(() => query),
      not: jest.fn(() => query),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    supabase.from.mockImplementation(() => query);
    req.query = {};

    const { listRecipients } = require('../messages');
    await listRecipients(req, res);

    expect(query.not).toHaveBeenCalledWith('role', 'in', '("admin","customer_support")');
    expect(query.eq).toHaveBeenCalledWith('is_verified', true);
    expect(res.json).toHaveBeenCalledWith({ data: [], scope: 'customers' });
  });
});
