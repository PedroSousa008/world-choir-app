#!/usr/bin/env node
/**
 * Integration test: invitation window → REVEAL_PENDING → TRAVELLING
 * Uses in-memory mock store (does not touch production blob).
 */
const path = require('path');

const mem = {
  state: null,
  itinerary: null,
  roundInvites: new Map(),
  roundWinner: new Map(),
};

function roundInvitesIndexPath(roundId) {
  return `rounds/${roundId}/index`;
}
function roundInvitationPath(roundId, userId) {
  return `rounds/${roundId}/invites/${userId}`;
}
function roundWinnerPath(roundId) {
  return `rounds/${roundId}/winner`;
}

const storePath = path.resolve(__dirname, '../api/_lib/store.js');
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: {
    assertBlobConfigured: () => {},
    readBlobJson: async (p) => {
      if (p === 'wc-data/pass-the-world/state.json') {
        if (!mem.state) throw new Error('missing');
        return mem.state;
      }
      if (p === 'wc-data/pass-the-world/itinerary.json') {
        if (!mem.itinerary) throw new Error('missing');
        return mem.itinerary;
      }
      if (p.endsWith('/winner.json')) {
        const w = mem.roundWinner.get(p);
        if (!w) throw new Error('missing');
        return w;
      }
      if (p.endsWith('/invitations-index.json')) {
        return mem.roundInvites.get(p) || { invitations: [] };
      }
      if (p.includes('/invitations/') && !p.endsWith('invitations-index.json')) {
        throw new Error('missing');
      }
      throw new Error(`unmocked read ${p}`);
    },
    writeJson: async (p, data, opts = {}) => {
      if (p === 'wc-data/pass-the-world/state.json') {
        mem.state = data;
        return data;
      }
      if (p === 'wc-data/pass-the-world/itinerary.json') {
        mem.itinerary = data;
        return data;
      }
      if (p.includes('/winner.json')) {
        if (!opts.overwrite && mem.roundWinner.has(p)) throw new Error('exists');
        mem.roundWinner.set(p, data);
        return data;
      }
      if (p.includes('/invitations-index.json')) {
        mem.roundInvites.set(p, data);
        return data;
      }
      if (p.includes('/invitations/')) {
        return data;
      }
      throw new Error(`unmocked write ${p}`);
    },
    findUserByDevice: async () => null,
    readPledge: async () => null,
  },
};

const ptw = require('../api/_lib/pass-the-world');

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function seedArrived() {
  const now = '2026-09-01T15:59:00.000Z';
  mem.itinerary = {
    entries: [{
      id: 'seed-braga',
      sequence: 1,
      city: 'Braga',
      country: 'Portugal',
      countryCode: 'PT',
      latitude: 41.5518,
      longitude: -8.4229,
      arrivedAt: now,
      createdAt: now,
      isSeed: true,
    }],
  };
  mem.state = {
    version: 1,
    status: 'ARRIVED',
    currentCity: 'Braga',
    currentCountry: 'Portugal',
    currentCountryCode: 'PT',
    currentLatitude: 41.5518,
    currentLongitude: -8.4229,
    currentItineraryEntryId: 'seed-braga',
    activeRoundId: null,
    invitationCount: 0,
    invitedCities: [],
  };
}

async function writeInvite(roundId, invite) {
  const indexPath = `wc-data/pass-the-world/rounds/${roundId}/invitations-index.json`;
  const userPath = `wc-data/pass-the-world/rounds/${roundId}/invitations/${invite.userId}.json`;
  await require('../api/_lib/store').writeJson(userPath, invite, { overwrite: true });
  const existing = mem.roundInvites.get(indexPath)?.invitations || [];
  const without = existing.filter((e) => e.userId !== invite.userId);
  without.push({
    id: invite.id,
    userId: invite.userId,
    voiceNumber: invite.voiceNumber,
    city: invite.city,
    country: invite.country,
    countryCode: invite.countryCode,
    latitude: invite.latitude,
    longitude: invite.longitude,
    submittedAt: invite.submittedAt,
  });
  mem.roundInvites.set(indexPath, { invitations: without });
}

async function main() {
  await seedArrived();

  const tOpen = new Date('2026-09-01T16:00:30.000Z');
  let r = await ptw.advanceStateMachine(tOpen);
  assert(r.state.status === 'INVITATION_OPEN', '16:00:30 opens invitation window');
  const roundId = r.state.activeRoundId;
  assert(roundId, 'active round id set');

  // 100 London + 1 Tokyo users
  for (let i = 0; i < 100; i += 1) {
    await writeInvite(roundId, {
      id: `inv-l-${i}`,
      roundId,
      userId: `user-l-${i}`,
      voiceNumber: 100 + i,
      city: 'London',
      country: 'United Kingdom',
      countryCode: 'GB',
      latitude: 51.5074,
      longitude: -0.1278,
      submittedAt: '2026-09-01T16:00:10.000Z',
    });
  }
  await writeInvite(roundId, {
    id: 'inv-t-0',
    roundId,
    userId: 'user-t-0',
    voiceNumber: 7,
    city: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    latitude: 35.6762,
    longitude: 139.6503,
    submittedAt: '2026-09-01T16:00:20.000Z',
  });

  r = await ptw.advanceStateMachine(tOpen);
  assert(r.state.invitationCount === 0, 'invitationCount synced on next read via getPassTheWorld path');
  // sync via getPassTheWorld
  const mid = await ptw.getPassTheWorld({ now: '2026-09-01T16:00:45.000Z' });
  assert(mid.journey.status === 'INVITATION_OPEN', 'still open at 16:00:45');
  assert(mid.journey.invitedCities.length === 2, 'map gets 2 city dots (London + Tokyo)');
  assert(mid.journey.invitationCount === 101, '101 users in pool');

  const tClose = new Date('2026-09-01T16:01:00.000Z');
  r = await ptw.advanceStateMachine(tClose);
  assert(r.state.status === 'REVEAL_PENDING', '16:01:00 enters REVEAL_PENDING');
  assert(r.state.revealStartAt === '2026-09-01T16:01:00.000Z', 'reveal starts at window close');
  assert(r.state.revealEndAt === '2026-09-01T16:01:10.000Z', 'reveal ends 10s later');
  assert(r.state.invitedCities.length === 2, 'invite cities visible during reveal');
  assert(mem.roundWinner.size === 1, 'winner chosen in background');

  const tRevealMid = new Date('2026-09-01T16:01:05.000Z');
  r = await ptw.advanceStateMachine(tRevealMid);
  assert(r.state.status === 'REVEAL_PENDING', 'still revealing at 16:01:05');
  const pubMid = await ptw.getPassTheWorld({ now: '2026-09-01T16:01:05.000Z' });
  assert(!pubMid.journey.destination, 'destination hidden during reveal');
  assert(pubMid.journey.revealEndAt === '2026-09-01T16:01:10.000Z', 'client gets revealEndAt');

  const tRevealEnd = new Date('2026-09-01T16:01:10.000Z');
  r = await ptw.advanceStateMachine(tRevealEnd);
  assert(r.state.status === 'TRAVELLING', '16:01:10 starts travel');
  assert(r.state.destination?.city, 'destination set after reveal');
  assert(r.state.departureAt === '2026-09-01T16:01:10.000Z', 'departure at reveal end');
  assert(r.state.invitedCities.length === 0, 'invite dots cleared after travel starts');
  assert(r.state.lastReveal?.city, 'lastReveal populated');
  assert(r.itinerary.length === 2, 'itinerary updated');

  const winner = [...mem.roundWinner.values()][0];
  assert(winner.userId, 'winner is a specific user');
  assert(
    winner.userId.startsWith('user-l-') || winner.userId === 'user-t-0',
    `winner user id valid: ${winner.userId}`
  );

  console.log('\nIntegration flow passed.');
  console.log(`Winner: ${winner.city}, ${winner.country} (${winner.userId})`);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
