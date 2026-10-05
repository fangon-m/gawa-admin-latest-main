const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function listAssessmentQuestions(req, res) {
  const { assessmentId, isActive } = req.query;
  let query = supabase.from('assessment_questions').select('*');
  if (assessmentId) query = query.eq('assessment_id', assessmentId);
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  query = query.order('part_no', { ascending: true }).order('created_at', { ascending: true });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  
  // Enrich with choices and answer keys
  const questions = data.map(toCamelCase);
  if (questions.length > 0) {
    const questionIds = questions.map(q => q.questionId);
    
    const { data: choices } = await supabase
      .from('assessment_choices')
      .select('*')
      .in('question_id', questionIds)
      .order('sort_order', { ascending: true });
    
    const { data: answerKeys } = await supabase
      .from('assessment_answer_keys')
      .select('*')
      .in('question_id', questionIds);
    
    const choicesMap = {};
    (choices || []).forEach(c => {
      const qId = c.question_id;
      if (!choicesMap[qId]) choicesMap[qId] = [];
      choicesMap[qId].push(toCamelCase(c));
    });
    
    const answerKeyMap = {};
    (answerKeys || []).forEach(a => {
      answerKeyMap[a.question_id] = toCamelCase(a);
    });
    
    questions.forEach(q => {
      q.choices = choicesMap[q.questionId] || [];
      q.answerKey = answerKeyMap[q.questionId] || null;
    });
  }
  
  res.json({ data: questions });
}

async function getAssessmentQuestionById(req, res) {
  const { data: q, error } = await supabase
    .from('assessment_questions')
    .select('*')
    .eq('question_id', req.params.id)
    .single();

  if (error || !q) return res.status(404).json({ error: 'Question not found' });
  
  const { data: choices } = await supabase
    .from('assessment_choices')
    .select('*')
    .eq('question_id', q.question_id)
    .order('sort_order', { ascending: true });
  
  const { data: answerKey } = await supabase
    .from('assessment_answer_keys')
    .select('*')
    .eq('question_id', q.question_id)
    .single();
  
  res.json({ data: { ...toCamelCase(q), choices: choices.map(toCamelCase), answerKey: answerKey ? toCamelCase(answerKey) : null } });
}

async function createAssessmentQuestion(req, res) {
  const { assessmentId, partNo, category, questionText, explanation, choices, correctChoiceId } = req.body;
  if (!assessmentId || !questionText) return res.status(400).json({ error: 'Assessment ID and question text are required' });

  const { data: question, error: qError } = await supabase
    .from('assessment_questions')
    .insert({
      assessment_id: assessmentId,
      part_no: partNo || 1,
      category: category || 'general',
      question_text: questionText,
      explanation: explanation || null,
      is_active: true,
    })
    .select()
    .single();

  if (qError) return res.status(500).json({ error: qError.message });

  // Create choices if provided
  if (choices && choices.length > 0) {
    const choiceInserts = choices.map((c, i) => ({
      question_id: question.question_id,
      choice_text: c.choiceText || c,
      sort_order: c.sortOrder !== undefined ? c.sortOrder : i,
    }));
    
    const { data: createdChoices, error: cError } = await supabase
      .from('assessment_choices')
      .insert(choiceInserts)
      .select();
    
    if (cError) return res.status(500).json({ error: cError.message });
    
    // Create answer key if correctChoiceId provided (index into created choices)
    if (correctChoiceId !== undefined && createdChoices[correctChoiceId]) {
      await supabase
        .from('assessment_answer_keys')
        .insert({
          question_id: question.question_id,
          correct_choice_id: createdChoices[correctChoiceId].choice_id,
        });
    }
  }

  res.status(201).json({ data: toCamelCase(question), message: 'Question created' });
}

async function updateAssessmentQuestion(req, res) {
  const { partNo, category, questionText, explanation, isActive, choices, correctChoiceId } = req.body;
  const updates = {};
  if (partNo !== undefined) updates.part_no = partNo;
  if (category) updates.category = category;
  if (questionText) updates.question_text = questionText;
  if (explanation !== undefined) updates.explanation = explanation;
  if (isActive !== undefined) updates.is_active = isActive;
  updates.updated_at = new Date().toISOString();

  const { data: question, error } = await supabase
    .from('assessment_questions')
    .update(updates)
    .eq('question_id', req.params.id)
    .select()
    .single();

  if (error || !question) return res.status(404).json({ error: 'Question not found' });

  // Update choices if provided
  if (choices && choices.length > 0) {
    // Delete existing choices and answer key
    await supabase.from('assessment_answer_keys').delete().eq('question_id', question.question_id);
    await supabase.from('assessment_choices').delete().eq('question_id', question.question_id);
    
    // Insert new choices
    const choiceInserts = choices.map((c, i) => ({
      question_id: question.question_id,
      choice_text: c.choiceText || c,
      sort_order: c.sortOrder !== undefined ? c.sortOrder : i,
    }));
    
    const { data: createdChoices, error: cError } = await supabase
      .from('assessment_choices')
      .insert(choiceInserts)
      .select();
    
    if (cError) return res.status(500).json({ error: cError.message });
    
    // Create answer key
    if (correctChoiceId !== undefined && createdChoices[correctChoiceId]) {
      await supabase
        .from('assessment_answer_keys')
        .insert({
          question_id: question.question_id,
          correct_choice_id: createdChoices[correctChoiceId].choice_id,
        });
    }
  }

  res.json({ data: toCamelCase(question), message: 'Question updated' });
}

async function deleteAssessmentQuestion(req, res) {
  // Cascade delete: answer keys, choices, then question
  await supabase.from('assessment_answer_keys').delete().eq('question_id', req.params.id);
  await supabase.from('assessment_choices').delete().eq('question_id', req.params.id);
  const { error } = await supabase.from('assessment_questions').delete().eq('question_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Question deleted' });
}

async function deleteAssessmentQuestions(req, res) {
  const { skillId, ids } = req.body || {};
  if (!skillId || !Array.isArray(ids) || ids.length === 0 || ids.length > 500 ||
      ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'A skill ID and 1-500 unique question IDs are required' });
  }

  const { data: assessments, error: assessmentLookupError } = await supabase
    .from('skill_assessments')
    .select('assessment_id')
    .eq('skill_id', skillId);
  if (assessmentLookupError) return res.status(500).json({ error: assessmentLookupError.message });
  const assessmentIds = (assessments || []).map((assessment) => assessment.assessment_id);
  if (!assessmentIds.length) return res.status(404).json({ error: 'No assessments were found for this skill' });

  const { data: questions, error: questionLookupError } = await supabase
    .from('assessment_questions')
    .select('question_id, assessment_id')
    .in('assessment_id', assessmentIds)
    .in('question_id', ids);
  if (questionLookupError) return res.status(500).json({ error: questionLookupError.message });
  if (!questions || questions.length !== ids.length) {
    return res.status(404).json({ error: 'One or more selected questions do not belong to this skill' });
  }

  const { data: attemptedQuestions, error: attemptsError } = await supabase
    .from('assessment_attempt_answers')
    .select('question_id')
    .in('question_id', ids);

  if (attemptsError) return res.status(500).json({ error: attemptsError.message });
  if (attemptedQuestions?.length) {
    return res.status(409).json({ error: 'One or more selected questions have attempt history and cannot be deleted' });
  }

  for (const table of ['assessment_answer_keys', 'assessment_choices']) {
    const { error } = await supabase.from(table).delete().in('question_id', ids);
    if (error) return res.status(500).json({ error: `Could not remove related question data: ${error.message}` });
  }

  const { data: deletedQuestions, error: deleteError } = await supabase
    .from('assessment_questions')
    .delete()
    .in('question_id', ids)
    .select('question_id');

  if (deleteError) return res.status(500).json({ error: deleteError.message });
  if (!deletedQuestions || deletedQuestions.length !== ids.length) {
    return res.status(409).json({ error: 'The selected questions changed before deletion completed; refresh and try again' });
  }

  res.json({ message: 'Questions deleted', deletedCount: deletedQuestions.length });
}

module.exports = { listAssessmentQuestions, getAssessmentQuestionById, createAssessmentQuestion, updateAssessmentQuestion, deleteAssessmentQuestion, deleteAssessmentQuestions };