const { findUserByDevice, readPledge, mapPledgeRow } = require('./lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const deviceId = req.query.deviceId;
    const eventId = req.query.eventId || 'world-choir-2027';

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    const user = await findUserByDevice(deviceId);
    if (!user) {
      return res.status(200).json({ pledge: null });
    }

    const pledge = await readPledge(eventId, user.id);
    return res.status(200).json({ pledge: mapPledgeRow(pledge) });
  } catch (err) {
    console.error('api/my-pledge error:', err);
    return res.status(503).json({ error: err.message || 'Service unavailable' });
  }
};
