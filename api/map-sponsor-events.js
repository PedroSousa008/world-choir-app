/**
 * Public map sponsor bar analytics events (impressions + clicks).
 */
const { corsHeaders } = require('./_lib/auth');
const { jsonStorageError } = require('./_lib/store');
const { recordMapSponsorEvent } = require('./_lib/map-sponsors-analytics');

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      sponsorId,
      eventType,
      visitorId,
      country,
      city,
      latitude,
      longitude,
      eventId,
      destinationUrl,
    } = req.body || {};

    const result = await recordMapSponsorEvent({
      sponsorId,
      eventType,
      visitorId,
      country,
      city,
      latitude,
      longitude,
      eventId,
      destinationUrl,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('api/map-sponsor-events error:', err);
    const payload = await jsonStorageError(err);
    const message = err.message || 'Service unavailable';
    const status = payload.storageUnavailable
      ? 503
      : message.includes('not found') || message.includes('Invalid')
        ? 400
        : 500;
    return res.status(status).json(payload.error ? payload : { error: message });
  }
};
