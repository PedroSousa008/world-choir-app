const { putPrivateBinary } = require('./_lib/store');
const { loadPassportDataForDevice } = require('./_lib/passport-data');
const { generatePassportPass, walletConfigured } = require('./_lib/wallet/passport-pass-builder');
const {
  ensureWalletRecord,
  publicPassportUrl,
  getPublicBaseUrl,
  signDownloadTicket,
  storeDownloadTicket,
  passFilePath,
  markPassGenerated,
} = require('./_lib/wallet/wallet-store');

async function issueApplePass(req, res, deviceId) {
  if (!walletConfigured()) {
    return res.status(503).json({
      error: 'Apple Wallet is not configured yet. Add your Apple Pass Type credentials to enable this feature.',
      code: 'WALLET_NOT_CONFIGURED',
      platform: 'apple',
    });
  }

  const passportData = await loadPassportDataForDevice(deviceId);
  const walletRecord = await ensureWalletRecord({
    userId: passportData.userId,
    deviceId,
  });

  const qrUrl = publicPassportUrl(req, walletRecord.passportPublicToken);
  const passBuffer = await generatePassportPass({
    passportData,
    walletRecord,
    qrUrl,
  });

  await putPrivateBinary(
    passFilePath(passportData.userId),
    passBuffer,
    'application/vnd.apple.pkpass',
    { overwrite: true }
  );
  await markPassGenerated(passportData.userId);

  const ticket = signDownloadTicket(passportData.userId);
  await storeDownloadTicket(ticket);

  const baseUrl = getPublicBaseUrl(req);
  const passUrl = `${baseUrl}/api/passport-wallet/download?ticket=${encodeURIComponent(ticket.ticket)}&sig=${encodeURIComponent(ticket.sig)}`;

  const wantsDirect = req.body?.delivery === 'direct'
    || String(req.headers.accept || '').includes('application/vnd.apple.pkpass');

  if (wantsDirect) {
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', 'attachment; filename="world-choir-passport.pkpass"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(passBuffer);
  }

  return res.status(200).json({
    ok: true,
    platform: 'apple',
    passUrl,
    serialNumber: walletRecord.walletPassSerialNumber,
    publicPassportUrl: qrUrl,
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
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

  if (platform === 'google') {
    return res.status(501).json({
      error: 'Google Wallet is not configured yet',
      code: 'GOOGLE_WALLET_NOT_CONFIGURED',
      platform: 'google',
    });
  }

  try {
    return await issueApplePass(req, res, deviceId);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error('[passport-wallet]', err);
    }
    return res.status(status).json({
      error: err.message || 'Could not prepare Apple Wallet Passport',
      code: err.code || status,
      platform: 'apple',
    });
  }
};
