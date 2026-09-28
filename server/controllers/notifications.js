const supabase = require('../db/supabase');

async function listNotifications(req, res) {
  const { limit = 50, unread } = req.query;
  let query = supabase.from('notifications').select('*', { count: 'exact' }).eq('user_id', req.user.id);
  if (unread === 'true') query = query.eq('read', false);
  query = query.order('created_at', { ascending: false }).limit(Math.min(+limit, 100));

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    data: (data || []).map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      description: n.description,
      link: n.link,
      read: n.read,
      timestamp: n.created_at,
      actorName: n.actor_name,
    })),
    pagination: { total: count },
  });
}

async function createNotification(req, res) {
  const { type, title, description, link, userId } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'Type and title are required' });
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const actorName = req.user?.name || 'System';

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      description: description || null,
      link: link || null,
      actor_name: actorName,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({
    data: {
      id: data.id,
      type: data.type,
      title: data.title,
      description: data.description,
      link: data.link,
      read: data.read,
      timestamp: data.created_at,
      actorName: data.actor_name,
    },
  });
}

async function markAsRead(req, res) {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Notification not found' });
  res.json({ data: { id: data.id, read: true } });
}

async function markAllRead(req, res) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', req.user.id)
    .eq('read', false);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'All notifications marked as read' });
}

module.exports = { listNotifications, createNotification, markAsRead, markAllRead };
