const supabase = require('../db/supabase');
const { toCamelCase } = require('../utilities/helpers');

async function checkIn(req, res) {
  const { matchId } = req.params;
  const { locationLat, locationLng } = req.body;

  const { data: match } = await supabase
    .from('job_matches')
    .select('*')
    .eq('job_match_id', matchId)
    .eq('status', 'accepted')
    .single();

  if (!match) return res.status(403).json({ error: 'No accepted match found for this ID' });

  const { data: existing } = await supabase
    .from('check_ins')
    .select('check_in_id')
    .eq('job_match_id', matchId)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.status(409).json({ error: 'A check-in already exists for this match' });
  }

  const { data, error } = await supabase
    .from('check_ins')
    .insert({
      job_match_id: matchId,
      client_id: match.client_id,
      user_id: match.user_id,
      location_lat: locationLat || null,
      location_lng: locationLng || null,
      checked_in_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ data: toCamelCase(data), message: 'Check-in recorded' });
}

async function getCheckInStatus(req, res) {
  const { id } = req.params;
  const { matchId } = req.query;

  let query = supabase.from('check_ins').select('*').eq('job_match_id', matchId || id);
  const { data, error } = await query
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data ? toCamelCase(data) : null });
}

module.exports = { checkIn, getCheckInStatus };
