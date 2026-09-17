/**
 * Public first-party Cause engagement events (views / card clicks).
 * Does not invent metrics — only records real user actions.
 */
const { corsHeaders, getMembersSessionFromRequest } = require('./_lib/auth');
const { jsonStorageError } = require('./_lib/store');
const { recordCauseEvent } = require('./_lib/foundation-cause-analytics');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const foundationId = String(body.foundationId || '').trim();
    const causeId = String(body.causeId || '').trim();
    const type = String(body.type || body.eventType || '').trim();
    const visitorKey = String(body.visitorKey || body.deviceId || body.visitorId || '').trim();

    if (!foundationId || !causeId || !type || !visitorKey) {
      return res.status(400).json({ error: 'foundationId, causeId, type, and visitorKey are required' });
    }

    let isOwner = false;
    try {
      const session = getMembersSessionFromRequest(req);
      if (
        session?.role === 'influencer'
        && session?.influencerId
        && session.influencerId === foundationId
      ) {
        isOwner = true;
      }
    } catch {
      /* public track — session optional */
    }

    const result = await recordCauseEvent({
      foundationId,
      causeId,
      type,
      visitorKey,
      isOwner,
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Could not record event' });
    }

    return res.status(200).json({
      ok: true,
      recorded: result.recorded === true,
      reason: result.reason || null,
    });
  } catch (err) {
    console.error('api/foundation-cause-events error:', err);
    const payload = await jsonStorageError(err);
    return res.status(payload.statusCode || 500).json(payload);
  }
};
