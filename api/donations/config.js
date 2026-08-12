const {
  paymentsConfigured,
  getStripePublishableKey,
  PLATFORM_FEE_PERCENT,
  MIN_DONATION_CENTS,
  MAX_MESSAGE_LENGTH,
} = require('../_lib/donations');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const configured = paymentsConfigured();
  return res.status(200).json({
    configured,
    publishableKey: configured ? getStripePublishableKey() : null,
    currency: 'EUR',
    platformFeePercent: PLATFORM_FEE_PERCENT,
    foundationSharePercent: 100 - PLATFORM_FEE_PERCENT,
    minDonationCents: MIN_DONATION_CENTS,
    minDonation: MIN_DONATION_CENTS / 100,
    maxMessageLength: MAX_MESSAGE_LENGTH,
    suggestedAmounts: [5, 10, 25, 50, 100],
    message:
      configured
        ? null
        : 'Payments are not configured yet. Add Stripe keys in Vercel to enable live donations.',
  });
};
