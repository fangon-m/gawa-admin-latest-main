process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({
  rpc: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { getSkillAttemptStats } = require('../assessmentAttempts');

describe('skill assessment attempt statistics', () => {
  it('returns actual passed/attempt totals as camel-case response data', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{
        skill_id: 'skill-1',
        attempt_count: '2',
        passed_count: '1',
        average_score_percent: '55.0',
      }],
      error: null,
    });
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await getSkillAttemptStats({}, res);

    expect(supabase.rpc).toHaveBeenCalledWith('get_skill_assessment_attempt_stats');
    expect(res.json).toHaveBeenCalledWith({
      data: [{
        skillId: 'skill-1',
        attemptCount: '2',
        passedCount: '1',
        averageScorePercent: '55.0',
      }],
    });
  });

  it('reports an explicit error when the stats query fails', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'migration missing' } });
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await getSkillAttemptStats({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to load assessment attempt statistics.',
    });
  });
});
