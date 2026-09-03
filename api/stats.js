const { getWorldChoirStats, jsonStorageError } = require('./_lib/store');
const { getDailyActsCompletedTotal } = require('./_lib/daily-peace');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const eventId = req.query.eventId || 'world-choir-2027';
    const [stats, dailyActsCompleted] = await Promise.all([
      getWorldChoirStats(eventId),
      getDailyActsCompletedTotal(),
    ]);
    return res.status(200).json({
      ...stats,
      songs: 1,
      dailyActsCompleted,
    });
  } catch (err) {
    console.error('api/stats error:', err);
    const payload = await jsonStorageError(err);
    return res.status(503).json(payload);
  }
};
