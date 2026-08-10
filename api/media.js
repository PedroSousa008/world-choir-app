/**
 * Public proxy for private Foundation media stored in Vercel Blob.
 * Only serves paths under wc-data/members/media/
 */
const { corsHeaders } = require('./_lib/auth');
const { readPrivateBinary } = require('./_lib/store');

const ALLOWED_PREFIX = 'wc-data/members/media/';

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pathname = String(req.query.path || '').trim();
    if (!pathname || pathname.includes('..') || !pathname.startsWith(ALLOWED_PREFIX)) {
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
