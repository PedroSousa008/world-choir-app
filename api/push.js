/**
 * Public push subscription API — register / unregister / VAPID public key.
 * POST /api/push  { action, deviceId, ... }
 * GET  /api/push?action=vapid-public-key
 */
const { ensureUser, jsonStorageError } = require('./_lib/store');
const {
  upsertWebPushSubscription,
  upsertExpoPushToken,
  disableSubscription,
  getAudienceReachSummary,
} = require('./_lib/push-subscriptions');
const { getProviderStatus, vapidConfigured } = require('./_lib/push-provider');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const action = req.method === 'GET'
      ? String(req.query.action || '')
      : String(req.body?.action || '');

    if (req.method === 'GET' && (action === 'vapid-public-key' || action === 'status')) {
      const status = getProviderStatus();
      return res.status(200).json({
        configured: vapidConfigured(),
        publicKey: status.vapidPublicKey,
        dispatchEnabled: status.dispatchEnabled,
        providers: status.providers,
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body || {};
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId && action !== 'reach-summary') {
      return res.status(400).json({ error: 'deviceId required' });
    }

    if (action === 'subscribe-web') {
      if (!vapidConfigured()) {
        return res.status(503).json({ error: 'Web push is not configured on the server yet.' });
      }
      const user = await ensureUser(deviceId);
      const sub = await upsertWebPushSubscription({
        deviceId,
        userId: user.id,
        subscription: body.subscription,
        timezone: body.timezone,
        locale: body.locale,
        role: body.role === 'owner_test' ? 'owner_test' : 'voice',
      });
      return res.status(200).json({ ok: true, subscription: sub });
    }

    if (action === 'subscribe-expo') {
      const user = await ensureUser(deviceId);
      const sub = await upsertExpoPushToken({
        deviceId,
        userId: user.id,
        expoPushToken: body.expoPushToken,
        platform: body.platform,
        timezone: body.timezone,
        locale: body.locale,
        role: body.role === 'owner_test' ? 'owner_test' : 'voice',
      });
      return res.status(200).json({ ok: true, subscription: sub });
    }

    if (action === 'unsubscribe') {
      const result = await disableSubscription({
        deviceId,
        endpoint: body.endpoint,
        expoPushToken: body.expoPushToken,
      });
      return res.status(200).json(result);
    }

    if (action === 'reach-summary') {
      // Not owner-protected — returns aggregate counts only (no tokens).
      const summary = await getAudienceReachSummary();
      return res.status(200).json(summary);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('api/push error:', err);
    if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return res.status(err.statusCode).json({ error: err.message || 'Request failed' });
    }
    const payload = await jsonStorageError(err);
    const status = payload.storageUnavailable ? 503 : 500;
    return res.status(status).json(payload);
  }
};
