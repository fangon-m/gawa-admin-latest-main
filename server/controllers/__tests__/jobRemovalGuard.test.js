process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const { removeJob } = require('../jobs');

function makeQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    delete: jest.fn(() => query),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('removeJobPost audit-trail guard', () => {
  const jobId = '803a938f-775c-4e28-a757-42254100a3ce';
  let req;
  let res;
  let jobStatus;
  let paymentCount;
  let jobQueries;
  let paymentQueries;

  beforeEach(() => {
    jest.clearAllMocks();
    jobStatus = 'in_progress';
    paymentCount = 0;
    jobQueries = [];
    paymentQueries = [];
    req = { params: { id: jobId }, user: { id: 'admin-1' } };
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
    };
    supabase.from.mockImplementation((table) => {
      if (table === 'transactions') {
        const query = makeQuery({ count: paymentCount, error: null });
        paymentQueries.push(query);
        return query;
      }
      if (table === 'job_posts' && jobQueries.length === 0) {
        const query = makeQuery({ data: { job_status: jobStatus }, error: null });
        jobQueries.push(query);
        return query;
      }
      const query = makeQuery({ data: null, error: null });
      jobQueries.push(query);
      return query;
    });
  });

  it('refuses to remove a completed job and never issues the delete', async () => {
    jobStatus = 'completed';

    await removeJob(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Completed jobs and jobs with payment history cannot be removed. Resolve the flag instead to preserve the audit trail.',
    });
    expect(jobQueries).toHaveLength(1); // no delete query was issued
  });

  it('refuses to remove a live job that has payment history', async () => {
    paymentCount = 2;

    await removeJob(req, res);

    expect(paymentQueries[0].eq).toHaveBeenCalledWith('related_type', 'job_post');
    expect(paymentQueries[0].eq).toHaveBeenCalledWith('related_id', jobId);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(jobQueries).toHaveLength(1); // no delete query was issued
  });

  it('still removes a live job with no payment history', async () => {
    await removeJob(req, res);

    expect(jobQueries[1].delete).toHaveBeenCalled();
    expect(jobQueries[1].eq).toHaveBeenCalledWith('job_post_id', jobId);
    expect(res.json).toHaveBeenCalledWith({ message: 'Job post removed' });
  });
});
