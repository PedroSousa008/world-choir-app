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
      if (p.includes('/participants/')) {
        return data;
      }
      if (p.includes('/meta.json')) {
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
  mem.roundInvites.clear();
  mem.roundWinner.clear();
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
  // Before 16:00 UTC the Visit button must never appear (no WAITING from yesterday).
  await seedArrived();
  let r = await ptw.advanceStateMachine(new Date('2026-09-01T15:59:00.000Z'));
  assert(r.state.status === 'ARRIVED', '15:59 UTC stays ARRIVED — button closed');
  assert(!r.state.activeRoundId, 'no round attached before 16:00');

  await seedArrived();
  mem.state.status = 'WAITING_FOR_FIRST_CALL';
  mem.state.activeRoundId = 'round-2026-08-31T16:00:00.000Z';
  r = await ptw.advanceStateMachine(new Date('2026-09-01T15:59:30.000Z'));
  assert(r.state.status === 'ARRIVED', 'pre-16:00 clears stale WAITING from yesterday');

  await seedArrived();
  r = await ptw.advanceStateMachine(new Date('2026-09-01T16:00:00.000Z'));
  assert(r.state.status === 'INVITATION_OPEN', '16:00:00.000 exactly opens invitation window');
  const roundId = r.state.activeRoundId;
  assert(roundId === 'round-2026-09-01T16:00:00.000Z', 'active round id is today 16:00');

  r = await ptw.advanceStateMachine(new Date('2026-09-01T16:00:30.000Z'));
  assert(r.state.status === 'INVITATION_OPEN', '16:00:30 still inside 120s window');

  // Missed live window: after 16:02 (120s) heal to WAITING.
  await seedArrived();
  r = await ptw.advanceStateMachine(new Date('2026-09-01T16:05:00.000Z'));
  assert(r.state.status === 'WAITING_FOR_FIRST_CALL', 'missed window heals to WAITING at 16:05');
  assert(r.state.activeRoundId === 'round-2026-09-01T16:00:00.000Z', 'today round id attached');

  // Heal stuck Braga after completed Braga→Madrid leg.
  mem.roundInvites.clear();
  mem.roundWinner.clear();
  mem.itinerary = {
    entries: [
      {
        id: 'seed-braga',
        sequence: 1,
        city: 'Braga',
        country: 'Portugal',
        countryCode: 'PT',
        latitude: 41.5518,
        longitude: -8.4229,
        arrivedAt: '2026-08-30T15:59:00.000Z',
        isSeed: true,
      },
      {
        id: 'leg-madrid',
        sequence: 2,
        city: 'Madrid',
        country: 'Spain',
        countryCode: 'ES',
        latitude: 40.4168,
        longitude: -3.7038,
        originCity: 'Braga',
        originCountry: 'Portugal',
        departedAt: '2026-08-31T16:02:10.000Z',
        arrivedAt: '2026-09-01T15:59:00.000Z',
        isSeed: false,
      },
    ],
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
  r = await ptw.advanceStateMachine(new Date('2026-09-01T15:59:30.000Z'));
  assert(r.state.currentCity === 'Madrid', 'heals stuck Braga → Madrid after completed travel');
  assert(r.state.currentCountryCode === 'ES', 'country synced to Spain');

  // Heal wrong in-flight origin (Braga→Monaco should be Madrid→Monaco).
  mem.itinerary = {
    entries: [
      ...mem.itinerary.entries,
      {
        id: 'leg-monaco',
        sequence: 3,
        city: 'Monaco',
        country: 'Monaco',
        countryCode: 'MC',
        latitude: 43.7384,
        longitude: 7.4246,
        originCity: 'Braga',
        originCountry: 'Portugal',
        originLatitude: 41.5518,
        originLongitude: -8.4229,
        departedAt: '2026-09-01T16:05:20.000Z',
        arrivedAt: '2026-09-02T15:59:00.000Z',
        isSeed: false,
      },
    ],
  };
  mem.state = {
    version: 2,
    status: 'TRAVELLING',
    currentCity: 'Braga',
    currentCountry: 'Portugal',
    currentCountryCode: 'PT',
    currentLatitude: 41.5518,
    currentLongitude: -8.4229,
    currentItineraryEntryId: 'leg-monaco',
    origin: {
      city: 'Braga',
      country: 'Portugal',
      countryCode: 'PT',
      latitude: 41.5518,
      longitude: -8.4229,
    },
    destination: {
      city: 'Monaco',
      country: 'Monaco',
      countryCode: 'MC',
      latitude: 43.7384,
      longitude: 7.4246,
    },
    departureAt: '2026-09-01T16:05:20.000Z',
    arrivalAt: '2026-09-02T15:59:00.000Z',
    activeRoundId: null,
    invitationCount: 0,
    invitedCities: [],
  };
  r = await ptw.advanceStateMachine(new Date('2026-09-01T17:00:00.000Z'));
  assert(r.state.status === 'TRAVELLING', 'still travelling to Monaco');
  assert(r.state.origin?.city === 'Madrid', 'in-flight origin healed to Madrid');
  assert(r.state.currentCity === 'Madrid', 'plane current location is Madrid while flying');
  const monacoLeg = r.itinerary.find((e) => e.id === 'leg-monaco');
  assert(monacoLeg?.originCity === 'Madrid', 'itinerary originCity corrected to Madrid');

  // Same-country invites must never win or move the plane.
  await seedArrived();
  const sameCountryRound = 'round-2026-09-02T16:00:00.000Z';
  mem.state.activeRoundId = sameCountryRound;
  mem.state.status = 'INVITATION_OPEN';
  mem.state.invitationOpenAt = '2026-09-02T16:00:00.000Z';
  mem.state.invitationCloseAt = '2026-09-02T16:02:00.000Z';
  await writeInvite(sameCountryRound, {
    id: 'inv-pt',
    roundId: sameCountryRound,
    userId: 'user-pt',
    voiceNumber: 4,
    city: 'Porto',
    country: 'Portugal',
    countryCode: 'PT',
    latitude: 41.15,
    longitude: -8.61,
    submittedAt: '2026-09-02T16:00:10.000Z',
  });
  r = await ptw.advanceStateMachine(new Date('2026-09-02T16:02:05.000Z'));
  assert(r.state.status === 'WAITING_FOR_FIRST_CALL', 'same-country-only round stays waiting');
  assert(!r.itinerary.some((e) => e.originCountry === 'Portugal' && e.country === 'Portugal' && !e.isSeed), 'no same-country leg added');

  await seedArrived();
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

  r = await ptw.advanceStateMachine(new Date('2026-09-01T16:00:30.000Z'));
  assert(r.state.status === 'INVITATION_OPEN', 'window open mid-ritual');
  const mid = await ptw.getPassTheWorld({ now: '2026-09-01T16:00:45.000Z' });
  assert(mid.journey.status === 'INVITATION_OPEN', 'still open at 16:00:45');
  assert(mid.journey.invitedCities.length === 2, 'map gets 2 city dots (London + Tokyo)');
  assert(mid.journey.invitationCount === 101, '101 users in pool');

  // 120s window closes at 16:02:00
  const tClose = new Date('2026-09-01T16:02:00.000Z');
  r = await ptw.advanceStateMachine(tClose);
  assert(r.state.status === 'REVEAL_PENDING', '16:02:00 enters REVEAL_PENDING');
  assert(r.state.revealStartAt === '2026-09-01T16:02:00.000Z', 'reveal starts at window close');
  assert(r.state.revealEndAt === '2026-09-01T16:02:10.000Z', 'reveal ends 10s later');
  assert(r.state.invitedCities.length === 2, 'invite cities visible during reveal');
  assert(mem.roundWinner.size === 1, 'winner chosen in background');

  const tRevealMid = new Date('2026-09-01T16:02:05.000Z');
  r = await ptw.advanceStateMachine(tRevealMid);
  assert(r.state.status === 'REVEAL_PENDING', 'still revealing at 16:02:05');
  const pubMid = await ptw.getPassTheWorld({ now: '2026-09-01T16:02:05.000Z' });
  assert(!pubMid.journey.destination, 'destination hidden during reveal');
  assert(pubMid.journey.revealEndAt === '2026-09-01T16:02:10.000Z', 'client gets revealEndAt');

  const tRevealEnd = new Date('2026-09-01T16:02:10.000Z');
  r = await ptw.advanceStateMachine(tRevealEnd);
  assert(r.state.status === 'TRAVELLING', '16:02:10 starts travel');
  assert(r.state.destination?.city, 'destination set after reveal');
  assert(r.state.departureAt === '2026-09-01T16:02:10.000Z', 'departure at reveal end');
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

  // Stale invalid winner must not block the first eligible post-window click.
  await seedArrived();
  mem.roundWinner.clear();
  const staleRoundId = 'round-2026-09-03T16:00:00.000Z';
  mem.state.status = 'WAITING_FOR_FIRST_CALL';
  mem.state.activeRoundId = staleRoundId;
  mem.state.invitationOpenAt = '2026-09-03T16:00:00.000Z';
  mem.state.invitationCloseAt = '2026-09-03T16:02:00.000Z';
  mem.roundWinner.set(`wc-data/pass-the-world/rounds/${staleRoundId}/winner.json`, {
    invitationId: 'stale-pt',
    id: 'stale-pt',
    userId: 'user-pt',
    city: 'Braga',
    country: 'Portugal',
    countryCode: 'PT',
    latitude: 41.55,
    longitude: -8.42,
    voiceNumber: 4,
  });
  const store = require.cache[storePath].exports;
  store.findUserByDevice = async () => ({
    id: 'user-es',
    city: 'Madrid',
    country: 'Spain',
    latitude: 40.4168,
    longitude: -3.7038,
  });
  store.readPledge = async () => ({
    city: 'Madrid',
    country: 'Spain',
    latitude: 40.4168,
    longitude: -3.7038,
    voice_number: 99,
  });
  delete require.cache[path.resolve(__dirname, '../api/_lib/pass-the-world.js')];
  const ptwInvite = require('../api/_lib/pass-the-world');
  const inviteRes = await ptwInvite.submitInvitation({
    deviceId: 'dev-es',
    now: '2026-09-03T16:05:00.000Z',
  });
  assert(inviteRes.journey.status === 'TRAVELLING', 'Spanish first call starts travel despite stale PT winner');
  assert(inviteRes.journey.destination?.city === 'Madrid', 'destination is Madrid');
  assert(!inviteRes.alreadyMoving, 'does not report false already moving');

  console.log('\nAll Pass the World tests passed.');
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
