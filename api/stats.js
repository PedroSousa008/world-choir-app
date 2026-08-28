const { getWorldChoirStats } = require('./_lib/world-choir-stats');
const { jsonStorageError } = require('./_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const eventId = req.query.eventId || 'world-choir-2027';
    const stats = await getWorldChoirStats(eventId);
    return res.status(200).json(stats);
  } catch (err) {
    console.error('api/stats error:', err);
    const payload = await jsonStorageError(err);
    return res.status(503).json(payload);
  }
};
