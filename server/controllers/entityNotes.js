const supabase = require('../db/supabase');
const { getFullName, sendError } = require('../utilities/helpers');
const { resolveEntityId } = require('../utilities/entityIds');

/**
 * Notes attached to any entity — a job post, a listing, a rental, a user.
 *
 * The admin client sends the table name as the entity type ('job_posts').
 * The friendly name ('job') is accepted too, so both spellings work.
 *
 * The type is resolved through a fixed map rather than being used as a table
 * name directly, and the entity id is resolved through the same helper the
 * path parameters use, so the short ids the UI shows ('JOB-350252') work here
 * as well.
 */
const ENTITY_TYPES = {
  user: { table: 'users_table', entity: 'user' },
  users: { table: 'users_table', entity: 'user' },
  users_table: { table: 'users_table', entity: 'user' },
  job: { table: 'job_posts', entity: 'job' },
  jobs: { table: 'job_posts', entity: 'job' },
  job_post: { table: 'job_posts', entity: 'job' },
  job_posts: { table: 'job_posts', entity: 'job' },
  listing: { table: 'equipment_listings', entity: 'listing' },
  listings: { table: 'equipment_listings', entity: 'listing' },
  equipment_listing: { table: 'equipment_listings', entity: 'listing' },
  equipment_listings: { table: 'equipment_listings', entity: 'listing' },
  rental: { table: 'equipment_rentals', entity: 'rental' },
  rentals: { table: 'equipment_rentals', entity: 'rental' },
  equipment_rental: { table: 'equipment_rentals', entity: 'rental' },
  equipment_rentals: { table: 'equipment_rentals', entity: 'rental' },
  transaction: { table: 'transactions', entity: 'transaction' },
  transactions: { table: 'transactions', entity: 'transaction' },
};

const ENTITY_TYPE_PATTERN = /^[a-z_]{1,32}$/;

function resolveEntityType(rawType) {
  if (typeof rawType !== 'string' || !ENTITY_TYPE_PATTERN.test(rawType)) return null;
  return ENTITY_TYPES[rawType] || null;
}

/**
 * Turns the request's entity type and id into the pair stored on a note.
 * Returns null when either cannot be resolved.
 */
async function resolveTarget(rawType, rawId) {
  const type = resolveEntityType(rawType);
  if (!type) return null;

  const entityId = await resolveEntityId(type.entity, String(rawId || ''));
  if (!entityId) return null;

  return { type: rawType, entity: type.entity, entityId };
}

/**
 * List notes for an entity.
 */
async function listNotes(req, res) {
  const { entityType, entityId } = req.params;

  const target = await resolveTarget(entityType, entityId);
  if (!target) {
    return res.status(400).json({ error: 'Unsupported entity type or unknown entity' });
  }

  const { data, error } = await supabase
    .from('entity_notes')
    .select('*')
    .eq('entity_type', target.type)
    .eq('entity_id', target.entityId)
    .order('created_at', { ascending: false });

  if (error) return sendError(res, error, { status: 500 });

  const notes = data || [];
  const authorIds = [...new Set(notes.map((n) => n.author_id).filter(Boolean))];

  let authorMap = {};
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from('users_table')
      .select('id, first_name, last_name, email')
      .in('id', authorIds);
    (authors || []).forEach((a) => { authorMap[a.id] = getFullName(a) || a.email || a.id; });
  }

  res.json({
    data: notes.map((note) => ({
      id: note.id,
      entityType: note.entity_type,
      entityId: note.entity_id,
      // The shared NotesPanel reads `text`; the column is called `content`.
      text: note.content,
      author: authorMap[note.author_id] || note.author_id || null,
      authorId: note.author_id || null,
      createdAt: note.created_at,
    })),
  });
}

/**
 * Add a note to an entity.
 */
async function addNote(req, res) {
  const { entityType, entityId } = req.params;
  const { content } = req.body;
  const author = req.user?.name || 'Admin';

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Note content is required' });
  }

  const target = await resolveTarget(entityType, entityId);
  if (!target) {
    return res.status(400).json({ error: 'Unsupported entity type or unknown entity' });
  }

  const { data, error } = await supabase
    .from('entity_notes')
    .insert({
      entity_type: target.type,
      entity_id: target.entityId,
      content: content.trim(),
      author_id: req.user?.id || null,
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });

  res.status(201).json({
    data: {
      id: data.id,
      entityType: data.entity_type,
      entityId: data.entity_id,
      text: data.content,
      author,
      authorId: data.author_id || null,
      createdAt: data.created_at,
    },
  });
}

/**
 * Delete a note by id.
 */
async function deleteNote(req, res) {
  const { entityType, entityId, noteId } = req.params;

  const target = await resolveTarget(entityType, entityId);
  if (!target) {
    return res.status(400).json({ error: 'Unsupported entity type or unknown entity' });
  }

  const { error } = await supabase
    .from('entity_notes')
    .delete()
    .eq('id', noteId)
    .eq('entity_type', target.type)
    .eq('entity_id', target.entityId);

  if (error) return sendError(res, error, { status: 500 });
  res.json({ message: 'Note deleted' });
}

module.exports = { listNotes, addNote, deleteNote, resolveEntityType };
