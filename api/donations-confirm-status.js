const {
  findDonationById,
  publicReceipt,
  getStripe,
  paymentsConfigured,
} = require('./_lib/donations');

/**
 * Client polls after confirmPayment until webhook marks succeeded,
 * or we promote from Stripe PI status if webhook is delayed.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const donationId = String(req.body?.donationId || '').trim();
    if (!donationId) return res.status(400).json({ error: 'donationId is required.' });

    let row = await findDonationById(donationId);
    if (!row) return res.status(404).json({ error: 'Donation not found.' });

    const status = String(row.paymentStatus || row.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'completed' || status === 'paid') {
      return res.status(200).json({ donation: publicReceipt(row), ready: true });
    }

    // Fallback: if PI already succeeded but webhook lagging, complete now.
    if (paymentsConfigured() && row.payment_transaction_id) {
      try {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(row.payment_transaction_id);
        if (pi.status === 'succeeded') {
          const { upsertDonation } = require('./_lib/donations');
          row = {
            ...row,
            paymentStatus: 'succeeded',
            status: 'succeeded',
            mock: false,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await upsertDonation(row);
          return res.status(200).json({ donation: publicReceipt(row), ready: true });
        }
        if (pi.status === 'canceled') {
          return res.status(200).json({
            donation: publicReceipt(row),
            ready: false,
            paymentStatus: 'canceled',
          });
        }
        return res.status(200).json({
          donation: publicReceipt(row),
          ready: false,
          paymentStatus: pi.status,
        });
      } catch (e) {
        console.warn('confirm-status PI retrieve failed:', e.message);
      }
    }

    return res.status(200).json({ donation: publicReceipt(row), ready: false });
  } catch (err) {
    console.error('api/donations/confirm-status error:', err);
    return res.status(503).json({ error: err.message || 'Could not confirm status.' });
  }
};
