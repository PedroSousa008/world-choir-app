/**
 * Partnership media cleanup:
 * - linkImage: crop baked-in black letterbox bars so the banner fills its box
 * - mapLogo / tabLogo: remove near-uniform solid backgrounds (e.g. green screen)
 *   and keep a transparent PNG so the Pass the World map shows through
 */
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const NEAR_BLACK = 18;
const BG_CORNER_AGREE = 55;
const BG_MATCH = 48;
const MAX_LOGO_EDGE = 1024;

function isPng(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47;
}

function isJpeg(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff;
}

function decodeRgba(buffer) {
  if (isPng(buffer)) {
    const png = PNG.sync.read(buffer);
    return {
      width: png.width,
      height: png.height,
      data: png.data, // RGBA
      from: 'png',
    };
  }
  if (isJpeg(buffer)) {
    const raw = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return {
      width: raw.width,
      height: raw.height,
      data: Buffer.from(raw.data),
      from: 'jpeg',
    };
  }
  return null;
}

function encodePng(width, height, data) {
  const png = new PNG({ width, height });
  Buffer.from(data).copy(png.data);
  return PNG.sync.write(png);
}

function encodeJpeg(width, height, data, quality = 90) {
  // jpeg-js expects RGB or RGBA; pass RGBA
  const encoded = jpeg.encode({ data: Buffer.from(data), width, height }, quality);
  return encoded.data;
}

function sample(data, width, height, x, y) {
  const sx = Math.max(0, Math.min(width - 1, x | 0));
  const sy = Math.max(0, Math.min(height - 1, y | 0));
  const i = (sy * width + sx) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function colorDist(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function rowMostlyColor(data, width, y, color, thresh, minRatio = 0.97) {
  let match = 0;
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const px = [data[i], data[i + 1], data[i + 2]];
    if (colorDist(px, color) <= thresh) match += 1;
  }
  return match / width >= minRatio;
}

function colMostlyColor(data, width, height, x, color, thresh, minRatio = 0.97) {
  let match = 0;
  for (let y = 0; y < height; y += 1) {
    const i = (y * width + x) * 4;
    const px = [data[i], data[i + 1], data[i + 2]];
    if (colorDist(px, color) <= thresh) match += 1;
  }
  return match / height >= minRatio;
}

/** Crop near-black (or uniform edge) letterbox / pillarbox bars. */
function cropLetterbox(rgba) {
  const { width, height, data } = rgba;
  if (width < 8 || height < 8) return null;

  const black = [0, 0, 0];
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  while (top < bottom && rowMostlyColor(data, width, top, black, NEAR_BLACK)) top += 1;
  while (bottom > top && rowMostlyColor(data, width, bottom, black, NEAR_BLACK)) bottom -= 1;
  while (left < right && colMostlyColor(data, width, height, left, black, NEAR_BLACK)) left += 1;
  while (right > left && colMostlyColor(data, width, height, right, black, NEAR_BLACK)) right -= 1;

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW < 8 || cropH < 8) return null;
  if (top === 0 && bottom === height - 1 && left === 0 && right === width - 1) return null;
  // Only crop when bars are meaningful (avoid trimming real dark content edges).
  const trimmed = (top + (height - 1 - bottom) + left + (width - 1 - right));
  if (trimmed < Math.max(12, Math.round(Math.min(width, height) * 0.04))) return null;

  const out = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y += 1) {
    const src = ((top + y) * width + left) * 4;
    out.set(data.subarray(src, src + cropW * 4), y * cropW * 4);
  }
  return { width: cropW, height: cropH, data: out };
}

function cornersAgreeOnBackground(rgba) {
  const { width, height, data } = rgba;
  const pts = [
    sample(data, width, height, 2, 2),
    sample(data, width, height, width - 3, 2),
    sample(data, width, height, 2, height - 3),
    sample(data, width, height, width - 3, height - 3),
    sample(data, width, height, width >> 1, 2),
    sample(data, width, height, width >> 1, height - 3),
    sample(data, width, height, 2, height >> 1),
    sample(data, width, height, width - 3, height >> 1),
  ];
  // Already transparent corners → keep as-is.
  const transparentCorners = pts.filter((p) => p[3] < 16).length;
  if (transparentCorners >= 3) return null;

  const opaque = pts.filter((p) => p[3] > 200);
  if (opaque.length < 4) return null;

  let maxPair = 0;
  for (let i = 0; i < opaque.length; i += 1) {
    for (let j = i + 1; j < opaque.length; j += 1) {
      maxPair = Math.max(maxPair, colorDist(opaque[i], opaque[j]));
    }
  }
  if (maxPair > BG_CORNER_AGREE) return null;

  const bg = [
    Math.round(opaque.reduce((s, p) => s + p[0], 0) / opaque.length),
    Math.round(opaque.reduce((s, p) => s + p[1], 0) / opaque.length),
    Math.round(opaque.reduce((s, p) => s + p[2], 0) / opaque.length),
  ];
  return bg;
}

function keyOutBackground(rgba, bg) {
  const { width, height, data } = rgba;
  const out = Buffer.from(data);
  let keyed = 0;
  for (let i = 0; i < out.length; i += 4) {
    const px = [out[i], out[i + 1], out[i + 2]];
    const d = colorDist(px, bg);
    if (d <= BG_MATCH) {
      // Soft edge so anti-aliased logo fringes don't keep a green halo.
      const alpha = d < BG_MATCH * 0.55
        ? 0
        : Math.round(255 * ((d - BG_MATCH * 0.55) / (BG_MATCH * 0.45)));
      out[i + 3] = Math.min(out[i + 3], alpha);
      if (out[i + 3] < 16) keyed += 1;
    }
  }
  const keyedRatio = keyed / (width * height);
  if (keyedRatio < 0.08 || keyedRatio > 0.97) return null;
  return { width, height, data: out, keyedRatio };
}

function downscaleIfHuge(rgba, maxEdge = MAX_LOGO_EDGE) {
  const { width, height, data } = rgba;
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return rgba;
  const scale = maxEdge / edge;
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < tw; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const si = (sy * width + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { width: tw, height: th, data: out };
}

/**
 * @param {Buffer} buffer
 * @param {{ field?: string, contentType?: string, fileName?: string }} opts
 * @returns {Promise<{ buffer: Buffer, contentType: string, ext: string, processed: boolean, reason?: string }>}
 */
async function processPartnershipImage(buffer, {
  field = '',
  contentType = '',
  fileName = '',
} = {}) {
  const decoded = decodeRgba(buffer);
  if (!decoded) {
    return {
      buffer,
      contentType: contentType || 'application/octet-stream',
      ext: String(fileName || '').split('.').pop() || 'img',
      processed: false,
      reason: 'unsupported',
    };
  }

  const kind = String(field || '').trim();

  if (kind === 'linkImage') {
    const cropped = cropLetterbox(decoded);
    if (!cropped) {
      // Re-encode HEIC-derived JPEGs as clean JPEG; keep png as png.
      if (decoded.from === 'png') {
        return {
          buffer: encodePng(decoded.width, decoded.height, decoded.data),
          contentType: 'image/png',
          ext: 'png',
          processed: false,
        };
      }
      return {
        buffer,
        contentType: contentType || 'image/jpeg',
        ext: 'jpg',
        processed: false,
      };
    }
    return {
      buffer: encodeJpeg(cropped.width, cropped.height, cropped.data, 90),
      contentType: 'image/jpeg',
      ext: 'jpg',
      processed: true,
      reason: 'letterbox-crop',
    };
  }

  if (kind === 'mapLogo' || kind === 'tabLogo') {
    let rgba = decoded;
    const bg = cornersAgreeOnBackground(rgba);
    let keyed = null;
    if (bg) keyed = keyOutBackground(rgba, bg);
    if (keyed) rgba = keyed;
    rgba = downscaleIfHuge(rgba);
    // Logos that need transparency (or already had it) ship as PNG.
    const needsPng = Boolean(keyed) || decoded.from === 'png';
    if (needsPng) {
      return {
        buffer: encodePng(rgba.width, rgba.height, rgba.data),
        contentType: 'image/png',
        ext: 'png',
        processed: Boolean(keyed) || rgba.width !== decoded.width || rgba.height !== decoded.height,
        reason: keyed ? 'background-keyed' : 'logo-png',
      };
    }
    return {
      buffer: encodeJpeg(rgba.width, rgba.height, rgba.data, 90),
      contentType: 'image/jpeg',
      ext: 'jpg',
      processed: rgba.width !== decoded.width || rgba.height !== decoded.height,
      reason: 'logo-downscale',
    };
  }

  return {
    buffer,
    contentType: contentType || 'application/octet-stream',
    ext: String(fileName || '').split('.').pop() || 'img',
    processed: false,
  };
}

function partnershipFieldFromPath(pathname = '') {
  const base = String(pathname || '').split('/').pop() || '';
  if (base.startsWith('linkImage-')) return 'linkImage';
  if (base.startsWith('mapLogo-')) return 'mapLogo';
  if (base.startsWith('tabLogo-')) return 'tabLogo';
  return '';
}

module.exports = {
  processPartnershipImage,
  partnershipFieldFromPath,
  cropLetterbox,
  keyOutBackground,
  cornersAgreeOnBackground,
};
