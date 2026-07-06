const { ensureUser } = require('./lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { deviceId } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    const user = await ensureUser(deviceId);

    return res.status(200).json({
      user: {
        id: user.id,
        anonymous_device_id: user.anonymous_device_id,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('api/user error:', err);
    return res.status(503).json({ error: err.message || 'Service unavailable' });
  }
};
