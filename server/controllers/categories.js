const supabase = require('../db/supabase');

async function listCategories(req, res) {
  const { page = 1, limit = 20, isActive } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('categories').select('*', { count: 'exact' });
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  query = query.order('name', { ascending: true }).range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: data.map(c => ({
      ...c,
      isActive: c.is_active,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getCategoryById(req, res) {
  const { data: cat, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !cat) return res.status(404).json({ error: 'Category not found' });
  res.json({ data: { ...cat, isActive: cat.is_active, createdAt: cat.created_at } });
}

async function createCategory(req, res) {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim(), description: description?.trim() || null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({
    data: { ...data, isActive: data.is_active, createdAt: data.created_at },
    message: 'Category created',
  });
}

async function updateCategory(req, res) {
  const { name, description } = req.body;
  if (!name && description === undefined) return res.status(400).json({ error: 'At least name or description is required' });

  const updates = {};
  if (name) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;

  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Category not found' });
  res.json({
    data: { ...data, isActive: data.is_active, createdAt: data.created_at },
    message: 'Category updated',
  });
}

async function deleteCategory(req, res) {
  const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Category deleted' });
}

module.exports = { listCategories, getCategoryById, createCategory, updateCategory, deleteCategory };
