/**
 * Public Pass the World partnership analytics events
 * (impressions, link clicks, engagement heartbeats).
 */
const { corsHeaders } = require('./_lib/auth');
const { jsonStorageError } = require('./_lib/store');
const {
  recordPartnershipAnalyticsEvent,
} = require('./_lib/pass-the-world-partnership-analytics');
const { getPublicPartnership } = require('./_lib/pass-the-world-partnership');

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const publicPartner = await getPublicPartnership();
    if (!publicPartner?.enabled || !publicPartner.configurationId) {
      return res.status(200).json({ ok: true, skipped: 'partnership_off' });
    }

    // Never trust a client configurationId that does not match the live config.
    const configurationId = publicPartner.configurationId;
    if (body.configurationId && String(body.configurationId) !== configurationId) {
      return res.status(200).json({ ok: true, skipped: 'stale_configuration' });
    }

    const result = await recordPartnershipAnalyticsEvent({
      eventType: body.eventType,
      configurationId,
      visitorId: body.visitorId,
      country: body.country,
      city: body.city,
      engagedMs: body.engagedMs,
      clientNow: body.clientNow,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('api/ptw-partnership-events error:', err);
    const payload = await jsonStorageError(err);
    const message = err.message || 'Service unavailable';
    const status = payload.storageUnavailable
      ? 503
      : (err.statusCode || (message.includes('Invalid') || message.includes('required') ? 400 : 500));
    return res.status(status).json(payload.error ? payload : { error: message });
  }
};
