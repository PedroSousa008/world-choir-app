const { corsHeaders } = require('./_lib/auth');
const { jsonStorageError } = require('./_lib/store');
const { getPublicCreatorFoundationsCatalog } = require('./_lib/members-store');

/**
 * Public Creator Foundations catalog for the Donate tab.
 * Built from Owner-created influencers + verified donations ledger.
 */
module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const catalog = await getPublicCreatorFoundationsCatalog();
    return res.status(200).json(catalog);
  } catch (err) {
    console.error('api/creator-foundations error:', err);
    const payload = await jsonStorageError(err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json(payload);
  }
};
