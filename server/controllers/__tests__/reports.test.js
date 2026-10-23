jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { listReports } = require('../reports');

describe('list issue reports', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { query: { page: '1', limit: '20', status: 'open' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('retrieves issue_reports using its actual schema and returns matching fields', async () => {
    const report = {
      report_id: '11111111-1111-4111-8111-111111111111',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'profile',
      target_id: '33333333-3333-4333-8333-333333333333',
      issue_type: 'Fraud',
      comment: 'Reported job contains false information',
      attachment_paths: ['evidence/image.png'],
      status: 'open',
      created_at: '2026-10-12T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: report.reporter_id, first_name: 'Taylor', last_name: 'User' },
          { id: report.target_id, first_name: 'Reported', last_name: 'Person' },
        ],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reportsQuery : usersQuery);

    await listReports(req, res);

    expect(supabase.from).toHaveBeenCalledWith('issue_reports');
    expect(reportsQuery.eq).toHaveBeenCalledWith('status', 'open');
    expect(res.json).toHaveBeenCalledWith({
      data: [{
        id: report.report_id,
        reporterId: report.reporter_id,
        reporterName: 'Taylor User',
        targetType: report.target_type,
        targetId: report.target_id,
        reportedName: 'Reported Person',
        issueType: report.issue_type,
        comment: report.comment,
        attachmentPaths: report.attachment_paths,
        status: report.status,
        createdAt: report.created_at,
      }],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('returns database errors instead of hiding failures', async () => {
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: null, count: null, error: { message: 'issue_reports unavailable' } }),
    };
    supabase.from.mockReturnValue(reportsQuery);

    await listReports(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'issue_reports unavailable' });
  });
});
