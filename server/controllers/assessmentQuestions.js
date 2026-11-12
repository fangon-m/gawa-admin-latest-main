const supabase = require('../db/supabase');
const { toCamelCase, calculatePagination, sendError } = require('../utilities/helpers');
const { isAdmin } = require('../utilities/permissions');

// The question bank is read by the whole support team, but the answer key is
// what makes the assessment meaningful. It is only ever attached for graders
// (administrators); for everyone else the field is omitted entirely rather
// than returned as null, so it cannot be mistaken for "no key stored".
const ASSESSMENT_QUESTION_MAX_LIMIT = 500;

function applyAnswerKeyPolicy(req, questions) {
  if (isAdmin(req)) return questions;
  return questions.map((question) => {
    const { answerKey, ...rest } = question;
    return rest;
  });
}

async function listAssessmentQuestions(req, res) {
  const { assessmentId, isActive } = req.query;
  const { limit, offset } = calculatePagination(req.query.page, req.query.limit, ASSESSMENT_QUESTION_MAX_LIMIT);

  let query = supabase.from('assessment_questions').select('*');
  if (assessmentId) query = query.eq('assessment_id', assessmentId);
  if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');
  query = query
    .order('part_no', { ascending: true })
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) return sendError(res, error, { status: 500 });

  // Enrich with choices and answer keys
  const questions = (data || []).map(toCamelCase);
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

  res.json({ data: applyAnswerKeyPolicy(req, questions) });
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

  const question = {
    ...toCamelCase(q),
    choices: (choices || []).map(toCamelCase),
    answerKey: answerKey ? toCamelCase(answerKey) : null,
  };

  res.json({ data: applyAnswerKeyPolicy(req, [question])[0] });
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

  if (qError) return sendError(res, qError, { status: 500 });

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
    
    if (cError) return sendError(res, cError, { status: 500 });
    
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
  const changesQuestionContent = [partNo, category, questionText, explanation, choices, correctChoiceId]
    .some((value) => value !== undefined);
  if (changesQuestionContent) {
    const { data: attemptedQuestion, error: attemptsError } = await supabase
      .from('assessment_attempt_answers')
      .select('question_id')
      .eq('question_id', req.params.id)
      .limit(1);

    if (attemptsError) return sendError(res, attemptsError, { status: 500 });
    if (attemptedQuestion?.length) {
      return res.status(409).json({
        error: 'This question has attempt history and cannot be edited; deactivate it and add a replacement question instead',
      });
    }
  }

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
    
    if (cError) return sendError(res, cError, { status: 500 });
    
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
  const { data: attemptedQuestion, error: attemptsError } = await supabase
    .from('assessment_attempt_answers')
    .select('question_id')
    .eq('question_id', req.params.id)
    .limit(1);

  if (attemptsError) return sendError(res, attemptsError, { status: 500 });
  if (attemptedQuestion?.length) {
    return res.status(409).json({ error: 'This question has attempt history and cannot be deleted; deactivate it and add a replacement question instead' });
  }

  await supabase.from('assessment_answer_keys').delete().eq('question_id', req.params.id);
  await supabase.from('assessment_choices').delete().eq('question_id', req.params.id);
  const { error } = await supabase.from('assessment_questions').delete().eq('question_id', req.params.id);
  if (error) return sendError(res, error, { status: 500 });
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
  if (assessmentLookupError) return sendError(res, assessmentLookupError, { status: 500 });
  const assessmentIds = (assessments || []).map((assessment) => assessment.assessment_id);
  if (!assessmentIds.length) return res.status(404).json({ error: 'No assessments were found for this skill' });

  const { data: questions, error: questionLookupError } = await supabase
    .from('assessment_questions')
    .select('question_id, assessment_id')
    .in('assessment_id', assessmentIds)
    .in('question_id', ids);
  if (questionLookupError) return sendError(res, questionLookupError, { status: 500 });
  if (!questions || questions.length !== ids.length) {
    return res.status(404).json({ error: 'One or more selected questions do not belong to this skill' });
  }

  const { data: attemptedQuestions, error: attemptsError } = await supabase
    .from('assessment_attempt_answers')
    .select('question_id')
    .in('question_id', ids);

  if (attemptsError) return sendError(res, attemptsError, { status: 500 });
  if (attemptedQuestions?.length) {
    return res.status(409).json({ error: 'One or more selected questions have attempt history and cannot be deleted' });
  }

  for (const table of ['assessment_answer_keys', 'assessment_choices']) {
    const { error } = await supabase.from(table).delete().in('question_id', ids);
    if (error) return sendError(res, error, { status: 500, fallback: 'Could not remove related question data:' });
  }

  const { data: deletedQuestions, error: deleteError } = await supabase
    .from('assessment_questions')
    .delete()
    .in('question_id', ids)
    .select('question_id');

  if (deleteError) return sendError(res, deleteError, { status: 500 });
  if (!deletedQuestions || deletedQuestions.length !== ids.length) {
    return res.status(409).json({ error: 'The selected questions changed before deletion completed; refresh and try again' });
  }

  res.json({ message: 'Questions deleted', deletedCount: deletedQuestions.length });
}

module.exports = { listAssessmentQuestions, getAssessmentQuestionById, createAssessmentQuestion, updateAssessmentQuestion, deleteAssessmentQuestion, deleteAssessmentQuestions };