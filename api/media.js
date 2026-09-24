/**
 * Public proxy for private media stored in Vercel Blob.
 * Serves Foundation media and Daily Acts partnership logos.
 * HEIC/HEIF is converted to JPEG on the fly so every browser can display it.
 * Magic-byte sniffing fixes Blob metadata that sometimes stores image/jpeg as octet-stream.
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

function sniffImageContentType(buffer, fallback = 'application/octet-stream') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return fallback;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) return 'image/png';
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
  ) return 'image/gif';
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  if (buffer.toString('ascii', 0, 5) === '<?xml' || buffer.toString('ascii', 0, 4) === '<svg') {
    return 'image/svg+xml';
  }
  const typed = String(fallback || '').toLowerCase();
  if (typed.startsWith('image/')) return typed;
  return fallback;
}

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
      if (normalized.converted && /\.(heic|heif)$/i.test(pathname)) {
        const jpegPath = pathname.replace(/\.(heic|heif)$/i, '.jpg');
        putPrivateBinary(jpegPath, outBuffer, 'image/jpeg', { overwrite: true }).catch(() => {});
      }
    } else {
      outType = sniffImageContentType(outBuffer, outType);
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
