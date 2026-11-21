const crypto = require('crypto');
const supabase = require('../db/supabase');

const SIGNING_SECRET = process.env.JWT_SECRET || 'report-attachments';
const TOKEN_TTL_MS = 60 * 60 * 1000;

const ATTACHMENT_BUCKETS = [...new Set([
  process.env.SUPABASE_REPORT_ATTACHMENTS_BUCKET,
  'issue-reports', 'report-attachments', 'attachments', 'reports',
].filter(Boolean))];

// Stored paths look like "<uuid>/<filename>.heic". Keep the allow-list narrow
// so this endpoint cannot be used to read arbitrary objects from the buckets.
const SAFE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+$/i;

async function downloadReportAttachment(path) {
  for (const bucket of ATTACHMENT_BUCKETS) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (!error && data) return { data, bucket };
    } catch {
      // Bucket may not exist — try the next candidate.
    }
  }
  return null;
}

function signAttachmentPath(path) {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${path}|${expires}`;
  const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}|${signature}`).toString('base64url');
}

function verifyAttachmentToken(token) {
  try {
    const decoded = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const [path, expires, signature] = decoded.split('|');
    if (!path || !expires || !signature || Date.now() > Number(expires)) return null;
    const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(`${path}|${expires}`).digest('hex');
    return signature === expected ? path : null;
  } catch {
    return null;
  }
}

module.exports = {
  ATTACHMENT_BUCKETS,
  SAFE_PATH,
  downloadReportAttachment,
  signAttachmentPath,
  verifyAttachmentToken,
};
