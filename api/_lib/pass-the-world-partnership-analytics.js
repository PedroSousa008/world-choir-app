/**
 * Pass the World — Partnership daily analytics (real events only).
 * Blob: wc-data/pass-the-world/partnership/analytics/{configurationId}/{YYYY-MM-DD}.json
 *
 * Tracking epoch starts on the UTC day this feature shipped (not on the first
 * visitor event). Dates before that are "unavailable". Dates on/after that with
 * no traffic show real zeros — never "not collected" for the live ship day.
 */
const {
  readBlobJson,
  writeJson,
  assertBlobConfigured,
} = require('./store');

const ROOT = 'wc-data/pass-the-world/partnership/analytics';
const META_PATH = `${ROOT}/meta.json`;
/** UTC calendar day when daily partnership analytics first shipped. */
const TRACKING_EPOCH_DATE = '2026-09-16';

const EVENT_TYPES = new Set(['impression', 'click', 'engage']);
/** Client may send at most one impression per visitor/config within this window. */
const IMPRESSION_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_ENGAGE_CHUNK_MS = 60 * 1000;
const MAX_UNIQUE_IDS = 5000;

function utcDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dailyPath(configurationId, date) {
  return `${ROOT}/${configurationId}/${date}.json`;
}

function emptyRow(configurationId, date) {
  return {
    version: 1,
    configurationId,
    date,
    impressions: 0,
    uniqueViewers: [],
    uniqueReach: 0,
    countries: {},
    cities: {},
    linkClicks: 0,
    uniqueClickers: [],
    uniqueClickerCount: 0,
    engagedMsByVisitor: {},
    totalEngagedMs: 0,
    lastImpressionAtByVisitor: {},
    updatedAt: null,
  };
}

function clampVisitorList(list) {
  const arr = Array.isArray(list) ? list.map((v) => String(v || '').trim()).filter(Boolean) : [];
  if (arr.length <= MAX_UNIQUE_IDS) return arr;
  return arr.slice(-MAX_UNIQUE_IDS);
}

function normalizeRow(raw, configurationId, date) {
  const base = emptyRow(configurationId, date);
  if (!raw || typeof raw !== 'object') return base;
  const uniqueViewers = clampVisitorList(raw.uniqueViewers);
  const uniqueClickers = clampVisitorList(raw.uniqueClickers);
  const engagedMsByVisitor = raw.engagedMsByVisitor && typeof raw.engagedMsByVisitor === 'object'
    ? raw.engagedMsByVisitor
    : {};
  let totalEngagedMs = 0;
  Object.values(engagedMsByVisitor).forEach((ms) => {
    totalEngagedMs += Math.max(0, Number(ms) || 0);
  });
  return {
    ...base,
    ...raw,
    configurationId,
    date,
    impressions: Number(raw.impressions) || 0,
    uniqueViewers,
    uniqueReach: Number(raw.uniqueReach) || uniqueViewers.length,
    countries: raw.countries && typeof raw.countries === 'object' ? raw.countries : {},
    cities: raw.cities && typeof raw.cities === 'object' ? raw.cities : {},
    linkClicks: Number(raw.linkClicks) || 0,
    uniqueClickers,
    uniqueClickerCount: Number(raw.uniqueClickerCount) || uniqueClickers.length,
    engagedMsByVisitor,
    totalEngagedMs: Number(raw.totalEngagedMs) || totalEngagedMs,
    lastImpressionAtByVisitor: raw.lastImpressionAtByVisitor && typeof raw.lastImpressionAtByVisitor === 'object'
      ? raw.lastImpressionAtByVisitor
      : {},
    updatedAt: raw.updatedAt || null,
  };
}

async function readMeta() {
  try {
    const data = await readBlobJson(META_PATH);
    return {
      trackingSince: data?.trackingSince || null,
      updatedAt: data?.updatedAt || null,
    };
  } catch {
    return { trackingSince: null, updatedAt: null };
  }
}

async function ensureTrackingSince(nowIso) {
  const meta = await readMeta();
  if (meta.trackingSince) return meta;
  // Prefer the feature ship date so Owner sees real zeros on launch day
  // even before the first public event arrives.
  const shipIso = `${TRACKING_EPOCH_DATE}T00:00:00.000Z`;
  const nowMs = new Date(nowIso).getTime();
  const shipMs = new Date(shipIso).getTime();
  const since = Number.isFinite(nowMs) && nowMs < shipMs ? nowIso : shipIso;
  const next = {
    trackingSince: since,
    updatedAt: nowIso || new Date().toISOString(),
  };
  await writeJson(META_PATH, next, { overwrite: true });
  return next;
}

async function readDailyRow(configurationId, date) {
  try {
    return normalizeRow(await readBlobJson(dailyPath(configurationId, date)), configurationId, date);
  } catch {
    return emptyRow(configurationId, date);
  }
}

function placeKey(city, country) {
  const c = String(city || '').trim();
  const co = String(country || '').trim();
  if (!c && !co) return null;
  return `${c.toLowerCase()}|${co.toLowerCase()}`;
}

function addPlaceVisitor(bucket, key, label, visitorId) {
  if (!key || !visitorId) return;
  if (!bucket[key]) {
    bucket[key] = { label, visitors: [] };
  }
  const set = new Set(bucket[key].visitors || []);
  set.add(visitorId);
  bucket[key].visitors = [...set].slice(-MAX_UNIQUE_IDS);
  bucket[key].count = set.size;
  if (label) bucket[key].label = label;
}

/**
 * Record a public analytics event. Silent no-ops for bad input are avoided —
 * callers get structured errors for invalid types.
 */
async function recordPartnershipAnalyticsEvent({
  eventType,
  configurationId,
  visitorId,
  country = null,
  city = null,
  engagedMs = 0,
  clientNow = null,
} = {}) {
  assertBlobConfigured();

  const type = String(eventType || '').trim();
  if (!EVENT_TYPES.has(type)) {
    throw Object.assign(new Error('Invalid event type'), { statusCode: 400 });
  }

  const configId = String(configurationId || '').trim();
  if (!configId) {
    throw Object.assign(new Error('configurationId required'), { statusCode: 400 });
  }

  const visitor = String(visitorId || '').trim();
  if (!visitor) {
    throw Object.assign(new Error('visitorId required'), { statusCode: 400 });
  }

  const now = clientNow ? new Date(clientNow) : new Date();
  const nowIso = (Number.isNaN(now.getTime()) ? new Date() : now).toISOString();
  const date = utcDateKey(nowIso);
  if (!date) {
    throw Object.assign(new Error('Invalid timestamp'), { statusCode: 400 });
  }

  await ensureTrackingSince(nowIso);

  const row = await readDailyRow(configId, date);
  const countryLabel = String(country || '').trim() || null;
  const cityLabel = String(city || '').trim() || null;

  if (type === 'impression') {
    const lastAt = row.lastImpressionAtByVisitor[visitor];
    if (lastAt) {
      const elapsed = new Date(nowIso).getTime() - new Date(lastAt).getTime();
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < IMPRESSION_COOLDOWN_MS) {
        return { ok: true, deduped: true, date, configurationId: configId };
      }
    }
    row.impressions = Number(row.impressions || 0) + 1;
    row.lastImpressionAtByVisitor[visitor] = nowIso;
    const viewers = new Set(row.uniqueViewers || []);
    viewers.add(visitor);
    row.uniqueViewers = [...viewers].slice(-MAX_UNIQUE_IDS);
    row.uniqueReach = row.uniqueViewers.length;
    if (countryLabel) {
      addPlaceVisitor(row.countries, countryLabel.toLowerCase(), countryLabel, visitor);
    }
    if (cityLabel || countryLabel) {
      const key = placeKey(cityLabel, countryLabel);
      const label = [cityLabel, countryLabel].filter(Boolean).join(', ');
      addPlaceVisitor(row.cities, key, label, visitor);
    }
  } else if (type === 'click') {
    row.linkClicks = Number(row.linkClicks || 0) + 1;
    const clickers = new Set(row.uniqueClickers || []);
    clickers.add(visitor);
    row.uniqueClickers = [...clickers].slice(-MAX_UNIQUE_IDS);
    row.uniqueClickerCount = row.uniqueClickers.length;
    // Clicks also imply a reach visitor for geo uniqueness if we have place data
    if (countryLabel) {
      addPlaceVisitor(row.countries, countryLabel.toLowerCase(), countryLabel, visitor);
    }
    if (cityLabel || countryLabel) {
      const key = placeKey(cityLabel, countryLabel);
      const label = [cityLabel, countryLabel].filter(Boolean).join(', ');
      addPlaceVisitor(row.cities, key, label, visitor);
    }
  } else if (type === 'engage') {
    const chunk = Math.min(MAX_ENGAGE_CHUNK_MS, Math.max(0, Math.round(Number(engagedMs) || 0)));
    if (chunk <= 0) {
      return { ok: true, ignored: true, date, configurationId: configId };
    }
    const prev = Number(row.engagedMsByVisitor[visitor] || 0);
    row.engagedMsByVisitor[visitor] = prev + chunk;
    row.totalEngagedMs = Object.values(row.engagedMsByVisitor)
      .reduce((sum, ms) => sum + Math.max(0, Number(ms) || 0), 0);
    const viewers = new Set(row.uniqueViewers || []);
    viewers.add(visitor);
    row.uniqueViewers = [...viewers].slice(-MAX_UNIQUE_IDS);
    row.uniqueReach = row.uniqueViewers.length;
  }

  row.updatedAt = nowIso;
  await writeJson(dailyPath(configId, date), row, { overwrite: true });
  return { ok: true, date, configurationId: configId };
}

function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const sec = Math.floor(totalSec);
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (minutes < 60) {
    return remSec > 0 ? `${minutes}m ${String(remSec).padStart(2, '0')}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours >= 24 && remMin === 0 && hours % 24 === 0) {
    return `${hours}h`;
  }
  if (remMin === 0) return `${hours}h`;
  return `${hours}h ${remMin}m`;
}

function formatActiveDurationMs(ms) {
  const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const minutes = Math.floor(totalSec / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours === 24 && remMin === 0) return '24h';
  if (remMin === 0) return `${hours}h`;
  return `${hours}h ${remMin}m`;
}

/**
 * Clip period intervals to a UTC calendar day.
 * @returns {{ startIso, endIso, open, configurationId, ms }[]}
 */
function buildDayIntervals(segments, dateKey, now = new Date()) {
  const dayStart = Date.parse(`${dateKey}T00:00:00.000Z`);
  const dayEnd = dayStart + 86400000;
  const nowMs = now.getTime();
  const todayKey = utcDateKey(now);
  const intervals = [];

  for (const seg of segments || []) {
    if (!seg?.startedAt) continue;
    const startMs = new Date(seg.startedAt).getTime();
    if (!Number.isFinite(startMs)) continue;
    let endMs = seg.endedAt ? new Date(seg.endedAt).getTime() : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(endMs)) endMs = Number.POSITIVE_INFINITY;

    const clipStart = Math.max(startMs, dayStart);
    let clipEnd = Math.min(endMs, dayEnd);
    const open = !seg.endedAt && dateKey === todayKey;
    if (open) {
      clipEnd = Math.min(dayEnd, Math.max(clipStart, nowMs));
    }
    if (clipEnd <= clipStart) continue;

    intervals.push({
      startIso: new Date(clipStart).toISOString(),
      endIso: new Date(clipEnd).toISOString(),
      open: Boolean(open),
      configurationId: seg.configurationId || null,
      mapLogoUrl: seg.mapLogoUrl || null,
      subtitle: seg.subtitle || '',
      ms: clipEnd - clipStart,
    });
  }

  intervals.sort((a, b) => String(a.startIso).localeCompare(String(b.startIso)));
  return intervals;
}

function summarizeRow(row) {
  const uniqueReach = Number(row.uniqueReach) || (row.uniqueViewers || []).length;
  const uniqueClickers = Number(row.uniqueClickerCount) || (row.uniqueClickers || []).length;
  const engagedVisitors = Object.keys(row.engagedMsByVisitor || {}).length;
  const totalEngagedMs = Number(row.totalEngagedMs) || 0;
  const avgEngagedMs = engagedVisitors > 0 ? totalEngagedMs / engagedVisitors : 0;
  const countries = Object.values(row.countries || {}).filter((b) => (b.count || (b.visitors || []).length) > 0);
  const cities = Object.values(row.cities || {}).filter((b) => (b.count || (b.visitors || []).length) > 0);

  return {
    partnershipReach: uniqueReach,
    partnershipImpressions: Number(row.impressions) || 0,
    uniqueCountriesReached: countries.length,
    uniqueCitiesReached: cities.length,
    linkImageClicks: Number(row.linkClicks) || 0,
    uniqueLinkImageClickers: uniqueClickers,
    averageTimeOnPassTheWorldMs: Math.round(avgEngagedMs),
    averageTimeOnPassTheWorldLabel: formatDurationMs(avgEngagedMs),
  };
}

function mergeRows(rows) {
  const merged = emptyRow('_merged', rows[0]?.date || '');
  const viewers = new Set();
  const clickers = new Set();
  const engaged = {};
  const countries = {};
  const cities = {};

  for (const row of rows) {
    merged.impressions += Number(row.impressions) || 0;
    merged.linkClicks += Number(row.linkClicks) || 0;
    (row.uniqueViewers || []).forEach((v) => viewers.add(v));
    (row.uniqueClickers || []).forEach((v) => clickers.add(v));
    Object.entries(row.engagedMsByVisitor || {}).forEach(([vid, ms]) => {
      engaged[vid] = (engaged[vid] || 0) + (Number(ms) || 0);
    });
    Object.entries(row.countries || {}).forEach(([key, bucket]) => {
      if (!countries[key]) countries[key] = { label: bucket.label, visitors: [] };
      const set = new Set([...(countries[key].visitors || []), ...(bucket.visitors || [])]);
      countries[key].visitors = [...set];
      countries[key].count = set.size;
      countries[key].label = bucket.label || countries[key].label;
    });
    Object.entries(row.cities || {}).forEach(([key, bucket]) => {
      if (!cities[key]) cities[key] = { label: bucket.label, visitors: [] };
      const set = new Set([...(cities[key].visitors || []), ...(bucket.visitors || [])]);
      cities[key].visitors = [...set];
      cities[key].count = set.size;
      cities[key].label = bucket.label || cities[key].label;
    });
  }

  merged.uniqueViewers = [...viewers];
  merged.uniqueReach = viewers.size;
  merged.uniqueClickers = [...clickers];
  merged.uniqueClickerCount = clickers.size;
  merged.engagedMsByVisitor = engaged;
  merged.totalEngagedMs = Object.values(engaged).reduce((s, n) => s + n, 0);
  merged.countries = countries;
  merged.cities = cities;
  return merged;
}

/**
 * Build Owner day-modal analytics payload for a UTC date.
 */
async function getPartnershipDayAnalytics({
  date,
  segments = [],
  now = new Date(),
} = {}) {
  const dateKey = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw Object.assign(new Error('date must be YYYY-MM-DD'), { statusCode: 400 });
  }

  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  // Always materialize the tracking epoch on Owner reads so launch day is not
  // stuck on "not collected" until the first public visitor event arrives.
  const meta = await ensureTrackingSince(nowIso);
  const trackingSince = meta.trackingSince || `${TRACKING_EPOCH_DATE}T00:00:00.000Z`;
  const intervals = buildDayIntervals(segments, dateKey, now);
  const activeMs = intervals.reduce((sum, iv) => sum + iv.ms, 0);
  const isLive = intervals.some((iv) => iv.open);

  const configIds = [...new Set(
    intervals.map((iv) => iv.configurationId).filter(Boolean)
  )];

  // Ship-epoch gate only — never depend on "first event arrived" or a late
  // meta.trackingSince, or Owner flashes skeleton then "not collected".
  const unavailable = dateKey < TRACKING_EPOCH_DATE;

  if (!intervals.length) {
    return {
      available: !unavailable,
      unavailable: unavailable || false,
      unavailableReason: unavailable
        ? 'Analytics were not collected on this date.'
        : null,
      live: false,
      timeline: {
        timezone: 'UTC',
        intervals: [],
        activeMs: 0,
        activeLabel: formatActiveDurationMs(0),
      },
      // Off / empty day after tracking started: real zeros, not "unavailable".
      metrics: unavailable ? null : {
        partnershipReach: 0,
        partnershipImpressions: 0,
        uniqueCountriesReached: 0,
        uniqueCitiesReached: 0,
        linkImageClicks: 0,
        uniqueLinkImageClickers: 0,
        averageTimeOnPassTheWorldMs: 0,
        averageTimeOnPassTheWorldLabel: formatDurationMs(0),
        partnershipActiveTimeMs: 0,
        partnershipActiveTimeLabel: formatActiveDurationMs(0),
      },
      byConfiguration: [],
      trackingSince,
    };
  }

  if (unavailable) {
    return {
      available: false,
      unavailable: true,
      unavailableReason: 'Analytics were not collected on this date.',
      live: isLive,
      timeline: {
        timezone: 'UTC',
        intervals,
        activeMs,
        activeLabel: formatActiveDurationMs(activeMs),
      },
      metrics: null,
      byConfiguration: configIds.map((id) => {
        const segs = segments.filter((s) => s.configurationId === id);
        return {
          configurationId: id,
          mapLogoUrl: segs[0]?.mapLogoUrl || null,
          subtitle: segs[0]?.subtitle || '',
          metrics: null,
        };
      }),
      trackingSince,
    };
  }

  const rows = [];
  for (const id of configIds) {
    rows.push(await readDailyRow(id, dateKey));
  }

  const byConfiguration = configIds.map((id, i) => {
    const segs = segments.filter((s) => s.configurationId === id);
    const summary = summarizeRow(rows[i]);
    const cfgActiveMs = intervals
      .filter((iv) => iv.configurationId === id)
      .reduce((sum, iv) => sum + iv.ms, 0);
    return {
      configurationId: id,
      mapLogoUrl: segs[0]?.mapLogoUrl || null,
      subtitle: segs[0]?.subtitle || '',
      metrics: {
        ...summary,
        partnershipActiveTimeMs: cfgActiveMs,
        partnershipActiveTimeLabel: formatActiveDurationMs(cfgActiveMs),
      },
    };
  });

  const mergedSummary = summarizeRow(mergeRows(rows));
  const metrics = {
    ...mergedSummary,
    partnershipActiveTimeMs: activeMs,
    partnershipActiveTimeLabel: formatActiveDurationMs(activeMs),
  };

  return {
    available: true,
    unavailable: false,
    unavailableReason: null,
    live: isLive,
    timeline: {
      timezone: 'UTC',
      intervals,
      activeMs,
      activeLabel: formatActiveDurationMs(activeMs),
    },
    metrics,
    byConfiguration,
    trackingSince,
  };
}

module.exports = {
  IMPRESSION_COOLDOWN_MS,
  TRACKING_EPOCH_DATE,
  recordPartnershipAnalyticsEvent,
  getPartnershipDayAnalytics,
  buildDayIntervals,
  formatDurationMs,
  formatActiveDurationMs,
  utcDateKey,
  ROOT,
};
