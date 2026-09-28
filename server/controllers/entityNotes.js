const supabase = require('../db/supabase');

// Entity types that support inline notes (notes stored as JSON in the entity's text field)
const INLINE_ENTITIES = ['disputes', 'appeals'];

/**
 * Parse notes from an entity's text field — handles JSON arrays, plain text, or null.
 */
function parseNotes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [{ text: raw, createdAt: null }];
    } catch {
      // Plain text — wrap as a single note
      return [{ text: raw, createdAt: null }];
    }
  }
  return [];
}

/**
 * List notes for a given entity.
 */
async function listNotes(req, res) {
  const { entityType, entityId } = req.params;

  if (INLINE_ENTITIES.includes(entityType)) {
    // Fetch from the entity's notes text field
    const { data: entity, error } = await supabase
      .from(entityType)
      .select('id, notes')
      .eq('id', entityId)
      .single();

    if (error || !entity) return res.status(404).json({ error: `${entityType} not found` });

    const notes = parseNotes(entity.notes);
    return res.json({ data: notes });
  }

  // Future: query entity_notes table
  return res.status(400).json({ error: `Unsupported entity type: ${entityType}` });
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

  if (INLINE_ENTITIES.includes(entityType)) {
    // Fetch current notes, append, store back as JSON
    const { data: entity, error: fetchErr } = await supabase
      .from(entityType)
      .select('id, notes')
      .eq('id', entityId)
      .single();

    if (fetchErr || !entity) return res.status(404).json({ error: `${entityType} not found` });

    const notes = parseNotes(entity.notes);
    const newNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: content.trim(),
      author,
      authorId: req.user?.id || null,
      createdAt: new Date().toISOString(),
    };
    notes.push(newNote);

    const { error: updateErr } = await supabase
      .from(entityType)
      .update({ notes: JSON.stringify(notes), updated_at: new Date().toISOString() })
      .eq('id', entityId);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    return res.status(201).json({ data: newNote });
  }

  return res.status(400).json({ error: `Unsupported entity type: ${entityType}` });
}

/**
 * Delete a note from an entity by note ID.
 */
async function deleteNote(req, res) {
  const { entityType, entityId, noteId } = req.params;

  if (INLINE_ENTITIES.includes(entityType)) {
    const { data: entity, error: fetchErr } = await supabase
      .from(entityType)
      .select('id, notes')
      .eq('id', entityId)
      .single();

    if (fetchErr || !entity) return res.status(404).json({ error: `${entityType} not found` });

    const notes = parseNotes(entity.notes);
    const filtered = notes.filter(n => n.id !== noteId);

    if (filtered.length === notes.length) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const { error: updateErr } = await supabase
      .from(entityType)
      .update({ notes: JSON.stringify(filtered), updated_at: new Date().toISOString() })
      .eq('id', entityId);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    return res.json({ message: 'Note deleted' });
  }

  return res.status(400).json({ error: `Unsupported entity type: ${entityType}` });
}

module.exports = { listNotes, addNote, deleteNote };
