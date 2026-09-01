/**
 * Pass the World — shared global journey (Vercel Blob).
 * Ritual at 16:00 UTC · 60s window · World never moves by itself.
 */
const { randomUUID } = require('crypto');
const {
  readBlobJson,
  writeJson,
  findUserByDevice,
  readPledge,
  assertBlobConfigured,
} = require('./store');

const ROOT = 'wc-data/pass-the-world';
const STATE_PATH = `${ROOT}/state.json`;
const ITINERARY_PATH = `${ROOT}/itinerary.json`;

const INVITATION_HOUR_UTC = 16;
const INVITATION_WINDOW_MS = 60 * 1000;
/** Suspense reveal after the 60s window — winner is fixed; travel starts when this ends. */
const REVEAL_WINDOW_MS = 10 * 1000;
/** Journeys always land at 15:59 UTC so the World is ready for 16:00 UTC. */
const ARRIVAL_HOUR_UTC = 15;
const ARRIVAL_MINUTE_UTC = 59;

const SEED_CITY = {
  city: 'Braga',
  country: 'Portugal',
  countryCode: 'PT',
  latitude: 41.5518,
  longitude: -8.4229,
};

const STATUS = {
  INITIAL: 'INITIAL',
  TRAVELLING: 'TRAVELLING',
  ARRIVED: 'ARRIVED',
  INVITATION_OPEN: 'INVITATION_OPEN',
  REVEAL_PENDING: 'REVEAL_PENDING',
  WAITING_FOR_FIRST_CALL: 'WAITING_FOR_FIRST_CALL',
};

function roundInvitationPath(roundId, userId) {
  return `${ROOT}/rounds/${roundId}/invitations/${userId}.json`;
}
function roundWinnerPath(roundId) {
  return `${ROOT}/rounds/${roundId}/winner.json`;
}
function roundInvitesIndexPath(roundId) {
  return `${ROOT}/rounds/${roundId}/invitations-index.json`;
}
function roundMetaPath(roundId) {
  return `${ROOT}/rounds/${roundId}/meta.json`;
}
function participantPath(userId) {
  return `${ROOT}/participants/${userId}.json`;
}

async function readRoundMeta(roundId) {
  try { return await readBlobJson(roundMetaPath(roundId)); } catch { return null; }
}

async function writeRoundMeta(roundId, patch) {
  if (!roundId) return null;
  const existing = await readRoundMeta(roundId);
  const next = {
    ...(existing || {}),
    ...patch,
    roundId,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(roundMetaPath(roundId), next, { overwrite: true });
  return next;
}

async function readParticipant(userId) {
  try { return await readBlobJson(participantPath(userId)); } catch { return null; }
}

async function recordParticipantInvite(invitation, roundOpenAt) {
  if (!invitation?.userId) return invitation;
  const openMs = roundOpenAt ? new Date(roundOpenAt).getTime() : null;
  const submittedMs = new Date(invitation.submittedAt || Date.now()).getTime();
  const secondsAfterOpen = openMs != null && Number.isFinite(submittedMs)
    ? Math.max(0, Math.round((submittedMs - openMs) / 1000))
    : null;

  const existing = await readParticipant(invitation.userId);
  const firstTimeEver = !existing?.firstInvitedAt;
  const roundDate = openMs != null
    ? new Date(openMs).toISOString().slice(0, 10)
    : new Date(submittedMs).toISOString().slice(0, 10);
  const roundDates = new Set(existing?.roundDates || []);
  roundDates.add(roundDate);

  const participant = {
    userId: invitation.userId,
    voiceNumber: invitation.voiceNumber ?? existing?.voiceNumber ?? null,
    city: invitation.city || existing?.city || null,
    country: invitation.country || existing?.country || null,
    countryCode: invitation.countryCode || existing?.countryCode || null,
    firstInvitedAt: existing?.firstInvitedAt || invitation.submittedAt,
    lastInvitedAt: invitation.submittedAt,
    totalInvites: (Number(existing?.totalInvites) || 0) + 1,
    roundDates: [...roundDates].sort(),
    roundCount: roundDates.size,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(participantPath(invitation.userId), participant, { overwrite: true });

  return {
    ...invitation,
    firstTimeEver,
    secondsAfterOpen,
  };
}

async function snapshotRoundOpenMeta(state, roundId, openAt, closeAt) {
  return writeRoundMeta(roundId, {
    date: new Date(openAt).toISOString().slice(0, 10),
    openAt,
    closeAt,
    startingCity: state.currentCity,
    startingCountry: state.currentCountry,
    startingCountryCode: state.currentCountryCode || resolveCountryCode(state.currentCountry),
    startingLatitude: state.currentLatitude,
    startingLongitude: state.currentLongitude,
    status: 'in_progress',
  });
}

async function finalizeRoundMeta(roundId, {
  invitations = [],
  winner = null,
  state = null,
  itinerary = [],
  wasEmpty = false,
  now = new Date(),
} = {}) {
  if (!roundId) return null;
  const meta = await readRoundMeta(roundId);
  const openAt = meta?.openAt || state?.invitationOpenAt;
  const openMs = openAt ? new Date(openAt).getTime() : null;
  const sorted = [...invitations].sort((a, b) => (
    new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime()
  ));
  const first = sorted[0] || null;
  const windowBuckets = new Array(60).fill(0);
  for (const inv of invitations) {
    if (openMs == null || !inv.submittedAt) continue;
    const sec = Math.min(59, Math.max(0, Math.floor((new Date(inv.submittedAt).getTime() - openMs) / 1000)));
    windowBuckets[sec] += 1;
  }
  const cityKeys = new Set();
  const countryKeys = new Set();
  for (const inv of invitations) {
    cityKeys.add(`${normalizeCountry(inv.country)}|${String(inv.city || '').trim().toLowerCase()}`);
    countryKeys.add(resolveCountryCode(inv.countryCode || inv.country) || normalizeCountry(inv.country));
  }

  let journeyDistanceKm = null;
  if (winner && meta?.startingLatitude != null && winner.latitude != null) {
    journeyDistanceKm = Math.round(haversineKm(
      meta.startingLatitude, meta.startingLongitude,
      winner.latitude, winner.longitude
    ));
  }

  const patch = {
    invitationCount: invitations.length,
    uniqueParticipants: invitations.length,
    uniqueCities: cityKeys.size,
    uniqueCountries: countryKeys.size,
    firstInvitationAt: first?.submittedAt || null,
    firstInvitationSecondsAfterOpen: first?.secondsAfterOpen ?? (
      first && openMs != null
        ? Math.max(0, Math.round((new Date(first.submittedAt).getTime() - openMs) / 1000))
        : null
    ),
    wasEmpty: Boolean(wasEmpty),
    windowBuckets,
    status: wasEmpty ? 'empty' : (winner ? 'settled' : 'waiting_first_call'),
    selectionMethod: winner?.selectionMode || null,
    selectedAt: winner?.selectedAt || null,
    selectedVoiceNumber: winner?.voiceNumber ?? null,
    selectedCity: winner?.city || null,
    selectedCountry: winner?.country || null,
    selectedUserId: winner?.userId || null,
    journeyDistanceKm,
    settledAt: now instanceof Date ? now.toISOString() : now,
  };
  return writeRoundMeta(roundId, patch);
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCountry(country) {
  return String(country || '').trim().toLowerCase();
}

/** Resolve ISO2 from country name or code — eligibility must use codes, not GPS. */
const COUNTRY_NAME_TO_ISO2 = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', andorra: 'AD', angola: 'AO',
  argentina: 'AR', armenia: 'AM', australia: 'AU', austria: 'AT', azerbaijan: 'AZ',
  bahrain: 'BH', bangladesh: 'BD', belarus: 'BY', belgium: 'BE', belize: 'BZ',
  benin: 'BJ', bhutan: 'BT', bolivia: 'BO', 'bosnia and herzegovina': 'BA',
  botswana: 'BW', brazil: 'BR', brunei: 'BN', bulgaria: 'BG', 'burkina faso': 'BF',
  burundi: 'BI', 'cabo verde': 'CV', cambodia: 'KH', cameroon: 'CM', canada: 'CA',
  'central african republic': 'CF', chad: 'TD', chile: 'CL', china: 'CN',
  colombia: 'CO', comoros: 'KM', congo: 'CG', 'costa rica': 'CR', croatia: 'HR',
  cuba: 'CU', cyprus: 'CY', czechia: 'CZ', 'czech republic': 'CZ',
  'democratic republic of the congo': 'CD', denmark: 'DK', djibouti: 'DJ',
  dominica: 'DM', 'dominican republic': 'DO', ecuador: 'EC', egypt: 'EG',
  'el salvador': 'SV', 'equatorial guinea': 'GQ', eritrea: 'ER', estonia: 'EE',
  eswatini: 'SZ', ethiopia: 'ET', fiji: 'FJ', finland: 'FI', france: 'FR',
  gabon: 'GA', gambia: 'GM', georgia: 'GE', germany: 'DE', ghana: 'GH',
  greece: 'GR', guatemala: 'GT', guinea: 'GN', 'guinea-bissau': 'GW',
  guyana: 'GY', haiti: 'HT', honduras: 'HN', hungary: 'HU', iceland: 'IS',
  india: 'IN', indonesia: 'ID', iran: 'IR', iraq: 'IQ', ireland: 'IE',
  israel: 'IL', italy: 'IT', "côte d'ivoire": 'CI', 'ivory coast': 'CI',
  jamaica: 'JM', japan: 'JP', jordan: 'JO', kazakhstan: 'KZ', kenya: 'KE',
  kiribati: 'KI', kuwait: 'KW', kyrgyzstan: 'KG', laos: 'LA', latvia: 'LV',
  lebanon: 'LB', lesotho: 'LS', liberia: 'LR', libya: 'LY', liechtenstein: 'LI',
  lithuania: 'LT', luxembourg: 'LU', madagascar: 'MG', malawi: 'MW',
  malaysia: 'MY', maldives: 'MV', mali: 'ML', malta: 'MT', 'marshall islands': 'MH',
  mauritania: 'MR', mauritius: 'MU', mexico: 'MX', micronesia: 'FM', moldova: 'MD',
  monaco: 'MC', mongolia: 'MN', montenegro: 'ME', morocco: 'MA', mozambique: 'MZ',
  myanmar: 'MM', namibia: 'NA', nauru: 'NR', nepal: 'NP', netherlands: 'NL',
  'new zealand': 'NZ', nicaragua: 'NI', niger: 'NE', nigeria: 'NG',
  'north korea': 'KP', 'north macedonia': 'MK', norway: 'NO', oman: 'OM',
  pakistan: 'PK', palau: 'PW', palestine: 'PS', panama: 'PA',
  'papua new guinea': 'PG', paraguay: 'PY', peru: 'PE', philippines: 'PH',
  poland: 'PL', portugal: 'PT', qatar: 'QA', romania: 'RO', russia: 'RU',
  rwanda: 'RW', 'saint kitts and nevis': 'KN', 'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC', samoa: 'WS', 'san marino': 'SM',
  'sao tome and principe': 'ST', 'saudi arabia': 'SA', senegal: 'SN', serbia: 'RS',
  seychelles: 'SC', 'sierra leone': 'SL', singapore: 'SG', slovakia: 'SK',
  slovenia: 'SI', 'solomon islands': 'SB', somalia: 'SO', 'south africa': 'ZA',
  'south korea': 'KR', 'south sudan': 'SS', spain: 'ES', 'sri lanka': 'LK',
  sudan: 'SD', suriname: 'SR', sweden: 'SE', switzerland: 'CH', syria: 'SY',
  taiwan: 'TW', tajikistan: 'TJ', tanzania: 'TZ', thailand: 'TH',
  'timor-leste': 'TL', togo: 'TG', tonga: 'TO', 'trinidad and tobago': 'TT',
  tunisia: 'TN', turkey: 'TR', türkiye: 'TR', turkmenistan: 'TM', tuvalu: 'TV',
  uganda: 'UG', ukraine: 'UA', 'united arab emirates': 'AE',
  'united kingdom': 'GB', 'united states': 'US', 'united states of america': 'US',
  uruguay: 'UY', uzbekistan: 'UZ', vanuatu: 'VU', 'vatican city': 'VA',
  venezuela: 'VE', vietnam: 'VN', yemen: 'YE', zambia: 'ZM', zimbabwe: 'ZW',
};

function resolveCountryCode(countryOrCode) {
  const raw = String(countryOrCode || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_NAME_TO_ISO2[raw.toLowerCase()] || null;
}

function countriesMatch(a, b) {
  const codeA = resolveCountryCode(a);
  const codeB = resolveCountryCode(b);
  if (codeA && codeB) return codeA === codeB;
  return Boolean(normalizeCountry(a) && normalizeCountry(a) === normalizeCountry(b));
}

/** Invites and destinations must be in a different country than where the World currently is. */
function inviteEligibleForWorld(invite, worldCountry, worldCountryCode) {
  if (!invite) return false;
  const worldCode = resolveCountryCode(worldCountryCode || worldCountry);
  const inviteCode = resolveCountryCode(invite.countryCode || invite.country);
  if (worldCode && inviteCode) return worldCode !== inviteCode;
  return !countriesMatch(worldCountry, invite.country);
}

function filterInvitesForWorld(invitations, state) {
  return (invitations || []).filter((inv) => inviteEligibleForWorld(
    inv,
    state.currentCountry,
    state.currentCountryCode
  ));
}

function isInvalidItineraryEntry(entry) {
  if (!entry || entry.isSeed) return false;
  if (!entry.originCountry || !entry.country) return false;
  return countriesMatch(entry.originCountry, entry.country);
}

function isInvalidTravelLeg(origin, destination) {
  if (!origin?.country || !destination?.country) return false;
  return countriesMatch(
    origin.countryCode || origin.country,
    destination.countryCode || destination.country
  );
}

function winnerEligibleForWorld(winner, state) {
  return inviteEligibleForWorld(winner, state.currentCountry, state.currentCountryCode);
}

function nextInvitationOpenAt(from = new Date()) {
  const d = new Date(from.getTime());
  const candidate = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    INVITATION_HOUR_UTC, 0, 0, 0
  ));
  if (candidate.getTime() <= from.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

function latestInvitationOpenAt(now = new Date()) {
  const todayOpen = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    INVITATION_HOUR_UTC, 0, 0, 0
  ));
  if (now.getTime() >= todayOpen.getTime()) return todayOpen;
  const yesterday = new Date(todayOpen);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday;
}

/**
 * Next 15:59:00.000 UTC strictly after departure.
 * Closer cities therefore move slower; longer hops move faster — same arrival clock.
 */
function nextArrivalAt(from = new Date()) {
  const d = new Date(from.getTime());
  const candidate = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    ARRIVAL_HOUR_UTC, ARRIVAL_MINUTE_UTC, 0, 0
  ));
  if (candidate.getTime() <= from.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

function computeArrivalAt(departureAt) {
  return nextArrivalAt(new Date(departureAt));
}

function isCanonicalArrivalAt(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCHours() === ARRIVAL_HOUR_UTC
    && d.getUTCMinutes() === ARRIVAL_MINUTE_UTC
    && d.getUTCSeconds() === 0;
}

function seedItinerary() {
  const now = new Date().toISOString();
  return [{
    id: 'seed-braga',
    sequence: 1,
    city: SEED_CITY.city,
    country: SEED_CITY.country,
    countryCode: SEED_CITY.countryCode,
    latitude: SEED_CITY.latitude,
    longitude: SEED_CITY.longitude,
    calledByUserId: null,
    calledByVoiceNumber: null,
    originCity: null,
    originCountry: null,
    originLatitude: null,
    originLongitude: null,
    distanceKm: 0,
    selectedAt: now,
    departedAt: null,
    arrivedAt: now,
    createdAt: now,
    isSeed: true,
  }];
}

function seedState(itinerary) {
  const entry = itinerary[0];
  return {
    version: 1,
    status: STATUS.ARRIVED,
    currentCity: entry.city,
    currentCountry: entry.country,
    currentCountryCode: entry.countryCode,
    currentLatitude: entry.latitude,
    currentLongitude: entry.longitude,
    currentItineraryEntryId: entry.id,
    origin: null,
    destination: null,
    activeRoundId: null,
    invitationOpenAt: null,
    invitationCloseAt: null,
    departureAt: null,
    arrivalAt: null,
    invitationCount: 0,
    invitedCities: [],
    lastReveal: null,
    updatedAt: new Date().toISOString(),
  };
}

async function readItinerary() {
  try {
    const data = await readBlobJson(ITINERARY_PATH);
    if (Array.isArray(data?.entries) && data.entries.length) return data.entries;
  } catch { /* seed */ }
  return null;
}

async function writeItinerary(entries) {
  await writeJson(ITINERARY_PATH, { entries, updatedAt: new Date().toISOString() }, { overwrite: true });
}

/** Collapse duplicate stops created by repeated applyWinner heals. */
function dedupeItinerary(entries) {
  const order = [];
  const byKey = new Map();
  for (const entry of entries || []) {
    const key = entry.isSeed
      ? `seed:${entry.id || `${entry.city}|${entry.country}`}`
      : [
        entry.selectedAt || entry.departedAt || '',
        String(entry.city || '').trim().toLowerCase(),
        normalizeCountry(entry.country),
        entry.calledByUserId || entry.calledByVoiceNumber || '',
      ].join('|');
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, entry); // last write wins (keeps corrected arrivalAt)
  }
  return order.map((key, i) => ({ ...byKey.get(key), sequence: i + 1 }));
}

async function repairItineraryIfNeeded(state, itinerary) {
  const cleaned = dedupeItinerary(itinerary);
  if (cleaned.length === (itinerary || []).length) {
    return { state, itinerary };
  }
  await writeItinerary(cleaned);

  let nextState = state;
  const currentStillThere = cleaned.some((e) => e.id === state.currentItineraryEntryId);
  if (!currentStillThere && cleaned.length) {
    const last = cleaned[cleaned.length - 1];
    nextState = await writeState({
      ...state,
      currentItineraryEntryId: last.id,
      arrivalAt: last.arrivedAt || state.arrivalAt,
      departureAt: last.departedAt || state.departureAt,
      version: (Number(state.version) || 1) + 1,
    });
  }
  return { state: nextState, itinerary: cleaned };
}

/** Remove same-country legs and reset state when an invalid in-country trip is in progress. */
async function repairInvalidJourney(state, itinerary) {
  let cleaned = (itinerary || []).filter((entry) => !isInvalidItineraryEntry(entry));
  cleaned = dedupeItinerary(cleaned);

  let nextState = state;
  let changed = cleaned.length !== (itinerary || []).length;

  const invalidTravel = nextState.status === STATUS.TRAVELLING
    && isInvalidTravelLeg(nextState.origin, nextState.destination);
  const currentMissing = nextState.currentItineraryEntryId
    && !cleaned.some((e) => e.id === nextState.currentItineraryEntryId);

  if (invalidTravel || currentMissing) {
    changed = true;
    const anchor = cleaned.length ? cleaned[cleaned.length - 1] : null;
    if (anchor) {
      const clearReveal = invalidTravel
        || (nextState.lastReveal && countriesMatch(
          nextState.lastReveal.originCountry || nextState.origin?.country,
          nextState.lastReveal.country
        ));
      nextState = {
        ...nextState,
        status: STATUS.ARRIVED,
        currentCity: anchor.city,
        currentCountry: anchor.country,
        currentCountryCode: anchor.countryCode || resolveCountryCode(anchor.country),
        currentLatitude: anchor.latitude,
        currentLongitude: anchor.longitude,
        currentItineraryEntryId: anchor.id,
        origin: null,
        destination: null,
        departureAt: null,
        arrivalAt: null,
        revealStartAt: null,
        revealEndAt: null,
        invitedCities: [],
        invitationCount: 0,
        lastReveal: clearReveal ? null : nextState.lastReveal,
        version: (Number(nextState.version) || 1) + 1,
      };
    }
  }

  if (changed) {
    if (cleaned.length !== (itinerary || []).length) {
      await writeItinerary(cleaned);
    }
    if (nextState !== state) {
      nextState = await writeState(nextState);
    }
  }

  return { state: nextState, itinerary: cleaned };
}

async function readStateRaw() {
  try { return await readBlobJson(STATE_PATH); } catch { return null; }
}

async function writeState(state) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await writeJson(STATE_PATH, next, { overwrite: true });
  return next;
}

async function ensureSeeded() {
  assertBlobConfigured();
  let itinerary = await readItinerary();
  let state = await readStateRaw();
  if (!itinerary?.length) {
    itinerary = seedItinerary();
    await writeItinerary(itinerary);
  }
  if (!state) {
    state = seedState(itinerary);
    await writeState(state);
  }
  return { state, itinerary };
}

async function readRoundInvites(roundId) {
  try {
    const index = await readBlobJson(roundInvitesIndexPath(roundId));
    return Array.isArray(index?.invitations) ? index.invitations : [];
  } catch { return []; }
}

async function writeRoundInvite(roundId, invitation, roundOpenAt = null) {
  let enriched = invitation;
  try {
    enriched = await recordParticipantInvite(invitation, roundOpenAt);
  } catch { /* analytics must not block invites */ }

  await writeJson(roundInvitationPath(roundId, enriched.userId), enriched, { overwrite: true });
  const existing = await readRoundInvites(roundId);
  const without = existing.filter((e) => e.userId !== enriched.userId);
  without.push({
    id: enriched.id,
    userId: enriched.userId,
    voiceNumber: enriched.voiceNumber,
    city: enriched.city,
    country: enriched.country,
    countryCode: enriched.countryCode,
    latitude: enriched.latitude,
    longitude: enriched.longitude,
    submittedAt: enriched.submittedAt,
    firstTimeEver: enriched.firstTimeEver,
    secondsAfterOpen: enriched.secondsAfterOpen,
  });
  await writeJson(roundInvitesIndexPath(roundId), {
    invitations: without,
    updatedAt: new Date().toISOString(),
  }, { overwrite: true });
  return without;
}

async function readWinner(roundId) {
  try { return await readBlobJson(roundWinnerPath(roundId)); } catch { return null; }
}

async function claimWinner(roundId, winnerPayload) {
  const existing = await readWinner(roundId);
  if (existing?.invitationId) return { winner: existing, created: false };
  try {
    await writeJson(roundWinnerPath(roundId), winnerPayload, { overwrite: false });
  } catch {
    const raced = await readWinner(roundId);
    if (raced?.invitationId) return { winner: raced, created: false };
    await writeJson(roundWinnerPath(roundId), winnerPayload, { overwrite: true });
  }
  const confirmed = await readWinner(roundId);
  return {
    winner: confirmed || winnerPayload,
    created: (confirmed || winnerPayload).invitationId === winnerPayload.invitationId,
  };
}

function buildInvitedCities(invitations, worldState = null) {
  const byKey = new Map();
  for (const invite of invitations) {
    if (worldState && !inviteEligibleForWorld(invite, worldState.currentCountry, worldState.currentCountryCode)) {
      continue;
    }
    const key = `${normalizeCountry(invite.country)}|${String(invite.city || '').trim().toLowerCase()}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      city: invite.city,
      country: invite.country,
      countryCode: invite.countryCode || null,
      latitude: invite.latitude,
      longitude: invite.longitude,
    });
  }
  return Array.from(byKey.values());
}

function publicReveal(winner, origin) {
  if (!winner) return null;
  return {
    city: winner.city,
    country: winner.country,
    countryCode: winner.countryCode || null,
    voiceNumber: winner.voiceNumber,
    originCity: origin?.city || null,
    originCountry: origin?.country || null,
    revealedAt: winner.selectedAt || new Date().toISOString(),
  };
}

async function applyWinner(state, itinerary, winner, invitations) {
  if (!winnerEligibleForWorld(winner, state)) {
    return { state, itinerary };
  }

  const selectedAt = winner.selectedAt || new Date().toISOString();

  // Idempotent: heal/re-apply must not append duplicate itinerary stops.
  const already = itinerary.find((entry) => (
    !entry.isSeed
    && entry.selectedAt === selectedAt
    && entry.city === winner.city
    && normalizeCountry(entry.country) === normalizeCountry(winner.country)
    && (
      (winner.userId && entry.calledByUserId === winner.userId)
      || (winner.voiceNumber != null && entry.calledByVoiceNumber === winner.voiceNumber)
    )
  ));
  if (already) {
    const arrivalAt = already.arrivedAt || computeArrivalAt(selectedAt).toISOString();
    const nextState = await writeState({
      ...state,
      status: STATUS.TRAVELLING,
      origin: {
        city: already.originCity || state.currentCity,
        country: already.originCountry || state.currentCountry,
        countryCode: state.currentCountryCode,
        latitude: already.originLatitude ?? state.currentLatitude,
        longitude: already.originLongitude ?? state.currentLongitude,
      },
      destination: {
        city: already.city,
        country: already.country,
        countryCode: already.countryCode || null,
        latitude: already.latitude,
        longitude: already.longitude,
      },
      currentItineraryEntryId: already.id,
      departureAt: already.departedAt || selectedAt,
      arrivalAt,
      invitationOpenAt: null,
      invitationCloseAt: null,
      revealStartAt: null,
      revealEndAt: null,
      invitationCount: invitations.length,
      invitedCities: [],
      lastReveal: state.lastReveal || publicReveal(winner, {
        city: already.originCity,
        country: already.originCountry,
      }),
      version: (Number(state.version) || 1) + 1,
    });
    return { state: nextState, itinerary };
  }

  const origin = {
    city: state.currentCity,
    country: state.currentCountry,
    countryCode: state.currentCountryCode,
    latitude: state.currentLatitude,
    longitude: state.currentLongitude,
  };
  const distanceKm = Math.round(haversineKm(
    origin.latitude, origin.longitude, winner.latitude, winner.longitude
  ));
  const arrivalAt = computeArrivalAt(selectedAt).toISOString();
  const entry = {
    id: randomUUID(),
    sequence: itinerary.length + 1,
    city: winner.city,
    country: winner.country,
    countryCode: winner.countryCode || null,
    latitude: winner.latitude,
    longitude: winner.longitude,
    calledByUserId: winner.userId,
    calledByVoiceNumber: winner.voiceNumber,
    originCity: origin.city,
    originCountry: origin.country,
    originLatitude: origin.latitude,
    originLongitude: origin.longitude,
    distanceKm,
    selectedAt,
    departedAt: selectedAt,
    arrivedAt: arrivalAt,
    createdAt: selectedAt,
    isSeed: false,
  };
  const nextItinerary = [...itinerary, entry];
  await writeItinerary(nextItinerary);
  const nextState = await writeState({
    ...state,
    status: STATUS.TRAVELLING,
    origin,
    destination: {
      city: entry.city,
      country: entry.country,
      countryCode: entry.countryCode,
      latitude: entry.latitude,
      longitude: entry.longitude,
    },
    currentItineraryEntryId: entry.id,
    departureAt: selectedAt,
    arrivalAt,
    invitationOpenAt: null,
    invitationCloseAt: null,
    invitationCount: invitations.length,
    invitedCities: [],
    revealStartAt: null,
    revealEndAt: null,
    lastReveal: publicReveal(winner, origin),
    version: (Number(state.version) || 1) + 1,
  });
  return { state: nextState, itinerary: nextItinerary };
}

async function beginRevealPhase(state, invitations, now) {
  const revealStartAt = state.invitationCloseAt || now.toISOString();
  const revealEndAt = new Date(new Date(revealStartAt).getTime() + REVEAL_WINDOW_MS).toISOString();
  return writeState({
    ...state,
    status: STATUS.REVEAL_PENDING,
    revealStartAt,
    revealEndAt,
    invitationCount: invitations.length,
    invitedCities: buildInvitedCities(invitations, state),
    version: (Number(state.version) || 1) + 1,
  });
}

async function openInvitationRound(state, now) {
  const openAt = latestInvitationOpenAt(now);
  const closeAt = new Date(openAt.getTime() + INVITATION_WINDOW_MS);
  const roundId = `round-${openAt.toISOString()}`;
  if (state.activeRoundId === roundId
    && (state.status === STATUS.INVITATION_OPEN || state.status === STATUS.WAITING_FOR_FIRST_CALL)) {
    return state;
  }
  const next = await writeState({
    ...state,
    status: STATUS.INVITATION_OPEN,
    activeRoundId: roundId,
    invitationOpenAt: openAt.toISOString(),
    invitationCloseAt: closeAt.toISOString(),
    invitationCount: 0,
    invitedCities: [],
    lastReveal: null,
    origin: null,
    destination: null,
    departureAt: null,
    arrivalAt: null,
    version: (Number(state.version) || 1) + 1,
  });
  try {
    await snapshotRoundOpenMeta(next, roundId, openAt.toISOString(), closeAt.toISOString());
  } catch { /* non-blocking */ }
  return next;
}

async function settleInvitationRound(state, itinerary, now) {
  const roundId = state.activeRoundId;
  if (!roundId) {
    const next = await writeState({
      ...state,
      status: STATUS.WAITING_FOR_FIRST_CALL,
      version: (Number(state.version) || 1) + 1,
    });
    return { state: next, itinerary };
  }
  if (state.status === STATUS.REVEAL_PENDING) {
    return { state, itinerary };
  }
  const allInvitations = await readRoundInvites(roundId);
  const invitations = filterInvitesForWorld(allInvitations, state);
  if (!invitations.length) {
    try {
      await finalizeRoundMeta(roundId, { invitations: allInvitations, wasEmpty: true, state, now });
    } catch { /* non-blocking */ }
    const next = await writeState({
      ...state,
      status: STATUS.WAITING_FOR_FIRST_CALL,
      invitationCount: 0,
      invitedCities: [],
      version: (Number(state.version) || 1) + 1,
    });
    return { state: next, itinerary };
  }
  let existingWinner = await readWinner(roundId);
  if (existingWinner?.invitationId && !winnerEligibleForWorld(existingWinner, state)) {
    existingWinner = null;
  }
  if (!existingWinner?.invitationId) {
    // Random user selection — each invite is one user (same city may appear many times).
    const pick = invitations[Math.floor(Math.random() * invitations.length)];
    const winnerPayload = {
      ...pick,
      invitationId: pick.id,
      selectedAt: now.toISOString(),
      selectionMode: 'window',
    };
    await claimWinner(roundId, winnerPayload);
  }
  try {
    const winner = await readWinner(roundId);
    await finalizeRoundMeta(roundId, {
      invitations: allInvitations,
      winner: winnerEligibleForWorld(winner, state) ? winner : null,
      state,
      now,
      wasEmpty: false,
    });
  } catch { /* non-blocking */ }
  return {
    state: await beginRevealPhase(state, invitations, now),
    itinerary,
  };
}

async function advanceStateMachine(nowInput) {
  const now = nowInput instanceof Date ? nowInput : new Date();
  let { state, itinerary } = await ensureSeeded();
  ({ state, itinerary } = await repairItineraryIfNeeded(state, itinerary));
  ({ state, itinerary } = await repairInvalidJourney(state, itinerary));

  // Correct any in-flight arrival that is not the canonical 15:59 UTC landing.
  if (
    state.status === STATUS.TRAVELLING
    && state.departureAt
    && !isCanonicalArrivalAt(state.arrivalAt)
  ) {
    const arrivalAt = computeArrivalAt(state.departureAt).toISOString();
    state = await writeState({
      ...state,
      arrivalAt,
      version: (Number(state.version) || 1) + 1,
    });
    if (state.currentItineraryEntryId) {
      itinerary = itinerary.map((entry) => (
        entry.id === state.currentItineraryEntryId
          ? { ...entry, arrivedAt: arrivalAt }
          : entry
      ));
      await writeItinerary(itinerary);
    }
  }

  if (state.status === STATUS.TRAVELLING
    && state.arrivalAt
    && now.getTime() >= new Date(state.arrivalAt).getTime()) {
    const dest = state.destination;
    state = await writeState({
      ...state,
      status: STATUS.ARRIVED,
      currentCity: dest?.city || state.currentCity,
      currentCountry: dest?.country || state.currentCountry,
      currentCountryCode: dest?.countryCode || state.currentCountryCode,
      currentLatitude: dest?.latitude ?? state.currentLatitude,
      currentLongitude: dest?.longitude ?? state.currentLongitude,
      origin: null,
      destination: null,
      departureAt: null,
      arrivalAt: null,
      activeRoundId: null,
      invitationOpenAt: null,
      invitationCloseAt: null,
      invitationCount: 0,
      invitedCities: [],
      version: (Number(state.version) || 1) + 1,
    });
  }

  if (state.status === STATUS.TRAVELLING) return { state, itinerary, now };

  // 10-second reveal after invitations close — winner already chosen; travel starts at revealEndAt.
  if (state.status === STATUS.REVEAL_PENDING) {
    if (state.revealEndAt && now.getTime() >= new Date(state.revealEndAt).getTime()) {
      const roundId = state.activeRoundId;
      const winner = roundId ? await readWinner(roundId) : null;
      if (winner?.invitationId && winnerEligibleForWorld(winner, state)) {
        const invitations = await readRoundInvites(roundId);
        const applied = await applyWinner(state, itinerary, {
          ...winner,
          selectedAt: state.revealEndAt,
        }, invitations);
        if (applied.state.status === STATUS.TRAVELLING) {
          return { ...applied, now };
        }
      }
      state = await writeState({
        ...state,
        status: STATUS.ARRIVED,
        origin: null,
        destination: null,
        departureAt: null,
        arrivalAt: null,
        revealStartAt: null,
        revealEndAt: null,
        invitedCities: [],
        lastReveal: null,
        version: (Number(state.version) || 1) + 1,
      });
    }
    return { state, itinerary, now };
  }

  const openAt = latestInvitationOpenAt(now);
  const closeAt = new Date(openAt.getTime() + INVITATION_WINDOW_MS);
  const roundId = `round-${openAt.toISOString()}`;

  // Active 60-second ritual window — always open the round while the clock is in-window,
  // even if a prior request missed the transition (state can still be ARRIVED/INITIAL).
  if (now.getTime() >= openAt.getTime() && now.getTime() < closeAt.getTime()) {
    const invitations = await readRoundInvites(roundId);
    const winner = await readWinner(roundId);
    const roundAlreadyOpen = state.status === STATUS.INVITATION_OPEN
      && state.activeRoundId === roundId;
    const staleWinnerOnly = Boolean(winner?.invitationId && !invitations.length);

    if (!roundAlreadyOpen && (!winner?.invitationId || staleWinnerOnly)) {
      state = await openInvitationRound(state, now);
    }
    return { state, itinerary, now };
  }

  // Window just closed while still marked open → settle (pick or wait)
  if (state.status === STATUS.INVITATION_OPEN
    && state.invitationCloseAt
    && now.getTime() >= new Date(state.invitationCloseAt).getTime()) {
    return { ...(await settleInvitationRound(state, itinerary, now)), now };
  }

  if ((state.status === STATUS.ARRIVED || state.status === STATUS.INITIAL)
    && now.getTime() >= closeAt.getTime()
    && state.activeRoundId === roundId) {
    return { ...(await settleInvitationRound(state, itinerary, now)), now };
  }

  // Missed/empty window with no round opened yet → waiting for first call forever
  // until someone invites (World never moves by itself).
  if (
    (state.status === STATUS.ARRIVED || state.status === STATUS.INITIAL)
    && now.getTime() >= closeAt.getTime()
  ) {
    const allInvitations = await readRoundInvites(roundId);
    const invitations = filterInvitesForWorld(allInvitations, state);
    const winner = await readWinner(roundId);
    const hasRealWinner = Boolean(
      winner?.invitationId
      && invitations.length
      && winnerEligibleForWorld(winner, state)
    );

    if (hasRealWinner) {
      return { ...(await settleInvitationRound({
        ...state,
        status: STATUS.INVITATION_OPEN,
        activeRoundId: roundId,
        invitationOpenAt: state.invitationOpenAt || openAt.toISOString(),
        invitationCloseAt: state.invitationCloseAt || closeAt.toISOString(),
      }, itinerary, now)), now };
    }

    if (state.status !== STATUS.WAITING_FOR_FIRST_CALL || state.activeRoundId !== roundId) {
      state = await writeState({
        ...state,
        status: STATUS.WAITING_FOR_FIRST_CALL,
        activeRoundId: roundId,
        invitationOpenAt: openAt.toISOString(),
        invitationCloseAt: closeAt.toISOString(),
        invitationCount: invitations.length,
        invitedCities: buildInvitedCities(allInvitations, state),
        version: (Number(state.version) || 1) + 1,
      });
    }
  }

  // Heal WAITING: any pending winner/invite must start travelling immediately
  // (first person after the empty 60s window sends the plane — no collecting).
  if (state.status === STATUS.WAITING_FOR_FIRST_CALL && state.activeRoundId) {
    const healed = await resolveFirstCallIfPending(state, itinerary, now);
    if (healed) return { ...healed, now };
  }

  return { state, itinerary, now };
}

/** If WAITING already has a claimed winner or any invite, start the first-call trip. */
async function resolveFirstCallIfPending(state, itinerary, now) {
  const roundId = state.activeRoundId;
  if (!roundId) return null;

  const allInvites = await readRoundInvites(roundId);
  const invites = filterInvitesForWorld(allInvites, state);
  if (!invites.length) return null;

  let winner = await readWinner(roundId);
  if (!winner?.invitationId || !winnerEligibleForWorld(winner, state)) {
    const sorted = [...invites].sort((a, b) => {
      const ta = new Date(a.submittedAt || 0).getTime();
      const tb = new Date(b.submittedAt || 0).getTime();
      return ta - tb;
    });
    const pick = sorted[0];
    const winnerPayload = {
      ...pick,
      invitationId: pick.id,
      selectedAt: pick.submittedAt || now.toISOString(),
      selectionMode: 'first_call',
    };
    const claimed = await claimWinner(roundId, winnerPayload);
    winner = claimed.winner;
  } else if (!winner.selectionMode) {
    winner = { ...winner, selectionMode: 'first_call' };
  }

  if (!winnerEligibleForWorld(winner, state)) return null;
  return applyWinner(state, itinerary, winner, allInvites);
}

function journeyProgress(state, now) {
  if (state.status !== STATUS.TRAVELLING || !state.departureAt || !state.arrivalAt) {
    return { progress: 0, travelledKm: 0, totalKm: 0 };
  }
  const start = new Date(state.departureAt).getTime();
  const end = new Date(state.arrivalAt).getTime();
  const totalKm = state.origin && state.destination
    ? Math.round(haversineKm(
      state.origin.latitude, state.origin.longitude,
      state.destination.latitude, state.destination.longitude
    ))
    : 0;
  if (end <= start) return { progress: 1, travelledKm: totalKm, totalKm };
  const progress = Math.max(0, Math.min(1, (now.getTime() - start) / (end - start)));
  return { progress, travelledKm: Math.round(totalKm * progress), totalKm };
}

function computeStats(itinerary, state = null, now = new Date()) {
  const stops = itinerary || [];
  const countries = new Set(stops.map((e) => normalizeCountry(e.country)).filter(Boolean));
  let km = 0;
  if (state?.status === STATUS.TRAVELLING && state.currentItineraryEntryId) {
    km = stops.reduce((sum, entry) => {
      if (entry.id === state.currentItineraryEntryId) return sum;
      return sum + (Number(entry.distanceKm) || 0);
    }, 0);
    km += journeyProgress(state, now).travelledKm || 0;
  } else {
    km = stops.reduce((sum, entry) => sum + (Number(entry.distanceKm) || 0), 0);
  }
  const people = stops.filter((e) => e.calledByVoiceNumber != null).length;
  const beganAt = stops[0]?.arrivedAt || stops[0]?.createdAt || null;
  const daysSince = beganAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(beganAt).getTime()) / 86400000))
    : 0;
  return {
    totalKm: km,
    cities: stops.length,
    countries: countries.size,
    peopleWhoChangedPath: people,
    daysSinceBegan: daysSince,
  };
}

function clientStatusLabel(state, progress, itinerary) {
  if (state.status === STATUS.TRAVELLING && state.destination) {
    return {
      headline: `Next Stop: ${state.destination.city}`,
      detail: progress.totalKm
        ? `${progress.travelledKm.toLocaleString('en-US')} km of ${progress.totalKm.toLocaleString('en-US')} km`
        : null,
    };
  }
  if (state.status === STATUS.INVITATION_OPEN) {
    return { headline: 'Where should the World go next?', detail: 'Invite it to your city.' };
  }
  if (state.status === STATUS.REVEAL_PENDING) {
    return { headline: 'The World is choosing.', detail: 'Where will the journey go next?' };
  }
  if (state.status === STATUS.WAITING_FOR_FIRST_CALL) {
    return { headline: 'Waiting for its next invitation.', detail: 'Invite it to your city.' };
  }
  if (state.status === STATUS.ARRIVED && (itinerary?.length || 0) > 1) {
    return { headline: 'The World has arrived.', detail: null };
  }
  return {
    headline: 'The journey begins here.',
    detail: null,
  };
}

function buildPublicState(state, itinerary, now, viewer = {}) {
  const progress = journeyProgress(state, now);
  const nextInvite = state.status === STATUS.INVITATION_OPEN
    ? null
    : nextInvitationOpenAt(
      state.status === STATUS.TRAVELLING && state.arrivalAt
        ? new Date(state.arrivalAt)
        : now
    ).toISOString();

  const worldCountryCode = resolveCountryCode(state.currentCountryCode || state.currentCountry);
  const viewerCountryCode = resolveCountryCode(viewer.countryCode || viewer.country);
  const countryLoaded = Boolean(viewerCountryCode || viewer.country);
  // Universal rule: same registered country code → blocked; every other country → eligible.
  const sameCountry = Boolean(
    countryLoaded && worldCountryCode && viewerCountryCode && worldCountryCode === viewerCountryCode
  );
  const countryEligible = Boolean(
    viewer.userId
    && viewer.city
    && countryLoaded
    && viewer.latitude != null
    && viewer.longitude != null
    && !sameCountry
  );
  const windowOpen = state.status === STATUS.INVITATION_OPEN
    || state.status === STATUS.WAITING_FOR_FIRST_CALL;
  const canInviteNow = Boolean(countryEligible && windowOpen && !viewer.hasInvited);

  return {
    serverNow: now.toISOString(),
    status: state.status,
    current: {
      city: state.currentCity,
      country: state.currentCountry,
      countryCode: worldCountryCode || state.currentCountryCode,
      latitude: state.currentLatitude,
      longitude: state.currentLongitude,
    },
    origin: state.origin,
    destination: state.destination,
    departureAt: state.departureAt,
    arrivalAt: state.arrivalAt,
    invitationOpenAt: state.invitationOpenAt,
    invitationCloseAt: state.invitationCloseAt,
    revealStartAt: state.revealStartAt || null,
    revealEndAt: state.revealEndAt || null,
    activeRoundId: state.activeRoundId,
    invitationCount: Number(state.invitationCount) || 0,
    invitedCities: state.invitedCities || [],
    progress,
    nextInvitationAt: state.status === STATUS.WAITING_FOR_FIRST_CALL
      ? null
      : (state.status === STATUS.INVITATION_OPEN ? state.invitationCloseAt : nextInvite),
    label: clientStatusLabel(state, progress, itinerary),
    lastReveal: state.lastReveal || null,
    viewer: {
      countryLoaded,
      countryCode: viewerCountryCode,
      city: viewer.city || null,
      country: viewer.country || null,
      voiceNumber: viewer.voiceNumber ?? null,
      sameCountry,
      countryEligible,
      canInviteNow,
      // legacy aliases
      eligible: canInviteNow,
      hasInvited: Boolean(viewer.hasInvited),
    },
    constants: {
      invitationHourUtc: INVITATION_HOUR_UTC,
      invitationWindowMs: INVITATION_WINDOW_MS,
      revealWindowMs: REVEAL_WINDOW_MS,
      arrivalHourUtc: ARRIVAL_HOUR_UTC,
      arrivalMinuteUtc: ARRIVAL_MINUTE_UTC,
    },
  };
}

async function getViewerContext(deviceId, eventId) {
  if (!deviceId) return {};
  const user = await findUserByDevice(deviceId);
  if (!user) return {};
  const pledge = await readPledge(eventId, user.id);
  // Prefer pledge location (authoritative registered World Choir city/country).
  const city = (pledge?.city || user.city || null);
  const country = (pledge?.country || user.country || null);
  const latitude = pledge?.latitude ?? user.latitude ?? null;
  const longitude = pledge?.longitude ?? user.longitude ?? null;
  const voiceNumber = pledge?.voice_number ?? null;
  return {
    userId: user.id,
    city: city ? String(city).trim() : null,
    country: country ? String(country).trim() : null,
    countryCode: resolveCountryCode(country),
    latitude,
    longitude,
    voiceNumber,
  };
}

async function syncOpenRoundInvites(state) {
  if (!state?.activeRoundId) return state;
  if (state.status !== STATUS.INVITATION_OPEN && state.status !== STATUS.WAITING_FOR_FIRST_CALL) {
    return state;
  }
  const invites = await readRoundInvites(state.activeRoundId);
  const invitationCount = invites.length;
  const invitedCities = buildInvitedCities(invites, state);
  if (
    invitationCount === (Number(state.invitationCount) || 0)
    && invitedCities.length === (state.invitedCities || []).length
  ) {
    return state;
  }
  return writeState({
    ...state,
    invitationCount,
    invitedCities,
  });
}

async function getPassTheWorld({ deviceId, eventId = 'world-choir-2027', now } = {}) {
  const advanced = await advanceStateMachine(now ? new Date(now) : new Date());
  let { state, itinerary } = advanced;
  state = await syncOpenRoundInvites(state);
  const viewer = await getViewerContext(deviceId, eventId);
  let hasInvited = false;
  if (viewer.userId && state.activeRoundId) {
    try {
      await readBlobJson(roundInvitationPath(state.activeRoundId, viewer.userId));
      hasInvited = true;
    } catch { hasInvited = false; }
  }
  viewer.hasInvited = hasInvited;
  return {
    journey: buildPublicState(state, itinerary, advanced.now, viewer),
    itinerary,
    stats: computeStats(itinerary, state, advanced.now),
  };
}

async function submitInvitation({ deviceId, eventId = 'world-choir-2027', now } = {}) {
  if (!deviceId) {
    const err = new Error('deviceId is required');
    err.statusCode = 400;
    throw err;
  }

  const advanced = await advanceStateMachine(now ? new Date(now) : new Date());
  let { state, itinerary } = advanced;
  const clock = advanced.now;
  const viewer = await getViewerContext(deviceId, eventId);

  if (!viewer.userId) {
    const err = new Error('Join World Choir to invite the World.');
    err.statusCode = 403;
    throw err;
  }
  if (!viewer.city || !viewer.country) {
    const err = new Error('Add your city and country to invite the World.');
    err.statusCode = 400;
    throw err;
  }
  if (viewer.latitude == null || viewer.longitude == null) {
    const err = new Error('Your city could not be located on the map yet.');
    err.statusCode = 400;
    throw err;
  }
  if (countriesMatch(viewer.countryCode || viewer.country, state.currentCountryCode || state.currentCountry)) {
    const err = new Error('The journey is currently in your country.');
    err.statusCode = 403;
    throw err;
  }
  if (state.status === STATUS.REVEAL_PENDING) {
    const err = new Error('The World is choosing its next destination.');
    err.statusCode = 409;
    throw err;
  }
  if (state.status !== STATUS.INVITATION_OPEN && state.status !== STATUS.WAITING_FOR_FIRST_CALL) {
    const err = new Error('Invitations are not open right now.');
    err.statusCode = 409;
    throw err;
  }

  if (!state.activeRoundId) {
    const openAt = latestInvitationOpenAt(clock);
    state = await writeState({
      ...state,
      activeRoundId: `round-${openAt.toISOString()}`,
      invitationOpenAt: state.invitationOpenAt || openAt.toISOString(),
      invitationCloseAt: state.invitationCloseAt
        || new Date(openAt.getTime() + INVITATION_WINDOW_MS).toISOString(),
      status: STATUS.WAITING_FOR_FIRST_CALL,
      version: (Number(state.version) || 1) + 1,
    });
  }

  const roundId = state.activeRoundId;
  const existingWinner = await readWinner(roundId);
  if (existingWinner?.invitationId) {
    const invites = await readRoundInvites(roundId);
    const applied = await applyWinner(state, itinerary, existingWinner, invites);
    return {
      ok: false,
      alreadyMoving: true,
      message: 'The World is already moving.',
      journey: buildPublicState(applied.state, applied.itinerary, clock, { ...viewer, hasInvited: true }),
      itinerary: applied.itinerary,
      stats: computeStats(applied.itinerary, applied.state, clock),
    };
  }

  let alreadyInvited = false;
  try {
    await readBlobJson(roundInvitationPath(roundId, viewer.userId));
    alreadyInvited = true;
  } catch { /* first invite */ }

  // After the empty 60s window: first click sends the plane immediately (no collecting).
  if (state.status === STATUS.WAITING_FOR_FIRST_CALL) {
    let invites = await readRoundInvites(roundId);
    if (!alreadyInvited) {
      const invitation = {
        id: randomUUID(),
        roundId,
        userId: viewer.userId,
        voiceNumber: viewer.voiceNumber,
        city: viewer.city,
        country: viewer.country,
        countryCode: viewer.countryCode || resolveCountryCode(viewer.country),
        latitude: Number(viewer.latitude),
        longitude: Number(viewer.longitude),
        submittedAt: clock.toISOString(),
      };
      invites = await writeRoundInvite(roundId, invitation, state.invitationOpenAt);
      const winnerPayload = {
        ...invitation,
        invitationId: invitation.id,
        selectedAt: clock.toISOString(),
        selectionMode: 'first_call',
      };
      const { winner, created } = await claimWinner(roundId, winnerPayload);
      const applied = await applyWinner(state, itinerary, winner, invites);
      return {
        ok: created,
        selected: created,
        alreadyMoving: !created,
        message: created ? null : 'The World is already moving.',
        journey: buildPublicState(applied.state, applied.itinerary, clock, { ...viewer, hasInvited: true }),
        itinerary: applied.itinerary,
        stats: computeStats(applied.itinerary, applied.state, clock),
      };
    }

    // Already invited but trip never started — heal and start travelling.
    const healed = await resolveFirstCallIfPending(state, itinerary, clock);
    if (healed) {
      return {
        ok: true,
        selected: true,
        alreadyInvited: true,
        journey: buildPublicState(healed.state, healed.itinerary, clock, { ...viewer, hasInvited: true }),
        itinerary: healed.itinerary,
        stats: computeStats(healed.itinerary, healed.state, clock),
      };
    }
    state = await writeState({
      ...state,
      invitationCount: invites.length,
      invitedCities: buildInvitedCities(invites, state),
    });
    return {
      ok: true,
      alreadyInvited: true,
      journey: buildPublicState(state, itinerary, clock, { ...viewer, hasInvited: true }),
      itinerary,
      stats: computeStats(itinerary, state, clock),
    };
  }

  // Active 60-second ritual window — collect invitations only.
  if (alreadyInvited) {
    const invites = await readRoundInvites(roundId);
    state = await writeState({
      ...state,
      invitationCount: invites.length,
      invitedCities: buildInvitedCities(invites, state),
    });
    return {
      ok: true,
      alreadyInvited: true,
      journey: buildPublicState(state, itinerary, clock, { ...viewer, hasInvited: true }),
      itinerary,
      stats: computeStats(itinerary, state, clock),
    };
  }

  const invitation = {
    id: randomUUID(),
    roundId,
    userId: viewer.userId,
    voiceNumber: viewer.voiceNumber,
    city: viewer.city,
    country: viewer.country,
    countryCode: viewer.countryCode || resolveCountryCode(viewer.country),
    latitude: Number(viewer.latitude),
    longitude: Number(viewer.longitude),
    submittedAt: clock.toISOString(),
  };

  const invites = await writeRoundInvite(roundId, invitation, state.invitationOpenAt);
  state = await writeState({
    ...state,
    invitationCount: invites.length,
    invitedCities: buildInvitedCities(invites, state),
    version: (Number(state.version) || 1) + 1,
  });

  return {
    ok: true,
    alreadyInvited: false,
    journey: buildPublicState(state, itinerary, clock, { ...viewer, hasInvited: true }),
    itinerary,
    stats: computeStats(itinerary, state, clock),
  };
}

module.exports = {
  STATUS,
  INVITATION_HOUR_UTC,
  INVITATION_WINDOW_MS,
  REVEAL_WINDOW_MS,
  ARRIVAL_HOUR_UTC,
  ARRIVAL_MINUTE_UTC,
  SEED_CITY,
  getPassTheWorld,
  submitInvitation,
  advanceStateMachine,
  haversineKm,
  nextInvitationOpenAt,
  nextArrivalAt,
  computeArrivalAt,
  countriesMatch,
  isInvalidItineraryEntry,
  isInvalidTravelLeg,
  inviteEligibleForWorld,
};
