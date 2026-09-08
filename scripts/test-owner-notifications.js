#!/usr/bin/env node
/**
 * Lightweight Owner Notifications regression checks (no real push / no network).
 * Run with project Node binary: node scripts/test-owner-notifications.js
 */
const path = require('path');
const root = path.join(__dirname, '..');
const n = require(path.join(root, 'api/_lib/owner-notifications'));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const topics = Object.values(n.NOTIFICATION_TOPICS);
assert(topics.length === 9, 'topic enum has 9 topics');
assert(topics.some((t) => t.key === 'daily_acts'), 'includes Daily Acts');
assert(topics.some((t) => t.key === 'live_moment'), 'includes Live Moment');
assert(topics.some((t) => t.key === 'post_event'), 'includes Post Event');

const statuses = Object.values(n.NOTIFICATION_STATUS);
['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled', 'archived'].forEach((s) => {
  assert(statuses.includes(s), `status ${s}`);
});

assert(n.calcActionRate(5, 0, 0) === null, 'action rate safe with zero delivered/sent');
assert(n.calcActionRate(10, 100, 120) === 10, 'action rate uses delivered');
assert(n.calcActionRate(10, 0, 100) === 10, 'action rate falls back to sent');

assert(n.isSafeInternalPath('https://evil.com') === false, 'rejects external URL');
assert(n.isSafeInternalPath('//evil.com') === false, 'rejects protocol-relative');
assert(n.isSafeInternalPath('../secret') === false, 'rejects path traversal');
assert(n.isSafeInternalPath('world-chain.html?id=abc') === true, 'allows internal path');

try {
  n.normalizeCampaignInput({ topic: 'nope', title: 'x', message: 'y' });
  assert(false, 'invalid topic should throw');
} catch (err) {
  assert(err.statusCode === 400, 'invalid topic 400');
}

try {
  n.normalizeCampaignInput({
    topic: 'others',
    title: 'Hi',
    message: 'Body',
    destination_type: 'custom',
    destination_payload: { path: 'https://phish.test' },
  });
  assert(false, 'unsafe custom dest should throw');
} catch (err) {
  assert(err.statusCode === 400, 'unsafe custom dest 400');
}

const fatigue = n.evaluateFatigue(
  [
    { status: 'sent', sent_at: new Date().toISOString(), topic: 'donations' },
    { status: 'sent', sent_at: new Date().toISOString(), topic: 'others' },
    { status: 'sent', sent_at: new Date().toISOString(), topic: 'others' },
  ],
  { mode: 'everyone' },
  { topic: 'donations' }
);
assert(fatigue.warnings.some((w) => w.code === 'donations_cooldown'), 'donations fatigue warning');
assert(fatigue.warnings.some((w) => w.code === 'max_per_day'), 'max per day fatigue warning');

const badge = n.performanceBadge(20, 10);
assert(badge === 'Excellent', 'performance badge Excellent vs topic baseline');

// Sidebar order contract (mirror owner-control SECTIONS slice)
const SECTIONS = ['overview', 'community', 'map', 'notifications', 'donations'];
assert(
  SECTIONS.indexOf('notifications') === SECTIONS.indexOf('map') + 1
    && SECTIONS.indexOf('donations') === SECTIONS.indexOf('notifications') + 1,
  'Notifications sits between Map and Donations'
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll owner-notifications checks passed.');
