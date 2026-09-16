#!/usr/bin/env node
/**
 * Integration test: invitation window → REVEAL_PENDING → TRAVELLING
 * Uses in-memory mock store (does not touch production blob).
 * Times follow the module's INVITATION_* / ARRIVAL_* constants.
 */
const path = require('path');

const mem = {
  state: null,
  itinerary: null,
  roundInvites: new Map(),
  roundWinner: new Map(),
};

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
      if (p.includes('/invitations/') || p.includes('/participants/') || p.includes('/meta.json')) {
        return data;
      }
      throw new Error(`unmocked write ${p}`);
    },
    findUserByDevice: async () => null,
    readPledge: async () => null,
    updatePledgeLocation: async () => null,
  },
};

const ptw = require('../api/_lib/pass-the-world');

const INV_H = ptw.INVITATION_HOUR_UTC;
const INV_M = ptw.INVITATION_MINUTE_UTC;
const ARR_H = ptw.ARRIVAL_HOUR_UTC;
const ARR_M = ptw.ARRIVAL_MINUTE_UTC;
const WIN_MS = ptw.INVITATION_WINDOW_MS;
const REV_MS = ptw.REVEAL_WINDOW_MS;

function utcOn(day, hour, minute, second = 0, ms = 0) {
  return new Date(Date.UTC(2026, 8, day, hour, minute, second, ms)); // September = month 8
}

function isoOn(day, hour, minute, second = 0, ms = 0) {
  return utcOn(day, hour, minute, second, ms).toISOString();
}

function roundIdFor(day) {
  return `round-${isoOn(day, INV_H, INV_M)}`;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function seedArrived(day = 1) {
  const now = isoOn(day, ARR_H, ARR_M);
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
  const day = 1;
  const openIso = isoOn(day, INV_H, INV_M);
  const closeDate = new Date(new Date(openIso).getTime() + WIN_MS);
  const closeIso = closeDate.toISOString();
  const revealEndIso = new Date(closeDate.getTime() + REV_MS).toISOString();
  const roundId = roundIdFor(day);

  // 1 minute before open: first-call is already open if nobody invited yet
  await seedArrived(day);
  let r = await ptw.advanceStateMachine(utcOn(day, ARR_H, ARR_M, 0));
  const preRoundId = `round-pre-${openIso}`;
  assert(r.state.status === 'WAITING_FOR_FIRST_CALL', 'before open: waiting for first call');
  assert(r.state.activeRoundId === preRoundId, 'pre-ritual round attached');

  await seedArrived(day);
  mem.state.status = 'WAITING_FOR_FIRST_CALL';
  mem.state.activeRoundId = roundIdFor(day - 1 >= 1 ? day - 1 : 31);
  r = await ptw.advanceStateMachine(utcOn(day, ARR_H, ARR_M, 30));
  assert(r.state.status === 'WAITING_FOR_FIRST_CALL', 'pre-open replaces stale WAITING with today pre-round');
  assert(r.state.activeRoundId === preRoundId, 'stale round upgraded to pre-round');

  await seedArrived(day);
  r = await ptw.advanceStateMachine(utcOn(day, INV_H, INV_M, 0, 0));
  assert(r.state.status === 'INVITATION_OPEN', 'invitation opens exactly at ritual time');
  assert(r.state.activeRoundId === roundId, 'active round id matches today open');

  r = await ptw.advanceStateMachine(new Date(new Date(openIso).getTime() + 30000));
  assert(r.state.status === 'INVITATION_OPEN', 'still inside invitation window');

  // Missed window → WAITING
  await seedArrived(day);
  r = await ptw.advanceStateMachine(new Date(closeDate.getTime() + 3 * 60 * 1000));
  assert(r.state.status === 'WAITING_FOR_FIRST_CALL', 'missed window heals to WAITING');
  assert(r.state.activeRoundId === roundId, 'today round id attached');

  // Heal stuck Braga after completed Braga→Madrid
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
        arrivedAt: isoOn(day - 1 > 0 ? day - 1 : 31, ARR_H, ARR_M),
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
        departedAt: isoOn(day - 1 > 0 ? day - 1 : 31, INV_H, INV_M, 10),
        arrivedAt: isoOn(day, ARR_H, ARR_M),
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
  r = await ptw.advanceStateMachine(utcOn(day, ARR_H, ARR_M, 30));
  assert(r.state.currentCity === 'Madrid', 'heals stuck Braga → Madrid after completed travel');
  assert(r.state.currentCountryCode === 'ES', 'country synced to Spain');

  // Heal wrong in-flight origin
  const nextArrive = isoOn(day + 1, ARR_H, ARR_M);
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
        departedAt: isoOn(day, INV_H, INV_M, 20),
        arrivedAt: nextArrive,
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
      city: 'Braga', country: 'Portugal', countryCode: 'PT',
      latitude: 41.5518, longitude: -8.4229,
    },
    destination: {
      city: 'Monaco', country: 'Monaco', countryCode: 'MC',
      latitude: 43.7384, longitude: 7.4246,
    },
    departureAt: isoOn(day, INV_H, INV_M, 20),
    arrivalAt: nextArrive,
    activeRoundId: null,
    invitationCount: 0,
    invitedCities: [],
  };
  r = await ptw.advanceStateMachine(utcOn(day, INV_H, INV_M + 5, 0));
  assert(r.state.status === 'TRAVELLING', 'still travelling to Monaco');
  assert(r.state.origin?.city === 'Madrid', 'in-flight origin healed to Madrid');
  assert(r.state.currentCity === 'Madrid', 'plane current location is Madrid while flying');
  const monacoLeg = r.itinerary.find((e) => e.id === 'leg-monaco');
  assert(monacoLeg?.originCity === 'Madrid', 'itinerary originCity corrected to Madrid');

  // Same-country only → WAITING
  await seedArrived(2);
  const sameCountryRound = roundIdFor(2);
  mem.state.activeRoundId = sameCountryRound;
  mem.state.status = 'INVITATION_OPEN';
  mem.state.invitationOpenAt = isoOn(2, INV_H, INV_M);
  mem.state.invitationCloseAt = new Date(new Date(isoOn(2, INV_H, INV_M)).getTime() + WIN_MS).toISOString();
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
    submittedAt: isoOn(2, INV_H, INV_M, 10),
  });
  r = await ptw.advanceStateMachine(new Date(new Date(isoOn(2, INV_H, INV_M)).getTime() + WIN_MS + 5000));
  assert(r.state.status === 'WAITING_FOR_FIRST_CALL', 'same-country-only round stays waiting');

  // Full ritual with pool
  await seedArrived(day);
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
      submittedAt: isoOn(day, INV_H, INV_M, 10),
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
    submittedAt: isoOn(day, INV_H, INV_M, 20),
  });

  r = await ptw.advanceStateMachine(new Date(new Date(openIso).getTime() + 30000));
  assert(r.state.status === 'INVITATION_OPEN', 'window open mid-ritual');
  const mid = await ptw.getPassTheWorld({ now: new Date(new Date(openIso).getTime() + 45000).toISOString() });
  assert(mid.journey.status === 'INVITATION_OPEN', 'still open mid-window');
  assert(mid.journey.invitedCities.length === 101, 'map gets one light per inviting user');
  assert(mid.journey.invitationCount === 101, '101 users in pool');
  assert(
    mid.journey.invitedCities.filter((c) => c.city === 'London').length === 100,
    '100 London invite lights'
  );
  assert(
    mid.journey.invitedCities.some((c) => c.city === 'Tokyo' && c.userId === 'user-t-0'),
    'Tokyo invite light present'
  );

  r = await ptw.advanceStateMachine(closeDate);
  assert(r.state.status === 'REVEAL_PENDING', 'window close enters REVEAL_PENDING');
  assert(r.state.revealStartAt === closeIso, 'reveal starts at window close');
  assert(r.state.revealEndAt === revealEndIso, 'reveal ends after reveal window');
  assert(mem.roundWinner.size === 1, 'winner chosen in background');

  r = await ptw.advanceStateMachine(new Date(closeDate.getTime() + 5000));
  assert(r.state.status === 'REVEAL_PENDING', 'still revealing mid-countdown');
  const pubMid = await ptw.getPassTheWorld({ now: new Date(closeDate.getTime() + 5000).toISOString() });
  assert(!pubMid.journey.destination, 'destination hidden during reveal');

  r = await ptw.advanceStateMachine(new Date(closeDate.getTime() + REV_MS));
  assert(r.state.status === 'TRAVELLING', 'reveal end starts travel');
  assert(r.state.destination?.city, 'destination set after reveal');
  assert(r.state.departureAt === revealEndIso, 'departure at reveal end');
  assert(r.itinerary.length === 2, 'itinerary updated');

  // Current trip arrival rewritten to next canonical landing
  assert(
    r.state.arrivalAt === ptw.computeArrivalAt(revealEndIso).toISOString(),
    'arrival is next canonical landing (1 min before next invitation)'
  );

  const winner = [...mem.roundWinner.values()][0];
  assert(winner.userId, 'winner is a specific user');

  console.log('\nIntegration flow passed.');
  console.log(`Ritual open: ${INV_H}:${String(INV_M).padStart(2, '0')} UTC · Land: ${ARR_H}:${String(ARR_M).padStart(2, '0')} UTC`);
  console.log(`Winner: ${winner.city}, ${winner.country} (${winner.userId})`);

  // Stale same-country winner must not block first eligible click
  await seedArrived(3);
  mem.roundWinner.clear();
  const staleRoundId = roundIdFor(3);
  mem.state.status = 'WAITING_FOR_FIRST_CALL';
  mem.state.activeRoundId = staleRoundId;
  mem.state.invitationOpenAt = isoOn(3, INV_H, INV_M);
  mem.state.invitationCloseAt = new Date(new Date(isoOn(3, INV_H, INV_M)).getTime() + WIN_MS).toISOString();
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
    now: new Date(new Date(isoOn(3, INV_H, INV_M)).getTime() + WIN_MS + 60000).toISOString(),
  });
  assert(inviteRes.journey.status === 'TRAVELLING', 'Spanish first call starts travel despite stale PT winner');
  assert(inviteRes.journey.destination?.city === 'Madrid', 'destination is Madrid');

  // --- Regression: no rogue mid-day reveal / no instant land on past canonical arrival ---
  delete require.cache[path.resolve(__dirname, '../api/_lib/pass-the-world.js')];
  const ptw2 = require('../api/_lib/pass-the-world');

  await seedArrived(16);
  const evening = utcOn(16, 18, 7, 0);
  const dayRound = roundIdFor(16);
  const rioInvite = {
    id: 'inv-rio',
    roundId: dayRound,
    userId: 'user-rio',
    voiceNumber: 88,
    city: 'Rio de Janeiro',
    country: 'Brazil',
    countryCode: 'BR',
    latitude: -22.9068,
    longitude: -43.1729,
    submittedAt: evening.toISOString(),
  };
  await writeInvite(dayRound, rioInvite);
  mem.roundWinner.set(`wc-data/pass-the-world/rounds/${dayRound}/winner.json`, {
    ...rioInvite,
    invitationId: rioInvite.id,
    selectedAt: evening.toISOString(),
    selectionMode: 'first_call',
  });
  mem.state.status = 'ARRIVED';
  mem.state.activeRoundId = dayRound;
  mem.state.invitationCloseAt = null;
  r = await ptw2.advanceStateMachine(evening);
  assert(r.state.status !== 'REVEAL_PENDING', 'evening ARRIVED+winner must not enter REVEAL_PENDING');
  assert(r.state.status === 'TRAVELLING', 'evening winner starts travel immediately');
  assert(
    r.state.arrivalAt === isoOn(17, ARR_H, ARR_M),
    'evening first-call lands at next canonical 15:59 UTC'
  );
  assert(r.state.activeRoundId == null, 'travel clears activeRoundId');

  // Stale reveal must not clobber an in-flight journey
  const travelSnap = { ...mem.state };
  mem.state = {
    version: 1,
    status: 'ARRIVED',
    currentCity: 'Braga',
    currentCountry: 'Portugal',
    currentCountryCode: 'PT',
    currentLatitude: 41.5518,
    currentLongitude: -8.4229,
    currentItineraryEntryId: 'seed-braga',
    activeRoundId: dayRound,
    invitationCloseAt: null,
    invitationCount: 0,
    invitedCities: [],
  };
  r = await ptw2.advanceStateMachine(new Date(evening.getTime() + 2000));
  assert(r.state.status === 'TRAVELLING', 'stale ARRIVED settle cannot clobber TRAVELLING');
  assert(r.state.destination?.city === 'Rio de Janeiro', 'in-flight destination preserved');
  assert(r.state.arrivalAt === travelSnap.arrivalAt, 'in-flight arrivalAt preserved');

  // Past canonical arrival while travelling must be healed forward (not instant arrive)
  await seedArrived(16);
  const pastArrive = isoOn(16, ARR_H, ARR_M);
  mem.itinerary.entries.push({
    id: 'leg-rio-past',
    sequence: 2,
    city: 'Rio de Janeiro',
    country: 'Brazil',
    countryCode: 'BR',
    latitude: -22.9068,
    longitude: -43.1729,
    originCity: 'Braga',
    originCountry: 'Portugal',
    departedAt: evening.toISOString(),
    arrivedAt: pastArrive,
    isSeed: false,
  });
  mem.state = {
    version: 2,
    status: 'TRAVELLING',
    currentCity: 'Braga',
    currentCountry: 'Portugal',
    currentCountryCode: 'PT',
    currentLatitude: 41.5518,
    currentLongitude: -8.4229,
    currentItineraryEntryId: 'leg-rio-past',
    origin: {
      city: 'Braga', country: 'Portugal', countryCode: 'PT',
      latitude: 41.5518, longitude: -8.4229,
    },
    destination: {
      city: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR',
      latitude: -22.9068, longitude: -43.1729,
    },
    departureAt: evening.toISOString(),
    arrivalAt: pastArrive,
    activeRoundId: null,
    invitationCount: 0,
    invitedCities: [],
  };
  r = await ptw2.advanceStateMachine(evening);
  assert(r.state.status === 'TRAVELLING', 'past arrivalAt does not instantly arrive');
  assert(r.state.arrivalAt === isoOn(17, ARR_H, ARR_M), 'past arrivalAt healed to next landing');
  assert(r.state.currentCity === 'Braga', 'still at origin until real landing');

  console.log('\nAll Pass the World tests passed.');
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
