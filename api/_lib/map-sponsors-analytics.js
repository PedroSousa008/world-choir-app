/**
 * Map sponsor bar — public impression/click analytics (Owner reporting).
 */
const { list } = require('@vercel/blob');
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');
const { getSponsorById } = require('./map-sponsors-owner');

const ANALYTICS_ROOT = 'wc-data/map-sponsors/analytics';

function getUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysAgoDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return getUtcDateString(d);
}

function emptyDailyRow(sponsorId, date) {
  return {
    sponsorId,
    date,
    impressions: 0,
    totalClicks: 0,
    uniqueClickVisitors: [],
    uniqueClicks: 0,
    updatedAt: null,
  };
}

function emptyTotals() {
  return {
    impressions: 0,
    totalClicks: 0,
    uniqueClicks: 0,
    ctrUnique: 0,
    ctrTotal: 0,
  };
}

function dailyPath(sponsorId, date) {
  return `${ANALYTICS_ROOT}/${sponsorId}/${date}.json`;
}

async function readDailyRow(sponsorId, date) {
  try {
    const row = await readBlobJson(dailyPath(sponsorId, date));
    const visitors = Array.isArray(row.uniqueClickVisitors) ? row.uniqueClickVisitors : [];
    return {
      ...emptyDailyRow(sponsorId, date),
      ...row,
      sponsorId,
      date,
      uniqueClickVisitors: visitors,
      uniqueClicks: Number(row.uniqueClicks || visitors.length || 0),
    };
  } catch {
    return emptyDailyRow(sponsorId, date);
  }
}

function finalizeTotals(totals) {
  const impressions = Number(totals.impressions || 0);
  const totalClicks = Number(totals.totalClicks || 0);
  const uniqueClicks = Number(totals.uniqueClicks || 0);
  return {
    impressions,
    totalClicks,
    uniqueClicks,
    ctrUnique: impressions ? (uniqueClicks / impressions) * 100 : 0,
    ctrTotal: impressions ? (totalClicks / impressions) * 100 : 0,
  };
}

function addDailyToTotals(totals, row, uniqueSet) {
  totals.impressions += Number(row.impressions || 0);
  totals.totalClicks += Number(row.totalClicks || 0);
  (row.uniqueClickVisitors || []).forEach((visitorId) => uniqueSet.add(visitorId));
  totals.uniqueClicks = uniqueSet.size;
  return totals;
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

async function recordMapSponsorEvent({ sponsorId, eventType, visitorId }) {
  assertBlobConfigured();

  const id = String(sponsorId || '').trim();
  if (!id) throw new Error('Sponsor id required');

  const sponsor = await getSponsorById(id);
  if (!sponsor || !sponsor.isActive) throw new Error('Sponsor not found');

  const type = String(eventType || '').trim();
  if (!['impression', 'click'].includes(type)) throw new Error('Invalid event type');

  const date = getUtcDateString();
  const row = await readDailyRow(id, date);

  if (type === 'impression') {
    row.impressions = Number(row.impressions || 0) + 1;
  } else {
    row.totalClicks = Number(row.totalClicks || 0) + 1;
    const visitors = new Set(row.uniqueClickVisitors || []);
    const vid = String(visitorId || '').trim();
    if (vid) visitors.add(vid);
    row.uniqueClickVisitors = [...visitors];
    row.uniqueClicks = visitors.size;
  }

  row.updatedAt = new Date().toISOString();
  await writeJson(dailyPath(id, date), row, { overwrite: true });
  return { ok: true };
}

async function getMapSponsorAnalytics(sponsorId) {
  const sponsor = await getSponsorById(sponsorId);
  if (!sponsor) throw new Error('Company not found');

  const daily = await listDailyRows(sponsorId);
  const today = getUtcDateString();
  const since7 = daysAgoDate(6);
  const since30 = daysAgoDate(29);

  const lifetimeSet = new Set();
  const last7Set = new Set();
  const last30Set = new Set();
  const lifetime = emptyTotals();
  const last7Days = emptyTotals();
  const last30Days = emptyTotals();
  const trendDaily = [];

  for (const row of daily) {
    addDailyToTotals(lifetime, row, lifetimeSet);
    if (row.date >= since7 && row.date <= today) {
      addDailyToTotals(last7Days, row, last7Set);
    }
    if (row.date >= since30 && row.date <= today) {
      addDailyToTotals(last30Days, row, last30Set);
      trendDaily.push({
        date: row.date,
        impressions: Number(row.impressions || 0),
        totalClicks: Number(row.totalClicks || 0),
        uniqueClicks: Number(row.uniqueClicks || 0),
      });
    }
  }

  return {
    sponsor: {
      id: sponsor.id,
      companyName: sponsor.companyName,
      companyLogoUrl: sponsor.companyLogoUrl,
      isActive: !!sponsor.isActive,
    },
    lifetime: finalizeTotals(lifetime),
    last7Days: finalizeTotals(last7Days),
    last30Days: finalizeTotals(last30Days),
    trends: {
      daily: trendDaily,
    },
  };
}

module.exports = {
  recordMapSponsorEvent,
  getMapSponsorAnalytics,
};
