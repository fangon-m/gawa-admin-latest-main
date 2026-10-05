const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');
const { createAuditLog } = require('../middleware/auditLogger');

/**
 * Helper: get current date in Philippine Time (UTC+8) as YYYY-MM-DD
 */
function getPHDate(date = new Date()) {
  const phOffset = 8 * 60; // UTC+8 in minutes
  const local = new Date(date.getTime() + phOffset * 60 * 1000);
  return local.toISOString().split('T')[0]; // YYYY-MM-DD in PHT
}

/**
 * Helper: determine pass/fail based on score ratio (60% threshold)
 */
function determineResult(score, totalPoints) {
  if (totalPoints <= 0) return 'failed';
  return (score / totalPoints) >= 0.6 ? 'passed' : 'failed';
}

async function getSkillAttemptStats(req, res) {
  const { data, error } = await supabase.rpc('get_skill_assessment_attempt_stats');
  if (error) {
    console.error('[Assessment attempts] Failed to load skill statistics:', error.message);
    return res.status(500).json({ error: 'Unable to load assessment attempt statistics.' });
  }
  res.json({ data: (data || []).map(toCamelCase) });
}

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
 * Guard: check if a user has passed an assessment (for proposal gates)
 * Returns { passed: boolean, assessmentId: string|null }
 * Used by the proposals module to gate proposal submissions.
 */
async function checkAssessmentPassed(userId, categoryId) {
  // Find the latest completed assessment for this user+category
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, status, score, total_points')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .order('started_at', { ascending: false })
    .limit(1);

  if (!assessments || assessments.length === 0) {
    return { passed: false, assessmentId: null };
  }

  const latest = assessments[0];
  const result = determineResult(latest.score || 0, latest.total_points || 0);

  return {
    passed: result === 'passed' && latest.status === 'completed',
    assessmentId: latest.id,
  };
}

/**
 * Express middleware: gates proposal submission to users who passed their assessment.
 * Usage: router.post('/proposals', authenticate, requirePassedAssessment, proposalsCtrl.create);
 * Expects req.body to have { categoryId } or fetches from job's category.
 */
async function requirePassedAssessment(req, res, next) {
  const userId = req.user?.id;
  const categoryId = req.body?.categoryId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!categoryId) {
    return res.status(400).json({ error: 'categoryId is required to check assessment eligibility' });
  }

  const { passed } = await checkAssessmentPassed(userId, categoryId);
  if (!passed) {
    return res.status(403).json({
      error: 'You must pass the skills assessment for this category before submitting proposals.',
      code: 'ASSESSMENT_REQUIRED',
    });
  }

  next();
}

/**
 * POST /api/assessments/:id/submit (also at /api/assessment-attempts/submit)
 * Validates retake gating, then records the attempt and returns result.
 * Body: { userId, assessmentId, score, totalPoints }
 * - assessmentId from req.params.id if not in body
 * - Checks if user already has a failed attempt today (UTC+8)
 * - Checks for active retake override
 * - Returns 429 if blocked, 201 on success
 */
async function submitAttempt(req, res) {
  // Support both URL patterns: /api/assessments/:id/submit and /api/assessment-attempts/submit
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const userId = req.user.id;
  const assessmentId = req.params?.id || req.body.assessmentId;
  const { score, totalPoints } = req.body;

  if (!userId || !assessmentId) {
    return res.status(400).json({ error: 'userId and assessmentId are required' });
  }

  // Fetch the assessment to verify it exists
  const { data: assessment, error: asmtErr } = await supabase
    .from('assessments')
    .select('id, status')
    .eq('id', assessmentId)
    .single();

  if (asmtErr || !assessment) {
    return res.status(404).json({ error: 'Assessment not found' });
  }

  const todayPH = getPHDate();
  const result = determineResult(score || 0, totalPoints || 0);

  // --- RETAKEGATE: Check if already attempted today (failed) ---
  if (result === 'failed') {
    // Check for active retake override (admin exception)
    const now = new Date().toISOString();
    const { data: activeOverride } = await supabase
      .from('assessment_retake_overrides')
      .select('id, reason, granted_by')
      .eq('user_id', userId)
      .eq('assessment_id', assessmentId)
      .gte('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no active override, check for existing failed attempt today
    if (!activeOverride) {
      // Count failed attempts today in PHT
      const phStart = `${todayPH}T00:00:00+08:00`;
      const phEnd = `${todayPH}T23:59:59+08:00`;

      const { count, error: countErr } = await supabase
        .from('assessment_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('assessment_id', assessmentId)
        .eq('result', 'failed')
        .gte('attempted_at', phStart)
        .lte('attempted_at', phEnd);

      if (!countErr && count > 0) {
        return res.status(429).json({
          error: 'You can only retake once per day. Please try again tomorrow.',
          retryAfter: '24h',
          todayDate: todayPH,
        });
      }
    }
  }

  // Determine if this is a retake
  const { count: prevAttempts } = await supabase
    .from('assessment_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('assessment_id', assessmentId);

  const isRetake = (prevAttempts || 0) > 0;

  // Record the attempt
  const { data: attempt, error: insertErr } = await supabase
    .from('assessment_attempts')
    .insert({
      user_id: userId,
      assessment_id: assessmentId,
      attempted_at: new Date().toISOString(),
      score: score || 0,
      total_points: totalPoints || 0,
      result,
      is_retake: isRetake,
    })
    .select()
    .single();

  if (insertErr) {
    return res.status(500).json({ error: 'Failed to record attempt: ' + insertErr.message });
  }

  res.status(201).json({
    data: toCamelCase(attempt),
    result,
    passed: result === 'passed',
    message: result === 'passed'
      ? 'Assessment passed! You can now submit proposals.'
      : 'Assessment failed. You may retake once per calendar day (PHT).',
  });
}

/**
 * GET /api/assessment-attempts/:userId/:assessmentId
 * Returns full attempt history for a user on a given assessment.
 */
async function getAttemptHistory(req, res) {
  const { userId, assessmentId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Fetch attempts
  let query = supabase
    .from('assessment_attempts')
    .select('*')
    .eq('user_id', userId);

  if (assessmentId && assessmentId !== 'all') {
    query = query.eq('assessment_id', assessmentId);
  }

  const { data: attempts, error } = await query
    .order('attempted_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Enrich with assessment/category info
  const assessmentIds = [...new Set((attempts || []).map(a => a.assessment_id))];
  let assessmentMap = {};
  if (assessmentIds.length > 0) {
    const { data: assessments } = await supabase
      .from('assessments')
      .select('id, category_id')
      .in('id', assessmentIds);

    const categoryIds = [...new Set((assessments || []).map(a => a.category_id))];
    let categoryMap = {};
    if (categoryIds.length > 0) {
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', categoryIds);
      if (categories) {
        categories.forEach(c => { categoryMap[c.id] = c.name; });
      }
    }

    if (assessments) {
      assessments.forEach(a => {
        assessmentMap[a.id] = {
          categoryId: a.category_id,
          categoryName: categoryMap[a.category_id] || a.category_id,
        };
      });
    }
  }

  // Compute stats
  const totalAttempts = attempts?.length || 0;
  const passedAttempts = (attempts || []).filter(a => a.result === 'passed').length;
  const failedAttempts = totalAttempts - passedAttempts;
  const lastAttempt = attempts?.length > 0 ? attempts[0] : null;
  const passRate = totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;

  const enriched = (attempts || []).map(a => ({
    ...toCamelCase(a),
    assessmentInfo: assessmentMap[a.assessment_id] || null,
  }));

  res.json({
    data: enriched,
    stats: {
      totalAttempts,
      passedAttempts,
      failedAttempts,
      passRate,
      lastAttemptDate: lastAttempt?.attempted_at || null,
      lastResult: lastAttempt?.result || null,
    },
    pagination: { total: totalAttempts },
  });
}

/**
 * GET /api/assessment-attempts/:userId
 * Returns attempt history for all assessments for a user.
 */
async function getUserAllAttempts(req, res) {
  req.params.assessmentId = 'all';
  return getAttemptHistory(req, res);
}

/**
 * POST /api/assessment-attempts/:userId/grant-override
 * Admin grants a retake exception for a user on a specific assessment.
 * Body: { assessmentId, reason }
 */
async function grantRetakeOverride(req, res) {
  const { userId } = req.params;
  const { assessmentId, reason } = req.body;

  if (!assessmentId) {
    return res.status(400).json({ error: 'assessmentId is required' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason is required for granting a retake exception' });
  }

  // Verify user and assessment exist
  const { data: user } = await supabase
    .from('users_table')
    .select('id, first_name, last_name')
    .eq('id', userId)
    .single();

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userFullName = getFullName(user);

  const { data: assessment } = await supabase
    .from('assessments')
    .select('id')
    .eq('id', assessmentId)
    .single();

  if (!assessment) {
    return res.status(404).json({ error: 'Assessment not found' });
  }

  // Set expiry to end of today in PHT (UTC+8)
  const todayPH = getPHDate();
  const expiresAt = `${todayPH}T23:59:59+08:00`;

  // Insert the override
  const { data: override, error } = await supabase
    .from('assessment_retake_overrides')
    .insert({
      user_id: userId,
      assessment_id: assessmentId,
      granted_by: req.user.id,
      reason: reason.trim(),
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to grant retake exception: ' + error.message });
  }

  // Log the audit action
  await createAuditLog({
    agentId: req.user.id,
    agentName: req.user.name,
    action: 'grant_retake_exception',
    module: 'assessment-attempts',
    targetId: userId,
    targetType: 'user',
    description: `Granted retake exception for assessment ${assessmentId} to user ${userFullName}. Reason: ${reason.trim()}`,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
  });

  res.status(201).json({
    data: toCamelCase(override),
    message: `Retake exception granted for ${userFullName} until end of today (PHT).`,
  });
}

/**
 * GET /api/assessment-attempts/:userId/overrides
 * Returns all active overrides for a user
 */
async function getActiveOverrides(req, res) {
  const { userId } = req.params;
  const now = new Date().toISOString();

  const { data: overrides, error } = await supabase
    .from('assessment_retake_overrides')
    .select('*')
    .eq('user_id', userId)
    .gte('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Enrich with admin names
  const adminIds = [...new Set((overrides || []).map(o => o.granted_by))];
  let adminMap = {};
  if (adminIds.length > 0) {
    const { data: admins } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', adminIds);
    if (admins) {
      admins.forEach(a => { adminMap[a.id] = getFullName(a); });
    }
  }

  res.json({
    data: (overrides || []).map(o => ({
      ...toCamelCase(o),
      grantedByName: adminMap[o.granted_by] || o.granted_by,
    })),
  });
}

module.exports = {
  submitAttempt,
  getSkillAttemptStats,
  getSkillAttempts,
  getAttemptHistory,
  getUserAllAttempts,
  grantRetakeOverride,
  getActiveOverrides,
};
