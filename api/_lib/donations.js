/**
 * Creator Foundation donations — fee math, ledger writes, Stripe helpers.
 * Platform collects 100%; ledger records 90% foundation / 10% World Choir.
 * Never fake success. Never store raw card data.
 *
 * Controlled donation TEST MODE (DONATION_TEST_MODE / non-production only):
 * creates real ledger rows with is_test=true without calling Stripe.
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

/** Isolated test card — never sent to Stripe. Digits only. */
const TEST_CARD = Object.freeze({
  number: '0000000000000000',
  expMonth: '03',
  expYear: '30',
  cvc: '123',
});

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

/**
 * Explicit opt-in for temporary production testing via DONATION_TEST_MODE=true,
 * or automatic on Vercel Preview / local non-production.
 * Never invents money — only skips Stripe and marks is_test.
 */
function donationTestModeEnabled() {
  if (String(process.env.DONATION_TEST_MODE || '').trim().toLowerCase() === 'true') {
    return true;
  }
  const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  if (vercelEnv && vercelEnv !== 'production') return true;
  if (!vercelEnv && process.env.NODE_ENV !== 'production') return true;
  return false;
}

function donationsFlowAvailable() {
  return paymentsConfigured() || donationTestModeEnabled();
}

function assertTestModeAllowed() {
  if (!donationTestModeEnabled()) {
    const err = new Error('Test payments are not enabled in this environment.');
    err.code = 'TEST_PAYMENTS_DISABLED';
    throw err;
  }
}

function normalizeCardDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeExpYear(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 4) return digits.slice(-2);
  return digits.slice(0, 2);
}

/** Validate the controlled test card. Never logs or stores card data. */
function matchesControlledTestCard({ number, expMonth, expYear, cvc } = {}) {
  const num = normalizeCardDigits(number);
  const month = String(expMonth || '').replace(/\D/g, '').padStart(2, '0').slice(-2);
  const year = normalizeExpYear(expYear);
  const code = String(cvc || '').replace(/\D/g, '');
  return (
    num === TEST_CARD.number
    && month === TEST_CARD.expMonth
    && year === TEST_CARD.expYear
    && code === TEST_CARD.cvc
  );
}

function makeTestTransactionId(donationId) {
  // Deterministic per donation — safe for idempotent retries / cleanup.
  const id = String(donationId || 'don').trim() || 'don';
  return `TEST_${id}`;
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
  const isTest = row.is_test === true || row.isTest === true;
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
    testTransactionId: row.test_transaction_id || row.testTransactionId || null,
    isTest,
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
  isTest = false,
}) {
  const now = new Date().toISOString();
  const test = isTest === true;
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
    payment_provider: test ? 'test' : 'stripe',
    payment_transaction_id: test ? null : (paymentIntentId || null),
    paymentTransactionId: test ? null : (paymentIntentId || null),
    test_transaction_id: null,
    testTransactionId: null,
    is_test: test,
    isTest: test,
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
    // mock stays false so aggregators count this like a real succeeded gift.
    // Cleanup later uses is_test + test_transaction_id only.
    mock: false,
  };
}

/**
 * Complete a controlled test donation. Idempotent for already-succeeded rows.
 * Never calls Stripe. Never stores card PAN/CVC.
 * `details` may re-apply donor/location/message so a single write survives Blob races.
 */
async function completeTestDonation(row, { idempotencyKey, details } = {}) {
  assertTestModeAllowed();
  if (!row) {
    const err = new Error('Donation not found.');
    err.code = 'DONATION_NOT_FOUND';
    throw err;
  }

  const donationId = row.id || row.donation_id;
  // Re-read immediately before write to reduce lost-update risk.
  const fresh = (await findDonationById(donationId)) || row;
  const status = String(fresh.paymentStatus || fresh.status || '').toLowerCase();
  if (SUCCESS_STATUSES.has(status)) {
    return fresh;
  }

  if (fresh.is_test !== true && fresh.isTest !== true && fresh.payment_provider !== 'test') {
    const err = new Error('This donation is not a test payment.');
    err.code = 'NOT_A_TEST_DONATION';
    throw err;
  }

  const d = details && typeof details === 'object' ? details : {};
  const hasDonorFlag = Object.prototype.hasOwnProperty.call(d, 'donorAnonymous');
  const anonymous = hasDonorFlag
    ? d.donorAnonymous === true
    : (fresh.donor_anonymous === true || fresh.donorAnonymous === true);
  const donorDisplayName = anonymous
    ? 'Anonymous'
    : sanitizeName(d.donorDisplayName || fresh.donor_display_name || fresh.donorDisplayName || '');
  const message = d.message != null ? sanitizeMessage(d.message) : (fresh.message || '');
  const city = d.city != null
    ? sanitizeName(d.city).slice(0, 120)
    : (fresh.city || fresh.participationCity || fresh.world_choir_city_name || '');
  const country = d.country != null
    ? sanitizeName(d.country).slice(0, 120)
    : (fresh.country || fresh.participationCountry || fresh.world_choir_country || '');
  const latitude = Number(d.latitude);
  const longitude = Number(d.longitude);

  const testTxn = makeTestTransactionId(donationId);
  const now = new Date().toISOString();
  const completed = {
    ...fresh,
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
    latitude: Number.isFinite(latitude) ? latitude : (fresh.latitude ?? null),
    longitude: Number.isFinite(longitude) ? longitude : (fresh.longitude ?? null),
    paymentStatus: 'succeeded',
    status: 'succeeded',
    payment_provider: 'test',
    paymentProvider: 'test',
    payment_transaction_id: testTxn,
    paymentTransactionId: testTxn,
    test_transaction_id: testTxn,
    testTransactionId: testTxn,
    is_test: true,
    isTest: true,
    payment_method_type: 'card',
    paymentMethodType: 'card',
    card_brand: 'test',
    cardBrand: 'test',
    card_last4: '0000',
    cardLast4: '0000',
    mock: false,
    completed_at: now,
    updated_at: now,
    test_completed_via: 'controlled_test_card',
    test_idempotency_key: idempotencyKey ? String(idempotencyKey).slice(0, 255) : null,
  };
  await upsertDonation(completed);

  // Confirm persisted row (Blob can briefly lag).
  const confirmed = await findDonationById(donationId);
  return confirmed && SUCCESS_STATUSES.has(String(confirmed.paymentStatus || confirmed.status || '').toLowerCase())
    ? confirmed
    : completed;
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
  TEST_CARD,
  getStripeSecretKey,
  getStripePublishableKey,
  getStripeWebhookSecret,
  paymentsConfigured,
  donationTestModeEnabled,
  donationsFlowAvailable,
  assertTestModeAllowed,
  matchesControlledTestCard,
  makeTestTransactionId,
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
  completeTestDonation,
  isSuccessfulDonation,
  randomUUID,
};
