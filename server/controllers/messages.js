const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');

/**
 * Enrich conversation participants with user names and camelCase keys.
 * Takes raw participant rows [{ user_id }] and returns [{ userId, name }].
 */
async function enrichParticipants(participantRows) {
  if (!participantRows || participantRows.length === 0) return [];
  const userIds = participantRows.map(p => p.user_id);
  const { data: users } = await supabase
    .from('users_table')
    .select('id, first_name, last_name')
    .in('id', userIds);
  const nameMap = {};
  if (users) users.forEach(u => { nameMap[u.id] = getFullName(u); });
  return participantRows.map(p => ({
    userId: p.user_id,
    name: nameMap[p.user_id] || null,
  }));
}

async function listConversations(req, res) {
  const { page = 1, limit = 20, userId } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('conversations').select('id, last_message, last_message_at, unread, created_at', { count: 'exact' });

  if (userId) {
    const { data: participations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (!participations || participations.length === 0) {
      return res.json({ data: [], pagination: { total: 0, page: +page, limit: +limit, totalPages: 0 } });
    }

    const convIds = participations.map(p => p.conversation_id);
    query = query.in('id', convIds);
  }

  const { data, error, count } = await query.order('last_message_at', { ascending: false }).range(offset, offset + +limit - 1);
  if (error) return res.status(500).json({ error: error.message });

  if (!data || data.length === 0) {
    return res.json({ data: [], pagination: { total: 0, page: +page, limit: +limit, totalPages: 0 } });
  }

  // Batch-load all participants for all conversations in a single query
  const convIds = data.map(c => c.id);
  const { data: allParticipants } = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id')
    .in('conversation_id', convIds);

  // Group participants by conversation
  const participantsByConv = {};
  (allParticipants || []).forEach(p => {
    if (!participantsByConv[p.conversation_id]) participantsByConv[p.conversation_id] = [];
    participantsByConv[p.conversation_id].push({ user_id: p.user_id });
  });

  // Collect all unique user IDs for a single batch name lookup
  const allUserIds = [...new Set((allParticipants || []).map(p => p.user_id))];
  const { data: users } = await supabase
    .from('users_table')
    .select('id, first_name, last_name')
    .in('id', allUserIds);
  const nameMap = {};
  if (users) users.forEach(u => { nameMap[u.id] = getFullName(u); });

  // Enrich each conversation with participant info
  const enriched = (data || []).map((conv) => {
    const participants = (participantsByConv[conv.id] || []).map(p => ({
      userId: p.user_id,
      name: nameMap[p.user_id] || null,
    }));
    return {
      id: conv.id,
      lastMessage: conv.last_message,
      lastMessageAt: conv.last_message_at,
      unread: conv.unread,
      createdAt: conv.created_at,
      participants,
    };
  });

  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getConversation(req, res) {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, last_message, last_message_at, unread, created_at')
    .eq('id', req.params.id)
    .single();

  if (convErr || !conv) return res.status(404).json({ error: 'Conversation not found' });

  // Verify requesting user is a participant
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (!participant) return res.status(403).json({ error: 'You are not a participant in this conversation' });

  const { data: msgs } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, text, created_at')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: true });

  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', req.params.id);

  await supabase
    .from('conversations')
    .update({ unread: false })
    .eq('id', req.params.id);

  res.json({
    data: {
      id: conv.id,
      lastMessage: conv.last_message,
      lastMessageAt: conv.last_message_at,
      unread: conv.unread,
      createdAt: conv.created_at,
      participants: await enrichParticipants(participants || []),
      messages: (msgs || []).map(m => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        text: m.text,
        createdAt: m.created_at,
      })),
    },
  });
}

async function sendMessage(req, res) {
  const { conversationId, text } = req.body;
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, last_message, last_message_at, unread, created_at')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) return res.status(404).json({ error: 'Conversation not found' });

  // Verify requesting user is a participant
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (!participant) return res.status(403).json({ error: 'You are not a participant in this conversation' });

  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: req.user?.id || null,
      text,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (msgErr) return res.status(500).json({ error: msgErr.message });

  await supabase
    .from('conversations')
    .update({
      last_message: text,
      last_message_at: msg.created_at,
      unread: true,
    })
    .eq('id', conversationId);

  res.json({
    data: {
      id: msg.id,
      conversationId: msg.conversation_id,
      senderId: msg.sender_id,
      text: msg.text,
      createdAt: msg.created_at,
    },
    message: 'Message sent',
  });
}

async function createConversation(req, res) {
  const { participantIds } = req.body;
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 2) {
    return res.status(400).json({ error: 'At least 2 participant IDs are required' });
  }

  // Check if a conversation already exists between these participants
  const { data: existingParticipation } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .in('user_id', participantIds);

  if (existingParticipation && existingParticipation.length >= participantIds.length) {
    const convCounts = {};
    for (const p of existingParticipation) {
      convCounts[p.conversation_id] = (convCounts[p.conversation_id] || 0) + 1;
    }
    for (const [convId, count] of Object.entries(convCounts)) {
      if (count >= participantIds.length) {
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', convId)
          .single();
        if (existingConv) {
          const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', convId);
          return res.json({
            data: {
              id: existingConv.id,
              lastMessage: existingConv.last_message,
              lastMessageAt: existingConv.last_message_at,
              unread: existingConv.unread,
              createdAt: existingConv.created_at,
              participants: await enrichParticipants(participants || []),
            },
            message: 'Using existing conversation',
          });
        }
      }
    }
  }

  // Create new conversation
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ last_message: null, last_message_at: null, unread: false })
    .select()
    .single();

  if (convErr) return res.status(500).json({ error: convErr.message });

  // Add participants
  const participants = participantIds.map(userId => ({
    conversation_id: conv.id,
    user_id: userId,
  }));

  const { error: partErr } = await supabase
    .from('conversation_participants')
    .insert(participants);

  if (partErr) return res.status(500).json({ error: partErr.message });

  // Fetch and return enriched conversation
  const { data: freshParticipants } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conv.id);

  res.status(201).json({
    data: {
      id: conv.id,
      lastMessage: conv.last_message,
      lastMessageAt: conv.last_message_at,
      unread: conv.unread,
      createdAt: conv.created_at,
      participants: await enrichParticipants(freshParticipants || []),
    },
    message: 'Conversation created',
  });
}

module.exports = { listConversations, getConversation, sendMessage, createConversation };
