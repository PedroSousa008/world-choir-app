const { joinWorldChoir, mapPledgeRow } = require('./lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { deviceId, eventId, city, country, latitude, longitude } = req.body || {};

    if (!deviceId || !eventId || !city || !country) {
      return res.status(400).json({ error: 'deviceId, eventId, city, and country are required' });
    }

    const pledge = await joinWorldChoir({
      deviceId,
      eventId,
      city,
      country,
      latitude,
      longitude,
    });

    return res.status(200).json({ pledge: mapPledgeRow(pledge) });
  } catch (err) {
    console.error('api/join error:', err);
    return res.status(503).json({ error: err.message || 'Service unavailable' });
  }
};
