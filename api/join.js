const { joinWorldChoir, mapPledgeRow, jsonStorageError } = require('./_lib/store');
const { attributeVoiceCreated } = require('./_lib/qr-campaigns');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { deviceId, eventId, city, country, latitude, longitude, qrVisitorKey, qrAnonId } = req.body || {};

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

    // Best-effort QR / share attribution — never block join.
    try {
      await attributeVoiceCreated({
        deviceId,
        userId: pledge.user_id || pledge.userId,
        voiceNumber: pledge.voice_number ?? pledge.voiceNumber,
        eventId,
        visitorKey: qrVisitorKey || null,
        anonId: qrAnonId || null,
      });
    } catch (attrErr) {
      console.warn('qr attributeVoiceCreated:', attrErr?.message || attrErr);
    }

    return res.status(200).json({ pledge: mapPledgeRow(pledge) });
  } catch (err) {
    console.error('api/join error:', err);
    if (err.code === 'GEOCODE_FAILED' || err.code === 'LOCATION_MISMATCH') {
      return res.status(400).json({ error: err.message || 'Could not locate that city', code: err.code });
    }
    const payload = await jsonStorageError(err);
    return res.status(503).json(payload);
  }
};
