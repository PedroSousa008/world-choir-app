const { readPrivateBinary } = require('../_lib/store');
const {
  readDownloadTicket,
  verifyDownloadTicket,
  passFilePath,
} = require('../_lib/wallet/wallet-store');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ticket = String(req.query?.ticket || '').trim();
  const sig = String(req.query?.sig || '').trim();

  if (!ticket || !sig) {
    return res.status(400).json({ error: 'ticket and sig required' });
  }

  try {
    const record = await readDownloadTicket(ticket);
    if (!record || record.sig !== sig) {
      return res.status(403).json({ error: 'Invalid download link' });
    }
    if (!verifyDownloadTicket(record, record.userId)) {
      return res.status(403).json({ error: 'Download link expired' });
    }

    const { buffer } = await readPrivateBinary(passFilePath(record.userId));
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', 'attachment; filename="world-choir-passport.pkpass"');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('[passport-wallet/download]', err);
    return res.status(500).json({ error: 'Could not download Apple Wallet Passport' });
  }
};
