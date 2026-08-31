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
/** If a late claim would arrive sooner than this, roll to the following 16:00 UTC. */
const MIN_JOURNEY_DURATION_MS = 4 * 60 * 60 * 1000;
/** First-call (after empty 60s window) journeys are intentionally faster. */
const FIRST_CALL_JOURNEY_DURATION_MS = 2 * 60 * 60 * 1000;

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

function computeArrivalAt(departureAt, { selectionMode = 'window' } = {}) {
  const depart = new Date(departureAt);

  // After an empty 60s window, the first caller starts a shorter symbolic journey.
  if (selectionMode === 'first_call') {
    return new Date(depart.getTime() + FIRST_CALL_JOURNEY_DURATION_MS);
  }

  let arrival = nextInvitationOpenAt(depart);
  if (arrival.getTime() - depart.getTime() < MIN_JOURNEY_DURATION_MS) {
    arrival = nextInvitationOpenAt(arrival);
  }
  return arrival;
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

async function writeRoundInvite(roundId, invitation) {
  await writeJson(roundInvitationPath(roundId, invitation.userId), invitation, { overwrite: true });
  const existing = await readRoundInvites(roundId);
  const without = existing.filter((e) => e.userId !== invitation.userId);
  without.push({
    id: invitation.id,
    userId: invitation.userId,
    voiceNumber: invitation.voiceNumber,
    city: invitation.city,
    country: invitation.country,
    countryCode: invitation.countryCode,
    latitude: invitation.latitude,
    longitude: invitation.longitude,
    submittedAt: invitation.submittedAt,
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

function buildInvitedCities(invitations) {
  const byKey = new Map();
  for (const invite of invitations) {
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
  const selectedAt = winner.selectedAt || new Date().toISOString();
  const arrivalAt = computeArrivalAt(selectedAt, {
    selectionMode: winner.selectionMode || 'window',
  }).toISOString();
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
    invitedCities: buildInvitedCities(invitations),
    lastReveal: publicReveal(winner, origin),
    version: (Number(state.version) || 1) + 1,
  });
  return { state: nextState, itinerary: nextItinerary };
}

async function openInvitationRound(state, now) {
  const openAt = latestInvitationOpenAt(now);
  const closeAt = new Date(openAt.getTime() + INVITATION_WINDOW_MS);
  const roundId = `round-${openAt.toISOString()}`;
  if (state.activeRoundId === roundId
    && (state.status === STATUS.INVITATION_OPEN || state.status === STATUS.WAITING_FOR_FIRST_CALL)) {
    return state;
  }
  return writeState({
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
  const existingWinner = await readWinner(roundId);
  if (existingWinner?.invitationId) {
    return applyWinner(state, itinerary, existingWinner, await readRoundInvites(roundId));
  }
  const invitations = await readRoundInvites(roundId);
  if (!invitations.length) {
    const next = await writeState({
      ...state,
      status: STATUS.WAITING_FOR_FIRST_CALL,
      invitationCount: 0,
      invitedCities: [],
      version: (Number(state.version) || 1) + 1,
    });
    return { state: next, itinerary };
  }
  const pick = invitations[Math.floor(Math.random() * invitations.length)];
  const winnerPayload = {
    ...pick,
    invitationId: pick.id,
    selectedAt: now.toISOString(),
    selectionMode: 'window',
  };
  const { winner } = await claimWinner(roundId, winnerPayload);
  return applyWinner(state, itinerary, winner, invitations);
}

async function advanceStateMachine(nowInput) {
  const now = nowInput instanceof Date ? nowInput : new Date();
  let { state, itinerary } = await ensureSeeded();

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

  const openAt = latestInvitationOpenAt(now);
  const closeAt = new Date(openAt.getTime() + INVITATION_WINDOW_MS);
  const roundId = `round-${openAt.toISOString()}`;

  // Active 60-second ritual window
  if (now.getTime() >= openAt.getTime() && now.getTime() < closeAt.getTime()) {
    const winner = await readWinner(roundId);
    if (!winner?.invitationId) state = await openInvitationRound(state, now);
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
    const winner = await readWinner(roundId);
    if (!winner?.invitationId) {
      state = await writeState({
        ...state,
        status: STATUS.WAITING_FOR_FIRST_CALL,
        activeRoundId: roundId,
        invitationOpenAt: openAt.toISOString(),
        invitationCloseAt: closeAt.toISOString(),
        invitationCount: 0,
        invitedCities: [],
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

  let winner = await readWinner(roundId);
  if (!winner?.invitationId) {
    const invites = await readRoundInvites(roundId);
    if (!invites.length) return null;
    // Earliest invite wins (first person who clicked after the window).
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

  const invites = await readRoundInvites(roundId);
  return applyWinner(state, itinerary, winner, invites);
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

function computeStats(itinerary) {
  const stops = itinerary || [];
  const countries = new Set(stops.map((e) => normalizeCountry(e.country)).filter(Boolean));
  const km = stops.reduce((sum, e) => sum + (Number(e.distanceKm) || 0), 0);
  const people = stops.filter((e) => e.calledByVoiceNumber != null).length;
  const beganAt = stops[0]?.arrivedAt || stops[0]?.createdAt || null;
  const daysSince = beganAt
    ? Math.max(0, Math.floor((Date.now() - new Date(beganAt).getTime()) / 86400000))
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
      headline: `On the way to ${state.destination.city}`,
      detail: progress.totalKm
        ? `${progress.travelledKm.toLocaleString('en-US')} km of ${progress.totalKm.toLocaleString('en-US')} km`
        : null,
    };
  }
  if (state.status === STATUS.INVITATION_OPEN) {
    return { headline: 'Where should the World go next?', detail: 'Invite it to your city.' };
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
      minJourneyDurationMs: MIN_JOURNEY_DURATION_MS,
      firstCallJourneyDurationMs: FIRST_CALL_JOURNEY_DURATION_MS,
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
  const invitedCities = buildInvitedCities(invites);
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
    stats: computeStats(itinerary),
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
      stats: computeStats(applied.itinerary),
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
      invites = await writeRoundInvite(roundId, invitation);
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
        stats: computeStats(applied.itinerary),
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
        stats: computeStats(healed.itinerary),
      };
    }
    state = await writeState({
      ...state,
      invitationCount: invites.length,
      invitedCities: buildInvitedCities(invites),
    });
    return {
      ok: true,
      alreadyInvited: true,
      journey: buildPublicState(state, itinerary, clock, { ...viewer, hasInvited: true }),
      itinerary,
      stats: computeStats(itinerary),
    };
  }

  // Active 60-second ritual window — collect invitations only.
  if (alreadyInvited) {
    const invites = await readRoundInvites(roundId);
    state = await writeState({
      ...state,
      invitationCount: invites.length,
      invitedCities: buildInvitedCities(invites),
    });
    return {
      ok: true,
      alreadyInvited: true,
      journey: buildPublicState(state, itinerary, clock, { ...viewer, hasInvited: true }),
      itinerary,
      stats: computeStats(itinerary),
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

  const invites = await writeRoundInvite(roundId, invitation);
  state = await writeState({
    ...state,
    invitationCount: invites.length,
    invitedCities: buildInvitedCities(invites),
    version: (Number(state.version) || 1) + 1,
  });

  return {
    ok: true,
    alreadyInvited: false,
    journey: buildPublicState(state, itinerary, clock, { ...viewer, hasInvited: true }),
    itinerary,
    stats: computeStats(itinerary),
  };
}

module.exports = {
  STATUS,
  INVITATION_HOUR_UTC,
  INVITATION_WINDOW_MS,
  MIN_JOURNEY_DURATION_MS,
  FIRST_CALL_JOURNEY_DURATION_MS,
  SEED_CITY,
  getPassTheWorld,
  submitInvitation,
  advanceStateMachine,
  haversineKm,
  nextInvitationOpenAt,
  computeArrivalAt,
};
