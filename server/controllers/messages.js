const { createHash } = require('crypto');
const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');

const MESSAGE_COLUMNS = 'message_id, sender_id, receiver_id, message_text, created_at, read_at';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = new Set(['admin', 'customer_support']);

function isDatabaseUserId(id) {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}

function currentParticipant(user) {
  return {
    userId: user.id,
    name: user.name || getFullName(user),
    role: user.role || user.roles?.[0] || null,
  };
}

function otherParticipant(user) {
  return {
    userId: user.id,
    name: getFullName(user),
    role: user.role || null,
  };
}

async function loadUser(userId) {
  return supabase
    .from('users_table')
    .select('id, first_name, middle_name, last_name, email, role')
    .eq('id', userId)
    .maybeSingle();
}

async function loadMessagesForPair(firstUserId, secondUserId) {
  const [firstToSecond, secondToFirst] = await Promise.all([
    supabase.from('messages').select(MESSAGE_COLUMNS)
      .eq('sender_id', firstUserId).eq('receiver_id', secondUserId),
    supabase.from('messages').select(MESSAGE_COLUMNS)
      .eq('sender_id', secondUserId).eq('receiver_id', firstUserId),
  ]);

  if (firstToSecond.error) return { data: null, error: firstToSecond.error };
  if (secondToFirst.error) return { data: null, error: secondToFirst.error };

  const messages = [...(firstToSecond.data || []), ...(secondToFirst.data || [])];
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return { data: messages, error: null };
}

function serializeMessage(message) {
  return {
    id: message.message_id,
    senderId: message.sender_id,
    receiverId: message.receiver_id,
    text: message.message_text,
    createdAt: message.created_at,
  };
}

function threadForUser(user, admin, messages) {
  const latest = messages[messages.length - 1];
  return {
    id: user.id,
    lastMessage: latest?.message_text || '',
    lastMessageAt: latest?.created_at || null,
    unread: messages.some(message => message.receiver_id === admin.id && !message.read_at),
    createdAt: latest?.created_at || null,
    participants: [currentParticipant(admin), otherParticipant(user)],
  };
}

async function listConversations(req, res) {
  if (!isDatabaseUserId(req.user?.id)) {
    return res.status(400).json({ error: 'Messaging requires a registered admin account.' });
  }

  const [sent, received] = await Promise.all([
    supabase.from('messages').select(MESSAGE_COLUMNS).eq('sender_id', req.user.id),
    supabase.from('messages').select(MESSAGE_COLUMNS).eq('receiver_id', req.user.id),
  ]);
  if (sent.error) return res.status(500).json({ error: sent.error.message });
  if (received.error) return res.status(500).json({ error: received.error.message });

  const byUser = new Map();
  for (const message of [...(sent.data || []), ...(received.data || [])]) {
    const userId = message.sender_id === req.user.id ? message.receiver_id : message.sender_id;
    if (userId === req.user.id) continue;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push(message);
  }

  const userIds = [...byUser.keys()];
  if (userIds.length === 0) {
    return res.json({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  }

  const { data: users, error: usersError } = await supabase
    .from('users_table')
    .select('id, first_name, middle_name, last_name, email, role')
    .in('id', userIds);
  if (usersError) return res.status(500).json({ error: usersError.message });

  const userMap = new Map((users || []).map(user => [user.id, user]));
  const conversations = userIds
    .filter(userId => userMap.has(userId))
    .map(userId => {
      const messages = byUser.get(userId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return threadForUser(userMap.get(userId), req.user, messages);
    })
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  res.json({
    data: conversations.slice(offset, offset + limit),
    pagination: { total: conversations.length, page, limit, totalPages: Math.ceil(conversations.length / limit) },
  });
}

async function getConversation(req, res) {
  const adminId = req.user?.id;
  const userId = req.params.id;
  if (!isDatabaseUserId(adminId)) {
    return res.status(400).json({ error: 'Messaging requires a registered admin account.' });
  }
  if (!isDatabaseUserId(userId) || userId === adminId) {
    return res.status(400).json({ error: 'Invalid message recipient.' });
  }

  const { data: user, error: userError } = await loadUser(userId);
  if (userError) return res.status(500).json({ error: userError.message });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (STAFF_ROLES.has(user.role)) return res.status(403).json({ error: 'Messages can only be sent to user accounts.' });

  const { data: messages, error: messagesError } = await loadMessagesForPair(adminId, userId);
  if (messagesError) return res.status(500).json({ error: messagesError.message });

  const { error: readError } = await supabase.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('sender_id', userId)
    .eq('receiver_id', adminId)
    .is('read_at', null);
  if (readError) return res.status(500).json({ error: readError.message });

  const conversation = threadForUser(user, req.user, messages);
  conversation.unread = false;
  res.json({
    data: {
      ...conversation,
      messages: messages.map(serializeMessage),
    },
  });
}

async function sendMessage(req, res) {
  const adminId = req.user?.id;
  const userId = req.body.conversationId;
  const text = req.body.text.trim();
  if (!isDatabaseUserId(adminId)) {
    return res.status(400).json({ error: 'Messaging requires a registered admin account.' });
  }
  if (!isDatabaseUserId(userId) || userId === adminId) {
    return res.status(400).json({ error: 'Invalid message recipient.' });
  }

  const { data: user, error: userError } = await loadUser(userId);
  if (userError) return res.status(500).json({ error: userError.message });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (STAFF_ROLES.has(user.role)) return res.status(403).json({ error: 'Messages can only be sent to user accounts.' });

  const createdAt = new Date().toISOString();
  const messageHash = createHash('sha256').update(text).digest('hex');
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      sender_id: adminId,
      receiver_id: userId,
      message_text: text,
      message_hash: messageHash,
      created_at: createdAt,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (messageError) return res.status(500).json({ error: messageError.message });

  res.status(201).json({
    data: serializeMessage(message),
    message: 'Message sent',
  });
}

module.exports = { listConversations, getConversation, sendMessage };
