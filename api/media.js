/**
 * Public proxy for private media stored in Vercel Blob.
 * Serves Foundation media and Daily Acts partnership logos.
 */
const { corsHeaders } = require('./_lib/auth');
const { readPrivateBinary } = require('./_lib/store');

const ALLOWED_PREFIXES = [
  'wc-data/members/media/',
  'wc-data/daily-peace/partnerships/media/',
  'wc-data/map-sponsors/media/',
  'wc-data/memory/',
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
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('api/media error:', err);
    return res.status(404).json({ error: 'Media not found' });
  }
};
