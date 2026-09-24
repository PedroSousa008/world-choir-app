/**
 * Normalize uploaded images so every browser can display them.
 * Converts HEIC/HEIF (and opaque HEIC payloads) to JPEG before storage/serve.
 */
const convert = require('heic-convert');

const HEIC_MIME = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

function looksLikeHeic(buffer, contentType = '', fileName = '') {
  const mime = String(contentType || '').trim().toLowerCase();
  if (HEIC_MIME.has(mime)) return true;

  const name = String(fileName || '').toLowerCase();
  if (/\.(heic|heif)$/i.test(name)) return true;

  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  // ISO BMFF: bytes 4..7 = 'ftyp', then brand
  if (buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12).toLowerCase();
  return ['heic', 'heif', 'mif1', 'msf1', 'hevx', 'hevc'].includes(brand);
}

/**
 * Ensure buffer is a web-safe image. HEIC/HEIF → JPEG.
 * Returns { buffer, contentType, ext, converted }.
 */
async function normalizeUploadImage(buffer, {
  contentType = 'application/octet-stream',
  fileName = '',
  quality = 0.9,
} = {}) {
  let type = String(contentType || '').trim().toLowerCase();
  if (type === 'image/jpg') type = 'image/jpeg';

  if (!looksLikeHeic(buffer, type, fileName)) {
    let ext = 'img';
    if (type === 'image/jpeg') ext = 'jpg';
    else if (type === 'image/png') ext = 'png';
    else if (type === 'image/webp') ext = 'webp';
    else if (type === 'image/gif') ext = 'gif';
    else if (type === 'image/svg+xml') ext = 'svg';
    else if (type.startsWith('image/')) {
      ext = type.replace(/^image\//, '').replace(/[^a-z0-9]/gi, '') || 'img';
      if (ext === 'jpeg') ext = 'jpg';
    }
    return { buffer, contentType: type || 'application/octet-stream', ext, converted: false };
  }

  try {
    const output = await convert({
      buffer,
      format: 'JPEG',
      quality,
    });
    const jpeg = Buffer.isBuffer(output) ? output : Buffer.from(output);
    if (!jpeg.length) {
      throw new Error('HEIC conversion produced an empty image');
    }
    return {
      buffer: jpeg,
      contentType: 'image/jpeg',
      ext: 'jpg',
      converted: true,
    };
  } catch (err) {
    const error = new Error(
      'That HEIC/HEIF photo could not be converted. Please upload a JPG or PNG instead.'
    );
    error.statusCode = 400;
    error.cause = err;
    throw error;
  }
}

module.exports = {
  looksLikeHeic,
  normalizeUploadImage,
  HEIC_MIME,
};
