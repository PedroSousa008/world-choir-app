const {
  getOrAssignDailyAct,
  completeDailyAct,
  getUtcDateString,
} = require('./lib/daily-peace');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const deviceId = req.method === 'GET' ? req.query.deviceId : req.body?.deviceId;
    const date = req.method === 'GET'
      ? req.query.date || getUtcDateString()
      : req.body?.date || getUtcDateString();

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    if (req.method === 'GET') {
      const result = await getOrAssignDailyAct(deviceId, date);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const result = await completeDailyAct(deviceId, date);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/daily-peace error:', err);
    const message = err.message || 'Service unavailable';
    const status = message.includes('user not found') ? 404 : 503;
    return res.status(status).json({ error: message });
  }
};
