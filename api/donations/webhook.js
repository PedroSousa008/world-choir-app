const {
  getStripe,
  getStripeWebhookSecret,
  findDonationByPaymentIntent,
  findDonationById,
  upsertDonation,
  sanitizeMessage,
  sanitizeName,
} = require('../_lib/donations');

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function completeDonationFromPaymentIntent(pi) {
  const donationId = pi.metadata?.donationId || null;
  let row = donationId
    ? await findDonationById(donationId)
    : await findDonationByPaymentIntent(pi.id);

  if (!row) {
    console.warn('Webhook: no donation draft for PaymentIntent', pi.id);
    return null;
  }

  const status = String(row.paymentStatus || row.status || '').toLowerCase();
  if (status === 'succeeded' || status === 'completed' || status === 'paid') {
    return row;
  }

  let paymentMethodType = row.payment_method_type || null;
  let cardBrand = row.card_brand || null;
  let cardLast4 = row.card_last4 || null;

  try {
    const stripe = getStripe();
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

  const metaName = sanitizeName(pi.metadata?.donorDisplayName || '');
  const anonymous = pi.metadata?.donorAnonymous === '1'
    || row.donor_anonymous === true;

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
    donor_display_name: anonymous
      ? 'Anonymous'
      : (row.donor_display_name || metaName || 'Anonymous'),
    city: row.city || sanitizeName(pi.metadata?.city || ''),
    country: row.country || sanitizeName(pi.metadata?.country || ''),
    message: row.message || sanitizeMessage(pi.metadata?.message || ''),
    mock: false,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await upsertDonation(completed);
  return completed;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return res.status(503).json({ error: 'Webhook not configured.' });
  }

  let event;
  try {
    const stripe = getStripe();
    const signature = req.headers['stripe-signature'];
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      await completeDonationFromPaymentIntent(event.data.object);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
