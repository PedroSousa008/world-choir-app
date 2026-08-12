const {
  paymentsConfigured,
  getStripe,
  eurosToCents,
  splitDonationCents,
  assertFoundationDonatable,
  buildDraftRecord,
  upsertDonation,
  randomUUID,
  MIN_DONATION_CENTS,
} = require('./_lib/donations');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!paymentsConfigured()) {
      return res.status(503).json({
        error: 'Payments are not configured yet.',
        code: 'PAYMENTS_NOT_CONFIGURED',
      });
    }

    const body = req.body || {};
    const foundationId = String(body.foundationId || '').trim();
    const projectId = body.projectId ? String(body.projectId).trim() : null;
    const deviceId = String(body.deviceId || '').trim() || null;
    const currency = String(body.currency || 'EUR').trim().toUpperCase() || 'EUR';
    const grossCents = eurosToCents(body.amount);

    if (!foundationId) {
      return res.status(400).json({ error: 'foundationId is required.' });
    }
    if (grossCents == null) {
      return res.status(400).json({ error: 'Enter a valid donation amount.' });
    }
    if (grossCents < MIN_DONATION_CENTS) {
      return res.status(400).json({
        error: `Minimum donation is ${(MIN_DONATION_CENTS / 100).toFixed(2)} ${currency}.`,
        code: 'AMOUNT_TOO_LOW',
      });
    }

    const foundation = await assertFoundationDonatable(foundationId);
    const split = splitDonationCents(grossCents);
    const donationId = `don_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const idempotencyKey = String(
      req.headers['idempotency-key']
      || body.idempotencyKey
      || `create-${donationId}`
    ).slice(0, 255);

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: split.amountGrossCents,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      description: `World Choir donation to ${foundation.foundationName || foundation.displayName || 'Creator Foundation'}`,
      metadata: {
        donationId,
        foundationId: foundation.id,
        projectId: projectId || '',
        deviceId: deviceId || '',
        platformFeeCents: String(split.platformFeeCents),
        foundationAmountCents: String(split.foundationAmountCents),
        worldChoirApp: '1',
      },
    }, { idempotencyKey });

    const draft = buildDraftRecord({
      donationId,
      foundation,
      projectId,
      split,
      currency,
      deviceId,
      paymentIntentId: paymentIntent.id,
    });
    await upsertDonation(draft);

    return res.status(200).json({
      donationId,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      currency,
      amountGross: split.amountGross,
      platformFee: split.platformFee,
      foundationAmount: split.foundationAmount,
      platformFeePercent: split.platformFeePercent,
      foundationSharePercent: split.foundationSharePercent,
      foundationName: foundation.foundationName || '',
      creatorName: foundation.displayName || '',
    });
  } catch (err) {
    console.error('api/donations/create-intent error:', err);
    const status = err.code === 'FOUNDATION_UNAVAILABLE' ? 404
      : err.code === 'AMOUNT_TOO_LOW' ? 400
        : err.code === 'PAYMENTS_NOT_CONFIGURED' ? 503
          : 503;
    return res.status(status).json({
      error: err.message || 'Could not start donation.',
      code: err.code || 'CREATE_INTENT_FAILED',
    });
  }
};
