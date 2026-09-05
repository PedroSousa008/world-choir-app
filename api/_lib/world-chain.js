/**
 * World Chain — trusted backend logic.
 * Exactly 5 daily chains; country/city routes; 48h account-age eligibility;
 * attempt cooldowns; stuck after idle; never fabricates countries.
 */
const { randomUUID } = require('crypto');
const {
  listPledges,
  listAllUsers,
  findUserByDevice,
  readPledge,
  readBlobJson,
  writeJson,
  assertBlobConfigured,
} = require('./store');

const DEFAULT_EVENT_ID = 'world-choir-2027';
const DAILY_CHAIN_COUNT = 5;
const MIN_CHAIN_LENGTH = 2;
const CHAIN_DURATION_MS = 24 * 60 * 60 * 1000;
const STUCK_AFTER_MS = 3 * 60 * 60 * 1000;
const ACCOUNT_AGE_MS = 48 * 60 * 60 * 1000;
const COOLDOWNS_MS = [10 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];

const Status = {
  IN_PROGRESS: 'IN_PROGRESS',
  STUCK: 'STUCK',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
};

/** Temporary test: force chain #1 to start with Voice #5 (Portugal). */
const TEST_FORCE_STARTER = {
  enabled: true,
  chainIndex: 0,
  startCountry: 'Portugal',
  voiceNumber: 5,
};

/** Bump when generation rules change so the day regenerates. */
const CHAIN_STORAGE_VERSION = 'v5';
const CHAIN_ENGINE = 'starter-first-v5';

function dayKeyUTC(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function rootPath(eventId, day) {
  return `wc-data/world-chain/${CHAIN_STORAGE_VERSION}/${encodeURIComponent(eventId)}/${day}`;
}

function manifestPath(eventId, day) {
  return `${rootPath(eventId, day)}/manifest.json`;
}

function chainPath(eventId, day, chainId) {
  return `${rootPath(eventId, day)}/chains/${chainId}.json`;
}

function attemptsPath(eventId, day, chainId, voiceNumber) {
  return `${rootPath(eventId, day)}/attempts/${chainId}/v${voiceNumber}.json`;
}

function archiveRoot(eventId) {
  return `wc-data/world-chain/archive/${encodeURIComponent(eventId)}`;
}

function archiveIndexPath(eventId) {
  return `${archiveRoot(eventId)}/index.json`;
}

function archiveChainPath(eventId, chainId) {
  return `${archiveRoot(eventId)}/chains/${encodeURIComponent(chainId)}.json`;
}

function normalizeCountry(value) {
  return String(value || '').trim();
}

function normalizeCity(value) {
  return String(value || '').trim().toLowerCase();
}

function citiesEqual(a, b) {
  return normalizeCity(a) === normalizeCity(b);
}

function countriesEqual(a, b) {
  return normalizeCountry(a).toLowerCase() === normalizeCountry(b).toLowerCase();
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((n) => Number.isFinite(Number(n)))) return null;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function routeDistanceKm(steps) {
  let total = 0;
  let any = false;
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1];
    const cur = steps[i];
    const d = haversineKm(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
    if (d != null) {
      total += d;
      any = true;
    }
  }
  return any ? total : null;
}

function accountCreatedAt(user, pledge) {
  const raw = user?.created_at || pledge?.pledged_at || null;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function isAccountEligible(user, pledge, nowMs = Date.now()) {
  const created = accountCreatedAt(user, pledge);
  if (created == null) return false;
  return nowMs >= created + ACCOUNT_AGE_MS;
}

function buildUserMaps(users = []) {
  const byId = new Map();
  users.forEach((u) => {
    if (u?.id) byId.set(u.id, u);
  });
  return byId;
}

function buildPledgeIndexes(pledges = [], usersById = new Map(), nowMs = Date.now()) {
  const byVoice = new Map();
  const byCountry = new Map();
  const citiesByCountry = new Map();

  pledges.forEach((pledge) => {
    if (!pledge) return;
    const voice = Number(pledge.voice_number ?? pledge.voiceNumber);
    if (!Number.isFinite(voice)) return;
    // Normalize so downstream always reads voice_number.
    const normalized = {
      ...pledge,
      voice_number: voice,
      country: normalizeCountry(pledge.country),
      city: String(pledge.city || '').trim(),
    };
    byVoice.set(voice, normalized);

    const country = normalized.country;
    if (!country) return;
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push(normalized);

    const city = normalized.city;
    if (!city) return;
    const key = `${country.toLowerCase()}|${normalizeCity(city)}`;
    if (!citiesByCountry.has(country)) citiesByCountry.set(country, new Map());
    const cityMap = citiesByCountry.get(country);
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city,
        country,
        voices: [],
        eligibleVoices: [],
        latitude: normalized.latitude ?? null,
        longitude: normalized.longitude ?? null,
      });
    }
    const entry = cityMap.get(key);
    entry.voices.push(normalized);
    const user = usersById.get(normalized.user_id);
    if (isAccountEligible(user, normalized, nowMs)) {
      entry.eligibleVoices.push(normalized);
      if (entry.latitude == null && normalized.latitude != null) {
        entry.latitude = normalized.latitude;
        entry.longitude = normalized.longitude;
      }
    }
  });

  return { byVoice, byCountry, citiesByCountry };
}

function representedCountries(byCountry) {
  return [...byCountry.keys()].filter((c) => (byCountry.get(c) || []).length > 0);
}

function pickVariedLengths(maxCountries, count = DAILY_CHAIN_COUNT) {
  if (maxCountries < MIN_CHAIN_LENGTH) return [];
  const lengths = [];
  const min = MIN_CHAIN_LENGTH;
  const max = maxCountries;
  const span = Math.max(1, max - min);
  for (let i = 0; i < count; i += 1) {
    // Spread lengths across the available range; keep uniqueness when possible.
    const t = count === 1 ? 0.5 : i / (count - 1);
    let len = Math.round(min + t * span);
    len = Math.max(min, Math.min(max, len));
    lengths.push(len);
  }
  // Nudge duplicates so the five chains feel varied when the span allows it.
  for (let i = 1; i < lengths.length; i += 1) {
    if (lengths[i] === lengths[i - 1] && max > min) {
      const next = lengths[i] + (i % 2 === 0 ? 1 : -1);
      lengths[i] = Math.max(min, Math.min(max, next));
    }
  }
  return lengths;
}

function shuffle(arr, seedStr = '') {
  const out = [...arr];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i += 1) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickFinalCity(country, citiesByCountry, excludeVoiceIds = new Set()) {
  const cityMap = citiesByCountry.get(country);
  if (!cityMap) return null;
  const all = [...cityMap.values()];
  const withEligible = all
    .map((entry) => ({
      ...entry,
      eligibleVoices: entry.eligibleVoices.filter((p) => !excludeVoiceIds.has(p.user_id)),
    }))
    .filter((entry) => entry.eligibleVoices.length > 0)
    .sort((a, b) => b.eligibleVoices.length - a.eligibleVoices.length);
  if (withEligible[0]) return withEligible[0];
  // Fallback: any city with voices (eligibility checked at connect time).
  const withAny = all
    .map((entry) => ({
      ...entry,
      eligibleVoices: entry.voices.filter((p) => !excludeVoiceIds.has(p.user_id)),
    }))
    .filter((entry) => entry.eligibleVoices.length > 0)
    .sort((a, b) => b.eligibleVoices.length - a.eligibleVoices.length);
  return withAny[0] || all[0] || null;
}

/**
 * Pick a starting Voice for a country.
 * Starters are selected among pledged Voices (eligibility is enforced when connecting TO a Voice).
 */
function pickStartingVoice(country, byCountry, usersById, excludeVoiceIds, nowMs) {
  const pool = (byCountry.get(country) || []).filter((p) => !excludeVoiceIds.has(p.user_id));
  if (!pool.length) return null;
  // Prefer eligible accounts, but fall back so we can still fill today's 5 chains.
  const eligible = pool.filter((p) => isAccountEligible(usersById.get(p.user_id), p, nowMs));
  const use = eligible.length ? eligible : pool;
  return use[Math.floor(Math.random() * use.length)];
}

function listStarterCandidates(byVoice, usersById, excludeVoiceIds, nowMs) {
  const all = [];
  for (const pledge of byVoice.values()) {
    if (!pledge?.user_id || excludeVoiceIds.has(pledge.user_id)) continue;
    if (!normalizeCountry(pledge.country)) continue;
    all.push(pledge);
  }
  const eligible = all.filter((p) => isAccountEligible(usersById.get(p.user_id), p, nowMs));
  return { preferred: eligible.length ? eligible : all, all };
}

function buildRouteCountries(startCountry, allCountries, length, seedStr) {
  const start = normalizeCountry(startCountry);
  const rest = shuffle(
    allCountries.filter((c) => !countriesEqual(c, start)),
    seedStr
  );
  const route = [start, ...rest];
  // Ensure we never build a 1-country chain when more countries exist.
  const target = Math.max(MIN_CHAIN_LENGTH, Math.min(length, route.length));
  return route.slice(0, target);
}

function resolveForcedStarter(byVoice) {
  if (!TEST_FORCE_STARTER.enabled) return null;
  const voiceNum = Number(TEST_FORCE_STARTER.voiceNumber);
  let pledge = byVoice.get(voiceNum) || null;
  // Tolerate camelCase voiceNumber if an index row was mapped.
  if (!pledge) {
    for (const p of byVoice.values()) {
      const n = Number(p?.voice_number ?? p?.voiceNumber);
      if (n === voiceNum) {
        pledge = p;
        break;
      }
    }
  }
  if (!pledge?.user_id) return null;
  const country = normalizeCountry(pledge.country)
    || normalizeCountry(TEST_FORCE_STARTER.startCountry);
  if (!country) return null;
  return {
    ...pledge,
    voice_number: Number(pledge.voice_number ?? pledge.voiceNumber) || voiceNum,
    country,
  };
}

function buildRouteSteps(countries, citiesByCountry, startingPledge) {
  return countries.map((country, index) => {
    const isFinal = index === countries.length - 1;
    let requiredCity = null;
    let latitude = null;
    let longitude = null;
    if (isFinal) {
      const city = pickFinalCity(country, citiesByCountry);
      requiredCity = city?.city || null;
      latitude = city?.latitude ?? null;
      longitude = city?.longitude ?? null;
    } else if (index === 0 && startingPledge) {
      latitude = startingPledge.latitude ?? null;
      longitude = startingPledge.longitude ?? null;
    } else {
      const cityMap = citiesByCountry.get(country);
      const first = cityMap ? [...cityMap.values()][0] : null;
      latitude = first?.latitude ?? null;
      longitude = first?.longitude ?? null;
    }
    return {
      position: index,
      country,
      requiredCity,
      assignedVoiceId: index === 0 ? startingPledge?.user_id || null : null,
      assignedVoiceNumber: index === 0 ? Number(startingPledge?.voice_number) || null : null,
      assignedCity: index === 0 ? (startingPledge?.city || null) : null,
      latitude,
      longitude,
      // Fresh chain: starter is selected, but no connection has been made yet.
      connectedAt: null,
      activatedAt: null,
      status: index === 0 ? 'selected' : 'future',
    };
  });
}

function deriveStatus(chain, nowMs = Date.now()) {
  if (!chain) return Status.EXPIRED;
  if (chain.status === Status.COMPLETED || chain.completedAt) return Status.COMPLETED;
  const expiresAt = new Date(chain.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && nowMs >= expiresAt) return Status.EXPIRED;

  // Do not mark stuck before the starting Voice has actually begun.
  if (!chain.starterAccepted) return Status.IN_PROGRESS;

  const steps = chain.route || [];
  const active = steps.find((s) => s.status === 'active');
  if (!active) return Status.IN_PROGRESS;

  const anchor = active.activatedAt || chain.lastProgressAt || chain.startsAt;
  const idleFrom = new Date(anchor).getTime();
  if (Number.isFinite(idleFrom) && nowMs - idleFrom >= STUCK_AFTER_MS) {
    return Status.STUCK;
  }
  return Status.IN_PROGRESS;
}

function publicStep(step) {
  return {
    position: step.position,
    country: step.country,
    requiredCity: step.requiredCity || null,
    status: step.status,
    connectedAt: step.connectedAt || null,
    assignedVoiceNumber: step.assignedVoiceNumber || null,
    assignedCity: step.assignedCity || null,
  };
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function publicChain(chain, nowMs = Date.now(), viewer = null) {
  const liveStatus = deriveStatus(chain, nowMs);
  const steps = chain.route || [];
  const connected = steps.filter((s) => s.status === 'connected').length;
  const active = steps.find((s) => s.status === 'active') || null;
  const final = steps[steps.length - 1] || null;
  const start = steps[0] || null;

  let timerLabel = '';
  let timerMs = 0;
  if (liveStatus === Status.COMPLETED) {
    const started = new Date(chain.startsAt).getTime();
    const done = new Date(chain.completedAt || nowMs).getTime();
    timerMs = Math.max(0, done - started);
    timerLabel = `Completed in ${formatDuration(timerMs)}`;
  } else if (liveStatus === Status.STUCK) {
    const anchor = active?.activatedAt || chain.lastProgressAt || chain.startsAt;
    timerMs = Math.max(0, nowMs - new Date(anchor).getTime());
    timerLabel = `${formatDuration(timerMs)} stuck`;
  } else if (liveStatus === Status.EXPIRED) {
    timerLabel = 'Expired';
  } else {
    timerMs = Math.max(0, new Date(chain.expiresAt).getTime() - nowMs);
    timerLabel = `${formatDuration(timerMs)} left`;
  }

  const viewerIsActive = !!(
    viewer?.userId
    && active
    && active.assignedVoiceId
    && active.assignedVoiceId === viewer.userId
  );
  const pendingDestination = (!chain.starterAccepted && steps[1]) ? steps[1] : null;

  // Starter is selected on step 0; they must accept before any destination becomes active.
  const viewerNeedsStart = !!(
    viewer?.userId
    && chain.startingVoiceId === viewer.userId
    && !chain.starterAccepted
    && liveStatus !== Status.COMPLETED
    && liveStatus !== Status.EXPIRED
  );

  const viewerIsCurrentActor = !!(
    viewer?.userId
    && active?.assignedVoiceId === viewer.userId
    && chain.starterAccepted
  );

  // Named by the app (starter) or by another Voice (connected / current actor on this chain).
  const viewerIsNamed = !!(
    viewer?.userId
    && (
      chain.startingVoiceId === viewer.userId
      || steps.some((s) => s.assignedVoiceId && s.assignedVoiceId === viewer.userId)
    )
  );

  let cta = 'WATCH LIVE';
  if (liveStatus === Status.COMPLETED) {
    cta = 'VIEW COMPLETED CHAIN';
  } else if (viewerIsNamed) {
    cta = 'KEEP THE CHAIN ALIVE';
  } else if (liveStatus === Status.STUCK) {
    cta = 'HELP THIS CHAIN';
  }

  return {
    id: chain.id,
    dailyChainNumber: chain.dailyChainNumber,
    dayKey: chain.dayKey,
    status: liveStatus,
    startsAt: chain.startsAt,
    expiresAt: chain.expiresAt,
    completedAt: chain.completedAt || null,
    timerLabel,
    timerMs,
    countries: steps.length,
    connections: Math.max(0, steps.length - 1),
    voicesConnected: connected,
    voicesTotal: steps.length,
    progressLabel: `${connected} / ${steps.length} VOICES CONNECTED`,
    startCountry: start?.country || null,
    finalCountry: final?.country || null,
    finalCity: final?.requiredCity || null,
    routeSummary: start && final
      ? `${start.country} → ${final.requiredCity || final.country}`
      : '',
    totalDistanceKm: chain.totalDistanceKm ?? routeDistanceKm(steps),
    route: steps.map(publicStep),
    activeCountry: active?.country || pendingDestination?.country || null,
    activeRequiredCity: active?.requiredCity || pendingDestination?.requiredCity || null,
    cta,
    viewer: viewer ? {
      isStarter: chain.startingVoiceId === viewer.userId,
      isNamed: viewerIsNamed,
      needsStart: viewerNeedsStart,
      isActiveTurn: viewerIsCurrentActor || (viewerIsActive && chain.starterAccepted),
      voiceNumber: viewer.voiceNumber || null,
    } : null,
  };
}

async function readManifest(eventId, day) {
  try {
    return await readBlobJson(manifestPath(eventId, day));
  } catch {
    return null;
  }
}

async function readChain(eventId, day, chainId) {
  try {
    return await readBlobJson(chainPath(eventId, day, chainId));
  } catch {
    return null;
  }
}

async function writeChain(eventId, day, chain) {
  await writeJson(chainPath(eventId, day, chain.id), chain, { overwrite: true });
  return chain;
}

async function readArchiveIndex(eventId) {
  try {
    return await readBlobJson(archiveIndexPath(eventId));
  } catch {
    return null;
  }
}

async function readArchivedChain(eventId, chainId) {
  try {
    return await readBlobJson(archiveChainPath(eventId, chainId));
  } catch {
    return null;
  }
}

/** Persist completed chains forever (beyond daily storage versions). */
async function archiveCompletedChain(chain) {
  if (!chain?.id || !chain.eventId) return;
  const status = chain.status === Status.COMPLETED || chain.completedAt
    ? Status.COMPLETED
    : null;
  if (status !== Status.COMPLETED) return;

  const snapshot = {
    ...chain,
    status: Status.COMPLETED,
    completedAt: chain.completedAt || new Date().toISOString(),
  };
  await writeJson(archiveChainPath(chain.eventId, chain.id), snapshot, { overwrite: true });

  const existing = await readArchiveIndex(chain.eventId);
  const prevIds = Array.isArray(existing?.chainIds) ? existing.chainIds : [];
  const chainIds = [chain.id, ...prevIds.filter((id) => id !== chain.id)].slice(0, 500);
  await writeJson(archiveIndexPath(chain.eventId), {
    eventId: chain.eventId,
    chainIds,
    updatedAt: new Date().toISOString(),
  }, { overwrite: true });
}

async function generateDailyChains(eventId, day, now = new Date()) {
  assertBlobConfigured();
  const nowMs = now.getTime();
  const [pledges, users] = await Promise.all([
    listPledges(eventId),
    listAllUsers().catch(() => []),
  ]);
  const usersById = buildUserMaps(users);
  const { byVoice, byCountry, citiesByCountry } = buildPledgeIndexes(pledges, usersById, nowMs);
  const countries = representedCountries(byCountry);
  const maxAvailable = countries.length;

  if (maxAvailable < MIN_CHAIN_LENGTH) {
    const empty = {
      eventId,
      dayKey: day,
      generatedAt: now.toISOString(),
      maxAvailableCountries: maxAvailable,
      chainIds: [],
      limited: true,
      reason: 'not_enough_countries',
    };
    await writeJson(manifestPath(eventId, day), empty, { overwrite: false }).catch(async () => {
      /* if already exists, leave it */
    });
    return empty;
  }

  const lengths = pickVariedLengths(maxAvailable, DAILY_CHAIN_COUNT);
  const usedStartVoices = new Set();
  const usedStartCountries = new Set();
  const chains = [];

  // --- Chain #1 test: app "selects" Voice #5 → route starts in their country (Portugal) ---
  const forcedStarter = resolveForcedStarter(byVoice);
  if (forcedStarter && lengths.length) {
    // Give the test chain a full route (not the shortest slot).
    const length = Math.max(...lengths);
    const startCountry = normalizeCountry(forcedStarter.country);
    // Make sure Portugal (starter country) is in the country pool for routing.
    const countryPool = countries.some((c) => countriesEqual(c, startCountry))
      ? countries
      : [startCountry, ...countries];
    const routeCountries = buildRouteCountries(
      startCountry,
      countryPool,
      length,
      `${day}:${eventId}:force`
    );
    if (routeCountries.length >= MIN_CHAIN_LENGTH) {
      const finalCountry = routeCountries[routeCountries.length - 1];
      const finalCity = pickFinalCity(finalCountry, citiesByCountry, usedStartVoices)
        || pickFinalCity(finalCountry, citiesByCountry, new Set());
      if (finalCity?.city || !countriesEqual(finalCountry, startCountry)) {
        usedStartVoices.add(forcedStarter.user_id);
        usedStartCountries.add(startCountry.toLowerCase());
        const route = buildRouteSteps(routeCountries, citiesByCountry, forcedStarter);
        if (finalCity?.city) {
          route[route.length - 1].requiredCity = finalCity.city;
          route[route.length - 1].latitude = finalCity.latitude;
          route[route.length - 1].longitude = finalCity.longitude;
        } else {
          // No city pin — keep country-only final so the chain still exists for testing.
          route[route.length - 1].requiredCity = null;
        }
        chains.push({
          id: randomUUID(),
          eventId,
          dayKey: day,
          dailyChainNumber: 1,
          createdAt: now.toISOString(),
          startsAt: now.toISOString(),
          expiresAt: new Date(nowMs + CHAIN_DURATION_MS).toISOString(),
          status: Status.IN_PROGRESS,
          starterAccepted: false,
          startingVoiceId: forcedStarter.user_id,
          startingVoiceNumber: Number(forcedStarter.voice_number),
          currentStep: 0,
          lastProgressAt: null,
          completedAt: null,
          totalDistanceKm: null,
          route,
        });
      }
    }
  }

  // --- Remaining chains: randomly select a starting Voice, then build route from their country ---
  let attempt = 0;
  const maxAttempts = DAILY_CHAIN_COUNT * 12;
  while (chains.length < DAILY_CHAIN_COUNT && attempt < maxAttempts) {
    attempt += 1;
    const slot = chains.length;
    const length = lengths[Math.min(slot, lengths.length - 1)] || MIN_CHAIN_LENGTH;
    const { preferred } = listStarterCandidates(byVoice, usersById, usedStartVoices, nowMs);
    if (!preferred.length) break;

    // Prefer a starter from a country not already used as a start, when possible.
    const freshCountry = preferred.filter(
      (p) => !usedStartCountries.has(normalizeCountry(p.country).toLowerCase())
    );
    const pool = freshCountry.length ? freshCountry : preferred;
    const starter = pool[Math.floor(Math.random() * pool.length)];
    const startCountry = normalizeCountry(starter.country);
    const routeCountries = buildRouteCountries(
      startCountry,
      countries,
      length,
      `${day}:${eventId}:${slot}:${attempt}`
    );
    if (routeCountries.length < MIN_CHAIN_LENGTH) {
      usedStartVoices.add(starter.user_id);
      continue;
    }

    const finalCountry = routeCountries[routeCountries.length - 1];
    const finalCity = pickFinalCity(finalCountry, citiesByCountry, usedStartVoices)
      || pickFinalCity(finalCountry, citiesByCountry, new Set());
    if (!finalCity?.city && countriesEqual(finalCountry, startCountry)) {
      usedStartVoices.add(starter.user_id);
      continue;
    }

    usedStartVoices.add(starter.user_id);
    usedStartCountries.add(startCountry.toLowerCase());

    const route = buildRouteSteps(routeCountries, citiesByCountry, starter);
    if (finalCity?.city) {
      route[route.length - 1].requiredCity = finalCity.city;
      route[route.length - 1].latitude = finalCity.latitude;
      route[route.length - 1].longitude = finalCity.longitude;
    }

    chains.push({
      id: randomUUID(),
      eventId,
      dayKey: day,
      dailyChainNumber: slot + 1,
      createdAt: now.toISOString(),
      startsAt: now.toISOString(),
      expiresAt: new Date(nowMs + CHAIN_DURATION_MS).toISOString(),
      status: Status.IN_PROGRESS,
      starterAccepted: false,
      startingVoiceId: starter.user_id,
      startingVoiceNumber: Number(starter.voice_number),
      currentStep: 0,
      lastProgressAt: null,
      completedAt: null,
      totalDistanceKm: null,
      route,
    });
  }

  // Ensure numbers are #1 … #N in creation order (forced chain already #1).
  chains.forEach((chain, idx) => {
    chain.dailyChainNumber = idx + 1;
  });

  for (const chain of chains) {
    await writeJson(chainPath(eventId, day, chain.id), chain, { overwrite: false });
  }

  const manifest = {
    eventId,
    dayKey: day,
    engine: CHAIN_ENGINE,
    storageVersion: CHAIN_STORAGE_VERSION,
    generatedAt: now.toISOString(),
    maxAvailableCountries: maxAvailable,
    chainIds: chains.map((c) => c.id),
    limited: chains.length < DAILY_CHAIN_COUNT,
    reason: chains.length
      ? (chains.length < DAILY_CHAIN_COUNT ? 'partial_day' : null)
      : 'could_not_build_valid_routes',
  };

  try {
    await writeJson(manifestPath(eventId, day), manifest, { overwrite: true });
  } catch (err) {
    // Prefer regenerating on conflict rather than serving a stale day.
    const existing = await readManifest(eventId, day);
    if (existing?.engine === CHAIN_ENGINE && existing?.chainIds?.length) return existing;
    throw err;
  }

  return manifest;
}

function isValidTestDay(manifest, chains) {
  if (!manifest || !Array.isArray(manifest.chainIds)) return false;
  if (manifest.engine !== CHAIN_ENGINE) return false;
  if (chains.length < DAILY_CHAIN_COUNT) return false;
  if (!TEST_FORCE_STARTER.enabled) return true;
  const first = [...chains].sort((a, b) => (a.dailyChainNumber || 0) - (b.dailyChainNumber || 0))[0];
  if (!first) return false;
  const startCountry = first.route?.[0]?.country;
  const voice = Number(first.startingVoiceNumber);
  return voice === Number(TEST_FORCE_STARTER.voiceNumber)
    && countriesEqual(startCountry, TEST_FORCE_STARTER.startCountry);
}

async function ensureDailyChains(eventId = DEFAULT_EVENT_ID, now = new Date()) {
  assertBlobConfigured();
  const day = dayKeyUTC(now);
  const existing = await readManifest(eventId, day);
  if (existing?.chainIds?.length) {
    const chains = [];
    for (const id of existing.chainIds) {
      const chain = await readChain(eventId, day, id);
      if (chain) chains.push(chain);
    }
    if (isValidTestDay(existing, chains)) return existing;
    // Stale / incomplete day (e.g. only 3 chains, or #1 not Voice 5) — rebuild.
  }
  try {
    return await generateDailyChains(eventId, day, now);
  } catch (err) {
    const again = await readManifest(eventId, day);
    if (again?.engine === CHAIN_ENGINE && again?.chainIds?.length) return again;
    throw err;
  }
}

async function loadDayChains(eventId, day) {
  const manifest = await ensureDailyChains(eventId, new Date(`${day}T12:00:00.000Z`));
  const chains = [];
  for (const id of manifest.chainIds || []) {
    const chain = await readChain(eventId, day, id);
    if (chain) chains.push(chain);
  }
  chains.sort((a, b) => (a.dailyChainNumber || 0) - (b.dailyChainNumber || 0));
  return { manifest, chains };
}

async function resolveViewer(deviceId, eventId) {
  if (!deviceId) return null;
  const user = await findUserByDevice(deviceId);
  if (!user) return null;
  const pledge = await readPledge(eventId, user.id);
  if (!pledge) {
    return {
      userId: user.id,
      deviceId,
      createdAt: user.created_at || null,
      voiceNumber: null,
      city: null,
      country: null,
      pledged: false,
    };
  }
  return {
    userId: user.id,
    deviceId,
    createdAt: user.created_at || null,
    voiceNumber: Number(pledge.voice_number) || null,
    city: pledge.city || null,
    country: pledge.country || null,
    pledged: true,
  };
}

async function getTodayPayload(deviceId, eventId = DEFAULT_EVENT_ID) {
  const now = new Date();
  const day = dayKeyUTC(now);
  const nowMs = now.getTime();
  const viewer = await resolveViewer(deviceId, eventId);
  const { manifest, chains } = await loadDayChains(eventId, day);

  const publicChains = chains.map((c) => publicChain(c, nowMs, viewer));
  // Named chains (app-selected or user-connected) float to the top for this viewer.
  publicChains.sort((a, b) => {
    const an = a.viewer?.isNamed ? 1 : 0;
    const bn = b.viewer?.isNamed ? 1 : 0;
    if (bn !== an) return bn - an;
    return (a.dailyChainNumber || 0) - (b.dailyChainNumber || 0);
  });
  const overview = {
    chainsToday: publicChains.length,
    completed: publicChains.filter((c) => c.status === Status.COMPLETED).length,
    inProgress: publicChains.filter((c) => c.status === Status.IN_PROGRESS).length,
    stuck: publicChains.filter((c) => c.status === Status.STUCK).length,
  };

  const limited = !!manifest.limited || publicChains.length === 0;

  return {
    dayKey: day,
    serverNow: now.toISOString(),
    engine: CHAIN_ENGINE,
    storageVersion: CHAIN_STORAGE_VERSION,
    maxAvailableCountries: manifest.maxAvailableCountries ?? 0,
    limited,
    limitedReason: manifest.reason || null,
    overview,
    chains: publicChains,
    viewer,
  };
}

async function getCompletedPayload(deviceId, eventId = DEFAULT_EVENT_ID) {
  assertBlobConfigured();
  const now = new Date();
  const nowMs = now.getTime();
  const viewer = await resolveViewer(deviceId, eventId);
  const byId = new Map();

  const index = await readArchiveIndex(eventId);
  for (const id of index?.chainIds || []) {
    const chain = await readArchivedChain(eventId, id);
    if (chain) byId.set(chain.id, chain);
  }

  // Include / backfill any completed chains from today that aren't archived yet.
  try {
    const day = dayKeyUTC(now);
    const { chains: todayChains } = await loadDayChains(eventId, day);
    for (const chain of todayChains) {
      if (deriveStatus(chain, nowMs) !== Status.COMPLETED) continue;
      if (!byId.has(chain.id)) {
        await archiveCompletedChain(chain);
      }
      byId.set(chain.id, chain);
    }
  } catch {
    /* today load is best-effort for archive listing */
  }

  const chains = [...byId.values()]
    .map((c) => publicChain(c, nowMs, viewer))
    .sort((a, b) => {
      const tb = new Date(b.completedAt || 0).getTime();
      const ta = new Date(a.completedAt || 0).getTime();
      return tb - ta;
    });

  return {
    serverNow: now.toISOString(),
    engine: CHAIN_ENGINE,
    storageVersion: CHAIN_STORAGE_VERSION,
    chains,
    viewer,
  };
}

async function getChainPayload(chainId, deviceId, eventId = DEFAULT_EVENT_ID) {
  const now = new Date();
  const day = dayKeyUTC(now);
  const viewer = await resolveViewer(deviceId, eventId);
  let chain = await readChain(eventId, day, chainId);
  if (!chain) {
    const { chains } = await loadDayChains(eventId, day);
    chain = chains.find((c) => c.id === chainId) || null;
  }
  if (!chain) {
    chain = await readArchivedChain(eventId, chainId);
  }
  if (!chain) {
    const err = new Error('Chain not found');
    err.statusCode = 404;
    throw err;
  }
  return {
    serverNow: now.toISOString(),
    chain: publicChain(chain, now.getTime(), viewer),
    viewer,
  };
}

async function readAttempts(eventId, day, chainId, voiceNumber) {
  try {
    return await readBlobJson(attemptsPath(eventId, day, chainId, voiceNumber));
  } catch {
    return { incorrectStreak: 0, cooldownUntil: null, history: [] };
  }
}

async function writeAttempts(eventId, day, chainId, voiceNumber, data) {
  await writeJson(attemptsPath(eventId, day, chainId, voiceNumber), data, { overwrite: true });
}

function rejectionMessage() {
  return {
    ok: false,
    code: 'VOICE_NOT_FOUND',
    title: 'VOICE NOT FOUND',
    message: "That Voice doesn't match this destination.",
  };
}

async function acceptStart(deviceId, chainId, eventId = DEFAULT_EVENT_ID) {
  const now = new Date();
  const day = dayKeyUTC(now);
  const viewer = await resolveViewer(deviceId, eventId);
  if (!viewer?.pledged) {
    const err = new Error('You must be a pledged World Choir Voice');
    err.statusCode = 403;
    throw err;
  }
  const chain = await readChain(eventId, day, chainId);
  if (!chain) {
    const err = new Error('Chain not found');
    err.statusCode = 404;
    throw err;
  }
  if (chain.startingVoiceId !== viewer.userId) {
    const err = new Error('Not your chain to start');
    err.statusCode = 403;
    throw err;
  }
  if (deriveStatus(chain, now.getTime()) === Status.EXPIRED) {
    const err = new Error('This chain has expired');
    err.statusCode = 409;
    throw err;
  }
  chain.starterAccepted = true;
  chain.lastProgressAt = now.toISOString();
  chain.currentStep = 1;
  // First destination becomes active only after the starter accepts.
  const dest = chain.route[1];
  if (dest && dest.status !== 'connected') {
    dest.status = 'active';
    dest.assignedVoiceId = viewer.userId;
    dest.assignedVoiceNumber = viewer.voiceNumber;
    dest.activatedAt = now.toISOString();
  }
  await writeChain(eventId, day, chain);
  return { ok: true, chain: publicChain(chain, now.getTime(), viewer) };
}

async function connectVoice(deviceId, chainId, submittedVoiceNumber, eventId = DEFAULT_EVENT_ID) {
  const now = new Date();
  const nowMs = now.getTime();
  const day = dayKeyUTC(now);
  const viewer = await resolveViewer(deviceId, eventId);
  if (!viewer?.pledged) {
    const err = new Error('You must be a pledged World Choir Voice');
    err.statusCode = 403;
    throw err;
  }

  const chain = await readChain(eventId, day, chainId);
  if (!chain) {
    const err = new Error('Chain not found');
    err.statusCode = 404;
    throw err;
  }

  const liveStatus = deriveStatus(chain, nowMs);
  if (liveStatus === Status.COMPLETED) {
    const err = new Error('This chain is already complete');
    err.statusCode = 409;
    throw err;
  }
  if (liveStatus === Status.EXPIRED) {
    const err = new Error('This chain has expired');
    err.statusCode = 409;
    throw err;
  }

  if (!chain.starterAccepted) {
    const err = new Error('This chain has not been started yet');
    err.statusCode = 409;
    throw err;
  }

  const active = chain.route.find((s) => s.status === 'active');
  if (!active) {
    const err = new Error('No active destination on this chain');
    err.statusCode = 409;
    throw err;
  }

  if (active.assignedVoiceId !== viewer.userId) {
    const err = new Error('It is not your turn on this chain');
    err.statusCode = 403;
    throw err;
  }

  const attempts = await readAttempts(eventId, day, chainId, viewer.voiceNumber);
  if (attempts.cooldownUntil && new Date(attempts.cooldownUntil).getTime() > nowMs) {
    const waitMs = new Date(attempts.cooldownUntil).getTime() - nowMs;
    return {
      ...rejectionMessage(),
      cooldownMs: waitMs,
      cooldownLabel: formatDuration(waitMs),
      title: 'VOICE NOT FOUND',
      message: "That Voice doesn't match this destination.",
      retryLabel: `You can try again in: ${formatDuration(waitMs)}`,
    };
  }

  const voiceNum = Number(String(submittedVoiceNumber || '').replace(/[^\d]/g, ''));
  if (!Number.isFinite(voiceNum) || voiceNum <= 0) {
    return failAttempt(eventId, day, chainId, viewer, attempts, nowMs);
  }

  const [pledges, users] = await Promise.all([
    listPledges(eventId),
    listAllUsers().catch(() => []),
  ]);
  const usersById = buildUserMaps(users);
  const { byVoice } = buildPledgeIndexes(pledges, usersById, nowMs);
  const target = byVoice.get(voiceNum);

  // Privacy-preserving: all failure reasons collapse to the same message.
  let valid = true;
  if (!target) valid = false;
  else if (target.user_id === viewer.userId) valid = false;
  else if (!countriesEqual(target.country, active.country)) valid = false;
  else if (active.requiredCity && !citiesEqual(target.city, active.requiredCity)) valid = false;
  else {
    const targetUser = usersById.get(target.user_id);
    if (!isAccountEligible(targetUser, target, nowMs)) valid = false;
  }
  // Already used in this chain?
  if (valid && chain.route.some((s) => s.assignedVoiceId === target.user_id)) {
    valid = false;
  }

  if (!valid) {
    return failAttempt(eventId, day, chainId, viewer, attempts, nowMs);
  }

  // Success — advance chain.
  attempts.incorrectStreak = 0;
  attempts.cooldownUntil = null;
  attempts.history = [...(attempts.history || []), { at: now.toISOString(), ok: true }].slice(-20);
  await writeAttempts(eventId, day, chainId, viewer.voiceNumber, attempts);

  // Mark the starter (or previous selected) node as connected on first real link.
  chain.route.forEach((step) => {
    if (step.status === 'selected') {
      step.status = 'connected';
      step.connectedAt = step.connectedAt || now.toISOString();
    }
  });

  active.status = 'connected';
  active.connectedAt = now.toISOString();
  active.assignedVoiceId = target.user_id;
  active.assignedVoiceNumber = Number(target.voice_number);
  active.assignedCity = target.city || null;
  active.latitude = target.latitude ?? active.latitude;
  active.longitude = target.longitude ?? active.longitude;

  const nextIndex = active.position + 1;
  const next = chain.route[nextIndex];
  if (next) {
    next.status = 'active';
    next.assignedVoiceId = target.user_id; // next actor is the voice just connected
    next.assignedVoiceNumber = Number(target.voice_number);
    next.activatedAt = now.toISOString();
    chain.currentStep = nextIndex;
  } else {
    chain.status = Status.COMPLETED;
    chain.completedAt = now.toISOString();
    chain.currentStep = active.position;
    chain.totalDistanceKm = routeDistanceKm(chain.route);
  }

  chain.lastProgressAt = now.toISOString();
  chain.starterAccepted = true;
  await writeChain(eventId, day, chain);

  const completed = chain.status === Status.COMPLETED;
  if (completed) {
    await archiveCompletedChain(chain).catch((err) => {
      console.error('world-chain archive error:', err);
    });
  }
  return {
    ok: true,
    code: completed ? 'CHAIN_COMPLETE' : 'CONNECTION_MADE',
    title: completed ? 'CONNECTION COMPLETE' : 'CONNECTION MADE',
    chain: publicChain(chain, nowMs, viewer),
  };
}

async function failAttempt(eventId, day, chainId, viewer, attempts, nowMs) {
  const streak = (attempts.incorrectStreak || 0) + 1;
  const cooldownMs = COOLDOWNS_MS[Math.min(streak, COOLDOWNS_MS.length) - 1];
  const cooldownUntil = new Date(nowMs + cooldownMs).toISOString();
  const next = {
    incorrectStreak: streak,
    cooldownUntil,
    history: [...(attempts.history || []), { at: new Date(nowMs).toISOString(), ok: false }].slice(-20),
  };
  await writeAttempts(eventId, day, chainId, viewer.voiceNumber, next);
  return {
    ...rejectionMessage(),
    cooldownMs,
    cooldownLabel: formatDuration(cooldownMs),
    retryLabel: `You can try again in: ${formatDuration(cooldownMs)}`,
  };
}

module.exports = {
  Status,
  DEFAULT_EVENT_ID,
  DAILY_CHAIN_COUNT,
  ACCOUNT_AGE_MS,
  STUCK_AFTER_MS,
  CHAIN_ENGINE,
  CHAIN_STORAGE_VERSION,
  dayKeyUTC,
  ensureDailyChains,
  getTodayPayload,
  getCompletedPayload,
  getChainPayload,
  acceptStart,
  connectVoice,
  publicChain,
  deriveStatus,
};
