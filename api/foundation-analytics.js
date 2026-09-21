/**
 * Public Foundation analytics events (page views, funnel, project engagement).
 * Consent is enforced on the client; this endpoint only validates and stores.
 */
const { corsHeaders } = require('./_lib/auth');
const { jsonStorageError } = require('./_lib/store');
const { recordFoundationAnalyticsEvent } = require('./_lib/foundation-page-analytics');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const result = await recordFoundationAnalyticsEvent({
      foundationId: body.foundationId,
      eventType: body.eventType,
      visitorId: body.visitorId,
      projectId: body.projectId,
      projectTitle: body.projectTitle,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('api/foundation-analytics error:', err);
    const payload = await jsonStorageError(err);
    const code = err.code || '';
    const status = payload.storageUnavailable
      ? 503
      : code === 'NOT_FOUND'
        ? 404
        : code === 'INVALID'
          ? 400
          : 500;
    return res.status(status).json(payload.error ? payload : { error: err.message || 'Request failed' });
  }
};
