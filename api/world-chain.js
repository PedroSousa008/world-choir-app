const {
  DEFAULT_EVENT_ID,
  CHAIN_ENGINE,
  CHAIN_STORAGE_VERSION,
  ensureDailyChains,
  getTodayPayload,
  getChainPayload,
  acceptStart,
  connectVoice,
} = require('./_lib/world-chain');
const { jsonStorageError } = require('./_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-WC-Chain-Engine', CHAIN_ENGINE || 'unknown');
  res.setHeader('X-WC-Chain-Storage', CHAIN_STORAGE_VERSION || 'unknown');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const deviceId = String(req.query.deviceId || '').trim();
      if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
      }
      const eventId = String(req.query.eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
      const chainId = String(req.query.chainId || '').trim();

      // Ensure today's chains exist (idempotent).
      await ensureDailyChains(eventId);

      if (chainId) {
        const result = await getChainPayload(chainId, deviceId, eventId);
        return res.status(200).json(result);
      }

      const result = await getTodayPayload(deviceId, eventId);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const deviceId = String(req.body?.deviceId || '').trim();
      if (!deviceId) {
        return res.status(400).json({ error: 'deviceId required' });
      }
      const eventId = String(req.body?.eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
      const action = String(req.body?.action || '').trim();
      const chainId = String(req.body?.chainId || '').trim();

      if (!chainId) {
        return res.status(400).json({ error: 'chainId required' });
      }

      if (action === 'accept-start') {
        const result = await acceptStart(deviceId, chainId, eventId);
        return res.status(200).json(result);
      }

      if (action === 'connect') {
        const result = await connectVoice(deviceId, chainId, req.body?.voiceNumber, eventId);
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err?.code === 'BLOB_NOT_CONFIGURED' || err?.storageUnavailable || err?.code === 'STORAGE_UNAVAILABLE') {
      const payload = await jsonStorageError(err);
      return res.status(503).json(payload);
    }
    const status = err?.statusCode || 500;
    console.error('world-chain error:', err);
    return res.status(status).json({ error: err.message || 'World Chain error' });
  }
};
