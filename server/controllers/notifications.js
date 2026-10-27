const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');

const VALID_ENTITY_TYPES = ['job_proposal', 'job_assignment', 'equipment_request', 'verification', 'user_account'];

/**
 * Pick a live `entity_type` for an admin-originated notification. The live
 * notifications.entity_type column is constrained to five values; admin event
 * types (user_suspended, verification_approved, ...) are mapped to the closest.
 */
function inferEntityType(type = '') {
  const t = String(type).toLowerCase();
  if (t.includes('verification')) return 'verification';
  if (t.includes('assign') || t.includes('completion')) return 'job_assignment';
  if (t.includes('equipment') || t.includes('listing') || t.includes('rental')) return 'equipment_request';
  if (t.includes('user') || t.includes('account') || t.includes('warning') || t.includes('suspension')) {
    return 'user_account';
  }
  return 'job_proposal';
}

function mapNotification(n, actorName) {
  return {
    id: n.notification_id,
    type: n.event_type,
    title: n.title,
    description: n.body,
    link: (n.data && n.data.link) || null,
    read: !!n.read_at,
    timestamp: n.created_at,
    actorName: actorName || 'System',
    entityType: n.entity_type,
    entityId: n.entity_id,
  };
}

async function listNotifications(req, res) {
  const { limit = 50, unread } = req.query;
  let query = supabase
    .from('notifications')
    .select('notification_id, recipient_id, actor_id, event_type, title, body, entity_type, entity_id, data, created_at, read_at', { count: 'exact' })
    .eq('recipient_id', req.user.id);
  if (unread === 'true') query = query.is('read_at', null);
  query = query.order('created_at', { ascending: false }).limit(Math.min(+limit, 100));

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const actorIds = [...new Set((data || []).map(n => n.actor_id).filter(Boolean))];
  const actorMap = {};
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from('users_table')
      .select('id, first_name, middle_name, last_name, email')
      .in('id', actorIds);
    (actors || []).forEach(a => { actorMap[a.id] = getFullName(a) || 'System'; });
  }

  res.json({
    data: (data || []).map(n => mapNotification(n, actorMap[n.actor_id])),
    pagination: { total: count },
  });
}

async function createNotification(req, res) {
  const { type, title, description, link, userId, entityType, entityId } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'Type and title are required' });

  const recipientId = userId || req.user.id;
  const resolvedEntityType = VALID_ENTITY_TYPES.includes(entityType) ? entityType : inferEntityType(type);

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      actor_id: req.user.id,
      event_type: type,
      title,
      body: description || title,
      entity_type: resolvedEntityType,
      entity_id: entityId || null,
      data: link ? { link } : {},
    })
    .select('notification_id, recipient_id, actor_id, event_type, title, body, entity_type, entity_id, data, created_at, read_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({ data: mapNotification(data, req.user?.name) });
}

async function markAsRead(req, res) {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('notification_id', id)
    .eq('recipient_id', req.user.id)
    .select('notification_id, read_at')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Notification not found' });
  res.json({ data: { id: data.notification_id, read: true } });
}

async function markAllRead(req, res) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', req.user.id)
    .is('read_at', null);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'All notifications marked as read' });
}

module.exports = { listNotifications, createNotification, markAsRead, markAllRead };
