/**
 * Owner lockdown unit checks (no network / no secrets).
 */
const assert = require('assert');
const {
  isOwnerAuthConfigured,
  getAllowedOwnerOrigins,
  normalizeRelationshipDate,
  safeEqual,
} = require('../api/_lib/auth');
const {
  WINDOW_MS,
  LOCK_MS,
  MAX_FAILS_PER_IP,
  MAX_FAILS_PER_EMAIL,
} = require('../api/_lib/owner-login-guard');

assert.ok(WINDOW_MS >= 60_000);
assert.ok(LOCK_MS >= 60_000);
assert.ok(MAX_FAILS_PER_IP >= 5);
assert.ok(MAX_FAILS_PER_EMAIL >= 3);

const origins = getAllowedOwnerOrigins();
assert.ok(origins.has('https://worldchoirapp.com'));
assert.ok(origins.has('https://world-choir-app.vercel.app'));
assert.ok(!origins.has('*'));

assert.strictEqual(normalizeRelationshipDate('21.09.2027'), '21.09.2027');
assert.strictEqual(normalizeRelationshipDate('2027-09-21'), '21.09.2027');

assert.strictEqual(safeEqual('abc', 'abc'), true);
assert.strictEqual(safeEqual('abc', 'abd'), false);
assert.strictEqual(safeEqual('abc', 'ab'), false);

// Sync configured gate should never throw.
assert.strictEqual(typeof isOwnerAuthConfigured(), 'boolean');

console.log('owner-lockdown tests passed');
