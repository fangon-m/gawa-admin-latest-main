jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
  auth: {
    admin: {
      getUserById: jest.fn(),
    },
  },
  storage: {
    from: jest.fn(() => ({
      createSignedUrl: jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://signed.example.com/evidence' },
        error: null,
      }),
    })),
  },
}));

const supabase = require('../../db/supabase');
const { listReports } = require('../reports');

describe('list issue reports', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    supabase.storage.from.mockImplementation(() => ({
      createSignedUrl: jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://signed.example.com/evidence' },
        error: null,
      }),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: null } })),
    }));
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
      data: [expect.objectContaining({
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
        warnedAt: null,
        warningDueAt: null,
        warningComplianceFlag: false,
        autoSuspendedAt: null,
      })],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('resolves the reported user for non-profile targets and signs attachment paths', async () => {
    const report = {
      report_id: 'report-id',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'job_post',
      target_id: 'job-1',
      issue_type: 'Fraud',
      comment: 'False listing',
      attachment_paths: ['reports/a.png'],
      status: 'open',
      created_at: '2026-11-01T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const jobsQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ job_post_id: 'job-1', client_id: '33333333-3333-4333-8333-333333333333' }],
        error: null,
      }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: report.reporter_id, first_name: 'Taylor', last_name: 'User' },
          { id: '33333333-3333-4333-8333-333333333333', first_name: 'Reported', last_name: 'Person' },
        ],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return reportsQuery;
      if (table === 'job_posts') return jobsQuery;
      return usersQuery;
    });

    await listReports(req, res);

    expect(jobsQuery.in).toHaveBeenCalledWith('job_post_id', ['job-1']);
    expect(supabase.storage.from).toHaveBeenCalledWith('issue-reports');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: '33333333-3333-4333-8333-333333333333',
        reportedName: 'Reported Person',
        attachmentPaths: ['reports/a.png'],
        attachmentUrls: ['https://signed.example.com/evidence'],
      })],
    }));
  });

  it('uses the stored reported_user_id when the target entity is gone', async () => {
    const report = {
      report_id: 'report-8',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      reported_user_id: '99999999-9999-4999-8999-999999999999',
      target_type: 'job_match',
      target_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      issue_type: 'Harassment',
      comment: 'Deleted match',
      attachment_paths: [],
      status: 'open',
      created_at: '2026-11-08T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const missingTargetQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: report.reporter_id, first_name: 'Taylor', last_name: 'User' },
          { id: report.reported_user_id, first_name: 'Stored', last_name: 'Target' },
        ],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return reportsQuery;
      if (table === 'job_matches') return missingTargetQuery;
      return usersQuery;
    });

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: report.reported_user_id,
        reportedName: 'Stored Target',
      })],
    }));
  });

  it('recovers a deleted job match reported user from job_completion', async () => {
    const report = {
      report_id: 'report-9',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'job_match',
      target_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      issue_type: 'Payment dispute',
      comment: 'match deleted',
      attachment_paths: [],
      status: 'open',
      created_at: '2026-11-09T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const emptyQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const completionQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{
          job_match_id: report.target_id,
          client_id: report.reporter_id,
          user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }],
        error: null,
      }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: report.reporter_id, first_name: 'Taylor', last_name: 'User' },
          { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', first_name: 'Completed', last_name: 'Worker' },
        ],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return reportsQuery;
      if (table === 'job_matches') return emptyQuery;
      if (table === 'job_completion') return completionQuery;
      return usersQuery;
    });

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reportedName: 'Completed Worker',
      })],
    }));
  });

  it('prefers target_id as the reported user when it resolves in users_table', async () => {
    const report = {
      report_id: 'report-5',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'job_match',
      target_id: '55555555-5555-4555-8555-555555555555',
      issue_type: 'Payment dispute',
      comment: 'Reported account',
      attachment_paths: [],
      status: 'open',
      created_at: '2026-11-05T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const matchQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ job_match_id: report.target_id, user_id: 'different-worker-id' }],
        error: null,
      }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: report.reporter_id, first_name: 'Taylor', last_name: 'User' },
          { id: report.target_id, first_name: 'Direct', last_name: 'Target' },
          { id: 'different-worker-id', first_name: 'Wrong', last_name: 'Person' },
        ],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return reportsQuery;
      if (table === 'job_matches') return matchQuery;
      return usersQuery;
    });

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: report.target_id,
        reportedName: 'Direct Target',
      })],
    }));
  });

  it('picks the other party of a rental as the reported user', async () => {
    const report = {
      report_id: 'report-7',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'equipment_rental',
      target_id: '77777777-7777-4777-8777-777777777777',
      issue_type: 'Damage dispute',
      comment: 'Owner reported',
      attachment_paths: [],
      status: 'open',
      created_at: '2026-11-07T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const rentalsQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{
          rental_id: report.target_id,
          renter_id: report.reporter_id,
          owner_id: '88888888-8888-4888-8888-888888888888',
        }],
        error: null,
      }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: report.reporter_id, first_name: 'Taylor', last_name: 'User' },
          { id: '88888888-8888-4888-8888-888888888888', first_name: 'Owner', last_name: 'Reported' },
        ],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return reportsQuery;
      if (table === 'equipment_rentals') return rentalsQuery;
      return usersQuery;
    });

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: '88888888-8888-4888-8888-888888888888',
        reportedName: 'Owner Reported',
      })],
    }));
  });

  it('falls back to users_table when the reported target no longer exists', async () => {
    const report = {
      report_id: 'report-2',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'job_match',
      target_id: '33333333-3333-4333-8333-333333333333',
      issue_type: 'Payment dispute',
      comment: 'No longer available',
      attachment_paths: [],
      status: 'open',
      created_at: '2026-11-02T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const missingTargetQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [
          { id: report.reporter_id, first_name: 'Taylor', last_name: 'User' },
          { id: report.target_id, first_name: 'Gone', last_name: 'Account' },
        ],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return reportsQuery;
      if (table === 'job_matches') return missingTargetQuery;
      return usersQuery;
    });

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: report.target_id,
        reportedName: 'Gone Account',
      })],
    }));
  });

  it('reports an unknown user instead of a raw UUID when nothing resolves', async () => {
    const report = {
      report_id: 'report-3',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'equipment_rental',
      target_id: '44444444-4444-4444-8444-444444444444',
      issue_type: 'Damage',
      comment: 'Deleted rental',
      attachment_paths: [],
      status: 'open',
      created_at: '2026-11-03T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const missingTargetQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: report.reporter_id, first_name: 'Taylor', last_name: 'User' }],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => {
      if (table === 'issue_reports') return reportsQuery;
      if (table === 'equipment_rentals') return missingTargetQuery;
      return usersQuery;
    });

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: null,
        reportedName: 'Unknown user',
      })],
    }));
  });

  it('uses the auth account as a last resort for the reported user', async () => {
    const report = {
      report_id: 'report-6',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'profile',
      target_id: '66666666-6666-4666-8666-666666666666',
      issue_type: 'Spam',
      comment: 'Auth-only account',
      attachment_paths: [],
      status: 'open',
      created_at: '2026-11-06T00:00:00.000Z',
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
        data: [{ id: report.reporter_id, first_name: 'Taylor', last_name: 'User' }],
        error: null,
      }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reportsQuery : usersQuery);
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: report.target_id, email: 'auth-only@example.com', user_metadata: {} } },
    });

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        reportedUserId: report.target_id,
        reportedName: 'auth-only@example.com',
      })],
    }));
  });

  it('keeps the raw path when attachments cannot be signed', async () => {
    const report = {
      report_id: 'report-4',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      target_type: 'profile',
      target_id: '33333333-3333-4333-8333-333333333333',
      issue_type: 'Spam',
      comment: 'Test',
      attachment_paths: ['issue-reports/photo.png'],
      status: 'open',
      created_at: '2026-11-04T00:00:00.000Z',
    };
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: [report], count: 1, error: null }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    supabase.from.mockImplementation(table => table === 'issue_reports' ? reportsQuery : usersQuery);
    supabase.storage.from.mockImplementation(() => ({
      createSignedUrl: jest.fn().mockResolvedValue({ data: null, error: new Error('not found') }),
      getPublicUrl: jest.fn(() => ({ data: { publicUrl: null } })),
    }));

    await listReports(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        attachmentUrls: ['issue-reports/photo.png'],
      })],
    }));
  });

  it('reports failures without leaking database error detail to the client', async () => {
    const reportsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: null, count: null, error: { message: 'issue_reports unavailable' } }),
    };
    supabase.from.mockReturnValue(reportsQuery);

    await listReports(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    // The table/driver detail stays in the server log; the client only sees
    // a generic message.
    expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
    expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('issue_reports'),
    }));
  });
});
