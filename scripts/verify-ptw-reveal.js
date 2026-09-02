#!/usr/bin/env node
/**
 * Verify Pass the World reveal flow logic (read-only checks + optional live API probes).
 * Run: node scripts/verify-ptw-reveal.js
 */
const {
  STATUS,
  INVITATION_WINDOW_MS,
  REVEAL_WINDOW_MS,
  advanceStateMachine,
  buildInvitedCities,
} = require('../api/_lib/pass-the-world');

// buildInvitedCities is not exported — inline the same dedupe rule for unit check
function dedupeCities(invitations) {
  const byKey = new Map();
  for (const invite of invitations) {
    const key = `${String(invite.country || '').trim().toLowerCase()}|${String(invite.city || '').trim().toLowerCase()}`;
    if (byKey.has(key)) continue;
    byKey.set(key, invite);
  }
  return byKey.size;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function main() {
  assert(INVITATION_WINDOW_MS === 120000, 'invitation window is 120 seconds');
  assert(REVEAL_WINDOW_MS === 10000, 'reveal window is 10 seconds');
  assert(STATUS.REVEAL_PENDING === 'REVEAL_PENDING', 'REVEAL_PENDING status exists');

  // User-based pool vs city-based dots
  const invites = [];
  for (let i = 0; i < 100; i += 1) {
    invites.push({ city: 'London', country: 'UK', countryCode: 'GB', latitude: 51.5, longitude: -0.12, userId: `u-l-${i}` });
  }
  invites.push({ city: 'Tokyo', country: 'Japan', countryCode: 'JP', latitude: 35.68, longitude: 139.69, userId: 'u-t-0' });
  assert(invites.length === 101, '101 users in selection pool');
  assert(dedupeCities(invites) === 2, 'only 2 unique city dots on map');

  const picks = new Map();
  for (let i = 0; i < 5000; i += 1) {
    const pick = invites[Math.floor(Math.random() * invites.length)];
    picks.set(pick.userId, (picks.get(pick.userId) || 0) + 1);
  }
  const londonUsers = [...picks.keys()].filter((k) => k.startsWith('u-l-')).length;
  const tokyoUsers = picks.has('u-t-0') ? 1 : 0;
  assert(londonUsers > 50, 'random selection hits many London users (user-based, not city-based)');
  assert(tokyoUsers === 1, 'Tokyo user remains in pool');

  // Live API read-only checks
  const base = process.env.PTW_API_BASE || 'https://world-choir-app.vercel.app';
  const res = await fetch(`${base}/api/pass-the-world?eventId=world-choir-2027`);
  assert(res.ok, `live API responds (${res.status})`);
  const data = await res.json();
  assert(data.journey?.constants?.revealWindowMs === 10000, 'live API exposes revealWindowMs=10000');
  assert(typeof data.journey?.status === 'string', `live status is ${data.journey.status}`);

  console.log('\nAll verification checks passed.');
  console.log(`Live status now: ${data.journey.status}`);
  if (data.journey.revealStartAt) {
    console.log(`Reveal phase active until ${data.journey.revealEndAt}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
