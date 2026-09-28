const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function enrichJobPosts(posts) {
  if (!posts || posts.length === 0) return [];
  const userIds = new Set();
  const postIds = posts.map(p => p.job_post_id);
  posts.forEach(p => { if (p.client_id) userIds.add(p.client_id); });

  const [userRes, skillsRes, matchRes] = await Promise.all([
    userIds.size > 0 ? supabase.from('users_table').select('id, first_name, last_name').in('id', [...userIds]) : { data: [] },
    postIds.length > 0 ? supabase.from('job_skills').select('job_post_id, skills(skill_name)').in('job_post_id', postIds) : { data: [] },
    postIds.length > 0 ? supabase.from('job_matches').select('job_post_id').in('job_post_id', postIds) : { data: [] },
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

  return posts.map(p => ({
    ...toCamelCase(p),
    clientName: userMap[p.client_id] || p.client_id,
    skills: skillsByPost[p.job_post_id] || [],
    matchCount: matchCount[p.job_post_id] || 0,
  }));
}

async function listJobPosts(req, res) {
  const { page = 1, limit = 20, jobStatus, clientId, search, hiringOption, participantId } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('job_posts').select('*', { count: 'exact' });
  if (jobStatus) query = query.eq('job_status', jobStatus);
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
  } else if (clientId || req.query.userId) {
    query = query.eq('client_id', clientId || req.query.userId);
  }
  if (search) query = query.or(`job_title.ilike.%${search}%,job_description.ilike.%${search}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });

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

  if (error) return res.status(500).json({ error: error.message });
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

    enrichedMatches = matches.map(m => ({
      ...toCamelCase(m),
      userName: userMap[m.user_id] || m.user_id,
    }));
  }

  const { data: flags } = await supabase
    .from('entity_flags')
    .select('*')
    .eq('entity_type', 'job_post')
    .eq('entity_id', req.params.id)
    .order('created_at', { ascending: false });

  const { data: completions } = await supabase
    .from('job_completion')
    .select('*')
    .eq('job_match_id', req.params.id)
    .order('created_at', { ascending: true });

  const enriched = await enrichJobPosts([post]);

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

  res.json({
    data: {
      ...enriched[0],
      matchCount: (matches || []).length,
      acceptedMatchId: acceptedMatch?.job_match_id || null,
      matches: enrichedMatches,
      flags: (flags || []).map(f => toCamelCase(f)),
      completions: (completions || []).map(c => toCamelCase(c)),
      checkIn: latestCheckIn,
    },
  });
}

async function flagJobPost(req, res) {
  const { data: existing } = await supabase
    .from('entity_flags')
    .select('flag_id')
    .eq('entity_type', 'job_post')
    .eq('entity_id', req.params.id)
    .limit(1);

  const { data: flag, error } = await supabase
    .from('entity_flags')
    .insert({
      entity_type: 'job_post',
      entity_id: req.params.id,
      flagged_by: req.user?.id || null,
      reason: req.body?.reason || 'Flagged by admin',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase
    .from('job_posts')
    .update({ job_status: 'flagged', updated_at: new Date().toISOString() })
    .eq('job_post_id', req.params.id);

  res.json({ data: toCamelCase(flag), message: 'Job post flagged' });
}

async function removeJobPost(req, res) {
  const { error } = await supabase.from('job_posts').delete().eq('job_post_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Job post removed' });
}

module.exports = { listJobs: listJobPosts, getJobById: getJobPostById, flagJob: flagJobPost, removeJob: removeJobPost };
