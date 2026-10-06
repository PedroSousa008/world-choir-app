/**
 * Public QR campaign tracking — scans, events, referrals.
 * Owner CRUD lives under /api/admin?action=qr-*
 */
const {
  publicOrigin,
  recordScan,
  recordEvent,
  openReferral,
  ensureReferralToken,
  readCampaign,
  EVENT_TYPES,
  makeVisitorKey,
} = require('./_lib/qr-campaigns');
const { assertBlobConfigured } = require('./_lib/store');

function readBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    assertBlobConfigured();
    const action = String(req.query?.action || readBody(req).action || '').trim();

    if (action === 'scan' && req.method === 'POST') {
      const body = readBody(req);
      const campaignId = String(body.campaignId || '').trim();
      const result = await recordScan({
        campaignId,
        deviceId: body.deviceId || null,
        anonId: body.anonId || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.status(200).json(result);
    }

    if (action === 'event' && req.method === 'POST') {
      const body = readBody(req);
      const type = String(body.type || '').trim();
      if (!Object.values(EVENT_TYPES).includes(type)) {
        return res.status(400).json({ error: 'Unknown event type' });
      }
      const result = await recordEvent({
        type,
        visitorKey: body.visitorKey || null,
        deviceId: body.deviceId || null,
        anonId: body.anonId || null,
        campaignId: body.campaignId || null,
        userId: body.userId || null,
        voiceNumber: body.voiceNumber ?? null,
        meta: body.meta || null,
      });
      return res.status(200).json(result);
    }

    if (action === 'referral-open' && req.method === 'POST') {
      const body = readBody(req);
      const token = String(body.token || body.ref || '').trim();
      const result = await openReferral(token, {
        deviceId: body.deviceId || null,
        anonId: body.anonId || null,
      });
      return res.status(200).json(result);
    }

    if (action === 'share-link' && req.method === 'POST') {
      const body = readBody(req);
      const result = await ensureReferralToken(
        body.visitorKey || null,
        body.deviceId || null,
        body.anonId || null
      );
      const origin = publicOrigin(req);
      return res.status(200).json({
        ok: true,
        token: result.token,
        url: `${origin}${result.urlPath}`,
        path: result.urlPath,
      });
    }

    if (action === 'resolve' && req.method === 'GET') {
      const campaignId = String(req.query.campaignId || '').trim();
      const campaign = await readCampaign(campaignId);
      // Archived campaigns remain resolvable so printed QR links keep working.
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      return res.status(200).json({
        ok: true,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          type: campaign.type,
        },
      });
    }

    if (action === 'visitor-key' && req.method === 'POST') {
      const body = readBody(req);
      return res.status(200).json({
        visitorKey: makeVisitorKey(body.deviceId, body.anonId),
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('api/qr error:', err);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'QR tracking failed' });
  }
};
