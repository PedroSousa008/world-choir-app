/**
 * Map sponsor bar — public impression/click analytics (Owner reporting).
 */
const { list } = require('@vercel/blob');
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');
const { getSponsorById } = require('./map-sponsors-owner');

const ANALYTICS_ROOT = 'wc-data/map-sponsors/analytics';
const DEFAULT_EVENT_ID = 'world-choir-2027';

const KNOWN_EVENTS = {
  'world-choir-2027': {
    id: 'world-choir-2027',
    title: 'World Choir 2027',
    eventDateUTC: '2027-09-21T16:00:00.000Z',
  },
};

function getUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysAgoDate(days, from = new Date()) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return getUtcDateString(d);
}

function parseDateInput(value) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function emptyDailyRow(sponsorId, date) {
  return {
    sponsorId,
    date,
    impressions: 0,
    totalClicks: 0,
    uniqueImpressionVisitors: [],
    uniqueReach: 0,
    uniqueClickVisitors: [],
    uniqueClicks: 0,
    countries: {},
    events: {},
    clickDestinations: {},
    clickLocations: {},
    updatedAt: null,
  };
}

function emptySummary() {
  return {
    impressions: 0,
    uniqueReach: 0,
    websiteClicks: 0,
    uniqueClickers: 0,
    ctr: 0,
    ctrUnique: 0,
    daysActive: 0,
  };
}

function finalizeSummary(summary) {
  const impressions = Number(summary.impressions || 0);
  const websiteClicks = Number(summary.websiteClicks || 0);
  const uniqueClickers = Number(summary.uniqueClickers || 0);
  const uniqueReach = Number(summary.uniqueReach || 0);
  return {
    impressions,
    uniqueReach,
    websiteClicks,
    uniqueClickers,
    ctr: impressions ? (websiteClicks / impressions) * 100 : 0,
    ctrUnique: impressions ? (uniqueClickers / impressions) * 100 : 0,
    daysActive: Number(summary.daysActive || 0),
  };
}

function mergeSummaryFromRow(summary, row, impressionSet, clickSet) {
  summary.impressions += Number(row.impressions || 0);
  summary.websiteClicks += Number(row.totalClicks || 0);
  (row.uniqueImpressionVisitors || []).forEach((visitorId) => impressionSet.add(visitorId));
  (row.uniqueClickVisitors || []).forEach((visitorId) => clickSet.add(visitorId));
  summary.uniqueReach = impressionSet.size;
  summary.uniqueClickers = clickSet.size;
  return summary;
}

function getPreviousBounds(bounds) {
  if (!bounds.from) return null;
  const fromMs = Date.parse(`${bounds.from}T00:00:00.000Z`);
  const toMs = Date.parse(`${bounds.to}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  const dayCount = Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1);
  const prevTo = new Date(fromMs - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (dayCount - 1) * 86400000);
  return {
    from: getUtcDateString(prevFrom),
    to: getUtcDateString(prevTo),
    label: `previous ${dayCount} days`,
  };
}

function pctChange(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

function aggregateRowsInRange(allDaily, bounds) {
  const rows = allDaily.filter((row) => rowInRange(row, bounds));
  const summary = emptySummary();
  const impressionSet = new Set();
  const clickSet = new Set();
  rows.forEach((row) => mergeSummaryFromRow(summary, row, impressionSet, clickSet));
  return finalizeSummary(summary);
}

function dailyPath(sponsorId, date) {
  return `${ANALYTICS_ROOT}/${sponsorId}/${date}.json`;
}

function normalizeCountry(country) {
  const c = String(country || '').trim();
  return c || null;
}

function normalizeEventId(eventId) {
  const id = String(eventId || '').trim();
  return id || DEFAULT_EVENT_ID;
}

function ensureCountryBucket(row, country) {
  if (!country) return null;
  row.countries = row.countries || {};
  if (!row.countries[country]) {
    row.countries[country] = {
      impressions: 0,
      totalClicks: 0,
      uniqueImpressionVisitors: [],
      uniqueReach: 0,
      uniqueClickVisitors: [],
      uniqueClickers: 0,
    };
  }
  return row.countries[country];
}

function ensureEventBucket(row, eventId) {
  const id = normalizeEventId(eventId);
  row.events = row.events || {};
  if (!row.events[id]) {
    row.events[id] = {
      impressions: 0,
      totalClicks: 0,
      uniqueImpressionVisitors: [],
      uniqueReach: 0,
      uniqueClickVisitors: [],
      uniqueClickers: 0,
      countries: {},
    };
  }
  return row.events[id];
}

function addVisitor(set, visitorId) {
  const vid = String(visitorId || '').trim();
  if (vid) set.add(vid);
}

function syncUniqueCounts(bucket) {
  bucket.uniqueReach = new Set(bucket.uniqueImpressionVisitors || []).size;
  bucket.uniqueClickers = new Set(bucket.uniqueClickVisitors || []).size;
}

async function readDailyRow(sponsorId, date) {
  try {
    const row = await readBlobJson(dailyPath(sponsorId, date));
    const impressionVisitors = Array.isArray(row.uniqueImpressionVisitors) ? row.uniqueImpressionVisitors : [];
    const clickVisitors = Array.isArray(row.uniqueClickVisitors) ? row.uniqueClickVisitors : [];
    return {
      ...emptyDailyRow(sponsorId, date),
      ...row,
      sponsorId,
      date,
      uniqueImpressionVisitors: impressionVisitors,
      uniqueReach: Number(row.uniqueReach || impressionVisitors.length || 0),
      uniqueClickVisitors: clickVisitors,
      uniqueClicks: Number(row.uniqueClicks || clickVisitors.length || 0),
      countries: row.countries && typeof row.countries === 'object' ? row.countries : {},
      events: row.events && typeof row.events === 'object' ? row.events : {},
      clickDestinations: row.clickDestinations && typeof row.clickDestinations === 'object'
        ? row.clickDestinations
        : {},
      clickLocations: row.clickLocations && typeof row.clickLocations === 'object'
        ? row.clickLocations
        : {},
    };
  } catch {
    return emptyDailyRow(sponsorId, date);
  }
}

function parseDailyDateFromPath(pathname) {
  const match = String(pathname || '').match(/(\d{4}-\d{2}-\d{2})\.json$/);
  return match ? match[1] : null;
}

async function listDailyRows(sponsorId) {
  assertBlobConfigured();
  const prefix = `${ANALYTICS_ROOT}/${sponsorId}/`;
  const rows = [];
  let cursor;

  do {
    const result = await list({ prefix, limit: 1000, cursor });
    for (const blob of result.blobs || []) {
      const date = parseDailyDateFromPath(blob.pathname);
      if (!date) continue;
      rows.push(await readDailyRow(sponsorId, date));
    }
    cursor = result.cursor;
  } while (cursor);

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

function resolveRangeBounds(options = {}) {
  const today = getUtcDateString();
  const range = String(options.range || '30d').trim();
  if (range === 'custom') {
    const from = parseDateInput(options.from);
    const to = parseDateInput(options.to) || today;
    if (!from || from > to) {
      return { from: daysAgoDate(29), to: today, range: '30d', label: '30 Days' };
    }
    return { from, to, range: 'custom', label: `${from} – ${to}` };
  }

  const map = {
    '7d': { days: 6, label: '7 Days' },
    '30d': { days: 29, label: '30 Days' },
    '90d': { days: 89, label: '90 Days' },
    '1y': { days: 364, label: '1 Year' },
    lifetime: { days: null, label: 'Lifetime' },
  };
  const cfg = map[range] || map['30d'];
  if (cfg.days == null) {
    return { from: null, to: today, range: 'lifetime', label: cfg.label };
  }
  return {
    from: daysAgoDate(cfg.days),
    to: today,
    range,
    label: cfg.label,
  };
}

function rowInRange(row, bounds) {
  if (!bounds.from) return row.date <= bounds.to;
  return row.date >= bounds.from && row.date <= bounds.to;
}

function mergeSummaryFromRow(summary, row, impressionSet, clickSet) {
  summary.impressions += Number(row.impressions || 0);
  summary.websiteClicks += Number(row.totalClicks || 0);
  (row.uniqueImpressionVisitors || []).forEach((id) => impressionSet.add(id));
  (row.uniqueClickVisitors || []).forEach((id) => clickSet.add(id));
  summary.uniqueReach = impressionSet.size;
  summary.uniqueClickers = clickSet.size;
  summary.ctr = summary.impressions
    ? (summary.websiteClicks / summary.impressions) * 100
    : 0;
  return summary;
}

function mergeCountryAgg(target, source) {
  Object.entries(source || {}).forEach(([country, stats]) => {
    if (!target[country]) {
      target[country] = {
        impressions: 0,
        totalClicks: 0,
        uniqueImpressionVisitors: [],
        uniqueReach: 0,
        uniqueClickVisitors: [],
        uniqueClickers: 0,
      };
    }
    const bucket = target[country];
    bucket.impressions += Number(stats.impressions || 0);
    bucket.totalClicks += Number(stats.totalClicks || 0);
    const imp = new Set([...(bucket.uniqueImpressionVisitors || []), ...(stats.uniqueImpressionVisitors || [])]);
    const clk = new Set([...(bucket.uniqueClickVisitors || []), ...(stats.uniqueClickVisitors || [])]);
    bucket.uniqueImpressionVisitors = [...imp];
    bucket.uniqueReach = imp.size;
    bucket.uniqueClickVisitors = [...clk];
    bucket.uniqueClickers = clk.size;
  });
}

function mergeClickLocationsAgg(target, source) {
  Object.entries(source || {}).forEach(([visitorId, loc]) => {
    const lat = Number(loc?.latitude);
    const lng = Number(loc?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (target[visitorId]) return;

    target[visitorId] = {
      city: loc.city || null,
      country: loc.country || null,
      latitude: lat,
      longitude: lng,
      uniqueClickers: 1,
    };
  });
}

function recordClickLocation(row, visitorId, { city, country, latitude, longitude }) {
  const visitor = String(visitorId || '').trim();
  if (!visitor) return;

  const lat = latitude == null || latitude === '' ? NaN : Number(latitude);
  const lng = longitude == null || longitude === '' ? NaN : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  row.clickLocations = row.clickLocations || {};
  if (row.clickLocations[visitor]) return;

  row.clickLocations[visitor] = {
    city: String(city || '').trim() || null,
    country: normalizeCountry(country),
    latitude: lat,
    longitude: lng,
    uniqueClickers: 1,
  };
}

function aggregateClickMapPoints(clickLocationsByVisitor) {
  const buckets = new Map();
  Object.values(clickLocationsByVisitor || {}).forEach((loc) => {
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${lat.toFixed(4)}|${lng.toFixed(4)}`;
    const existing = buckets.get(key) || {
      city: loc.city || null,
      country: loc.country || null,
      latitude: lat,
      longitude: lng,
      uniqueClickers: 0,
    };
    existing.uniqueClickers += 1;
    buckets.set(key, existing);
  });
  return [...buckets.values()].sort((a, b) =>
    b.uniqueClickers - a.uniqueClickers
    || String(a.country || '').localeCompare(String(b.country || ''))
    || String(a.city || '').localeCompare(String(b.city || ''))
  );
}

function mergeEventAgg(target, source) {
  Object.entries(source || {}).forEach(([eventId, stats]) => {
    if (!target[eventId]) {
      target[eventId] = {
        impressions: 0,
        totalClicks: 0,
        uniqueImpressionVisitors: [],
        uniqueReach: 0,
        uniqueClickVisitors: [],
        uniqueClickers: 0,
        countries: {},
      };
    }
    const bucket = target[eventId];
    bucket.impressions += Number(stats.impressions || 0);
    bucket.totalClicks += Number(stats.totalClicks || 0);
    const imp = new Set([...(bucket.uniqueImpressionVisitors || []), ...(stats.uniqueImpressionVisitors || [])]);
    const clk = new Set([...(bucket.uniqueClickVisitors || []), ...(stats.uniqueClickVisitors || [])]);
    bucket.uniqueImpressionVisitors = [...imp];
    bucket.uniqueReach = imp.size;
    bucket.uniqueClickVisitors = [...clk];
    bucket.uniqueClickers = clk.size;
    mergeCountryAgg(bucket.countries, stats.countries || {});
  });
}

function normalizeActivationHistory(sponsor) {
  const history = Array.isArray(sponsor.activationHistory) ? [...sponsor.activationHistory] : [];
  if (!history.length && sponsor.activatedAt) {
    history.push({
      activatedAt: sponsor.activatedAt,
      deactivatedAt: sponsor.isActive ? null : null,
    });
  }
  return history;
}

function countActiveDaysInRange(history, bounds) {
  const from = bounds.from || '1970-01-01';
  const to = bounds.to;
  const days = new Set();

  history.forEach((period) => {
    const start = String(period.activatedAt || '').slice(0, 10);
    const end = String(period.deactivatedAt || to).slice(0, 10);
    if (!start) return;
    const rangeStart = start > from ? start : from;
    const rangeEnd = end < to ? end : to;
    if (rangeStart > rangeEnd) return;

    const cursor = new Date(`${rangeStart}T00:00:00.000Z`);
    const endDate = new Date(`${rangeEnd}T00:00:00.000Z`);
    while (cursor <= endDate) {
      days.add(getUtcDateString(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  });

  return days.size;
}

function buildTimeSeries(rows, bounds) {
  const daily = rows.map((row) => ({
    date: row.date,
    impressions: Number(row.impressions || 0),
    clicks: Number(row.totalClicks || 0),
    uniqueReach: Number(row.uniqueReach || (row.uniqueImpressionVisitors || []).length || 0),
    ctr: row.impressions ? (row.totalClicks / row.impressions) * 100 : 0,
  }));

  const spanDays = bounds.from
    ? Math.max(1, Math.round((Date.parse(`${bounds.to}T00:00:00Z`) - Date.parse(`${bounds.from}T00:00:00Z`)) / 86400000) + 1)
    : daily.length || 1;

  if (bounds.range === 'lifetime' && spanDays > 365) {
    return aggregateSeries(daily, 'month');
  }
  if (bounds.range === '1y' || spanDays > 90) {
    return aggregateSeries(daily, 'week');
  }
  return daily;
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return getUtcDateString(d);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function aggregateSeries(daily, mode) {
  const buckets = new Map();
  daily.forEach((point) => {
    const key = mode === 'month' ? monthKey(point.date) : startOfWeek(point.date);
    const existing = buckets.get(key) || { date: key, impressions: 0, clicks: 0, uniqueReach: 0 };
    existing.impressions += point.impressions;
    existing.clicks += point.clicks;
    existing.uniqueReach = Math.max(existing.uniqueReach || 0, point.uniqueReach || 0);
    buckets.set(key, existing);
  });
  return [...buckets.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => ({
      ...point,
      ctr: point.impressions ? (point.clicks / point.impressions) * 100 : 0,
    }));
}

function buildHighlights(rows, countries, events) {
  if (!rows.length) return null;

  let bestImpressionDay = null;
  let mostClicksDay = null;
  let highestCtrDay = null;

  rows.forEach((row) => {
    const impressions = Number(row.impressions || 0);
    const clicks = Number(row.totalClicks || 0);
    const ctr = impressions ? (clicks / impressions) * 100 : 0;

    if (!bestImpressionDay || impressions > bestImpressionDay.impressions) {
      bestImpressionDay = { date: row.date, impressions };
    }
    if (!mostClicksDay || clicks > mostClicksDay.clicks) {
      mostClicksDay = { date: row.date, clicks };
    }
    if (impressions > 0 && (!highestCtrDay || ctr > highestCtrDay.ctr)) {
      highestCtrDay = { date: row.date, ctr };
    }
  });

  const countryEntries = Object.entries(countries || {})
    .map(([country, stats]) => ({ country, impressions: Number(stats.impressions || 0) }))
    .filter((entry) => entry.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions);
  const topCountry = countryEntries[0] || null;

  const eventEntries = Object.entries(events || {})
    .map(([eventId, stats]) => ({ eventId, impressions: Number(stats.impressions || 0) }))
    .filter((entry) => entry.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions);
  const bestEvent = eventEntries[0] || null;

  if (!bestImpressionDay?.impressions
    && !mostClicksDay?.clicks
    && !highestCtrDay
    && !topCountry
    && !bestEvent) {
    return null;
  }

  return {
    bestImpressionDay: bestImpressionDay?.impressions ? bestImpressionDay : null,
    mostClicksDay: mostClicksDay?.clicks ? mostClicksDay : null,
    highestCtrDay,
    topCountry,
    bestEvent: bestEvent
      ? {
        eventId: bestEvent.eventId,
        eventName: KNOWN_EVENTS[bestEvent.eventId]?.title || bestEvent.eventId,
        impressions: bestEvent.impressions,
      }
      : null,
  };
}

function buildCommercial(sponsor, summary) {
  const value = Number(sponsor?.contract?.value);
  const currency = sponsor?.contract?.currency || 'EUR';
  const hasMonetaryValue = Number.isFinite(value) && value > 0;
  const impressions = Number(summary.impressions || 0);
  const clicks = Number(summary.websiteClicks || 0);

  return {
    hasMonetaryValue,
    contractValue: hasMonetaryValue ? value : null,
    currency,
    impressionsDelivered: impressions,
    clicksDelivered: clicks,
    cpm: hasMonetaryValue && impressions > 0 ? (value / impressions) * 1000 : null,
    costPerClick: hasMonetaryValue && clicks > 0 ? value / clicks : null,
  };
}

async function recordMapSponsorEvent({
  sponsorId,
  eventType,
  visitorId,
  country = null,
  city = null,
  latitude = null,
  longitude = null,
  eventId = DEFAULT_EVENT_ID,
  destinationUrl = null,
}) {
  assertBlobConfigured();

  const id = String(sponsorId || '').trim();
  if (!id) throw new Error('Sponsor id required');

  const sponsor = await getSponsorById(id);
  if (!sponsor || !sponsor.isActive) throw new Error('Sponsor not found');

  const type = String(eventType || '').trim();
  if (!['impression', 'click'].includes(type)) throw new Error('Invalid event type');

  const date = getUtcDateString();
  const row = await readDailyRow(id, date);
  const visitor = String(visitorId || '').trim();
  const geo = normalizeCountry(country);
  const evt = normalizeEventId(eventId);
  const eventBucket = ensureEventBucket(row, evt);
  const countryBucket = geo ? ensureCountryBucket(row, geo) : null;
  const eventCountryBucket = geo ? ensureCountryBucket(eventBucket, geo) : null;

  if (type === 'impression') {
    row.impressions = Number(row.impressions || 0) + 1;
    if (visitor) {
      const imp = new Set(row.uniqueImpressionVisitors || []);
      imp.add(visitor);
      row.uniqueImpressionVisitors = [...imp];
      row.uniqueReach = imp.size;
    }
    if (countryBucket && visitor) {
      countryBucket.impressions += 1;
      const cImp = new Set(countryBucket.uniqueImpressionVisitors || []);
      cImp.add(visitor);
      countryBucket.uniqueImpressionVisitors = [...cImp];
      syncUniqueCounts(countryBucket);
    }
    if (eventBucket && visitor) {
      eventBucket.impressions += 1;
      const eImp = new Set(eventBucket.uniqueImpressionVisitors || []);
      eImp.add(visitor);
      eventBucket.uniqueImpressionVisitors = [...eImp];
      syncUniqueCounts(eventBucket);
    }
    if (eventCountryBucket && visitor) {
      eventCountryBucket.impressions += 1;
      const ecImp = new Set(eventCountryBucket.uniqueImpressionVisitors || []);
      ecImp.add(visitor);
      eventCountryBucket.uniqueImpressionVisitors = [...ecImp];
      syncUniqueCounts(eventCountryBucket);
    }
  } else {
    row.totalClicks = Number(row.totalClicks || 0) + 1;
    if (visitor) {
      const clk = new Set(row.uniqueClickVisitors || []);
      clk.add(visitor);
      row.uniqueClickVisitors = [...clk];
      row.uniqueClicks = clk.size;
    }
    if (countryBucket) {
      countryBucket.totalClicks += 1;
      if (visitor) {
        countryBucket.uniqueClickVisitors = [
          ...new Set([...(countryBucket.uniqueClickVisitors || []), visitor]),
        ];
        syncUniqueCounts(countryBucket);
      }
    }
    if (eventBucket) {
      eventBucket.totalClicks += 1;
      if (visitor) {
        eventBucket.uniqueClickVisitors = [
          ...new Set([...(eventBucket.uniqueClickVisitors || []), visitor]),
        ];
        syncUniqueCounts(eventBucket);
      }
    }
    if (eventCountryBucket) {
      eventCountryBucket.totalClicks += 1;
      if (visitor) {
        eventCountryBucket.uniqueClickVisitors = [
          ...new Set([...(eventCountryBucket.uniqueClickVisitors || []), visitor]),
        ];
        syncUniqueCounts(eventCountryBucket);
      }
    }
    const dest = String(destinationUrl || '').trim();
    if (dest) {
      row.clickDestinations = row.clickDestinations || {};
      row.clickDestinations[dest] = Number(row.clickDestinations[dest] || 0) + 1;
    }
    recordClickLocation(row, visitor, { city, country: geo || country, latitude, longitude });
  }

  row.updatedAt = new Date().toISOString();
  await writeJson(dailyPath(id, date), row, { overwrite: true });
  return { ok: true };
}

async function getMapSponsorAnalytics(sponsorId, options = {}) {
  const sponsor = await getSponsorById(sponsorId);
  if (!sponsor) throw new Error('Company not found');

  const bounds = resolveRangeBounds(options);
  const allDaily = await listDailyRows(sponsorId);
  const rows = allDaily.filter((row) => rowInRange(row, bounds));

  const impressionSet = new Set();
  const clickSet = new Set();
  const summary = emptySummary();
  rows.forEach((row) => mergeSummaryFromRow(summary, row, impressionSet, clickSet));
  summary.daysActive = countActiveDaysInRange(normalizeActivationHistory(sponsor), bounds);
  const finalizedSummary = finalizeSummary(summary);

  const previousBounds = getPreviousBounds(bounds);
  const previousSummary = previousBounds
    ? aggregateRowsInRange(allDaily, previousBounds)
    : finalizeSummary(emptySummary());

  const comparison = {
    impressions: pctChange(finalizedSummary.impressions, previousSummary.impressions),
    uniqueReach: pctChange(finalizedSummary.uniqueReach, previousSummary.uniqueReach),
    websiteClicks: pctChange(finalizedSummary.websiteClicks, previousSummary.websiteClicks),
    uniqueClickers: pctChange(finalizedSummary.uniqueClickers, previousSummary.uniqueClickers),
    ctrUnique: pctChange(finalizedSummary.ctrUnique, previousSummary.ctrUnique),
    periodLabel: previousBounds?.label || 'previous period',
  };

  const lastUpdated = rows.reduce((latest, row) => {
    const ts = row.updatedAt ? Date.parse(row.updatedAt) : 0;
    return ts > latest ? ts : latest;
  }, 0);

  const countries = {};
  const events = {};
  const clickLocations = {};

  rows.forEach((row) => {
    mergeCountryAgg(countries, row.countries || {});
    mergeEventAgg(events, row.events || {});
    mergeClickLocationsAgg(clickLocations, row.clickLocations || {});
  });

  const clickLocationRows = Object.values(clickLocations)
    .filter((loc) => Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude)))
    .map((loc) => ({
      city: loc.city || null,
      country: loc.country || null,
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      uniqueClickers: 1,
    }))
    .sort((a, b) => String(a.country || '').localeCompare(String(b.country || ''))
      || String(a.city || '').localeCompare(String(b.city || '')));

  const clickMapPoints = aggregateClickMapPoints(clickLocations);

  const countriesReached = Object.values(countries).filter((stats) => Number(stats.impressions || 0) > 0).length;
  const countryRows = Object.entries(countries)
    .map(([country, stats]) => {
      const impressions = Number(stats.impressions || 0);
      const clicks = Number(stats.totalClicks || 0);
      return {
        country,
        impressions,
        clicks,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
      };
    })
    .filter((entry) => entry.impressions > 0 || entry.clicks > 0)
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);

  const eventRows = Object.entries(events)
    .map(([eventId, stats]) => {
      const impressions = Number(stats.impressions || 0);
      const clicks = Number(stats.totalClicks || 0);
      const known = KNOWN_EVENTS[eventId];
      const eventCountries = Object.values(stats.countries || {})
        .filter((c) => Number(c.impressions || 0) > 0).length;
      return {
        eventId,
        eventName: known?.title || eventId,
        eventDate: known?.eventDateUTC || null,
        impressions,
        uniqueReach: Number(stats.uniqueReach || 0),
        websiteClicks: clicks,
        uniqueClickers: Number(stats.uniqueClickers || 0),
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        countriesReached: eventCountries,
      };
    })
    .filter((entry) => entry.impressions > 0 || entry.websiteClicks > 0)
    .sort((a, b) => b.impressions - a.impressions);

  const timeSeries = buildTimeSeries(rows, bounds);
  const highlights = buildHighlights(rows, countries, events);
  const commercial = buildCommercial(sponsor, finalizedSummary);

  const agreementLabels = {
    sponsorship: 'Sponsorship',
    partnership: 'Partnership',
    in_kind: 'In-Kind',
    promotional: 'Promotional',
    strategic: 'Strategic',
    other: 'Other',
  };

  return {
    sponsor: {
      id: sponsor.id,
      companyName: sponsor.companyName,
      companyLogoUrl: sponsor.companyLogoUrl,
      companyWebsiteUrl: sponsor.companyWebsiteUrl || '',
      isActive: !!sponsor.isActive,
      activatedAt: sponsor.activatedAt || null,
      createdAt: sponsor.createdAt || null,
      country: sponsor.country || '',
      activationHistory: normalizeActivationHistory(sponsor),
      contractEndDate: sponsor.contract?.endDate || null,
      agreementType: sponsor.contract?.agreementType || '',
      agreementTypeLabel: agreementLabels[sponsor.contract?.agreementType] || '—',
    },
    range: bounds,
    summary: finalizedSummary,
    previousSummary,
    comparison,
    countriesReached,
    countries: countryRows,
    clickLocations: clickLocationRows,
    clickMapPoints,
    events: eventRows,
    timeSeries,
    highlights,
    commercial: {
      ...commercial,
      eventsSupported: eventRows.length,
    },
    hasData: rows.some((row) => Number(row.impressions || 0) > 0 || Number(row.totalClicks || 0) > 0),
    lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : null,
    dataStatus: rows.some((row) => Number(row.impressions || 0) > 0 || Number(row.totalClicks || 0) > 0)
      ? 'Collecting'
      : 'No data yet',
  };
}

module.exports = {
  recordMapSponsorEvent,
  getMapSponsorAnalytics,
  mergeClickLocationsAgg,
  recordClickLocation,
  aggregateClickMapPoints,
  DEFAULT_EVENT_ID,
};
