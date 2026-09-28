const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listQuestions(req, res) {
  const { page = 1, limit = 20, categoryId } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;
  let query = supabase.from('questions').select('*', { count: 'exact' });
  if (categoryId) query = query.eq('category_id', categoryId);
  query = query.range(offset, offset + +limit - 1);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: (data || []).map(q => ({
      ...toCamelCase(q),
      question: q.text,
    })),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getQuestionById(req, res) {
  const { data: q, error } = await supabase
    .from('questions')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !q) return res.status(404).json({ error: 'Question not found' });
  res.json({ data: { ...toCamelCase(q), question: q.text } });
}

async function createQuestion(req, res) {
  const { categoryId, text, type, points, options, correctAnswer, difficulty, testId } = req.body;
  if (!categoryId || !text) return res.status(400).json({ error: 'categoryId and text are required' });

  const { data, error } = await supabase
    .from('questions')
    .insert({
      category_id: categoryId,
      text: text.trim(),
      type: type || 'multiple_choice',
      points: points || 5,
      options: options || [],
      correct_answer: correctAnswer || null,
      test_id: testId || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: { ...toCamelCase(data), question: data.text } });
}

async function updateQuestion(req, res) {
  const { categoryId, text, type, points, options, correctAnswer, difficulty, isActive, testId } = req.body;
  if (!text && !type && points === undefined && !options && !correctAnswer && !categoryId && isActive === undefined && testId === undefined) {
    return res.status(400).json({ error: 'At least one field to update is required' });
  }

  const updates = {};
  if (categoryId) updates.category_id = categoryId;
  if (text) updates.text = text.trim();
  if (type) updates.type = type;
  if (points !== undefined) updates.points = points;
  if (options) updates.options = options;
  if (correctAnswer !== undefined) updates.correct_answer = correctAnswer;
  if (isActive !== undefined) updates.is_active = isActive;
  if (testId !== undefined) updates.test_id = testId;

  const { data, error } = await supabase
    .from('questions')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Question not found' });
  res.json({ data: { ...toCamelCase(data), question: data.text } });
}

async function deleteQuestion(req, res) {
  const { error } = await supabase.from('questions').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Question deleted' });
}

module.exports = { listQuestions, getQuestionById, createQuestion, updateQuestion, deleteQuestion };
