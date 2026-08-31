const { jsonStorageError } = require('./_lib/store');
const { getPassTheWorld, submitInvitation } = require('./_lib/pass-the-world');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const deviceId = String(req.query?.deviceId || '').trim() || null;
      const eventId = String(req.query?.eventId || 'world-choir-2027').trim();
      const now = req.query?.now ? String(req.query.now) : null;
      const data = await getPassTheWorld({ deviceId, eventId, now });
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const deviceId = String(body.deviceId || '').trim();
      const eventId = String(body.eventId || 'world-choir-2027').trim();
      const action = String(body.action || 'invite').trim();
      const now = body.now ? String(body.now) : null;

      if (action !== 'invite') {
        return res.status(400).json({ error: 'Unsupported action.' });
      }

      const result = await submitInvitation({ deviceId, eventId, now });
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/pass-the-world error:', err);
    if (err?.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({ error: err.message || 'Request failed' });
    }
    const payload = await jsonStorageError(err);
    return res.status(err?.statusCode || 503).json(payload);
  }
};
