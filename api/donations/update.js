const {
  findDonationById,
  upsertDonation,
  sanitizeMessage,
  sanitizeName,
  getStripe,
  paymentsConfigured,
  MAX_MESSAGE_LENGTH,
} = require('../_lib/donations');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const donationId = String(body.donationId || '').trim();
    if (!donationId) {
      return res.status(400).json({ error: 'donationId is required.' });
    }

    const existing = await findDonationById(donationId);
    if (!existing) {
      return res.status(404).json({ error: 'Donation not found.' });
    }

    const status = String(existing.paymentStatus || existing.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'completed' || status === 'paid') {
      return res.status(409).json({ error: 'This donation is already completed.' });
    }

    const anonymous = body.donorAnonymous === true;
    const firstName = sanitizeName(body.firstName);
    const lastName = sanitizeName(body.lastName);
    const displayFromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
    const donorDisplayName = anonymous
      ? 'Anonymous'
      : sanitizeName(body.donorDisplayName || displayFromParts || existing.donor_display_name);

    const message = sanitizeMessage(body.message);
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
    }

    const city = sanitizeName(body.city).slice(0, 120);
    const country = sanitizeName(body.country).slice(0, 120);
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

    await upsertDonation(updated);

    // Keep PaymentIntent metadata in sync for webhook enrichment.
    if (paymentsConfigured() && updated.payment_transaction_id) {
      try {
        const stripe = getStripe();
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
  } catch (err) {
    console.error('api/donations/update error:', err);
    return res.status(503).json({ error: err.message || 'Could not update donation.' });
  }
};
