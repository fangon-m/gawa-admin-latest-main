const supabase = require('../db/supabase');
const { toCamelCase, getFullName, calculatePagination, sanitizeSearchTerm, sanitizeEntityFilter, sendError } = require('../utilities/helpers');
const { getArchivedUserIds, applyArchivedOwnerFilter } = require('../utilities/visibility');
const { logAdminActivity } = require('../utilities/activityLogger');

async function enrichJobPosts(posts) {
  if (!posts || posts.length === 0) return [];
  const userIds = new Set();
  const postIds = posts.map(p => p.job_post_id);
  posts.forEach(p => { if (p.client_id) userIds.add(p.client_id); });

  const [userRes, skillsRes, matchRes, flagRes] = await Promise.all([
    userIds.size > 0 ? supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]) : { data: [] },
    postIds.length > 0 ? supabase.from('job_skills').select('job_post_id, skills(skill_name)').in('job_post_id', postIds) : { data: [] },
    postIds.length > 0 ? supabase.from('job_matches').select('job_post_id').in('job_post_id', postIds) : { data: [] },
    postIds.length > 0
      ? supabase.from('entity_flags').select('entity_id, status').eq('entity_type', 'job_post').in('entity_id', postIds)
      : { data: [] },
  ]);

  const userMap = {};
  (userRes.data || []).forEach(u => { userMap[u.id] = getFullName(u); });
  const skillsByPost = {};
  (skillsRes.data || []).forEach(js => {
    if (!skillsByPost[js.job_post_id]) skillsByPost[js.job_post_id] = [];
    if (js.skills?.skill_name) skillsByPost[js.job_post_id].push(js.skills.skill_name);
  });
  const matchCount = {};
  (matchRes.data || []).forEach(m => { matchCount[m.job_post_id] = (matchCount[m.job_post_id] || 0) + 1; });
  const openFlagCount = {};
  (flagRes.data || []).forEach(f => {
    if (f.status && f.status !== 'open') return;
    openFlagCount[f.entity_id] = (openFlagCount[f.entity_id] || 0) + 1;
  });

  return posts.map(p => ({
    ...toCamelCase(p),
    clientName: userMap[p.client_id] || p.client_id,
    skills: skillsByPost[p.job_post_id] || [],
    matchCount: matchCount[p.job_post_id] || 0,
    openFlagCount: openFlagCount[p.job_post_id] || 0,
  }));
}

async function listJobPosts(req, res) {
  const { page, limit, offset } = calculatePagination(req.query.page, req.query.limit);
  const { jobStatus, hiringOption } = req.query;

  // "flagged" is moderation state (open entity flags), not a lifecycle status.
  const moderationFlagged = jobStatus === 'flagged';

  // `participantId` is interpolated into a PostgREST `or(...)` filter, so it
  // must be a well-formed identifier. Anything else is rejected outright: a
  // partial match would silently widen the filter, and a crafted value could
  // inject extra predicates into the expression.
  const participantId = sanitizeEntityFilter(req.query.participantId);
  if (req.query.participantId && !participantId) {
    return res.status(400).json({ error: 'Invalid participantId' });
  }
  const clientId = sanitizeEntityFilter(req.query.clientId || req.query.userId);
  if ((req.query.clientId || req.query.userId) && !clientId) {
    return res.status(400).json({ error: 'Invalid clientId' });
  }

  // Normalised before it reaches the PostgREST filter expression.
  const search = sanitizeSearchTerm(req.query.search);

  // Owner-scoped requests (user detail history) must still show archived accounts.
  const ownerScoped = Boolean(clientId || participantId);

  let flaggedPostIds = null;
  if (moderationFlagged) {
    const { data: flaggedRows, error: flaggedErr } = await supabase
      .from('entity_flags')
      .select('entity_id')
      .eq('entity_type', 'job_post')
      .or('status.eq.open,status.is.null');
    if (flaggedErr) return sendError(res, flaggedErr, { status: 500 });
    flaggedPostIds = [...new Set((flaggedRows || []).map(r => r.entity_id).filter(Boolean))];
    if (flaggedPostIds.length === 0) {
      return res.json({
        data: [],
        pagination: { total: 0, page: +page, limit: +limit, totalPages: 0 },
      });
    }
  }

  const runQuery = async (useArchiveMarker) => {
    let query = supabase.from('job_posts').select('*', { count: 'exact' });
    if (jobStatus && !moderationFlagged) query = query.eq('job_status', jobStatus);
    if (moderationFlagged) query = query.in('job_post_id', flaggedPostIds);
    if (hiringOption) query = query.eq('hiring_option', hiringOption);
    if (participantId) {
      const { data: matches } = await supabase
        .from('job_matches')
        .select('job_post_id')
        .or(`client_id.eq.${participantId},user_id.eq.${participantId}`);
      const postIds = [...new Set((matches || []).map(m => m.job_post_id))];
      if (postIds.length > 0) {
        query = query.in('job_post_id', postIds);
      } else {
        query = query.eq('client_id', participantId);
      }
    } else if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (search) query = query.or(`job_title.ilike.%${search}%,job_description.ilike.%${search}%`);
    if (!ownerScoped) {
      const archivedUserIds = await getArchivedUserIds();
      query = applyArchivedOwnerFilter(query, 'client_id', archivedUserIds, useArchiveMarker ? 'client_archived_at' : null);
    }

    return query
      .order('created_at', { ascending: false })
      .range(offset, offset + +limit - 1);
  };

  let { data, error, count } = await runQuery(true);
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    // Older database without the owner archive marker: retry without it.
    ({ data, error, count } = await runQuery(false));
  }

  if (error) return sendError(res, error, { status: 500 });

  const enriched = await enrichJobPosts(data || []);

  if (hiringOption === 'contractor_based' && enriched.length > 0) {
    const postIds = data.map(p => p.job_post_id);
    const { data: matches } = await supabase
      .from('job_matches')
      .select('*')
      .in('job_post_id', postIds)
      .eq('status', 'accepted');

    const userIds = [...new Set((matches || []).map(m => m.user_id))];
    const userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users_table')
        .select('id, first_name, last_name')
        .in('id', userIds);
      if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });
    }

    const acceptedByPost = {};
    (matches || []).forEach(m => {
      if (!acceptedByPost[m.job_post_id]) {
        acceptedByPost[m.job_post_id] = {
          contractorName: userMap[m.user_id] || 'Unknown',
          amount: m.agreed_price,
        };
      }
    });

    for (const post of enriched) {
      const accepted = acceptedByPost[post.jobPostId];
      post.contractorName = accepted?.contractorName || null;
      post.contractorBid = accepted?.amount || null;
    }
  }

  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getJobPostById(req, res) {
  const postId = req.params.id;

  const { data: post, error } = await supabase
    .from('job_posts')
    .select('*')
    .eq('job_post_id', postId)
    .maybeSingle();

  if (error) return sendError(res, error, { status: 500 });
  if (!post) return res.status(404).json({ error: 'Job post not found' });

  const { data: matches } = await supabase
    .from('job_matches')
    .select('*')
    .eq('job_post_id', req.params.id)
    .order('matched_at', { ascending: false });

  let enrichedMatches = [];
  if (matches && matches.length > 0) {
    const userIds = [...new Set(matches.map(m => m.user_id))];
    const { data: users } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', userIds);
    const userMap = {};
    if (users) users.forEach(u => { userMap[u.id] = getFullName(u); });

    // GP spent to submit a proposal is recorded in the points ledger as a
    // negative `proposal_charge` row keyed by proposal_id. The legacy
    // job_matches.connections column is null for newer matches, so derive the
    // figure from the ledger and keep the column as a fallback.
    const proposalIds = [...new Set(matches.map(m => m.proposal_id).filter(Boolean))];
    const { data: charges } = proposalIds.length
      ? await supabase
        .from('gawa_points_transactions')
        .select('proposal_id, amount')
        .eq('transaction_type', 'proposal_charge')
        .in('proposal_id', proposalIds)
      : { data: [] };
    const gpByProposal = {};
    (charges || []).forEach(charge => {
      if (!charge.proposal_id) return;
      gpByProposal[charge.proposal_id] = (gpByProposal[charge.proposal_id] || 0) + Math.abs(charge.amount);
    });

    enrichedMatches = matches.map(m => ({
      ...toCamelCase(m),
      userName: userMap[m.user_id] || m.user_id,
      gpUsed: gpByProposal[m.proposal_id] ?? m.connections ?? null,
    }));
  }

  const { data: flags } = await supabase
    .from('entity_flags')
    .select('*')
    .eq('entity_type', 'job_post')
    .eq('entity_id', req.params.id)
    .order('created_at', { ascending: false });

  const flaggerIds = [...new Set((flags || []).map(f => f.flagged_by).filter(Boolean))];
  const resolverIds = [...new Set((flags || []).map(f => f.resolved_by).filter(Boolean))];
  const flagUserIds = [...new Set([...flaggerIds, ...resolverIds])];
  let flagUserMap = {};
  if (flagUserIds.length > 0) {
    const { data: flagUsers } = await supabase
      .from('users_table')
      .select('id, first_name, last_name')
      .in('id', flagUserIds);
    (flagUsers || []).forEach(u => { flagUserMap[u.id] = getFullName(u); });
  }

  // A completion belongs to a job *match*, not to the job post. Filtering
  // `job_completion` by the post id compares two different keys, so it never
  // matches a row and the completions tab is always empty. The completions
  // for a job are the ones recorded against any of the job's matches.
  const matchIds = (matches || []).map((m) => m.job_match_id);
  const { data: completions } = matchIds.length
    ? await supabase
      .from('job_completion')
      .select('*')
      .in('job_match_id', matchIds)
      .order('created_at', { ascending: true })
    : { data: [] };

  const enriched = await enrichJobPosts([post]);

  // Name the worker each completion came from: a job can have several
  // matches, and a bare completion record says nothing about who submitted it.
  const talentNameByMatch = new Map(enrichedMatches.map((m) => [m.jobMatchId, m.userName]));
  const statusByMatch = new Map((matches || []).map((m) => [m.job_match_id, m.status]));
  const enrichedCompletions = (completions || []).map((c) => ({
    ...toCamelCase(c),
    matchId: c.job_match_id,
    talentName: talentNameByMatch.get(c.job_match_id) || null,
    matchStatus: statusByMatch.get(c.job_match_id) || null,
  }));

  let latestCheckIn = null;
  const acceptedMatch = (matches || []).find(m => m.status === 'accepted');
  if (acceptedMatch) {
    const { data: ci } = await supabase
      .from('check_ins')
      .select('*')
      .eq('job_match_id', acceptedMatch.job_match_id)
      .order('checked_in_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ci) latestCheckIn = toCamelCase(ci);
  }

  const mappedFlags = (flags || []).map(f => ({
    ...toCamelCase(f),
    flaggedByName: flagUserMap[f.flagged_by] || null,
    resolvedByName: flagUserMap[f.resolved_by] || null,
  }));
  const openFlags = mappedFlags.filter(f => !f.status || f.status === 'open');

  res.json({
    data: {
      ...enriched[0],
      matchCount: (matches || []).length,
      acceptedMatchId: acceptedMatch?.job_match_id || null,
      matches: enrichedMatches,
      flags: mappedFlags,
      openFlagCount: openFlags.length,
      flagCount: mappedFlags.length,
      moderationStatus: openFlags.length > 0 ? 'flagged' : 'clear',
      completions: enrichedCompletions,
      checkIn: latestCheckIn,
    },
  });
}

async function flagJobPost(req, res) {
  const jobId = req.params.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required to flag a job post' });
  }

  const { data: post, error: postErr } = await supabase
    .from('job_posts')
    .select('job_post_id, job_title')
    .eq('job_post_id', jobId)
    .maybeSingle();
  if (postErr) return sendError(res, postErr, { status: 500 });
  if (!post) return res.status(404).json({ error: 'Job post not found' });

  const { data: existing, error: existingErr } = await supabase
    .from('entity_flags')
    .select('flag_id')
    .eq('entity_type', 'job_post')
    .eq('entity_id', jobId)
    .or('status.eq.open,status.is.null')
    .limit(1);
  if (existingErr) return sendError(res, existingErr, { status: 500 });
  if (existing && existing.length > 0) {
    return res.status(409).json({ error: 'This job post already has an open flag' });
  }

  const { data: flag, error } = await supabase
    .from('entity_flags')
    .insert({
      entity_type: 'job_post',
      entity_id: jobId,
      flagged_by: req.user?.id || null,
      reason,
      status: 'open',
    })
    .select()
    .single();

  if (error) return sendError(res, error, { status: 500 });

  logAdminActivity({
    actorId: req.user?.id,
    activityType: 'content_flagged',
    category: 'job',
    relatedJobPostId: jobId,
    description: `Admin flagged job post "${post.job_title || jobId}": ${reason}`,
  });

  res.json({ data: toCamelCase(flag), message: 'Job post flagged' });
}

async function removeJobPost(req, res) {
  const { error } = await supabase.from('job_posts').delete().eq('job_post_id', req.params.id);
  if (error) return sendError(res, error, { status: 500 });
  res.json({ message: 'Job post removed' });
}

module.exports = { listJobs: listJobPosts, getJobById: getJobPostById, flagJob: flagJobPost, removeJob: removeJobPost };
