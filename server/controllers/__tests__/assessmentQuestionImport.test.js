process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  rpc: jest.fn(),
}));
jest.mock('../../middleware/auditLogger', () => ({
  createAuditLog: jest.fn().mockResolvedValue({}),
}));

const XLSX = require('@e965/xlsx');
const supabase = require('../../db/supabase');
const { createAuditLog } = require('../../middleware/auditLogger');
const { importAssessmentQuestions, parseAssessmentRows } = require('../assessmentQuestionImport');

const assessmentId = '123e4567-e89b-42d3-a456-426614174000';

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Questions');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function responseMock() {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return response;
}

describe('assessment question import controller', () => {
  let query;
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { assessment_id: assessmentId }, error: null }),
    };
    supabase.from.mockReturnValue(query);
    req = {
      body: { assessmentId },
      file: { originalname: 'questions.xlsx', buffer: workbookBuffer([
        ['Question', 'Option 1', 'Option 2', 'Correct Answer', 'Category', 'Part No', 'Explanation'],
        ['  Which step? ', 'Inspect', 'Rush', 'Inspect', 'Safety', '2', 'Check first'],
      ]) },
      user: { id: 'admin-1', name: 'Admin' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test' },
    };
    res = responseMock();
  });

  it('passes validated question rows to the transactional RPC', async () => {
    const rpcResult = { insertedCount: 1, duplicateCount: 0, duplicates: [] };
    supabase.rpc.mockResolvedValue({ data: rpcResult, error: null });

    await importAssessmentQuestions(req, res);

    expect(supabase.rpc).toHaveBeenCalledWith('import_assessment_questions', {
      p_assessment_id: assessmentId,
      p_skill_id: null,
      p_assessment_title: null,
      p_questions: [{
        rowNumber: 2,
        questionText: 'Which step?',
        partNo: 2,
        category: 'Safety',
        explanation: 'Check first',
        choices: [
          { choiceText: 'Inspect', sortOrder: 0 },
          { choiceText: 'Rush', sortOrder: 1 },
        ],
        correctChoiceIndex: 0,
      }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual(rpcResult);
  });

  it('creates an assessment for the selected skill when importing without an existing assessment', async () => {
    req.body = { skillId: assessmentId };
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { skill_name: 'Electrical' }, error: null }),
    });
    supabase.rpc.mockResolvedValue({
      data: { assessmentId, assessmentCreated: true, assessmentTitle: 'Electrical Assessment', insertedCount: 1, duplicates: [] },
      error: null,
    });

    await importAssessmentQuestions(req, res);

    expect(supabase.rpc).toHaveBeenCalledWith('import_assessment_questions', expect.objectContaining({
      p_assessment_id: null,
      p_skill_id: assessmentId,
      p_assessment_title: 'Electrical Assessment',
    }));
    expect(res.statusCode).toBe(201);
    expect(res.body.data.assessmentCreated).toBe(true);
  });

  it('rejects invalid workbook rows and logs the failure without calling the database RPC', async () => {
    req.file.buffer = workbookBuffer([
      ['Question', 'Option 1', 'Option 2', 'Correct Answer'],
      ['Broken question', 'Same', 'same', 'missing'],
    ]);

    await importAssessmentQuestions(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.details).toHaveLength(2);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ASSESSMENT_QUESTION_IMPORT_FAILED',
      targetId: assessmentId,
    }));
  });

  it('rejects duplicate headers and invalid answer mappings in the shared parsing contract', () => {
    const parsed = parseAssessmentRows([
      ['Question', 'Question', 'Option 1', 'Option 2', 'Correct Answer'],
      ['Question?', 'Question?', 'A', 'B', 'C'],
    ]);
    expect(parsed.questions).toEqual([]);
    expect(parsed.errors.some((error) => error.row === 1)).toBe(true);
  });

  it('reports an atomic failure if the database transaction rejects the batch', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'constraint error' } });

    await importAssessmentQuestions(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('no questions were committed');
    expect(createAuditLog).toHaveBeenCalled();
  });

  it('explains when the assessment import migration is missing or outdated', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache.' },
    });

    await importAssessmentQuestions(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('migration is missing or outdated');
    expect(res.body.error).toContain('20261005_import_assessment_questions.sql');
  });
});
