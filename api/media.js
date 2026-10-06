/**
 * Public proxy for private media stored in Vercel Blob.
 * Serves Foundation media and Daily Acts partnership logos.
 * HEIC/HEIF is converted to JPEG on the fly so every browser can display it.
 * Pass the World partnership images are cleaned on serve:
 *   - linkImage: crop baked-in black letterbox bars
 *   - mapLogo / tabLogo: key out solid backgrounds → transparent PNG
 */
const { corsHeaders } = require('./_lib/auth');
const { readPrivateBinary, putPrivateBinary } = require('./_lib/store');
const { looksLikeHeic, normalizeUploadImage } = require('./_lib/normalize-upload-image');
const {
  processPartnershipImage,
  partnershipFieldFromPath,
} = require('./_lib/partnership-image-process');

const ALLOWED_PREFIXES = [
  'wc-data/members/media/',
  'wc-data/daily-peace/partnerships/media/',
  'wc-data/map-sponsors/media/',
  'wc-data/pass-the-world/partnership/media/',
  'wc-data/memory/',
  'wc-data/world-chain/photo-book/',
];

const PTW_MEDIA_PREFIX = 'wc-data/pass-the-world/partnership/media/';

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

function processedSiblingPath(pathname, field) {
  const base = String(pathname || '').replace(/\.(heic|heif|jpe?g|png|webp)$/i, '');
  if (field === 'linkImage') return `${base}.fit.jpg`;
  if (field === 'mapLogo' || field === 'tabLogo') return `${base}.keyed.png`;
  return null;
}

async function tryReadBinary(pathname) {
  try {
    const cached = await readPrivateBinary(pathname);
    if (cached?.buffer?.length) return cached;
  } catch { /* miss */ }
  return null;
}

function sendImage(res, buffer, contentType) {
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
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

    const ptwField = pathname.startsWith(PTW_MEDIA_PREFIX)
      ? partnershipFieldFromPath(pathname)
      : '';

    // Prefer already-cleaned partnership siblings (covers live assets without re-upload).
    if (ptwField) {
      const sibling = processedSiblingPath(pathname, ptwField);
      if (sibling) {
        const cleaned = await tryReadBinary(sibling);
        if (cleaned) {
          const type = ptwField === 'linkImage' ? 'image/jpeg' : 'image/png';
          return sendImage(res, cleaned.buffer, cleaned.contentType || type);
        }
      }
    }

    // Prefer a previously converted JPEG sibling for HEIC so cold paints stay fast.
    if (/\.(heic|heif)$/i.test(pathname)) {
      const jpegPath = pathname.replace(/\.(heic|heif)$/i, '.jpg');
      const cached = await tryReadBinary(jpegPath);
      if (cached) {
        // Still run partnership cleanup below from this buffer.
        let outBuffer = cached.buffer;
        let outType = 'image/jpeg';
        if (ptwField) {
          try {
            const processed = await processPartnershipImage(outBuffer, {
              field: ptwField,
              contentType: outType,
              fileName: pathname,
            });
            if (processed.processed) {
              outBuffer = processed.buffer;
              outType = processed.contentType;
              const sibling = processedSiblingPath(pathname, ptwField);
              if (sibling) {
                putPrivateBinary(sibling, outBuffer, outType, { overwrite: true }).catch(() => {});
              }
            }
          } catch (err) {
            console.warn('partnership media process skipped:', err?.message || err);
          }
        }
        return sendImage(res, outBuffer, outType);
      }
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

      if (normalized.converted && /\.(heic|heif)$/i.test(pathname)) {
        const jpegPath = pathname.replace(/\.(heic|heif)$/i, '.jpg');
        putPrivateBinary(jpegPath, outBuffer, 'image/jpeg', { overwrite: true }).catch(() => {});
      }
    } else {
      outType = sniffImageContentType(outBuffer, outType);
    }

    if (ptwField) {
      try {
        const processed = await processPartnershipImage(outBuffer, {
          field: ptwField,
          contentType: outType,
          fileName: pathname,
        });
        if (processed.processed) {
          outBuffer = processed.buffer;
          outType = processed.contentType;
          const sibling = processedSiblingPath(pathname, ptwField);
          if (sibling) {
            putPrivateBinary(sibling, outBuffer, outType, { overwrite: true }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('partnership media process skipped:', err?.message || err);
      }
    }

    return sendImage(res, outBuffer, outType || 'application/octet-stream');
  } catch (err) {
    console.error('api/media error:', err);
    return res.status(404).json({ error: 'Media not found' });
  }
};
