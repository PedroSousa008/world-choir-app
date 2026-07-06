const { findUserByDevice, savePromise } = require('./lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      deviceId,
      eventId,
      promiseText,
      city,
      country,
      voiceNumber,
      voiceName,
    } = req.body || {};

    if (!deviceId || !eventId || !promiseText) {
      return res.status(400).json({ error: 'deviceId, eventId, and promiseText are required' });
    }

    const user = await findUserByDevice(deviceId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const promise = await savePromise({
      userId: user.id,
      eventId,
      promiseText,
      city,
      country,
      voiceNumber,
      voiceName,
    });

    return res.status(200).json({ promise });
  } catch (err) {
    console.error('api/promise error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save promise' });
  }
};
