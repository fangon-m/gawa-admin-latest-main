const supabase = require('../db/supabase');
const { toCamelCase, getFullName } = require('../utilities/helpers');

async function getSignedImageUrl(value) {
  if (!value) return value;

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const marker = '/storage/v1/object/';
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) return value;
    const objectPath = value.slice(markerIndex + marker.length).replace(/^\/?(public|sign|authenticated)\//, '');
    path = objectPath.replace(/^id-verifications\//, '');
  }

  const { data, error } = await supabase.storage
    .from('id-verifications')
    .createSignedUrl(path, 60 * 60);

  return error ? value : data?.signedUrl || value;
}

async function enrichVerifications(verifications) {
  if (!verifications || verifications.length === 0) return [];
  const userIds = new Set();
  verifications.forEach(v => {
    if (v.user_id) userIds.add(v.user_id);
    if (v.reviewed_by) userIds.add(v.reviewed_by);
  });

  let userMap = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from('users_table').select('id, first_name, last_name, role').in('id', [...userIds]);
    if (users) users.forEach(u => { userMap[u.id] = { ...u, fullName: getFullName(u) }; });
  }

  return Promise.all(verifications.map(async v => {
    const result = {
      id: v.verification_id,
      ...toCamelCase(v),
      userName: userMap[v.user_id]?.fullName || getFullName({
        first_name: v.first_name,
        middle_name: v.middle_name,
        last_name: v.last_name,
        email: v.email,
      }) || v.user_id,
      userRole: userMap[v.user_id]?.role || null,
      reviewerName: userMap[v.reviewed_by]?.fullName || (v.status !== 'pending' && !v.reviewed_by ? 'GAWA Admin' : null),
    };

    for (const field of ['frontImageUrl', 'backImageUrl', 'selfieImageUrl']) {
      result[field] = await getSignedImageUrl(result[field]);
    }

    return result;
  }));
}

async function listVerifications(req, res) {
  const { page = 1, limit = 20, status, type } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  let query = supabase.from('id_verifications').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('government_id_type', type);

  const { data, error, count } = await query
    .order('submitted_at', { ascending: false })
    .range(offset, offset + +limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data: await enrichVerifications(data || []),
    pagination: { total: count, page: +page, limit: +limit, totalPages: Math.ceil(count / +limit) },
  });
}

async function getVerificationById(req, res) {
  const { data: ver, error } = await supabase
    .from('id_verifications')
    .select('*')
    .eq('verification_id', req.params.id)
    .single();

  if (error || !ver) return res.status(404).json({ error: 'Verification not found' });
  const enriched = await enrichVerifications([ver]);
  res.json({ data: enriched[0] });
}

async function approveVerification(req, res) {
  const { remarks } = req.body;
  return reviewVerification(req, res, {
    status: 'approved',
    isVerified: true,
    remarks: remarks || null,
    message: 'Verification approved',
  });
}

async function rejectVerification(req, res) {
  const { remarks } = req.body;

  return reviewVerification(req, res, {
    status: 'rejected',
    isVerified: false,
    remarks,
    message: 'Verification rejected',
  });
}

async function reviewVerification(req, res, { status, isVerified, remarks, message }) {
  const reviewerId = req.user?.id && req.user.id !== 'local-admin' ? req.user.id : null;

  const { data: verification, error: verificationError } = await supabase
    .from('id_verifications')
    .select('verification_id, user_id')
    .eq('verification_id', req.params.id)
    .single();

  if (verificationError || !verification) return res.status(404).json({ error: 'Verification not found' });

  const { data: user, error: userLookupError } = await supabase
    .from('users_table')
    .select('is_verified')
    .eq('id', verification.user_id)
    .single();

  if (userLookupError || !user) return res.status(404).json({ error: 'User not found' });

  const { error: userUpdateError } = await supabase
    .from('users_table')
    .update({ is_verified: isVerified })
    .eq('id', verification.user_id);

  if (userUpdateError) return res.status(500).json({ error: userUpdateError.message });

  const { data, error } = await supabase
    .from('id_verifications')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
      rejection_reason: remarks,
    })
    .eq('verification_id', req.params.id)
    .select()
    .single();

  if (error || !data) {
    await supabase
      .from('users_table')
      .update({ is_verified: user.is_verified })
      .eq('id', verification.user_id);
    return res.status(error ? 500 : 404).json({ error: error?.message || 'Verification not found' });
  }

  const enriched = await enrichVerifications([data]);
  res.json({ data: enriched[0], message });
}

module.exports = { listVerifications, getVerificationById, approveVerification, rejectVerification };
