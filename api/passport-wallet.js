/**
 * Passport Wallet API — Apple / Google Wallet pass issuance.
 * Returns 501 until signing credentials and pass templates are configured.
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

  // Architecture is ready for signed .pkpass / Google Wallet objects.
  // Connect Apple Pass Type ID + certificates / Google Wallet issuer here.
  return res.status(501).json({
    error: 'Wallet pass generation is not configured yet',
    code: 'wallet_not_configured',
    platform,
  });
};
