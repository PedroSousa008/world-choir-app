/**
 * Unified donations API — ?action=config|create-intent|update|receipt|confirm-status|webhook
 * Keeps a single serverless function for Vercel deploy reliability.
 */
const donations = require('./_lib/donations');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, Stripe-Signature');
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function handleConfig(req, res) {
  const configured = donations.paymentsConfigured();
  return res.status(200).json({
    configured,
    publishableKey: configured ? donations.getStripePublishableKey() : null,
    currency: 'EUR',
    platformFeePercent: donations.PLATFORM_FEE_PERCENT,
    foundationSharePercent: 100 - donations.PLATFORM_FEE_PERCENT,
    minDonationCents: donations.MIN_DONATION_CENTS,
    minDonation: donations.MIN_DONATION_CENTS / 100,
    maxMessageLength: donations.MAX_MESSAGE_LENGTH,
    suggestedAmounts: [5, 10, 25, 50, 100],
    message: configured
      ? null
      : 'Payments are not configured yet. Add Stripe keys in Vercel to enable live donations.',
  });
}

async function handleCreateIntent(req, res) {
  if (!donations.paymentsConfigured()) {
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
  const grossCents = donations.eurosToCents(body.amount);

  if (!foundationId) return res.status(400).json({ error: 'foundationId is required.' });
  if (grossCents == null) return res.status(400).json({ error: 'Enter a valid donation amount.' });
  if (grossCents < donations.MIN_DONATION_CENTS) {
    return res.status(400).json({
      error: `Minimum donation is ${(donations.MIN_DONATION_CENTS / 100).toFixed(2)} ${currency}.`,
      code: 'AMOUNT_TOO_LOW',
    });
  }

  const foundation = await donations.assertFoundationDonatable(foundationId);
  const split = donations.splitDonationCents(grossCents);
  const donationId = `don_${donations.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const idempotencyKey = String(
    req.headers['idempotency-key'] || body.idempotencyKey || `create-${donationId}`
  ).slice(0, 255);

  const stripe = donations.getStripe();
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

  const draft = donations.buildDraftRecord({
    donationId,
    foundation,
    projectId,
    split,
    currency,
    deviceId,
    paymentIntentId: paymentIntent.id,
  });
  await donations.upsertDonation(draft, { mode: 'fast' });

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
}

async function handleUpdate(req, res) {
  const body = req.body || {};
  const donationId = String(body.donationId || '').trim();
  if (!donationId) return res.status(400).json({ error: 'donationId is required.' });

  const existing = await donations.findDonationByIdWithRetry(donationId);
  if (!existing) return res.status(404).json({ error: 'Donation not found.' });

  const status = String(existing.paymentStatus || existing.status || '').toLowerCase();
  if (status === 'succeeded' || status === 'completed' || status === 'paid') {
    return res.status(409).json({ error: 'This donation is already completed.' });
  }

  const anonymous = body.donorAnonymous === true;
  const firstName = donations.sanitizeName(body.firstName);
  const lastName = donations.sanitizeName(body.lastName);
  const displayFromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  const donorDisplayName = anonymous
    ? 'Anonymous'
    : donations.sanitizeName(body.donorDisplayName || displayFromParts || existing.donor_display_name);

  const message = donations.sanitizeMessage(body.message);
  const city = donations.sanitizeName(body.city).slice(0, 120);
  const country = donations.sanitizeName(body.country).slice(0, 120);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  const updated = {
    ...existing,
    donor_display_name: donorDisplayName,
    donorDisplayName,
    donor_anonymous: anonymous,
    donorAnonymous: anonymous,
    message,
    city,
    country,
    participationCity: city,
    participationCountry: country,
    world_choir_city_name: city,
    world_choir_country: country,
    latitude: Number.isFinite(latitude) ? latitude : (existing.latitude ?? null),
    longitude: Number.isFinite(longitude) ? longitude : (existing.longitude ?? null),
    updated_at: new Date().toISOString(),
  };

  await donations.upsertDonation(updated);

  if (donations.paymentsConfigured() && updated.payment_transaction_id) {
    try {
      const stripe = donations.getStripe();
      await stripe.paymentIntents.update(updated.payment_transaction_id, {
        metadata: {
          donationId,
          foundationId: String(updated.foundationId || updated.foundation_id || ''),
          projectId: String(updated.projectId || updated.project_id || ''),
          deviceId: String(updated.deviceId || ''),
          donorAnonymous: anonymous ? '1' : '0',
          donorDisplayName: donorDisplayName.slice(0, 100),
          city: city.slice(0, 80),
          country: country.slice(0, 80),
          hasMessage: message ? '1' : '0',
        },
      });
    } catch (metaErr) {
      console.warn('Could not update PaymentIntent metadata:', metaErr.message);
    }
  }

  return res.status(200).json({
    ok: true,
    donationId,
    donorDisplayName: anonymous ? 'Anonymous' : donorDisplayName,
    donorAnonymous: anonymous,
    message,
    city,
    country,
  });
}

async function handleHasSupported(req, res) {
  const deviceId = String(req.query?.deviceId || req.body?.deviceId || '').trim() || null;
  const userId = String(req.query?.userId || req.body?.userId || '').trim() || null;
  if (!deviceId && !userId) {
    return res.status(400).json({ error: 'deviceId or userId is required.' });
  }

  const supported = await donations.hasSupportedCreatorCause({ deviceId, userId });
  return res.status(200).json({ supported });
}

async function handleReceipt(req, res) {
  const id = String(req.query?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required.' });
  const row = await donations.findDonationById(id);
  if (!row) return res.status(404).json({ error: 'Donation not found.' });
  return res.status(200).json({ donation: donations.publicReceipt(row) });
}

async function handleConfirmStatus(req, res) {
  const donationId = String(req.body?.donationId || '').trim();
  if (!donationId) return res.status(400).json({ error: 'donationId is required.' });

  let row = await donations.findDonationById(donationId);
  if (!row) return res.status(404).json({ error: 'Donation not found.' });

  const status = String(row.paymentStatus || row.status || '').toLowerCase();
  if (status === 'succeeded' || status === 'completed' || status === 'paid') {
    return res.status(200).json({ donation: donations.publicReceipt(row), ready: true });
  }

  if (donations.paymentsConfigured() && row.payment_transaction_id) {
    try {
      const stripe = donations.getStripe();
      const pi = await stripe.paymentIntents.retrieve(row.payment_transaction_id);
      if (pi.status === 'succeeded') {
        row = {
          ...row,
          paymentStatus: 'succeeded',
          status: 'succeeded',
          mock: false,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await donations.upsertDonation(row);
        return res.status(200).json({ donation: donations.publicReceipt(row), ready: true });
      }
      if (pi.status === 'canceled') {
        return res.status(200).json({
          donation: donations.publicReceipt(row),
          ready: false,
          paymentStatus: 'canceled',
        });
      }
      return res.status(200).json({
        donation: donations.publicReceipt(row),
        ready: false,
        paymentStatus: pi.status,
      });
    } catch (e) {
      console.warn('confirm-status PI retrieve failed:', e.message);
    }
  }

  return res.status(200).json({ donation: donations.publicReceipt(row), ready: false });
}

async function completeFromPi(pi) {
  const donationId = pi.metadata?.donationId || null;
  let row = donationId
    ? await donations.findDonationById(donationId)
    : await donations.findDonationByPaymentIntent(pi.id);
  if (!row) return null;

  const status = String(row.paymentStatus || row.status || '').toLowerCase();
  if (status === 'succeeded' || status === 'completed' || status === 'paid') return row;

  let paymentMethodType = row.payment_method_type || null;
  let cardBrand = row.card_brand || null;
  let cardLast4 = row.card_last4 || null;
  try {
    const stripe = donations.getStripe();
    if (pi.payment_method) {
      const pm = typeof pi.payment_method === 'string'
        ? await stripe.paymentMethods.retrieve(pi.payment_method)
        : pi.payment_method;
      paymentMethodType = pm?.type || paymentMethodType;
      if (pm?.card) {
        cardBrand = pm.card.brand || cardBrand;
        cardLast4 = pm.card.last4 || cardLast4;
      }
    }
  } catch (e) {
    console.warn('Could not load payment method details:', e.message);
  }

  const anonymous = pi.metadata?.donorAnonymous === '1' || row.donor_anonymous === true;
  const metaName = donations.sanitizeName(pi.metadata?.donorDisplayName || '');
  const completed = {
    ...row,
    paymentStatus: 'succeeded',
    status: 'succeeded',
    payment_transaction_id: pi.id,
    paymentTransactionId: pi.id,
    payment_method_type: paymentMethodType,
    card_brand: cardBrand,
    card_last4: cardLast4,
    donor_anonymous: anonymous,
    donor_display_name: anonymous ? 'Anonymous' : (row.donor_display_name || metaName || 'Anonymous'),
    city: row.city || donations.sanitizeName(pi.metadata?.city || ''),
    country: row.country || donations.sanitizeName(pi.metadata?.country || ''),
    message: row.message || donations.sanitizeMessage(pi.metadata?.message || ''),
    mock: false,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await donations.upsertDonation(completed);
  return completed;
}

async function handleWebhook(req, res) {
  const webhookSecret = donations.getStripeWebhookSecret();
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook not configured.' });
  }

  let event;
  try {
    const stripe = donations.getStripe();
    const signature = req.headers['stripe-signature'];
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    await completeFromPi(event.data.object);
  }
  return res.status(200).json({ received: true });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = String(req.query?.action || req.body?.action || '').trim();

  try {
    if (req.method === 'GET') {
      if (action === 'has-supported') return handleHasSupported(req, res);
      if (action === 'receipt' || (req.query?.id && action !== 'config')) {
        return handleReceipt(req, res);
      }
      return handleConfig(req, res);
    }

    if (req.method === 'POST') {
      if (action === 'create-intent') return handleCreateIntent(req, res);
      if (action === 'update') return handleUpdate(req, res);
      if (action === 'confirm-status') return handleConfirmStatus(req, res);
      if (action === 'webhook') return handleWebhook(req, res);
      // Stripe webhooks hit /api/donations?action=webhook
      if (req.headers['stripe-signature']) return handleWebhook(req, res);
    }

    return res.status(400).json({ error: 'Unknown donations action.' });
  } catch (err) {
    console.error('api/donations error:', err);
    const status = err.code === 'FOUNDATION_UNAVAILABLE' ? 404
      : err.code === 'AMOUNT_TOO_LOW' ? 400
        : err.code === 'PAYMENTS_NOT_CONFIGURED' ? 503
          : 503;
    return res.status(status).json({
      error: err.message || 'Donation request failed.',
      code: err.code || 'DONATIONS_ERROR',
    });
  }
};
