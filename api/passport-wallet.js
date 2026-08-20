/**
 * POST /api/passport-wallet
 * Apple Wallet (.pkpass) / Google Wallet pass issuance.
 * Signing credentials live server-side; this endpoint is the integration point.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const deviceId = req.body?.deviceId;
  const platform = String(req.body?.platform || '').toLowerCase();

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }
  if (platform !== 'apple' && platform !== 'google') {
    return res.status(400).json({ error: 'platform must be apple or google' });
  }

  // Wallet certificate / issuer credentials are not configured yet.
  // Architecture is ready: load passport data for deviceId, sign pass, return URL.
  return res.status(501).json({
    error: 'Wallet pass issuance is not configured yet',
    code: 501,
    platform,
  });
};
