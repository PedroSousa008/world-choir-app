/**
 * Public map sponsor records for the World Choir Map sponsor bar.
 *
 * Returns only the public subset required for rendering. Private contract fields
 * are stored in Owner blob storage and never included here.
 */
const { corsHeaders } = require('./_lib/auth');
const { jsonStorageError } = require('./_lib/store');
const { loadActivePublicSponsors } = require('./_lib/map-sponsors-owner');

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sponsors = await loadActivePublicSponsors();
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(200).json({ sponsors });
  } catch (err) {
    console.error('api/map-sponsors error:', err);
    const payload = await jsonStorageError(err);
    const status = payload.storageUnavailable ? 503 : 500;
    return res.status(status).json(payload);
  }
};
