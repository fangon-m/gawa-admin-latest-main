const { SAFE_PATH, verifyAttachmentToken, downloadReportAttachment } = require('../utilities/reportAttachments');

const MAX_CACHED = 100;
const cache = new Map();

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

function contentTypeFor(path, blobType) {
  if (blobType && blobType !== 'application/octet-stream') return blobType;
  const extension = String(path).split('.').pop()?.toLowerCase();
  return CONTENT_TYPES[extension] || 'application/octet-stream';
}

/**
 * Serves an incident-report attachment as a browser-friendly image.
 *
 * Mobile uploads are HEIC (iPhone photos), which Chrome/Firefox/Edge cannot
 * render in an <img>. Convert HEIC/HEIF to JPEG on the way out; everything
 * else is streamed with its original content type. The signed URL is kept as
 * a client-side fallback if this endpoint is unavailable.
 */
async function getAttachment(req, res) {
  // <img> requests cannot carry the admin Bearer token, so the path is signed
  // by the reports API and verified here instead.
  const path = verifyAttachmentToken(req.query.token);
  if (!path || !SAFE_PATH.test(path)) {
    return res.status(401).json({ error: 'INVALID_ATTACHMENT_TOKEN' });
  }

  let cached = cache.get(path);
  if (!cached) {
    const found = await downloadReportAttachment(path);
    if (!found) return res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });

    const buffer = Buffer.from(await found.data.arrayBuffer());
    let body = buffer;
    let contentType = contentTypeFor(path, found.data.type);

    if (/\.hei[cf]$/i.test(path)) {
      try {
        const sharp = require('sharp');
        body = await sharp(buffer).jpeg({ quality: 82 }).toBuffer();
        contentType = 'image/jpeg';
      } catch (error) {
        console.warn('[Attachments] HEIC conversion failed, serving original:', error.message);
      }
    }

    cached = { body, contentType };
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
    cache.set(path, cached);
  }

  res.set('Content-Type', cached.contentType);
  res.set('Cache-Control', 'private, max-age=3600');
  return res.send(cached.body);
}

module.exports = { getAttachment };
