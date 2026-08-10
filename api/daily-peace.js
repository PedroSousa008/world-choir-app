const {
  getOrAssignDailyAct,
  completeDailyAct,
  dismissDailyActNotification,
  resolveDate,
} = require('./_lib/daily-peace');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const deviceId = req.method === 'GET' ? req.query.deviceId : req.body?.deviceId;
    const date = resolveDate(
      req.method === 'GET' ? req.query.date : req.body?.date
    );
    const action = req.method === 'POST' ? (req.body?.action || 'complete') : null;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    if (req.method === 'GET') {
      const result = await getOrAssignDailyAct(deviceId, date);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      if (action === 'dismiss-notification') {
        const result = await dismissDailyActNotification(deviceId, date);
        return res.status(200).json(result);
      }

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
