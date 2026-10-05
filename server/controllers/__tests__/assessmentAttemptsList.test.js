process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../db/supabase', () => ({
  from: jest.fn(),
}));

const supabase = require('../../db/supabase');
const { getSkillAttempts } = require('../assessmentAttempts');

describe('skill assessment attempt listing', () => {
  it('resolves attempt user IDs to profile names and returns actual attempt details', async () => {
    const attemptsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [{
          attempt_id: 'attempt-1',
          user_id: 'user-1',
          assessment_id: 'assessment-1',
          skill_id: 'skill-1',
          status: 'passed',
          started_at: '2026-10-05T08:00:00.000Z',
          submitted_at: '2026-10-05T08:10:00.000Z',
          score_percent: '85.0',
        }],
        error: null,
      }),
    };
    const usersQuery = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{
          id: 'user-1',
          first_name: 'Alex',
          middle_name: null,
          last_name: 'Example',
          email: 'alex@example.test',
        }],
        error: null,
      }),
    };
    supabase.from.mockImplementation((table) => (table === 'assessment_attempts' ? attemptsQuery : usersQuery));
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await getSkillAttempts({ params: { skillId: 'skill-1' } }, res);

    expect(attemptsQuery.eq).toHaveBeenCalledWith('skill_id', 'skill-1');
    expect(usersQuery.in).toHaveBeenCalledWith('id', ['user-1']);
    expect(res.json).toHaveBeenCalledWith({
      data: [{
        id: 'attempt-1',
        attemptId: 'attempt-1',
        userId: 'user-1',
        userName: 'Alex Example',
        assessmentId: 'assessment-1',
        skillId: 'skill-1',
        status: 'passed',
        startedAt: '2026-10-05T08:00:00.000Z',
        submittedAt: '2026-10-05T08:10:00.000Z',
        scorePercent: '85.0',
      }],
    });
  });
});
