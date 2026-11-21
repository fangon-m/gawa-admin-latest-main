jest.mock('../../db/supabase', () => ({ from: jest.fn() }));

const supabase = require('../../db/supabase');
const { deleteSkill } = require('../skills');

const REFERENCE_TABLES = [
  'job_skills',
  'equipment_listing_skills',
  'user_skills',
  'skill_assessments',
  'assessment_attempts',
];

function countQuery(count) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (resolve) => Promise.resolve({ count, error: null }).then(resolve),
  };
}

describe('deleteSkill usage guard', () => {
  let req;
  let res;
  let deleteQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: { id: 'skill-id' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    deleteQuery = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve({ error: null }).then(resolve),
    };
    supabase.from.mockImplementation((table) => (
      REFERENCE_TABLES.includes(table) ? countQuery(0) : deleteQuery
    ));
  });

  it('deletes a skill that has no references', async () => {
    await deleteSkill(req, res);

    expect(deleteQuery.delete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Skill deleted' });
  });

  it('blocks deletion and names every referencing table', async () => {
    const counts = { job_skills: 3, user_skills: 2, assessment_attempts: 12 };
    supabase.from.mockImplementation((table) => (
      REFERENCE_TABLES.includes(table) ? countQuery(counts[table] || 0) : deleteQuery
    ));

    await deleteSkill(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This skill is used by 3 job posts, 2 profiles, 12 assessment attempts. Remove those references or rename the skill instead.',
    });
    expect(deleteQuery.delete).not.toHaveBeenCalled();
  });

  it('blocks deletion when only an assessment references the skill', async () => {
    supabase.from.mockImplementation((table) => (
      table === 'skill_assessments' ? countQuery(1) : REFERENCE_TABLES.includes(table) ? countQuery(0) : deleteQuery
    ));

    await deleteSkill(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toContain('1 assessment.');
    expect(deleteQuery.delete).not.toHaveBeenCalled();
  });
});
