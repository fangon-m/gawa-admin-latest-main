const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');
const { createAuditLog } = require('../middleware/auditLogger');

async function listEscalatedJobs(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  const { data: posts, error, count } = await supabase
    .from('job_posts')
    .select('*', { count: 'exact' })
    .eq('job_status', 'escalated')
    .order('updated_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  if (!posts || posts.length === 0) {
    return res.json({ data: [], pagination: { total: 0, page: +page, limit: +limit, totalPages: 0 } });
  }

  const clientIds = [...new Set(posts.map(j => j.client_id))];
  const postIds = posts.map(j => j.job_post_id);

  const { data: matches } = await supabase
    .from('job_matches')
    .select('*')
    .in('job_post_id', postIds)
    .in('status', ['accepted']);

  const userIds = [...new Set([...clientIds, ...(matches || []).map(m => m.user_id)])];
  const { data: users } = await supabase
    .from('users_table')
    .select('id, first_name, last_name, email, phone, complete_address, role')
    .in('id', userIds);

  const userMap = {};
  (users || []).forEach(u => {
    userMap[u.id] = { name: getFullName(u), email: u.email, phone: u.phone, location: u.complete_address, role: u.role };
  });

  const matchByPost = {};
  (matches || []).forEach(m => {
    if (!matchByPost[m.job_post_id]) matchByPost[m.job_post_id] = [];
    matchByPost[m.job_post_id].push(toCamelCase(m));
  });

  const enriched = posts.map(post => {
    const clientInfo = userMap[post.client_id] || { name: post.client_id };
    const postMatches = matchByPost[post.job_post_id] || [];
    const accepted = postMatches[0] || null;
    return {
      ...toCamelCase(post),
      clientInfo,
      clientName: clientInfo.name,
      talentName: accepted ? (userMap[accepted.userId]?.name || accepted.userId) : null,
      talent: accepted ? { ...accepted, talentInfo: userMap[accepted.userId] || { name: accepted.userId } } : null,
      matches: postMatches,
    };
  });

  res.json({
    data: enriched,
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function resolveEscalatedJob(req, res) {
  const { id } = req.params;
  const { action, adminNote } = req.body;

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
  }
  if (!adminNote || !adminNote.trim()) {
    return res.status(400).json({ error: 'Admin note is required' });
  }

  const { data: post, error: postErr } = await supabase
    .from('job_posts')
    .select('*')
    .eq('job_post_id', id)
    .eq('job_status', 'escalated')
    .single();

  if (postErr || !post) {
    return res.status(404).json({ error: 'Escalated job post not found' });
  }

  const { data: acceptedMatch } = await supabase
    .from('job_matches')
    .select('*')
    .eq('job_post_id', id)
    .eq('status', 'accepted')
    .maybeSingle();

  const { data: clientProfile } = await supabase
    .from('users_table')
    .select('first_name, last_name, email')
    .eq('id', post.client_id)
    .single();

  let talentProfile = null;
  if (acceptedMatch) {
    const { data: tp } = await supabase
      .from('users_table')
      .select('first_name, last_name, email')
      .eq('id', acceptedMatch.user_id)
      .single();
    talentProfile = tp;
  }

  if (action === 'approve') {
    const { data: transaction, error: txnErr } = await supabase
      .from('transactions')
      .insert({
        type: 'job_payment',
        amount: acceptedMatch?.agreed_price || 0,
        status: 'completed',
        payment_method: 'wallet',
        user_id: acceptedMatch?.user_id || post.client_id,
        related_id: post.job_post_id,
        related_type: 'job_post',
        description: `Payment released for job "${post.job_title}" — escalated resolution approved by admin ${req.user.name}`,
        net_amount: acceptedMatch?.agreed_price || 0,
      })
      .select()
      .single();

    if (txnErr) {
      return res.status(500).json({ error: 'Failed to process payment: ' + txnErr.message });
    }

    const { data: updatedPost, error: updateErr } = await supabase
      .from('job_posts')
      .update({ job_status: 'finished', updated_at: new Date().toISOString() })
      .eq('job_post_id', id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    if (acceptedMatch) {
      await supabase.from('job_matches').update({ status: 'verified', updated_at: new Date().toISOString() }).eq('job_match_id', acceptedMatch.job_match_id);
    }

    await createAuditLog({
      agentId: req.user.id,
      agentName: req.user.name,
      action: 'approve_payment',
      module: 'escalated-jobs',
      targetId: id,
      targetType: 'job_post',
      description: `Approved payment release for escalated job "${post.job_title}". Note: ${adminNote.trim()}`,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });

    res.json({
      data: toCamelCase(updatedPost),
      message: `Payment approved for job "${post.job_title}". Funds released to ${talentProfile?.name || 'talent'}.`,
    });
  } else {
    const { data: updatedPost, error: updateErr } = await supabase
      .from('job_posts')
      .update({ job_status: 'flagged', updated_at: new Date().toISOString() })
      .eq('job_post_id', id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    await supabase.from('entity_flags').insert({
      entity_type: 'job_post',
      entity_id: id,
      flagged_by: req.user.id,
      reason: `Escalated job rejected: ${adminNote.trim()}`,
    });

    await createAuditLog({
      agentId: req.user.id,
      agentName: req.user.name,
      action: 'reject_investigation',
      module: 'escalated-jobs',
      targetId: id,
      targetType: 'job_post',
      description: `Rejected escalated job "${post.job_title}" — flagged for investigation. Note: ${adminNote.trim()}`,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });

    await supabase.from('notifications').insert({
      type: 'moderation_decision',
      title: 'Escalated Job Rejected',
      description: `Job "${post.job_title}" has been flagged for investigation. Admin note: ${adminNote.trim()}`,
      link: `/jobs/${id}`,
      actor_name: req.user.name,
    });

    res.json({
      data: toCamelCase(updatedPost),
      message: `Job "${post.job_title}" has been flagged for investigation. Both parties will be notified.`,
    });
  }
}

module.exports = { listEscalatedJobs, resolveEscalatedJob };
