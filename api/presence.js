const { recordPresenceHeartbeat, clearPresenceSession } = require('./_lib/voice-activity');
const { jsonStorageError } = require('./_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const action = String(body.action || 'heartbeat').trim();
    if (action === 'leave') {
      const result = await clearPresenceSession({
        deviceId,
        tabId: body.tabId || null,
      });
      return res.status(200).json(result);
    }

    const result = await recordPresenceHeartbeat({
      deviceId,
      tabId: body.tabId || null,
      timeZone: body.timeZone || 'UTC',
      localDate: body.localDate || null,
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err?.storageUnavailable || err?.code === 'STORAGE_UNAVAILABLE') {
      return jsonStorageError(res, err);
    }
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Presence update failed' });
  }
};
