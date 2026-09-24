/**
 * Public proxy for private media stored in Vercel Blob.
 * Serves Foundation media and Daily Acts partnership logos.
 * HEIC/HEIF is converted to JPEG on the fly so every browser can display it.
 */
const { corsHeaders } = require('./_lib/auth');
const { readPrivateBinary, putPrivateBinary } = require('./_lib/store');
const { looksLikeHeic, normalizeUploadImage } = require('./_lib/normalize-upload-image');

const ALLOWED_PREFIXES = [
  'wc-data/members/media/',
  'wc-data/daily-peace/partnerships/media/',
  'wc-data/map-sponsors/media/',
  'wc-data/pass-the-world/partnership/media/',
  'wc-data/memory/',
  'wc-data/world-chain/photo-book/',
];

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pathname = String(req.query.path || '').trim();
    const allowed = ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (!pathname || pathname.includes('..') || !allowed) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const { buffer, contentType } = await readPrivateBinary(pathname);
    let outBuffer = buffer;
    let outType = contentType || 'application/octet-stream';

    if (looksLikeHeic(buffer, outType, pathname)) {
      const normalized = await normalizeUploadImage(buffer, {
        contentType: outType,
        fileName: pathname,
      });
      outBuffer = normalized.buffer;
      outType = normalized.contentType;

      // Best-effort: persist a JPEG sibling so later requests stay fast.
      // Keep serving even if rewrite fails.
      if (normalized.converted && /\.(heic|heif)$/i.test(pathname)) {
        const jpegPath = pathname.replace(/\.(heic|heif)$/i, '.jpg');
        putPrivateBinary(jpegPath, outBuffer, outType, { overwrite: true }).catch(() => {});
      }
    }

    res.setHeader('Content-Type', outType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Length', outBuffer.length);
    return res.status(200).send(outBuffer);
  } catch (err) {
    console.error('api/media error:', err);
    return res.status(404).json({ error: 'Media not found' });
  }
};
