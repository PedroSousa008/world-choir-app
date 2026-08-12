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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function donationRecordId(d) {
  return d ? (d.id || d.donation_id || null) : null;
}

function donationStatus(d) {
  return String(d?.paymentStatus || d?.status || '').toLowerCase();
}

/** Prefer completed fields — never let a stale pending write wipe a succeeded gift. */
function mergeDonationRecords(prev, next) {
  const base = { ...(prev || {}), ...(next || {}) };
  const prevSuccess = SUCCESS_STATUSES.has(donationStatus(prev));
  const nextSuccess = SUCCESS_STATUSES.has(donationStatus(next));
  if (prevSuccess && !nextSuccess) {
    const keepKeys = [
      'paymentStatus', 'status', 'completed_at', 'updated_at',
      'payment_provider', 'paymentProvider',
      'payment_transaction_id', 'paymentTransactionId',
      'test_transaction_id', 'testTransactionId',
      'is_test', 'isTest',
      'payment_method_type', 'paymentMethodType',
      'card_brand', 'cardBrand', 'card_last4', 'cardLast4',
      'donor_display_name', 'donorDisplayName',
      'donor_anonymous', 'donorAnonymous',
      'message', 'city', 'country',
      'participationCity', 'participationCountry',
      'world_choir_city_name', 'world_choir_country',
      'latitude', 'longitude',
      'mock', 'test_completed_via', 'test_idempotency_key',
    ];
    keepKeys.forEach((k) => {
      if (prev[k] !== undefined) base[k] = prev[k];
    });
  }
  const id = donationRecordId(next) || donationRecordId(prev);
  if (id) {
    base.id = id;
    base.donation_id = id;
  }
  return base;
}

async function writeDonationsLedger(donations) {
  assertBlobConfigured();
  await writeJson(DONATIONS_LEDGER_PATH, {
    version: 1,
    updated_at: new Date().toISOString(),
    donations: Array.isArray(donations) ? donations : [],
  }, { overwrite: true });
}

async function findDonationById(id) {
  if (!id) return null;
  const list = await readDonationsLedger();
  return list.find((d) => donationRecordId(d) === id) || null;
}

async function findDonationByIdWithRetry(id, { attempts = 8, baseDelayMs = 150 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const row = await findDonationById(id);
    if (row) return row;
    await sleep(baseDelayMs * (i + 1));
  }
  return null;
}

/**
 * Merge-write with conflict recovery for Vercel Blob (no CAS).
 * Re-reads after write; if our row is missing or downgraded, merges into the latest ledger and retries.
 */
async function upsertDonation(row) {
  const id = donationRecordId(row);
  if (!id) throw new Error('Donation id is required for upsert.');

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const list = await readDonationsLedger();
      const byId = new Map();
      list.forEach((d) => {
        const did = donationRecordId(d);
        if (did) byId.set(did, d);
      });
      byId.set(id, mergeDonationRecords(byId.get(id), row));
      await writeDonationsLedger(Array.from(byId.values()));

      await sleep(80 + attempt * 40);
      const latest = await readDonationsLedger();
      const latestMap = new Map();
      latest.forEach((d) => {
        const did = donationRecordId(d);
        if (did) latestMap.set(did, d);
      });

      // Restore any rows we knew about that a concurrent writer dropped.
      let needsRewrite = false;
      byId.forEach((d, did) => {
        if (!latestMap.has(did)) {
          latestMap.set(did, d);
          needsRewrite = true;
        } else {
          const merged = mergeDonationRecords(latestMap.get(did), d);
          const before = JSON.stringify(latestMap.get(did));
          const after = JSON.stringify(merged);
          if (before !== after) {
            latestMap.set(did, merged);
            needsRewrite = true;
          }
        }
      });

      // Ensure our target row reflects this write.
      const target = mergeDonationRecords(latestMap.get(id), row);
      latestMap.set(id, target);

      const wantSuccess = SUCCESS_STATUSES.has(donationStatus(row));
      const gotSuccess = SUCCESS_STATUSES.has(donationStatus(target));
      if (wantSuccess && !gotSuccess) needsRewrite = true;
      if (!latestMap.has(id)) needsRewrite = true;

      if (needsRewrite) {
        await writeDonationsLedger(Array.from(latestMap.values()));
        await sleep(80 + attempt * 40);
      }

      const verified = (await readDonationsLedger()).find((d) => donationRecordId(d) === id);
      if (verified) {
        if (!wantSuccess || SUCCESS_STATUSES.has(donationStatus(verified))) {
          return verified;
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  return { ...row, id, donation_id: id };
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
    paymentTransactionId: paymentIntentId || null,
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
  findDonationByIdWithRetry,
  findDonationByPaymentIntent,
  assertFoundationDonatable,
  buildDraftRecord,
  isSuccessfulDonation,
  randomUUID,
};
