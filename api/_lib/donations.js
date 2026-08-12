/**
 * Creator Foundation donations — fee math, ledger writes, Stripe helpers.
 * Platform collects 100%; ledger records 90% foundation / 10% World Choir.
 * Never fake success. Never store raw card data.
 */
const { randomUUID } = require('crypto');
const {
  PLATFORM_FEE_PERCENT,
  readDonationsLedger,
  findInfluencerById,
} = require('./members-store');
const { writeJson, assertBlobConfigured } = require('./store');

const DONATIONS_LEDGER_PATH = 'wc-data/members/donations-ledger.json';
const MIN_DONATION_CENTS = 100; // €1.00
const MAX_MESSAGE_LENGTH = 500;
const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'paid']);
const PENDING_STATUSES = new Set(['pending', 'requires_payment', 'processing']);

function getStripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function getStripePublishableKey() {
  return String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
}

function getStripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

function paymentsConfigured() {
  return Boolean(getStripeSecretKey() && getStripePublishableKey());
}

function getStripe() {
  const key = getStripeSecretKey();
  if (!key) {
    const err = new Error('Payments are not configured yet.');
    err.code = 'PAYMENTS_NOT_CONFIGURED';
    throw err;
  }
  // Lazy require so local/static paths without stripe still boot.
  // eslint-disable-next-line global-require
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

/** Integer-cent fee split. foundation + fee = gross. */
function splitDonationCents(grossCents) {
  const gross = Math.round(Number(grossCents));
  if (!Number.isFinite(gross) || gross < MIN_DONATION_CENTS) {
    const err = new Error(`Minimum donation is ${MIN_DONATION_CENTS / 100} EUR.`);
    err.code = 'AMOUNT_TOO_LOW';
    throw err;
  }
  const platformFeeCents = Math.round(gross * (PLATFORM_FEE_PERCENT / 100));
  const foundationCents = gross - platformFeeCents;
  return {
    amountGrossCents: gross,
    platformFeeCents,
    foundationAmountCents: foundationCents,
    amountGross: gross / 100,
    platformFee: platformFeeCents / 100,
    foundationAmount: foundationCents / 100,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    foundationSharePercent: 100 - PLATFORM_FEE_PERCENT,
  };
}

function eurosToCents(amount) {
  const n = Number(String(amount).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function sanitizeMessage(raw) {
  if (raw == null) return '';
  let text = String(raw)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  if (text.length > MAX_MESSAGE_LENGTH) {
    text = text.slice(0, MAX_MESSAGE_LENGTH);
  }
  return text;
}

function sanitizeName(raw) {
  return String(raw || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F]/g, '')
    .trim()
    .slice(0, 80);
}

function publicReceipt(row) {
  if (!row) return null;
  const anonymous = row.donor_anonymous === true || row.donorAnonymous === true;
  return {
    id: row.id || row.donation_id,
    foundationId: row.foundationId || row.foundation_id,
    projectId: row.projectId || row.project_id || null,
    amountGross: Number(row.amount_gross ?? row.amount ?? 0),
    platformFee: Number(row.platform_fee ?? 0),
    foundationAmount: Number(row.foundation_amount ?? 0),
    currency: row.currency || 'EUR',
    status: row.paymentStatus || row.status,
    paymentProvider: row.payment_provider || row.paymentProvider || 'stripe',
    paymentTransactionId: row.payment_transaction_id || row.paymentTransactionId || null,
    donorDisplayName: anonymous
      ? 'Anonymous'
      : (row.donor_display_name || row.donorDisplayName || 'Anonymous'),
    donorAnonymous: anonymous,
    message: row.message || '',
    city: row.city || row.world_choir_city_name || row.participationCity || '',
    country: row.country || row.world_choir_country || row.participationCountry || '',
    createdAt: row.created_at || row.createdAt || row.date || null,
    paymentMethodType: row.payment_method_type || row.paymentMethodType || null,
    cardBrand: row.card_brand || row.cardBrand || null,
    cardLast4: row.card_last4 || row.cardLast4 || null,
    foundationName: row.foundationName || null,
    creatorName: row.creatorName || null,
  };
}

async function writeDonationsLedger(donations) {
  assertBlobConfigured();
  await writeJson(DONATIONS_LEDGER_PATH, {
    version: 1,
    updated_at: new Date().toISOString(),
    donations: Array.isArray(donations) ? donations : [],
  }, { overwrite: true });
}

async function upsertDonation(row) {
  const list = await readDonationsLedger();
  const id = row.id || row.donation_id;
  const idx = list.findIndex((d) => (d.id || d.donation_id) === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...row };
  } else {
    list.push(row);
  }
  await writeDonationsLedger(list);
  return row;
}

async function findDonationById(id) {
  if (!id) return null;
  const list = await readDonationsLedger();
  return list.find((d) => (d.id || d.donation_id) === id) || null;
}

async function findDonationByPaymentIntent(piId) {
  if (!piId) return null;
  const list = await readDonationsLedger();
  return list.find((d) =>
    (d.payment_transaction_id || d.paymentTransactionId) === piId
  ) || null;
}

async function assertFoundationDonatable(foundationId) {
  const row = await findInfluencerById(foundationId);
  if (!row || row.active === false || row.published !== true) {
    const err = new Error('This Foundation is not available for donations.');
    err.code = 'FOUNDATION_UNAVAILABLE';
    throw err;
  }
  return row;
}

function buildDraftRecord({
  donationId,
  foundation,
  projectId,
  split,
  currency,
  deviceId,
  paymentIntentId,
}) {
  const now = new Date().toISOString();
  return {
    id: donationId,
    donation_id: donationId,
    foundationId: foundation.id,
    foundation_id: foundation.id,
    foundationName: foundation.foundationName || '',
    creatorName: foundation.displayName || '',
    projectId: projectId || null,
    project_id: projectId || null,
    amount: split.amountGross,
    amount_gross: split.amountGross,
    platform_fee: split.platformFee,
    foundation_amount: split.foundationAmount,
    amount_gross_cents: split.amountGrossCents,
    platform_fee_cents: split.platformFeeCents,
    foundation_amount_cents: split.foundationAmountCents,
    currency: currency || 'EUR',
    paymentStatus: 'pending',
    status: 'pending',
    payment_provider: 'stripe',
    payment_transaction_id: paymentIntentId || null,
    donor_display_name: '',
    donor_anonymous: false,
    message: '',
    city: '',
    country: '',
    latitude: null,
    longitude: null,
    deviceId: deviceId || null,
    donorId: deviceId || null,
    created_at: now,
    createdAt: now,
    updated_at: now,
    mock: false,
  };
}

function isSuccessfulDonation(d) {
  if (!d || d.mock === true) return false;
  const status = String(d.paymentStatus || d.status || '').toLowerCase();
  return SUCCESS_STATUSES.has(status);
}

module.exports = {
  PLATFORM_FEE_PERCENT,
  MIN_DONATION_CENTS,
  MAX_MESSAGE_LENGTH,
  SUCCESS_STATUSES,
  PENDING_STATUSES,
  getStripeSecretKey,
  getStripePublishableKey,
  getStripeWebhookSecret,
  paymentsConfigured,
  getStripe,
  splitDonationCents,
  eurosToCents,
  sanitizeMessage,
  sanitizeName,
  publicReceipt,
  writeDonationsLedger,
  upsertDonation,
  findDonationById,
  findDonationByPaymentIntent,
  assertFoundationDonatable,
  buildDraftRecord,
  isSuccessfulDonation,
  randomUUID,
};
