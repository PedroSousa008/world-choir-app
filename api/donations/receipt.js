const { findDonationById, publicReceipt } = require('../_lib/donations');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const id = String(req.query?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required.' });

    const row = await findDonationById(id);
    if (!row) return res.status(404).json({ error: 'Donation not found.' });

    return res.status(200).json({ donation: publicReceipt(row) });
  } catch (err) {
    console.error('api/donations/receipt error:', err);
    return res.status(503).json({ error: err.message || 'Could not load receipt.' });
  }
};
