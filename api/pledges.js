const { listPledges, mapPledgeRow } = require('./lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const eventId = req.query.eventId || 'world-choir-2027';
    const pledges = await listPledges(eventId);

    return res.status(200).json({
      pledges: pledges.map(mapPledgeRow),
    });
  } catch (err) {
    console.error('api/pledges error:', err);
    return res.status(503).json({ error: err.message || 'Service unavailable' });
  }
};
