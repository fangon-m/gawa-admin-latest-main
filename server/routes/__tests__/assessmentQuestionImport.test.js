process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = req.headers.authorization === 'Bearer support'
      ? { id: 'support-1', role: 'customer_support', roles: ['customer_support'] }
      : { id: 'admin-1', name: 'Admin', role: 'admin', roles: ['admin'] };
    next();
  },
}));
jest.mock('../../db/supabase', () => {
  return {
    from: jest.fn((table) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: table === 'skills'
          ? { skill_name: 'Electrical' }
          : { assessment_id: '123e4567-e89b-42d3-a456-426614174000' },
        error: null,
      }),
    })),
    rpc: jest.fn().mockResolvedValue({
      data: { insertedCount: 1, duplicateCount: 0, duplicates: [] },
      error: null,
    }),
  };
});
jest.mock('../../middleware/auditLogger', () => ({
  createAuditLog: jest.fn().mockResolvedValue({}),
}));

const request = require('supertest');
const express = require('express');
const XLSX = require('@e965/xlsx');
const router = require('../assessmentQuestions');
const supabase = require('../../db/supabase');
const app = express();
app.use(router);

const assessmentId = '123e4567-e89b-42d3-a456-426614174000';
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['Question', 'Option 1', 'Option 2', 'Correct Answer'],
  ['Question?', 'Yes', 'No', 'Yes'],
]), 'Questions');
const workbookBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

describe('assessment question import route', () => {
  beforeEach(() => jest.clearAllMocks());

  it('authenticates admins and accepts bounded Excel uploads', async () => {
    const response = await request(app)
      .post('/import')
      .set('Authorization', 'Bearer admin')
      .field('assessmentId', assessmentId)
      .attach('file', workbookBuffer, {
        filename: 'questions.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(response.status).toBe(201);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('accepts CSV uploads using the same assessment column contract', async () => {
    const response = await request(app)
      .post('/import')
      .set('Authorization', 'Bearer admin')
      .field('assessmentId', assessmentId)
      .attach('file', Buffer.from('Question,Option 1,Option 2,Correct Answer\nQuestion?,Yes,No,Yes'), {
        filename: 'questions.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(201);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('accepts an upload for a skill without an assessment', async () => {
    const response = await request(app)
      .post('/import')
      .set('Authorization', 'Bearer admin')
      .field('skillId', assessmentId)
      .field('skillName', 'Electrical')
      .attach('file', workbookBuffer, { filename: 'questions.xlsx' });

    expect(response.status).toBe(201);
    expect(supabase.rpc).toHaveBeenCalledWith('import_assessment_questions', expect.objectContaining({
      p_assessment_id: null,
      p_skill_id: assessmentId,
      p_assessment_title: 'Electrical Assessment',
    }));
  });

  it('does not allow customer support to import assessment questions', async () => {
    const response = await request(app)
      .post('/import')
      .set('Authorization', 'Bearer support')
      .field('assessmentId', assessmentId)
      .attach('file', workbookBuffer, { filename: 'questions.xlsx' });

    expect(response.status).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects unsupported file extensions before parsing', async () => {
    const response = await request(app)
      .post('/import')
      .set('Authorization', 'Bearer admin')
      .field('assessmentId', assessmentId)
      .attach('file', Buffer.from('not a workbook'), { filename: 'questions.exe' });

    expect(response.status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects files larger than the 5 MB upload limit', async () => {
    const response = await request(app)
      .post('/import')
      .set('Authorization', 'Bearer admin')
      .field('assessmentId', assessmentId)
      .attach('file', Buffer.alloc((5 * 1024 * 1024) + 1), { filename: 'questions.csv' });

    expect(response.status).toBe(413);
    expect(response.body.error).toContain('5 MB');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
