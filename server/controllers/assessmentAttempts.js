const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

/**
 * GET /api/assessment-attempts/stats/skills
 * Actual submitted attempt counts and pass rates, grouped by skill.
 */
async function getSkillAttemptStats(req, res) {
  const { data, error } = await supabase.rpc('get_skill_assessment_attempt_stats');
  if (error) {
    console.error('[Assessment attempts] Failed to load skill statistics:', error.message);
    return res.status(500).json({ error: 'Unable to load assessment attempt statistics.' });
  }
  res.json({ data: (data || []).map(toCamelCase) });
}

/**
 * GET /api/assessment-attempts/skills/:skillId
 * All attempts for a given skill, with the attempting user's name.
 */
async function getSkillAttempts(req, res) {
  const { skillId } = req.params;
  const { data: attempts, error } = await supabase
    .from('assessment_attempts')
    .select('attempt_id, user_id, assessment_id, skill_id, status, started_at, submitted_at, score_percent')
    .eq('skill_id', skillId)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[Assessment attempts] Failed to load skill attempts:', error.message);
    return res.status(500).json({ error: 'Unable to load assessment attempts.' });
  }

  const userIds = [...new Set((attempts || []).map((attempt) => attempt.user_id).filter(Boolean))];
  const { data: users, error: usersError } = userIds.length
    ? await supabase
      .from('users_table')
      .select('id, first_name, middle_name, last_name, email')
      .in('id', userIds)
    : { data: [], error: null };

  if (usersError) {
    console.error('[Assessment attempts] Failed to load attempt users:', usersError.message);
    return res.status(500).json({ error: 'Unable to load assessment attempt users.' });
  }

  const userMap = new Map((users || []).map((user) => [
    user.id,
    getFullName(user) || user.email || user.id,
  ]));

  res.json({
    data: (attempts || []).map((attempt) => ({
      ...toCamelCase(attempt),
      id: attempt.attempt_id,
      userName: userMap.get(attempt.user_id) || attempt.user_id,
    })),
  });
}

/**
 * GET /api/assessment-attempts/:userId/:assessmentId
 * GET /api/assessment-attempts/:userId  (assessmentId = 'all')
 * Full attempt history for a user, enriched with skill/assessment names.
 */
async function getAttemptHistory(req, res) {
  const { userId, assessmentId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  let query = supabase
    .from('assessment_attempts')
    .select('attempt_id, user_id, assessment_id, skill_id, status, started_at, expires_at, submitted_at, total_questions, correct_count, score_percent, fail_number, next_attempt_at, created_at')
    .eq('user_id', userId);

  if (assessmentId && assessmentId !== 'all') {
    query = query.eq('assessment_id', assessmentId);
  }

  const { data: attempts, error } = await query.order('started_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Enrich each attempt with its assessment + skill name
  const assessmentIds = [...new Set((attempts || []).map(a => a.assessment_id).filter(Boolean))];
  const assessmentMap = {};
  if (assessmentIds.length > 0) {
    const { data: assessments } = await supabase
      .from('skill_assessments')
      .select('assessment_id, skill_id, title')
      .in('assessment_id', assessmentIds);

    const skillIds = [...new Set((assessments || []).map(a => a.skill_id).filter(Boolean))];
    const skillMap = {};
    if (skillIds.length > 0) {
      const { data: skills } = await supabase
        .from('skills')
        .select('skill_id, skill_name')
        .in('skill_id', skillIds);
      (skills || []).forEach(s => { skillMap[s.skill_id] = s.skill_name; });
    }

    (assessments || []).forEach(a => {
      assessmentMap[a.assessment_id] = {
        assessmentId: a.assessment_id,
        assessmentTitle: a.title,
        skillId: a.skill_id,
        skillName: skillMap[a.skill_id] || null,
        categoryId: a.skill_id,
        categoryName: skillMap[a.skill_id] || null,
      };
    });
  }

  const enriched = (attempts || []).map(a => ({
    ...toCamelCase(a),
    assessmentId: a.assessment_id,
    attemptedAt: a.started_at,
    score: a.correct_count ?? 0,
    totalPoints: a.total_questions ?? 0,
    result: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : a.status,
    isRetake: (a.fail_number || 0) > 1,
    assessmentInfo: assessmentMap[a.assessment_id] || null,
  }));

  const totalAttempts = enriched.length;
  const passedAttempts = enriched.filter(a => a.result === 'passed').length;
  const failedAttempts = enriched.filter(a => a.result === 'failed').length;
  const lastAttempt = enriched[0] || null;
  const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;

  res.json({
    data: enriched,
    stats: {
      totalAttempts,
      passedAttempts,
      failedAttempts,
      passRate,
      lastAttemptDate: lastAttempt?.attemptedAt || null,
      lastResult: lastAttempt?.result || null,
    },
    pagination: { total: totalAttempts },
  });
}

/**
 * GET /api/assessment-attempts/:userId
 * Attempt history across all assessments for a user.
 */
async function getUserAllAttempts(req, res) {
  req.params.assessmentId = 'all';
  return getAttemptHistory(req, res);
}

module.exports = {
  getSkillAttemptStats,
  getSkillAttempts,
  getAttemptHistory,
  getUserAllAttempts,
};
