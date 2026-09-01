/**
 * Pass the World — Owner Mode analytics (real blob data only).
 */
const {
  readBlobJson,
  listBlobs,
  listAllPledges,
} = require('./store');
const {
  getPassTheWorld,
  haversineKm,
  STATUS,
  INVITATION_WINDOW_MS,
  REVEAL_WINDOW_MS,
} = require('./pass-the-world');

const ROOT = 'wc-data/pass-the-world';
const EVENT_ID = 'world-choir-2027';

function normalizeCountry(country) {
  return String(country || '').trim().toLowerCase();
}

function cityKey(city, country) {
  return `${normalizeCountry(country)}|${String(city || '').trim().toLowerCase()}`;
}

function resolveCountryCode(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const key = raw.toLowerCase();
  const map = {
    portugal: 'PT', 'united kingdom': 'GB', uk: 'GB', japan: 'JP', argentina: 'AR',
    'united states': 'US', usa: 'US', brazil: 'BR', kenya: 'KE', spain: 'ES',
    france: 'FR', germany: 'DE', italy: 'IT', canada: 'CA', australia: 'AU',
  };
  return map[key] || null;
}

function utcDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return null; }
}

function daysAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function listRoundIds() {
  const blobs = await listBlobs(`${ROOT}/rounds/`);
  const ids = new Set();
  for (const blob of blobs) {
    const m = blob.pathname.match(/rounds\/(round-[^/]+)\//);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
}

async function readRoundMeta(roundId) {
  try { return await readBlobJson(`${ROOT}/rounds/${roundId}/meta.json`); } catch { return null; }
}

async function readRoundInvites(roundId) {
  try {
    const index = await readBlobJson(`${ROOT}/rounds/${roundId}/invitations-index.json`);
    return Array.isArray(index?.invitations) ? index.invitations : [];
  } catch { return []; }
}

async function readWinner(roundId) {
  try { return await readBlobJson(`${ROOT}/rounds/${roundId}/winner.json`); } catch { return null; }
}

function computeEligiblePledges(pledges, worldCountryCode) {
  const eligible = [];
  const seen = new Set();
  for (const p of pledges) {
    const userId = p.user_id || p.userId;
    if (!userId || seen.has(userId)) continue;
    if (!p.city || !p.country) continue;
    if (p.latitude == null || p.longitude == null) continue;
    const code = resolveCountryCode(p.country_code || p.countryCode || p.country);
    if (worldCountryCode && code && code === worldCountryCode) continue;
    seen.add(userId);
    eligible.push({
      userId,
      voiceNumber: p.voice_number ?? p.voiceNumber ?? null,
      city: p.city,
      country: p.country,
      countryCode: code,
      latitude: p.latitude,
      longitude: p.longitude,
    });
  }
  return eligible;
}

function worldAtTime(itinerary, atMs) {
  if (!itinerary?.length) return null;
  let current = itinerary[0];
  for (const entry of itinerary) {
    const arrived = entry.arrivedAt ? new Date(entry.arrivedAt).getTime() : null;
    const departed = entry.departedAt ? new Date(entry.departedAt).getTime() : null;
    if (arrived != null && arrived <= atMs) current = entry;
    if (departed != null && departed <= atMs && entry !== itinerary[0]) {
      /* still at previous until arrival of next — simplified: use last arrived */
    }
  }
  return current;
}

function buildRoundFromData(roundId, meta, invites, winner, itinerary) {
  const openAt = meta?.openAt || (roundId.startsWith('round-') ? roundId.slice(6) : null);
  const date = meta?.date || utcDate(openAt);
  const openMs = openAt ? new Date(openAt).getTime() : null;

  const cityMap = new Map();
  const countryMap = new Map();
  let firstTimeCount = 0;
  let returningCount = 0;
  const windowBuckets = meta?.windowBuckets || new Array(60).fill(0);

  if (!meta?.windowBuckets?.length) {
    for (const inv of invites) {
      if (openMs == null || !inv.submittedAt) continue;
      const sec = Math.min(59, Math.max(0, Math.floor((new Date(inv.submittedAt).getTime() - openMs) / 1000)));
      windowBuckets[sec] += 1;
    }
  }

  for (const inv of invites) {
    const ck = cityKey(inv.city, inv.country);
    if (!cityMap.has(ck)) {
      cityMap.set(ck, {
        city: inv.city,
        country: inv.country,
        countryCode: inv.countryCode || resolveCountryCode(inv.country),
        latitude: inv.latitude,
        longitude: inv.longitude,
        invitations: 0,
        participants: new Set(),
        days: new Set([date]),
      });
    }
    const c = cityMap.get(ck);
    c.invitations += 1;
    c.participants.add(inv.userId);

    const cc = inv.countryCode || resolveCountryCode(inv.country) || normalizeCountry(inv.country);
    if (!countryMap.has(cc)) {
      countryMap.set(cc, {
        country: inv.country,
        countryCode: inv.countryCode || resolveCountryCode(inv.country),
        invitations: 0,
        participants: new Set(),
        cities: new Set(),
      });
    }
    const co = countryMap.get(cc);
    co.invitations += 1;
    co.participants.add(inv.userId);
    co.cities.add(ck);

    if (inv.firstTimeEver) firstTimeCount += 1;
    else if (inv.firstTimeEver === false) returningCount += 1;
  }

  const sorted = [...invites].sort((a, b) => (
    new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt).getTime()
  ));
  const first = sorted[0] || null;
  const firstSec = first && openMs != null
    ? Math.max(0, Math.round((new Date(first.submittedAt).getTime() - openMs) / 1000))
    : meta?.firstInvitationSecondsAfterOpen ?? null;

  const selectionMethod = winner?.selectionMode
    || meta?.selectionMethod
    || (invites.length ? 'window' : null);
  const wasEmpty = meta?.wasEmpty != null
    ? Boolean(meta.wasEmpty)
    : invites.length === 0;

  let journeyDistanceKm = meta?.journeyDistanceKm ?? null;
  if (journeyDistanceKm == null && winner && meta?.startingLatitude != null) {
    journeyDistanceKm = Math.round(haversineKm(
      meta.startingLatitude, meta.startingLongitude,
      winner.latitude, winner.longitude
    ));
  }

  const visitedCities = new Set(
    (itinerary || []).filter((e) => !e.isSeed).map((e) => cityKey(e.city, e.country))
  );

  const byCountry = [...countryMap.entries()]
    .map(([code, v]) => ({
      country: v.country,
      countryCode: v.countryCode || code,
      invitations: v.invitations,
      uniqueParticipants: v.participants.size,
      uniqueCities: v.cities.size,
      pctOfRound: invites.length ? (v.invitations / invites.length) * 100 : 0,
    }))
    .sort((a, b) => b.invitations - a.invitations);

  const byCity = [...cityMap.values()]
    .map((v) => ({
      city: v.city,
      country: v.country,
      countryCode: v.countryCode,
      latitude: v.latitude,
      longitude: v.longitude,
      invitations: v.invitations,
      uniqueParticipants: v.participants.size,
      daysCalled: v.days.size,
      visitedByJourney: visitedCities.has(cityKey(v.city, v.country)),
    }))
    .sort((a, b) => b.invitations - a.invitations);

  return {
    roundId,
    date,
    openAt,
    closeAt: meta?.closeAt || (openMs != null ? new Date(openMs + INVITATION_WINDOW_MS).toISOString() : null),
    startingCity: meta?.startingCity || null,
    startingCountry: meta?.startingCountry || null,
    startingCountryCode: meta?.startingCountryCode || null,
    invitationCount: invites.length,
    uniqueParticipants: invites.length,
    uniqueCities: cityMap.size,
    uniqueCountries: countryMap.size,
    firstInvitationAt: first?.submittedAt || meta?.firstInvitationAt || null,
    firstInvitationSecondsAfterOpen: firstSec,
    wasEmpty,
    selectionMethod,
    selectedAt: winner?.selectedAt || meta?.selectedAt || null,
    selectedVoiceNumber: winner?.voiceNumber ?? meta?.selectedVoiceNumber ?? null,
    selectedCity: winner?.city || meta?.selectedCity || null,
    selectedCountry: winner?.country || meta?.selectedCountry || null,
    selectedUserId: winner?.userId || meta?.selectedUserId || null,
    journeyDistanceKm,
    status: meta?.status || (wasEmpty ? 'empty' : (winner ? 'settled' : 'in_progress')),
    windowBuckets,
    firstTimeCount,
    returningCount,
    byCountry,
    byCity,
  };
}

function statusLabel(status, state) {
  switch (status) {
    case STATUS.INVITATION_OPEN:
      return { label: 'Invitation Window Open', tone: 'live' };
    case STATUS.REVEAL_PENDING:
      return { label: '10-Second Destination Reveal', tone: 'live' };
    case STATUS.TRAVELLING:
      return { label: 'Travelling', tone: 'active' };
    case STATUS.WAITING_FOR_FIRST_CALL:
      return { label: 'Waiting for First Invitation', tone: 'waiting' };
    case STATUS.ARRIVED:
    case STATUS.INITIAL:
      return { label: 'Waiting for 16:00 UTC', tone: 'idle' };
    default:
      return { label: String(status || 'Unknown'), tone: 'idle' };
  }
}

function bucketSeries(rounds, key = 'invitationCount') {
  const byDate = new Map();
  for (const r of rounds) {
    if (!r.date) continue;
    byDate.set(r.date, (byDate.get(r.date) || 0) + (Number(r[key]) || 0));
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

function filterByRange(series, range) {
  if (!range || range === 'all') return series;
  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[range] || 30;
  const cutoff = daysAgo(days);
  return series.filter((p) => p.date >= cutoff);
}

async function buildPassTheWorldOwnerIntel({ range = '30d', roundId = null } = {}) {
  const now = new Date();
  const [livePayload, pledges, roundIds] = await Promise.all([
    getPassTheWorld({ eventId: EVENT_ID, now: now.toISOString() }),
    listAllPledges().catch(() => []),
    listRoundIds().catch(() => []),
  ]);

  const journey = livePayload.journey || {};
  const itinerary = livePayload.itinerary || [];
  const stateStatus = journey.status;

  let stateRaw = null;
  try { stateRaw = await readBlobJson(`${ROOT}/state.json`); } catch { /* */ }

  const eventPledges = pledges.filter((p) => String(p.event_id || p.eventId || EVENT_ID) === EVENT_ID);

  const rounds = [];
  for (const id of roundIds) {
    const [meta, invites, winner] = await Promise.all([
      readRoundMeta(id),
      readRoundInvites(id),
      readWinner(id),
    ]);
    rounds.push(buildRoundFromData(id, meta, invites, winner, itinerary));
  }
  rounds.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const allInvites = rounds.flatMap((r) => r.invitationCount || 0);
  const totalInvitations = allInvites.reduce((s, n) => s + n, 0);

  const participantIds = new Set();
  const countryInviteTotals = new Map();
  const countryParticipantSets = new Map();
  const countryNames = new Map();
  const cityInviteTotals = new Map();
  const inviteDatesByUser = new Map();
  const inviteUsersByDate = new Map();

  for (const round of rounds) {
    const invs = await readRoundInvites(round.roundId);
    for (const inv of invs) {
      participantIds.add(inv.userId);
      if (!inviteDatesByUser.has(inv.userId)) inviteDatesByUser.set(inv.userId, new Set());
      inviteDatesByUser.get(inv.userId).add(round.date);
      if (round.date) {
        if (!inviteUsersByDate.has(round.date)) inviteUsersByDate.set(round.date, new Set());
        inviteUsersByDate.get(round.date).add(inv.userId);
      }

      const cc = inv.countryCode || resolveCountryCode(inv.country) || inv.country;
      countryInviteTotals.set(cc, (countryInviteTotals.get(cc) || 0) + 1);
      countryNames.set(cc, inv.country);
      if (!countryParticipantSets.has(cc)) countryParticipantSets.set(cc, new Set());
      countryParticipantSets.get(cc).add(inv.userId);

      const ck = cityKey(inv.city, inv.country);
      if (!cityInviteTotals.has(ck)) {
        cityInviteTotals.set(ck, {
          city: inv.city,
          country: inv.country,
          countryCode: inv.countryCode,
          latitude: inv.latitude,
          longitude: inv.longitude,
          invitations: 0,
          participants: new Set(),
          days: new Set(),
          lastAt: inv.submittedAt,
        });
      }
      const city = cityInviteTotals.get(ck);
      city.invitations += 1;
      city.participants.add(inv.userId);
      city.days.add(round.date);
      if (inv.submittedAt && (!city.lastAt || inv.submittedAt > city.lastAt)) city.lastAt = inv.submittedAt;
    }
  }

  const journeyStops = itinerary.filter((e) => !e.isSeed);
  const journeyCountries = new Set(
    itinerary.map((e) => resolveCountryCode(e.countryCode || e.country)).filter(Boolean)
  );

  let totalDistance = 0;
  for (const entry of journeyStops) {
    totalDistance += Number(entry.distanceKm) || 0;
  }
  if (stateStatus === STATUS.TRAVELLING && journey.progress?.travelledKm) {
    totalDistance = (itinerary.filter((e) => e.id !== stateRaw?.currentItineraryEntryId)
      .reduce((s, e) => s + (Number(e.distanceKm) || 0), 0))
      + (Number(journey.progress.travelledKm) || 0);
  }

  const beganAt = itinerary[0]?.arrivedAt || itinerary[0]?.createdAt;
  const daysActive = beganAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(beganAt).getTime()) / 86400000))
    : 0;

  const today = now.toISOString().slice(0, 10);
  const todayRound = rounds.find((r) => r.date === today) || null;

  const worldCode = resolveCountryCode(journey.current?.countryCode || journey.current?.country);
  const eligibleNow = computeEligiblePledges(eventPledges, worldCode);

  const invitationsOverTime = bucketSeries(rounds);
  const participationOverTime = rounds
    .filter((r) => r.date && !r.wasEmpty)
    .map((r) => {
      const atMs = r.openAt ? new Date(r.openAt).getTime() : null;
      const worldEntry = atMs ? worldAtTime(itinerary, atMs) : null;
      const wCode = resolveCountryCode(
        r.startingCountryCode || worldEntry?.countryCode || worldEntry?.country
      );
      const eligible = computeEligiblePledges(eventPledges, wCode).length;
      const invited = r.invitationCount || 0;
      return {
        date: r.date,
        invitations: invited,
        eligible,
        rate: eligible > 0 ? (invited / eligible) * 100 : 0,
      };
    });

  const todayEligible = eligibleNow.length;
  const todayInvitations = todayRound?.invitationCount || (stateStatus === STATUS.INVITATION_OPEN ? (journey.invitationCount || 0) : 0);
  const todayRate = todayEligible > 0 ? (todayInvitations / todayEligible) * 100 : 0;

  const d7 = daysAgo(7, now);
  const d30 = daysAgo(30, now);
  const uniqueToday = todayRound?.uniqueParticipants || todayInvitations;
  const unique7 = new Set();
  const unique30 = new Set();
  for (const [userId, dates] of inviteDatesByUser) {
    for (const d of dates) {
      if (d >= d7) unique7.add(userId);
      if (d >= d30) unique30.add(userId);
    }
  }

  let firstTimeLifetime = 0;
  let returningLifetime = 0;
  for (const round of rounds) {
    firstTimeLifetime += round.firstTimeCount || 0;
    returningLifetime += round.returningCount || 0;
  }

  const retentionDays = { 1: 0, 2: 0, 5: 0, 10: 0, 30: 0 };
  let daySum = 0;
  for (const dates of inviteDatesByUser.values()) {
    const n = dates.size;
    daySum += n;
    if (n >= 1) retentionDays[1] += 1;
    if (n >= 2) retentionDays[2] += 1;
    if (n >= 5) retentionDays[5] += 1;
    if (n >= 10) retentionDays[10] += 1;
    if (n >= 30) retentionDays[30] += 1;
  }
  const avgDaysPerUser = participantIds.size ? daySum / participantIds.size : 0;

  const emptyRounds = rounds.filter((r) => r.wasEmpty);
  const emptyRoundCount = emptyRounds.length;
  const emptyRoundPct = rounds.length ? (emptyRoundCount / rounds.length) * 100 : 0;

  const timeToFirst = rounds
    .filter((r) => r.firstInvitationSecondsAfterOpen != null)
    .map((r) => r.firstInvitationSecondsAfterOpen);
  const timeToDestination = rounds
    .filter((r) => r.selectedAt && r.openAt)
    .map((r) => Math.max(0, Math.round((new Date(r.selectedAt).getTime() - new Date(r.openAt).getTime()) / 1000)));

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const byCountry = [...countryInviteTotals.entries()]
    .map(([code, count]) => {
      const eligible = computeEligiblePledges(eventPledges, null)
        .filter((p) => (p.countryCode || resolveCountryCode(p.country)) === code).length;
      return {
        countryCode: code,
        country: countryNames.get(code) || code,
        invitations: count,
        uniqueParticipants: countryParticipantSets.get(code)?.size || 0,
        pctOfAll: totalInvitations ? (count / totalInvitations) * 100 : 0,
        eligible,
        participationRate: eligible > 0 ? (count / eligible) * 100 : null,
        lastInvitation: rounds.find((r) => r.byCountry?.some((c) => (c.countryCode || c.country) === code))?.date || null,
      };
    })
    .sort((a, b) => b.invitations - a.invitations);

  const visitedCityKeys = new Set(itinerary.map((e) => cityKey(e.city, e.country)));

  const byCity = [...cityInviteTotals.values()]
    .map((c) => ({
      city: c.city,
      country: c.country,
      countryCode: c.countryCode,
      invitations: c.invitations,
      uniqueParticipants: c.participants.size,
      daysCalled: c.days.size,
      lastInvitation: c.lastAt,
      visitedByJourney: visitedCityKeys.has(cityKey(c.city, c.country)),
      latitude: c.latitude,
      longitude: c.longitude,
    }))
    .sort((a, b) => b.invitations - a.invitations);

  const journeyHistory = itinerary.map((entry, i) => ({
    sequence: entry.sequence || i + 1,
    day: entry.sequence || i + 1,
    date: utcDate(entry.arrivedAt || entry.selectedAt || entry.createdAt),
    originCity: entry.originCity,
    originCountry: entry.originCountry,
    city: entry.city,
    country: entry.country,
    countryCode: entry.countryCode,
    voiceNumber: entry.calledByVoiceNumber,
    distanceKm: entry.distanceKm,
    departedAt: entry.departedAt,
    arrivedAt: entry.arrivedAt,
    selectedAt: entry.selectedAt,
    isSeed: Boolean(entry.isSeed),
    latitude: entry.latitude,
    longitude: entry.longitude,
  }));

  const nonSeedLegs = journeyHistory.filter((e) => !e.isSeed);
  const distances = nonSeedLegs.map((e) => Number(e.distanceKm) || 0).filter(Boolean);

  const healthIssues = [];
  for (const round of rounds) {
    for (const inv of await readRoundInvites(round.roundId)) {
      if (!inv.city) healthIssues.push({ type: 'missing_city', roundId: round.roundId });
      if (!inv.country) healthIssues.push({ type: 'missing_country', roundId: round.roundId });
      if (inv.voiceNumber == null) healthIssues.push({ type: 'missing_voice', roundId: round.roundId });
    }
  }
  for (const entry of itinerary) {
    if (!entry.isSeed && (entry.latitude == null || entry.longitude == null)) {
      healthIssues.push({ type: 'missing_coords', entryId: entry.id });
    }
  }

  const mapInvitations = byCity
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({
      city: c.city,
      country: c.country,
      latitude: c.latitude,
      longitude: c.longitude,
      count: c.invitations,
    }));

  const mapJourney = itinerary
    .filter((e) => e.latitude != null && e.longitude != null)
    .map((e) => ({
      city: e.city,
      country: e.country,
      latitude: e.latitude,
      longitude: e.longitude,
      sequence: e.sequence,
    }));

  const st = statusLabel(stateStatus, journey);
  const waitingSince = stateStatus === STATUS.WAITING_FOR_FIRST_CALL && stateRaw?.invitationCloseAt
    ? stateRaw.invitationCloseAt
    : null;

  const selectedRound = roundId ? rounds.find((r) => r.roundId === roundId) : null;

  const sortedDates = [...inviteUsersByDate.keys()].sort();
  const cumulativeUsers = new Set();
  const uniqueParticipantsOverTime = sortedDates.map((date) => {
    for (const uid of inviteUsersByDate.get(date)) cumulativeUsers.add(uid);
    return { date, value: cumulativeUsers.size };
  });

  const successfulRounds = rounds.filter((r) => r.selectedCity && !r.wasEmpty).length;
  const invitationOutcomes = {
    successful: successfulRounds,
    empty: emptyRoundCount,
    total: rounds.length,
  };

  const currentWaitSeconds = waitingSince
    ? Math.max(0, Math.round((now.getTime() - new Date(waitingSince).getTime()) / 1000))
    : null;

  const journeyBeganAt = beganAt || null;

  return {
    serverNow: now.toISOString(),
    live: {
      isLive: stateStatus === STATUS.INVITATION_OPEN || stateStatus === STATUS.REVEAL_PENDING,
      status: stateStatus,
      statusLabel: st.label,
      statusTone: st.tone,
      invitationCount: journey.invitationCount || 0,
      uniqueCities: (journey.invitedCities || []).length,
      uniqueCountries: new Set((journey.invitedCities || []).map((c) => c.country)).size,
      invitationCloseAt: journey.invitationCloseAt,
      revealEndAt: journey.revealEndAt,
      secondsRemaining: journey.invitationCloseAt && stateStatus === STATUS.INVITATION_OPEN
        ? Math.max(0, Math.ceil((new Date(journey.invitationCloseAt).getTime() - now.getTime()) / 1000))
        : (journey.revealEndAt && stateStatus === STATUS.REVEAL_PENDING
          ? Math.max(0, Math.ceil((new Date(journey.revealEndAt).getTime() - now.getTime()) / 1000))
          : null),
    },
    overview: {
      totalInvitations,
      uniqueParticipants: participantIds.size,
      citiesThatCalled: cityInviteTotals.size,
      countriesThatCalled: countryInviteTotals.size,
      journeyStops: journeyStops.length,
      countriesVisited: journeyCountries.size,
      distanceTravelled: Math.round(totalDistance),
      daysActive,
      journeyBeganAt,
    },
    today: {
      date: today,
      invitations: todayInvitations,
      uniqueCities: todayRound?.uniqueCities || (journey.invitedCities || []).length,
      uniqueCountries: todayRound?.uniqueCountries || new Set((journey.invitedCities || []).map((c) => c.country)).size,
      participationRate: todayRate,
      eligibleCount: todayEligible,
      currentCity: journey.current?.city,
      currentCountry: journey.current?.country,
      nextDestination: journey.destination?.city || journey.lastReveal?.city || null,
      nextDestinationCountry: journey.destination?.country || journey.lastReveal?.country || null,
      calledByVoice: journey.lastReveal?.voiceNumber ?? null,
      calledByCity: journey.lastReveal?.city || null,
      calledByCountry: journey.lastReveal?.country || null,
    },
    currentJourney: stateStatus === STATUS.TRAVELLING && journey.origin && journey.destination ? {
      originCity: journey.origin.city,
      originCountry: journey.origin.country,
      destinationCity: journey.destination.city,
      destinationCountry: journey.destination.country,
      voiceNumber: itinerary.find((e) => e.city === journey.destination.city)?.calledByVoiceNumber || null,
      distanceKm: journey.progress?.totalKm || null,
      travelledKm: journey.progress?.travelledKm || null,
      progress: journey.progress?.progress || 0,
      departureAt: journey.departureAt,
      arrivalAt: journey.arrivalAt,
    } : null,
    currentStatus: {
      headline: st.label,
      waitingSince,
      travelling: stateStatus === STATUS.TRAVELLING,
      invitationOpen: stateStatus === STATUS.INVITATION_OPEN,
      revealPending: stateStatus === STATUS.REVEAL_PENDING,
      waitingFirstCall: stateStatus === STATUS.WAITING_FOR_FIRST_CALL,
    },
    charts: {
      invitationsOverTime: filterByRange(invitationsOverTime.map((p) => ({ date: p.date, invitations: p.value })), range),
      participationRateOverTime: filterByRange(participationOverTime, range),
      uniqueParticipantsOverTime: filterByRange(uniqueParticipantsOverTime.map((p) => ({
        date: p.date,
        participants: p.value,
      })), range),
    },
    invitationOutcomes,
    waitTime: {
      currentWaitSeconds,
      averageTimeToFirstInvitation: avg(timeToFirst) != null ? Math.round(avg(timeToFirst)) : null,
      averageTimeToDestination: avg(timeToDestination) != null ? Math.round(avg(timeToDestination)) : null,
      medianTimeToFirstInvitation: median(timeToFirst) != null ? Math.round(median(timeToFirst)) : null,
    },
    uniqueParticipants: {
      today: uniqueToday,
      d7: unique7.size,
      d30: unique30.size,
      lifetime: participantIds.size,
    },
    newVsReturning: {
      firstTime: firstTimeLifetime,
      returning: returningLifetime,
    },
    byCountry,
    byCity,
    rounds: rounds.map((r) => ({
      roundId: r.roundId,
      date: r.date,
      startingCity: r.startingCity,
      startingCountry: r.startingCountry,
      invitationCount: r.invitationCount,
      uniqueCities: r.uniqueCities,
      uniqueCountries: r.uniqueCountries,
      selectedCity: r.selectedCity,
      selectedCountry: r.selectedCountry,
      selectedVoiceNumber: r.selectedVoiceNumber,
      selectionMethod: r.selectionMethod,
      selectedAt: r.selectedAt,
      journeyDistanceKm: r.journeyDistanceKm,
      status: r.status,
      wasEmpty: r.wasEmpty,
    })),
    roundDetail: selectedRound,
    journeyHistory,
    journeyTotals: {
      totalDistance: Math.round(totalDistance),
      totalCities: itinerary.length,
      uniqueCountries: journeyCountries.size,
      totalLegs: nonSeedLegs.length,
      peopleWhoChangedPath: nonSeedLegs.filter((e) => e.voiceNumber != null).length,
      avgDistance: distances.length ? Math.round(avg(distances)) : 0,
      longestDistance: distances.length ? Math.max(...distances) : 0,
      shortestDistance: distances.length ? Math.min(...distances) : 0,
    },
    rankings: {
      mostActiveCountries: byCountry.slice(0, 10),
      mostActiveCities: byCity.slice(0, 10),
      highestParticipationCountries: [...byCountry]
        .filter((c) => c.participationRate != null)
        .sort((a, b) => b.participationRate - a.participationRate)
        .slice(0, 10),
      mostVisitedCountries: [...journeyCountries].map((code) => ({
        countryCode: code,
        visits: itinerary.filter((e) => resolveCountryCode(e.countryCode || e.country) === code).length,
      })).sort((a, b) => b.visits - a.visits).slice(0, 10),
    },
    retention: {
      participated1Day: retentionDays[1],
      participated2Plus: retentionDays[2],
      participated5Plus: retentionDays[5],
      participated10Plus: retentionDays[10],
      participated30Plus: retentionDays[30],
      avgInvitationDaysPerUser: Math.round(avgDaysPerUser * 10) / 10,
    },
    emptyRounds: {
      count: emptyRoundCount,
      pct: Math.round(emptyRoundPct * 10) / 10,
      mostRecent: emptyRounds[0]?.date || null,
    },
    timing: {
      timeToFirstInvitation: {
        latest: timeToFirst.length ? timeToFirst[timeToFirst.length - 1] : null,
        average: avg(timeToFirst) != null ? Math.round(avg(timeToFirst)) : null,
        median: median(timeToFirst) != null ? Math.round(median(timeToFirst)) : null,
      },
      timeToDestination: {
        average: avg(timeToDestination) != null ? Math.round(avg(timeToDestination)) : null,
        median: median(timeToDestination) != null ? Math.round(median(timeToDestination)) : null,
      },
    },
    map: {
      invitations: mapInvitations,
      journey: mapJourney,
    },
    health: {
      healthy: healthIssues.length === 0,
      issueCount: healthIssues.length,
      issues: healthIssues.slice(0, 20),
    },
    constants: {
      invitationWindowMs: INVITATION_WINDOW_MS,
      revealWindowMs: REVEAL_WINDOW_MS,
    },
  };
}

function exportPassTheWorldCsv(intel, kind) {
  const rows = [];
  if (kind === 'rounds') {
    rows.push(['date', 'starting_city', 'starting_country', 'invitations', 'unique_cities', 'unique_countries', 'destination_city', 'destination_country', 'voice_number', 'selection_method', 'selected_at', 'distance_km', 'status']);
    for (const r of intel.rounds || []) {
      rows.push([
        r.date, r.startingCity, r.startingCountry, r.invitationCount, r.uniqueCities, r.uniqueCountries,
        r.selectedCity, r.selectedCountry, r.selectedVoiceNumber, r.selectionMethod, r.selectedAt, r.journeyDistanceKm, r.status,
      ]);
    }
  } else if (kind === 'journey') {
    rows.push(['sequence', 'date', 'origin_city', 'origin_country', 'destination_city', 'destination_country', 'voice_number', 'distance_km', 'departed_at', 'arrived_at']);
    for (const e of intel.journeyHistory || []) {
      rows.push([
        e.sequence, e.date, e.originCity, e.originCountry, e.city, e.country, e.voiceNumber, e.distanceKm, e.departedAt, e.arrivedAt,
      ]);
    }
  } else if (kind === 'countries') {
    rows.push(['country_code', 'invitations', 'unique_participants', 'pct_of_all', 'participation_rate']);
    for (const c of intel.byCountry || []) {
      rows.push([c.countryCode, c.invitations, c.uniqueParticipants, c.pctOfAll, c.participationRate]);
    }
  } else if (kind === 'cities') {
    rows.push(['city', 'country', 'invitations', 'unique_participants', 'days_called', 'visited_by_journey', 'last_invitation']);
    for (const c of intel.byCity || []) {
      rows.push([c.city, c.country, c.invitations, c.uniqueParticipants, c.daysCalled, c.visitedByJourney, c.lastInvitation]);
    }
  } else if (kind === 'daily') {
    rows.push(['date', 'invitations']);
    for (const p of intel.charts?.invitationsOverTime || []) {
      rows.push([p.date, p.invitations]);
    }
  }
  return rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

module.exports = {
  buildPassTheWorldOwnerIntel,
  exportPassTheWorldCsv,
};
