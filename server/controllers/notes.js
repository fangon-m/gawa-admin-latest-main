const supabase = require('../db/supabase');
const { getFullName } = require('../utilities/helpers');

async function listNotes(req, res) {
  const { userId } = req.params;

  const { data, error } = await supabase
    .from('user_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Enrich with author names
  if (data && data.length > 0) {
    const authorIds = [...new Set(data.map(n => n.author_id))];
    const { data: authors } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', authorIds);

    const nameMap = {};
    if (authors) authors.forEach(a => { nameMap[a.id] = getFullName(a); });

    const enriched = data.map(n => ({
      id: n.id,
      userId: n.user_id,
      text: n.content,
      author: nameMap[n.author_id] || n.author_id,
      authorId: n.author_id,
      createdAt: n.created_at,
    }));

    return res.json({ data: enriched });
  }

  res.json({ data: [] });
}

async function addNote(req, res) {
  const { userId, content } = req.body;

  const { data, error } = await supabase
    .from('user_notes')
    .insert({
      user_id: userId,
      content,
      author_id: req.user?.id,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({
    data: {
      id: data.id,
      userId: data.user_id,
      text: data.content,
      author: req.user?.name || 'Admin',
      authorId: data.author_id,
      createdAt: data.created_at,
    },
  });
}

async function deleteNote(req, res) {
  const { id } = req.params;

  const { error } = await supabase
    .from('user_notes')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Note deleted' });
}

module.exports = { listNotes, addNote, deleteNote };
