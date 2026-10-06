#!/usr/bin/env node
/**
 * One-shot: rewrite today's longest World Chain to start with Voice #1,
 * with a long multi-country route and fresh eligibleVoices allowlists.
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const root = path.resolve(__dirname, '..');
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const { listPledges, listAllUsers, writeJson, readBlobJson } = require('../api/_lib/store');
const {
  DEFAULT_EVENT_ID,
  dayKeyUTC,
  cycleBoundsUTC,
  buildEligibleVoicesForDestination,
  CHAIN_STORAGE_VERSION,
} = require('../api/_lib/world-chain');

function normalizeCountry(value) {
  return String(value || '').trim();
}

function normalizeCity(value) {
  return String(value || '').trim().toLowerCase();
}

/** Minimal city index matching world-chain pickFinalCity shape. */
function buildCitiesByCountry(pledges) {
  const citiesByCountry = new Map();
  for (const pledge of pledges || []) {
    const country = normalizeCountry(pledge.country);
    const city = String(pledge.city || '').trim();
    if (!country || !city) continue;
    if (!citiesByCountry.has(country)) citiesByCountry.set(country, new Map());
    const cityMap = citiesByCountry.get(country);
    const key = `${country.toLowerCase()}|${normalizeCity(city)}`;
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city,
        country,
        voices: [],
        eligibleVoices: [],
        latitude: pledge.latitude ?? null,
        longitude: pledge.longitude ?? null,
      });
    }
    const entry = cityMap.get(key);
    entry.voices.push(pledge);
    entry.eligibleVoices.push(pledge);
    if (entry.latitude == null && pledge.latitude != null) {
      entry.latitude = pledge.latitude;
      entry.longitude = pledge.longitude;
    }
  }
  return citiesByCountry;
}

function pickFinalCity(country, citiesByCountry) {
  const cityMap = citiesByCountry.get(country);
  if (!cityMap) return null;
  const all = [...cityMap.values()];
  const withVoices = all
    .filter((e) => (e.eligibleVoices || e.voices || []).length > 0)
    .sort((a, b) => (b.eligibleVoices?.length || 0) - (a.eligibleVoices?.length || 0));
  return withVoices[0] || all[0] || null;
}

function buildBigRoute(countries, citiesByCountry, starter, pledges) {
  const exclude = new Set(starter?.user_id ? [starter.user_id] : []);
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
    } else if (index === 0 && starter) {
      latitude = starter.latitude ?? null;
      longitude = starter.longitude ?? null;
    } else {
      const cityMap = citiesByCountry.get(country);
      const first = cityMap ? [...cityMap.values()][0] : null;
      latitude = first?.latitude ?? null;
      longitude = first?.longitude ?? null;
    }
    const eligibleVoices = index === 0
      ? {}
      : buildEligibleVoicesForDestination(country, requiredCity, pledges, exclude);
    return {
      position: index,
      country,
      requiredCity,
      assignedVoiceId: index === 0 ? starter?.user_id || null : null,
      assignedVoiceNumber: index === 0 ? Number(starter?.voice_number) || null : null,
      assignedCity: index === 0 ? (starter?.city || null) : null,
      latitude,
      longitude,
      connectedAt: null,
      activatedAt: null,
      status: index === 0 ? 'selected' : 'future',
      eligibleVoices,
      eligibleVoiceCount: Object.keys(eligibleVoices).length,
    };
  });
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN missing');
  }

  const eventId = DEFAULT_EVENT_ID;
  const now = new Date();
  const day = dayKeyUTC(now);
  const bounds = cycleBoundsUTC(now);
  const pledges = await listPledges(eventId);
  const voice1 = pledges.find((p) => Number(p.voice_number ?? p.voiceNumber) === 1);
  if (!voice1?.user_id) {
    throw new Error('Voice #1 pledge not found');
  }

  const manifestPath = `wc-data/world-chain/${CHAIN_STORAGE_VERSION}/${encodeURIComponent(eventId)}/${day}/manifest.json`;
  const manifest = await readBlobJson(manifestPath);
  if (!manifest?.chainIds?.length) {
    throw new Error(`No chains for day ${day}`);
  }

  const chains = [];
  for (const id of manifest.chainIds) {
    const chainPath = `wc-data/world-chain/${CHAIN_STORAGE_VERSION}/${encodeURIComponent(eventId)}/${day}/chains/${id}.json`;
    const chain = await readBlobJson(chainPath);
    if (chain) chains.push(chain);
  }
  if (!chains.length) throw new Error('Could not load today chains');

  // Prefer the currently longest chain; rebuild it bigger around Voice #1.
  chains.sort((a, b) => (b.route?.length || 0) - (a.route?.length || 0));
  const target = chains[0];

  const startCountry = normalizeCountry(voice1.country) || 'Portugal';
  const countrySet = new Set();
  for (const p of pledges) {
    const c = normalizeCountry(p.country);
    if (c) countrySet.add(c);
  }
  // Keep Spain early (matches recent test UX) then fill a long world route.
  const preferredOrder = [
    startCountry,
    'Spain',
    'France',
    'Italy',
    'Germany',
    'United Kingdom',
    'Ireland',
    'Netherlands',
    'Belgium',
    'Switzerland',
    'Austria',
    'Portugal',
    'Poland',
    'Czech Republic',
    'Sweden',
    'Norway',
    'Denmark',
    'Finland',
    'Greece',
    'Croatia',
    'Brazil',
    'Argentina',
    'Chile',
    'Mexico',
    'United States',
    'Canada',
    'Japan',
    'South Korea',
    'Australia',
    'New Zealand',
    'South Africa',
    'India',
    'Singapore',
  ];

  const routeCountries = [];
  const used = new Set();
  for (const c of preferredOrder) {
    const key = c.toLowerCase();
    if (!countrySet.has(c) && ![...countrySet].some((x) => x.toLowerCase() === key)) continue;
    const real = [...countrySet].find((x) => x.toLowerCase() === key) || c;
    if (used.has(real.toLowerCase())) continue;
    // First hop must be starter country.
    if (routeCountries.length === 0 && real.toLowerCase() !== startCountry.toLowerCase()) continue;
    routeCountries.push(real);
    used.add(real.toLowerCase());
    if (routeCountries.length >= 28) break;
  }
  // Fill from remaining pledged countries if still short.
  for (const c of [...countrySet].sort()) {
    if (routeCountries.length >= 28) break;
    if (used.has(c.toLowerCase())) continue;
    routeCountries.push(c);
    used.add(c.toLowerCase());
  }
  if (routeCountries.length < 8) {
    throw new Error(`Not enough pledged countries for a big chain (${routeCountries.length})`);
  }
  // Ensure start country is index 0.
  if (routeCountries[0].toLowerCase() !== startCountry.toLowerCase()) {
    routeCountries.unshift(startCountry);
  }

  const citiesByCountry = buildCitiesByCountry(pledges);
  // listAllUsers kept available for future eligibility tightening
  await listAllUsers().catch(() => []);

  const starter = {
    user_id: voice1.user_id,
    voice_number: 1,
    city: voice1.city || null,
    country: startCountry,
    latitude: voice1.latitude ?? null,
    longitude: voice1.longitude ?? null,
  };

  const route = buildBigRoute(routeCountries, citiesByCountry, starter, pledges);
  const last = route[route.length - 1];
  if (last) {
    last.eligibleVoices = buildEligibleVoicesForDestination(
      last.country,
      last.requiredCity,
      pledges,
      new Set([starter.user_id])
    );
    last.eligibleVoiceCount = Object.keys(last.eligibleVoices).length;
  }

  const rewritten = {
    ...target,
    starterAccepted: false,
    startingVoiceId: starter.user_id,
    startingVoiceNumber: 1,
    currentStep: 0,
    lastProgressAt: null,
    completedAt: null,
    status: 'IN_PROGRESS',
    startsAt: bounds.startsAt,
    expiresAt: bounds.expiresAt,
    totalDistanceKm: null,
    route,
    forcedVoice1Big: true,
    rewrittenAt: now.toISOString(),
  };

  const outPath = `wc-data/world-chain/${CHAIN_STORAGE_VERSION}/${encodeURIComponent(eventId)}/${day}/chains/${target.id}.json`;
  await writeJson(outPath, rewritten, { overwrite: true });

  // Clear connect attempt locks for this chain (best-effort).
  try {
    const { list } = require('@vercel/blob');
    const prefix = `wc-data/world-chain/${CHAIN_STORAGE_VERSION}/${encodeURIComponent(eventId)}/${day}/attempts/${target.id}/`;
    const listed = await list({ prefix, limit: 200 });
    const { del } = require('@vercel/blob');
    for (const blob of listed.blobs || []) {
      await del(blob.url).catch(() => {});
    }
  } catch {
    /* optional */
  }

  console.log(JSON.stringify({
    ok: true,
    day,
    chainId: target.id,
    dailyChainNumber: rewritten.dailyChainNumber,
    startingVoiceNumber: 1,
    startingCountry: startCountry,
    countries: route.length,
    firstDestination: route[1]?.country || null,
    eligibleOnFirstDest: route[1]?.eligibleVoiceCount || 0,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
