/**
 * Owner login brute-force guard.
 * Tracks failed attempts by IP + email (hashed) in blob + memory.
 * Fail-open on storage errors so a blob outage never permanently locks the owner out.
 */
const crypto = require('crypto');
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');

const GUARD_PATH = 'wc-data/admin/owner-login-guard.json';
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_PER_EMAIL = 5;

/** @type {{ buckets: Record<string, { fails: number, windowStartedAt: number, lockedUntil: number }> } | null} */
let memoryGuard = null;

function nowMs() {
  return Date.now();
}

function hashEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return 'email:unknown';
  return `email:${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`;
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded.slice(0, 64);
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp.slice(0, 64);
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

function emptyGuard() {
  return { version: 1, buckets: {}, updatedAt: null };
}

function pruneBuckets(guard, now = nowMs()) {
  const next = { ...guard, buckets: { ...(guard.buckets || {}) } };
  Object.keys(next.buckets).forEach((key) => {
    const b = next.buckets[key];
    if (!b) {
      delete next.buckets[key];
      return;
    }
    const lockedUntil = Number(b.lockedUntil) || 0;
    const windowStartedAt = Number(b.windowStartedAt) || 0;
    if (lockedUntil && lockedUntil <= now && (!windowStartedAt || now - windowStartedAt > WINDOW_MS)) {
      delete next.buckets[key];
      return;
    }
    if (!lockedUntil && windowStartedAt && now - windowStartedAt > WINDOW_MS * 2) {
      delete next.buckets[key];
    }
  });
  return next;
}

async function readGuard() {
  if (memoryGuard) return pruneBuckets(memoryGuard);
  try {
    assertBlobConfigured();
    const raw = await readBlobJson(GUARD_PATH);
    memoryGuard = pruneBuckets({
      version: 1,
      buckets: raw?.buckets && typeof raw.buckets === 'object' ? raw.buckets : {},
      updatedAt: raw?.updatedAt || null,
    });
    return memoryGuard;
  } catch {
    memoryGuard = emptyGuard();
    return memoryGuard;
  }
}

async function writeGuard(guard) {
  const next = pruneBuckets({
    version: 1,
    buckets: guard.buckets || {},
    updatedAt: new Date().toISOString(),
  });
  memoryGuard = next;
  try {
    assertBlobConfigured();
    await writeJson(GUARD_PATH, next, { overwrite: true });
  } catch {
    /* memory still enforces on this instance */
  }
  return next;
}

function bucketStatus(bucket, now = nowMs()) {
  if (!bucket) return { locked: false, retryAfterSec: 0, fails: 0 };
  const lockedUntil = Number(bucket.lockedUntil) || 0;
  if (lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((lockedUntil - now) / 1000)),
      fails: Number(bucket.fails) || 0,
    };
  }
  const windowStartedAt = Number(bucket.windowStartedAt) || 0;
  if (!windowStartedAt || now - windowStartedAt > WINDOW_MS) {
    return { locked: false, retryAfterSec: 0, fails: 0 };
  }
  return { locked: false, retryAfterSec: 0, fails: Number(bucket.fails) || 0 };
}

function touchFail(bucket, maxFails, now = nowMs()) {
  const status = bucketStatus(bucket, now);
  let fails = status.fails + 1;
  let windowStartedAt = Number(bucket?.windowStartedAt) || now;
  if (!bucket || !windowStartedAt || now - windowStartedAt > WINDOW_MS) {
    fails = 1;
    windowStartedAt = now;
  }
  const lockedUntil = fails >= maxFails ? now + LOCK_MS : 0;
  return { fails, windowStartedAt, lockedUntil };
}

async function assertLoginAllowed(req, email) {
  try {
    const guard = await readGuard();
    const now = nowMs();
    const ipKey = `ip:${clientIp(req)}`;
    const emailKey = hashEmail(email);
    const ipStatus = bucketStatus(guard.buckets[ipKey], now);
    const emailStatus = bucketStatus(guard.buckets[emailKey], now);
    if (ipStatus.locked || emailStatus.locked) {
      const retryAfterSec = Math.max(ipStatus.retryAfterSec, emailStatus.retryAfterSec);
      return {
        ok: false,
        code: 'LOGIN_RATE_LIMITED',
        retryAfterSec,
        error: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function recordLoginFailure(req, email) {
  try {
    const guard = await readGuard();
    const now = nowMs();
    const ipKey = `ip:${clientIp(req)}`;
    const emailKey = hashEmail(email);
    guard.buckets[ipKey] = touchFail(guard.buckets[ipKey], MAX_FAILS_PER_IP, now);
    guard.buckets[emailKey] = touchFail(guard.buckets[emailKey], MAX_FAILS_PER_EMAIL, now);
    await writeGuard(guard);
    const ipStatus = bucketStatus(guard.buckets[ipKey], now);
    const emailStatus = bucketStatus(guard.buckets[emailKey], now);
    if (ipStatus.locked || emailStatus.locked) {
      const retryAfterSec = Math.max(ipStatus.retryAfterSec, emailStatus.retryAfterSec);
      return {
        limited: true,
        retryAfterSec,
        error: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
      };
    }
    return { limited: false };
  } catch {
    return { limited: false };
  }
}

async function clearLoginFailures(req, email) {
  try {
    const guard = await readGuard();
    const ipKey = `ip:${clientIp(req)}`;
    const emailKey = hashEmail(email);
    let changed = false;
    if (guard.buckets[ipKey]) {
      delete guard.buckets[ipKey];
      changed = true;
    }
    if (guard.buckets[emailKey]) {
      delete guard.buckets[emailKey];
      changed = true;
    }
    if (changed) await writeGuard(guard);
  } catch {
    /* ignore */
  }
}

module.exports = {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  WINDOW_MS,
  LOCK_MS,
  MAX_FAILS_PER_IP,
  MAX_FAILS_PER_EMAIL,
};
