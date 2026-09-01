/**
 * Promise Memory — searchable index shards (server-side pagination/search at scale).
 * Original promises remain at wc-data/promises/{userId}/{eventId}.json
 */
const { randomUUID } = require('crypto');
const {
  readBlobJson,
  writeJson,
  listBlobs,
  listAllPromises,
} = require('./store');

const ROOT = 'wc-data/promise-memory';
const INDEX_ROOT = `${ROOT}/index`;
const STATS_PATH = `${ROOT}/stats.json`;
const DAILY_ROOT = `${ROOT}/rollup/daily`;

const KNOWN_EVENTS = [
  { id: 'world-choir-2027', title: 'World Choir 2027' },
];

function resolveCountryCode(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const key = raw.toLowerCase();
  const map = {
    portugal: 'PT', 'united kingdom': 'GB', uk: 'GB', japan: 'JP', argentina: 'AR',
    'united states': 'US', usa: 'US', brazil: 'BR', kenya: 'KE', spain: 'ES',
    france: 'FR', germany: 'DE', italy: 'IT', canada: 'CA', australia: 'AU',
    india: 'IN', mexico: 'MX', china: 'CN', 'south korea': 'KR', netherlands: 'NL',
    belgium: 'BE', switzerland: 'CH', sweden: 'SE', norway: 'NO', denmark: 'DK',
    ireland: 'IE', 'new zealand': 'NZ', 'south africa': 'ZA', nigeria: 'NG', ghana: 'GH',
    colombia: 'CO', chile: 'CL', peru: 'PE', poland: 'PL', austria: 'AT', greece: 'GR',
    turkey: 'TR', israel: 'IL', 'saudi arabia': 'SA', uae: 'AE', singapore: 'SG',
    indonesia: 'ID', philippines: 'PH', thailand: 'TH', vietnam: 'VN', egypt: 'EG',
    morocco: 'MA', tunisia: 'TN', finland: 'FI', czechia: 'CZ', 'czech republic': 'CZ',
    hungary: 'HU', romania: 'RO', ukraine: 'UA', russia: 'RU', pakistan: 'PK',
    bangladesh: 'BD', 'sri lanka': 'LK', taiwan: 'TW', 'hong kong': 'HK',
  };
  return map[key] || null;
}

function normalizeCountryKey(country) {
  return String(country || '').trim().toLowerCase();
}

function normalizeCityKey(city, country) {
  return `${String(city || '').trim().toLowerCase()}|${normalizeCountryKey(country)}`;
}

function monthKey(iso) {
  if (!iso) return 'unknown';
  try { return new Date(iso).toISOString().slice(0, 7); } catch { return 'unknown'; }
}

function utcDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return null; }
}

function eventTitle(eventId) {
  return KNOWN_EVENTS.find((e) => e.id === eventId)?.title || eventId;
}

function normalizeIndexEntry(promise) {
  const text = String(promise.promise_text || '').trim();
  const city = promise.city || null;
  const country = promise.country || null;
  const countryCode = promise.country_code || resolveCountryCode(country);
  const voiceNumber = promise.voice_number ?? null;
  return {
    id: promise.id,
    event_id: promise.event_id,
    event_title: eventTitle(promise.event_id),
    user_id: promise.user_id,
    voice_number: voiceNumber,
    city,
    country,
    country_code: countryCode,
    promise_text: text,
    text_length: text.length,
    submitted_at: promise.submitted_at,
    city_key: normalizeCityKey(city, country),
    country_key: normalizeCountryKey(country),
    search_text: [
      text,
      city,
      country,
      voiceNumber != null ? String(voiceNumber) : '',
      countryCode || '',
    ].filter(Boolean).join(' ').toLowerCase(),
  };
}

function shardPath(eventId, month) {
  return `${INDEX_ROOT}/${eventId}/${month}.json`;
}

async function readShard(path) {
  try {
    const data = await readBlobJson(path);
    return Array.isArray(data?.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function writeShard(path, entries) {
  await writeJson(path, {
    updatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  });
}

async function readStats() {
  try {
    return await readBlobJson(STATS_PATH);
  } catch {
    return {
      totalPromises: 0,
      uniqueCountries: 0,
      uniqueCities: 0,
      uniqueVoices: 0,
      events: {},
      countries: {},
      cities: {},
      voices: {},
      updatedAt: null,
    };
  }
}

async function writeStats(stats) {
  stats.updatedAt = new Date().toISOString();
  await writeJson(STATS_PATH, stats, { overwrite: true });
}

async function incrementDailyRollup(eventId, date) {
  if (!eventId || !date) return;
  const path = `${DAILY_ROOT}/${eventId}.json`;
  let rollup = {};
  try { rollup = await readBlobJson(path); } catch { /* new */ }
  rollup[date] = (rollup[date] || 0) + 1;
  rollup.updatedAt = new Date().toISOString();
  await writeJson(path, rollup, { overwrite: true });
}

async function updateStatsForEntry(entry, { decrement = false } = {}) {
  const stats = await readStats();
  const delta = decrement ? -1 : 1;
  stats.totalPromises = Math.max(0, (stats.totalPromises || 0) + delta);

  if (!stats.events) stats.events = {};
  if (!stats.events[entry.event_id]) {
    stats.events[entry.event_id] = {
      id: entry.event_id,
      title: entry.event_title,
      totalPromises: 0,
      countries: {},
      cities: {},
      voices: {},
    };
  }
  const ev = stats.events[entry.event_id];
  ev.totalPromises = Math.max(0, (ev.totalPromises || 0) + delta);

  if (entry.country_key) {
    if (!stats.countries) stats.countries = {};
    if (!stats.countries[entry.country_key]) {
      stats.countries[entry.country_key] = {
        country: entry.country,
        country_code: entry.country_code,
        count: 0,
        cities: {},
      };
    }
    const co = stats.countries[entry.country_key];
    co.count = Math.max(0, (co.count || 0) + delta);
    if (entry.city_key) {
      if (!co.cities[entry.city_key]) {
        co.cities[entry.city_key] = { city: entry.city, count: 0 };
      }
      co.cities[entry.city_key].count = Math.max(0, (co.cities[entry.city_key].count || 0) + delta);
    }
    if (!ev.countries[entry.country_key]) {
      ev.countries[entry.country_key] = {
        country: entry.country,
        country_code: entry.country_code,
        count: 0,
        cities: {},
      };
    }
    const evCo = ev.countries[entry.country_key];
    evCo.count = Math.max(0, (evCo.count || 0) + delta);
    if (entry.city_key) {
      if (!evCo.cities[entry.city_key]) {
        evCo.cities[entry.city_key] = { city: entry.city, count: 0 };
      }
      evCo.cities[entry.city_key].count = Math.max(0, (evCo.cities[entry.city_key].count || 0) + delta);
    }
  }

  if (entry.city_key) {
    if (!stats.cities) stats.cities = {};
    if (!stats.cities[entry.city_key]) {
      stats.cities[entry.city_key] = {
        city: entry.city,
        country: entry.country,
        country_code: entry.country_code,
        count: 0,
      };
    }
    stats.cities[entry.city_key].count = Math.max(0, (stats.cities[entry.city_key].count || 0) + delta);
  }

  const voiceKey = entry.voice_number != null ? String(entry.voice_number) : entry.user_id;
  if (voiceKey) {
    if (!stats.voices) stats.voices = {};
    if (!stats.voices[voiceKey]) stats.voices[voiceKey] = 0;
    stats.voices[voiceKey] = Math.max(0, (stats.voices[voiceKey] || 0) + delta);
    if (!ev.voices) ev.voices = {};
    if (!ev.voices[voiceKey]) ev.voices[voiceKey] = 0;
    ev.voices[voiceKey] = Math.max(0, (ev.voices[voiceKey] || 0) + delta);
  }

  stats.uniqueCountries = Object.values(stats.countries || {}).filter((c) => c.count > 0).length;
  stats.uniqueCities = Object.values(stats.cities || {}).filter((c) => c.count > 0).length;
  stats.uniqueVoices = Object.values(stats.voices || {}).filter((v) => v > 0).length;

  await writeStats(stats);
}

async function appendPromiseToIndex(promise) {
  const entry = normalizeIndexEntry(promise);
  const path = shardPath(entry.event_id, monthKey(entry.submitted_at));
  const entries = await readShard(path);
  if (entries.some((e) => e.id === entry.id)) return entry;
  entries.push(entry);
  entries.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  await writeShard(path, entries);
  await updateStatsForEntry(entry);
  await incrementDailyRollup(entry.event_id, utcDate(entry.submitted_at));
  return entry;
}

async function indexExists() {
  const blobs = await listBlobs(`${INDEX_ROOT}/`);
  return blobs.some((b) => b.pathname.endsWith('.json'));
}

async function rebuildPromiseIndex() {
  const promises = await listAllPromises();
  const byShard = new Map();
  for (const promise of promises) {
    const entry = normalizeIndexEntry(promise);
    const path = shardPath(entry.event_id, monthKey(entry.submitted_at));
    if (!byShard.has(path)) byShard.set(path, []);
    byShard.get(path).push(entry);
  }

  await writeStats({
    totalPromises: 0,
    uniqueCountries: 0,
    uniqueCities: 0,
    uniqueVoices: 0,
    events: {},
    countries: {},
    cities: {},
    voices: {},
    updatedAt: null,
  });

  const dailyRollups = new Map();
  for (const [path, entries] of byShard.entries()) {
    entries.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    await writeShard(path, entries);
    for (const entry of entries) {
      await updateStatsForEntry(entry);
      const date = utcDate(entry.submitted_at);
      if (date) {
        const key = entry.event_id;
        if (!dailyRollups.has(key)) dailyRollups.set(key, {});
        const rollup = dailyRollups.get(key);
        rollup[date] = (rollup[date] || 0) + 1;
      }
    }
  }

  for (const [eventId, rollup] of dailyRollups.entries()) {
    rollup.updatedAt = new Date().toISOString();
    await writeJson(`${DAILY_ROOT}/${eventId}.json`, rollup, { overwrite: true });
  }

  return { indexed: promises.length, shards: byShard.size };
}

async function ensureIndexReady() {
  if (!(await indexExists())) {
    await rebuildPromiseIndex();
  }
}

async function listShardPaths({ eventId = null, dateFrom = null, dateTo = null } = {}) {
  const blobs = await listBlobs(`${INDEX_ROOT}/`);
  let paths = blobs.filter((b) => b.pathname.endsWith('.json')).map((b) => b.pathname);

  if (eventId && eventId !== 'all') {
    paths = paths.filter((p) => p.includes(`/${eventId}/`));
  }

  if (dateFrom || dateTo) {
    paths = paths.filter((p) => {
      const m = p.match(/\/(\d{4}-\d{2})\.json$/);
      if (!m) return true;
      const month = m[1];
      const monthStart = `${month}-01`;
      const monthEnd = `${month}-31`;
      if (dateFrom && monthEnd < dateFrom.slice(0, 10)) return false;
      if (dateTo && monthStart > dateTo.slice(0, 10)) return false;
      return true;
    });
  }

  return paths.sort();
}

function matchesFilters(entry, filters) {
  if (filters.eventId && filters.eventId !== 'all' && entry.event_id !== filters.eventId) return false;
  if (filters.country && normalizeCountryKey(entry.country) !== normalizeCountryKey(filters.country)) return false;
  if (filters.city && normalizeCityKey(entry.city, entry.country) !== normalizeCityKey(filters.city, filters.country || entry.country)) return false;
  if (filters.dateFrom && entry.submitted_at && entry.submitted_at.slice(0, 10) < filters.dateFrom.slice(0, 10)) return false;
  if (filters.dateTo && entry.submitted_at && entry.submitted_at.slice(0, 10) > filters.dateTo.slice(0, 10)) return false;
  if (filters.folderPromiseIds && !filters.folderPromiseIds.has(entry.id)) return false;
  if (filters.ids && filters.ids.length && !filters.ids.includes(entry.id)) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase().trim();
    if (!q) return true;
    if (!entry.search_text.includes(q)) {
      const voiceQ = q.replace(/^voice\s*#?\s*/i, '').trim();
      if (voiceQ && entry.voice_number != null && String(entry.voice_number).includes(voiceQ)) {
        return true;
      }
      return false;
    }
  }
  return true;
}

function sortEntries(entries, sort) {
  const list = [...entries];
  switch (sort) {
    case 'oldest':
      list.sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
      break;
    case 'longest':
      list.sort((a, b) => (b.text_length || 0) - (a.text_length || 0));
      break;
    case 'shortest':
      list.sort((a, b) => (a.text_length || 0) - (b.text_length || 0));
      break;
    case 'newest':
    default:
      list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
      break;
  }
  return list;
}

async function queryPromiseIndex({
  eventId = 'all',
  country = '',
  city = '',
  dateFrom = '',
  dateTo = '',
  q = '',
  sort = 'newest',
  page = 1,
  pageSize = 50,
  folderPromiseIds = null,
  ids = null,
} = {}) {
  await ensureIndexReady();

  const filters = {
    eventId,
    country,
    city,
    dateFrom,
    dateTo,
    q,
    folderPromiseIds,
    ids,
  };

  const shardPaths = await listShardPaths({ eventId, dateFrom, dateTo });
  const matched = [];

  for (const path of shardPaths) {
    const entries = await readShard(path);
    for (const entry of entries) {
      if (matchesFilters(entry, filters)) matched.push(entry);
    }
  }

  const sorted = sortEntries(matched, sort);
  const total = sorted.length;
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const start = (safePage - 1) * safeSize;
  const items = sorted.slice(start, start + safeSize).map((e) => ({
    id: e.id,
    eventId: e.event_id,
    eventTitle: e.event_title,
    voiceNumber: e.voice_number,
    city: e.city,
    country: e.country,
    countryCode: e.country_code,
    promiseText: e.promise_text,
    textLength: e.text_length,
    submittedAt: e.submitted_at,
  }));

  return {
    items,
    total,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}

async function readDailyRollup(eventId) {
  try {
    const data = await readBlobJson(`${DAILY_ROOT}/${eventId}.json`);
    return Object.entries(data)
      .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

async function buildOverviewFromStats({ eventId = 'all' } = {}) {
  const stats = await readStats();
  const events = KNOWN_EVENTS.map((ev) => {
    const data = stats.events?.[ev.id] || {};
    const countries = Object.values(data.countries || {}).filter((c) => c.count > 0);
    const cities = Object.values(data.countries || {}).flatMap((c) => Object.values(c.cities || {})).filter((c) => c.count > 0);
    const voices = Object.values(data.voices || {}).filter((v) => v > 0);
    return {
      id: ev.id,
      title: ev.title,
      totalPromises: data.totalPromises || 0,
      countries: countries.length,
      cities: cities.length,
      voices: voices.length,
    };
  });

  if (eventId && eventId !== 'all') {
    const ev = events.find((e) => e.id === eventId) || {
      id: eventId,
      title: eventTitle(eventId),
      totalPromises: 0,
      countries: 0,
      cities: 0,
      voices: 0,
    };
    return {
      totalPromises: ev.totalPromises,
      countries: ev.countries,
      cities: ev.cities,
      voices: ev.voices,
      events,
      viewingEvent: ev,
    };
  }

  return {
    totalPromises: stats.totalPromises || 0,
    countries: stats.uniqueCountries || 0,
    cities: stats.uniqueCities || 0,
    voices: stats.uniqueVoices || 0,
    events,
    viewingEvent: null,
  };
}

function buildCountryOverview(stats, { eventId = 'all', limit = 50 } = {}) {
  const source = eventId && eventId !== 'all'
    ? stats.events?.[eventId]?.countries || {}
    : stats.countries || {};
  const total = eventId && eventId !== 'all'
    ? (stats.events?.[eventId]?.totalPromises || 0)
    : (stats.totalPromises || 0);
  return Object.entries(source)
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({
      country: v.country,
      countryCode: v.country_code,
      countryKey: key,
      count: v.count,
      pctOfTotal: total ? (v.count / total) * 100 : 0,
      uniqueCities: Object.values(v.cities || {}).filter((c) => c.count > 0).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildCityOverview(stats, { eventId = 'all', country = '', query = '', page = 1, pageSize = 30 } = {}) {
  let rows = [];
  if (eventId && eventId !== 'all') {
    const evCountries = stats.events?.[eventId]?.countries || {};
    if (country) {
      const key = normalizeCountryKey(country);
      const co = evCountries[key];
      if (co) {
        rows = Object.entries(co.cities || {}).map(([cityKey, v]) => ({
          cityKey,
          city: v.city,
          country: co.country,
          countryCode: co.country_code,
          count: v.count,
        }));
      }
    } else {
      rows = Object.entries(evCountries).flatMap(([, co]) =>
        Object.entries(co.cities || {}).map(([cityKey, v]) => ({
          cityKey,
          city: v.city,
          country: co.country,
          countryCode: co.country_code,
          count: v.count,
        }))
      );
    }
  } else if (country) {
    const key = normalizeCountryKey(country);
    const co = stats.countries?.[key];
    if (co) {
      rows = Object.entries(co.cities || {}).map(([cityKey, v]) => ({
        cityKey,
        city: v.city,
        country: co.country,
        countryCode: co.country_code,
        count: v.count,
      }));
    }
  } else {
    rows = Object.entries(stats.cities || {}).map(([cityKey, v]) => ({
      cityKey,
      city: v.city,
      country: v.country,
      countryCode: v.country_code,
      count: v.count,
    }));
  }

  const q = String(query || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      `${r.city} ${r.country}`.toLowerCase().includes(q)
    );
  }
  rows = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const total = rows.length;
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Number(pageSize) || 30);
  const start = (safePage - 1) * safeSize;
  return {
    items: rows.slice(start, start + safeSize),
    total,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}

async function listCountriesForFilter({ eventId = 'all' } = {}) {
  const stats = await readStats();
  const source = eventId && eventId !== 'all'
    ? stats.events?.[eventId]?.countries || {}
    : stats.countries || {};
  return Object.entries(source)
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({
      key,
      country: v.country,
      countryCode: v.country_code,
      count: v.count,
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

async function listCitiesForFilter({ eventId = 'all', country = '' } = {}) {
  if (!country) return [];
  const stats = await readStats();
  const countryKey = normalizeCountryKey(country);
  const source = eventId && eventId !== 'all'
    ? stats.events?.[eventId]?.countries?.[countryKey]?.cities || {}
    : stats.countries?.[countryKey]?.cities || {};
  return Object.entries(source)
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({ key, city: v.city, count: v.count }))
    .sort((a, b) => a.city.localeCompare(b.city));
}

module.exports = {
  ROOT,
  KNOWN_EVENTS,
  resolveCountryCode,
  normalizeIndexEntry,
  appendPromiseToIndex,
  rebuildPromiseIndex,
  ensureIndexReady,
  queryPromiseIndex,
  readStats,
  readDailyRollup,
  buildOverviewFromStats,
  buildCountryOverview,
  buildCityOverview,
  listCountriesForFilter,
  listCitiesForFilter,
  eventTitle,
  normalizeCountryKey,
  normalizeCityKey,
};
