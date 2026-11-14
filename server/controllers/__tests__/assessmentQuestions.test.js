process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { deleteAssessmentQuestion, deleteAssessmentQuestions, updateAssessmentQuestion } = require('../assessmentQuestions');

function makeQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    limit: jest.fn(() => query),
    delete: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('bulk assessment question deletion', () => {
  const ids = ['question-1', 'question-2'];
  const req = { body: { skillId: 'skill-1', ids } };
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('deletes associated answer keys and choices for assessment-owned questions', async () => {
    const questions = makeQuery({ data: ids, error: null });
    const answers = makeQuery({ data: [], error: null });
    const assessments = makeQuery({ data: [{ assessment_id: 'assessment-1' }], error: null });
    const keys = makeQuery({ data: null, error: null });
    const choices = makeQuery({ data: null, error: null });
    const deleted = makeQuery({ data: ids.map((question_id) => ({ question_id })), error: null });
    const builders = {
      skill_assessments: [assessments],
      assessment_questions: [questions, deleted],
      assessment_attempt_answers: [answers],
      assessment_answer_keys: [keys],
      assessment_choices: [choices],
    };
    supabase.from.mockImplementation((table) => builders[table].shift());

    await deleteAssessmentQuestions(req, res);

    expect(assessments.eq).toHaveBeenCalledWith('skill_id', 'skill-1');
    expect(questions.in).toHaveBeenCalledWith('assessment_id', ['assessment-1']);
    expect(answers.in).toHaveBeenCalledWith('question_id', ids);
    expect(keys.delete).toHaveBeenCalled();
    expect(choices.delete).toHaveBeenCalled();
    expect(deleted.delete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Questions deleted', deletedCount: 2 });
  });

  it('rejects the entire selection before writes when questions have attempt history', async () => {
    const questions = makeQuery({ data: ids, error: null });
    const answers = makeQuery({ data: [{ question_id: ids[0] }], error: null });
    const assessments = makeQuery({ data: [{ assessment_id: 'assessment-1' }], error: null });
    supabase.from.mockImplementation((table) => ({
      skill_assessments: assessments,
      assessment_questions: questions,
      assessment_attempt_answers: answers,
    })[table]);

    await deleteAssessmentQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'One or more selected questions have attempt history and cannot be deleted',
    });
    expect(supabase.from).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid and duplicate selections without database calls', async () => {
    await deleteAssessmentQuestions({ body: { skillId: 'skill-1', ids: ['question-1', 'question-1'] } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('assessment questions with attempt history', () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('blocks single-question deletion when attempt history exists', async () => {
    const answers = makeQuery({ data: [{ question_id: 'question-1' }], error: null });
    supabase.from.mockReturnValue(answers);

    await deleteAssessmentQuestion({ params: { id: 'question-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This question has attempt history and cannot be deleted; deactivate it and add a replacement question instead',
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('blocks content edits when attempt history exists', async () => {
    const answers = makeQuery({ data: [{ question_id: 'question-1' }], error: null });
    supabase.from.mockReturnValue(answers);

    await updateAssessmentQuestion({
      params: { id: 'question-1' },
      body: { questionText: 'Changed question' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This question has attempt history and cannot be edited; deactivate it and add a replacement question instead',
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
