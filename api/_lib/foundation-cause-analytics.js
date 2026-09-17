/**
 * First-party Cause analytics for Foundation Control Center.
 *
 * Metric definitions (keep consistent across dashboards):
 * - Total Causes: count of active Causes belonging to the Foundation (not period-scoped).
 * - Views (cause_viewed): Cause detail-page opens. Total = event count; Unique Viewers = distinct visitorKey.
 * - Clicks (cause_card_clicked): Cause-card taps that enter the Cause detail. Total = event count;
 *   Unique Clickers = distinct visitorKey. Not every UI tap — only card→detail entry.
 * - Supporters: unique donor keys from successful donations with causeId matching a Foundation Cause,
 *   plus recorded cause_supported events (same visitor/donor identity model). Overview uses UNIQUE
 *   people across all Causes (union), not a sum of per-Cause counts.
 *
 * Owner/admin sessions are excluded from public engagement counts when detectable.
 * No social-platform metrics. No invented numbers — missing data reports as 0.
 */
const { randomUUID } = require('crypto');
const { readBlobJson, writeJson } = require('./store');
const { readWorkspace, publicCause } = require('./foundation-workspace');

const ROOT = 'wc-data/members/cause-analytics';
const MAX_EVENTS = 25000;
const VIEW_DEDUP_MS = 30 * 60 * 1000;
const CLICK_DEDUP_MS = 8 * 1000;

const EVENT_TYPES = new Set([
  'cause_viewed',
  'cause_card_clicked',
  'cause_supported',
]);

function analyticsPath(foundationId) {
  return `${ROOT}/${encodeURIComponent(foundationId)}.json`;
}

function emptyDoc(foundationId) {
  return {
    foundationId: String(foundationId || ''),
    updatedAt: null,
    events: [],
  };
}

async function readCauseAnalytics(foundationId) {
  const id = String(foundationId || '').trim();
  if (!id) return emptyDoc('');
  try {
    const data = await readBlobJson(analyticsPath(id));
    if (!data || typeof data !== 'object') return emptyDoc(id);
    return {
      ...emptyDoc(id),
      ...data,
      foundationId: id,
      events: Array.isArray(data.events) ? data.events : [],
    };
  } catch {
    return emptyDoc(id);
  }
}

async function writeCauseAnalytics(doc) {
  const id = String(doc?.foundationId || '').trim();
  if (!id) throw new Error('foundationId required');
  const next = {
    foundationId: id,
    updatedAt: new Date().toISOString(),
    events: Array.isArray(doc.events) ? doc.events.slice(-MAX_EVENTS) : [],
  };
  await writeJson(analyticsPath(id), next, { overwrite: true });
  return next;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rangeBounds(rangeKey) {
  const now = Date.now();
  const map = {
    '7d': { from: now - 7 * 86400000, to: now, days: 7 },
    '30d': { from: now - 30 * 86400000, to: now, days: 30 },
    '90d': { from: now - 90 * 86400000, to: now, days: 90 },
    all: { from: null, to: null, days: null },
  };
  return map[rangeKey] || map['30d'];
}

function inBounds(date, from, to) {
  if (!date) return false;
  const t = date.getTime();
  if (from != null && t < from) return false;
  if (to != null && t > to) return false;
  return true;
}

function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function normalizeVisitorKey(raw) {
  const key = String(raw || '').trim().slice(0, 120);
  return key || null;
}

function isPublicEngagement(event) {
  return event && event.isOwner !== true && EVENT_TYPES.has(event.type);
}

/**
 * Record a first-party Cause engagement event.
 * Returns { ok, recorded, reason? }.
 */
async function recordCauseEvent({
  foundationId,
  causeId,
  type,
  visitorKey,
  isOwner = false,
} = {}) {
  const fid = String(foundationId || '').trim();
  const cid = String(causeId || '').trim();
  const eventType = String(type || '').trim();
  const visitor = normalizeVisitorKey(visitorKey);

  if (!fid || !cid) return { ok: false, error: 'foundationId and causeId are required' };
  if (!EVENT_TYPES.has(eventType)) return { ok: false, error: 'Invalid event type' };
  if (!visitor) return { ok: false, error: 'visitorKey is required' };

  // Confirm Cause belongs to this Foundation
  const ws = await readWorkspace(fid);
  const cause = (ws.causes || []).find((c) => c.id === cid);
  if (!cause || (cause.status && cause.status !== 'active')) {
    return { ok: false, error: 'Cause not found' };
  }

  if (isOwner) {
    return { ok: true, recorded: false, reason: 'owner_excluded' };
  }

  const doc = await readCauseAnalytics(fid);
  const now = Date.now();
  const dedupMs = eventType === 'cause_viewed' ? VIEW_DEDUP_MS
    : eventType === 'cause_card_clicked' ? CLICK_DEDUP_MS
      : 0;

  if (dedupMs > 0) {
    const recent = doc.events.find((e) => (
      e
      && e.type === eventType
      && e.causeId === cid
      && e.visitorKey === visitor
      && e.isOwner !== true
      && (now - new Date(e.at).getTime()) < dedupMs
    ));
    if (recent) {
      return { ok: true, recorded: false, reason: 'deduped' };
    }
  }

  doc.events.push({
    id: randomUUID(),
    type: eventType,
    causeId: cid,
    visitorKey: visitor,
    isOwner: false,
    at: new Date(now).toISOString(),
  });

  await writeCauseAnalytics(doc);
  return { ok: true, recorded: true };
}

function filterEvents(events, { from, to, causeIds = null } = {}) {
  const idSet = causeIds ? new Set(causeIds) : null;
  return (events || []).filter((e) => {
    if (!isPublicEngagement(e)) return false;
    if (idSet && !idSet.has(e.causeId)) return false;
    const at = parseDate(e.at);
    return inBounds(at, from, to);
  });
}

function tallyEvents(events) {
  let views = 0;
  let clicks = 0;
  const viewers = new Set();
  const clickers = new Set();
  const supporters = new Set();

  events.forEach((e) => {
    const key = normalizeVisitorKey(e.visitorKey);
    if (e.type === 'cause_viewed') {
      views += 1;
      if (key) viewers.add(key);
    } else if (e.type === 'cause_card_clicked') {
      clicks += 1;
      if (key) clickers.add(key);
    } else if (e.type === 'cause_supported') {
      if (key) supporters.add(key);
    }
  });

  return {
    views,
    uniqueViewers: viewers.size,
    clicks,
    uniqueClickers: clickers.size,
    supportersFromEvents: supporters,
  };
}

function donorKey(d) {
  return d?.donorId || d?.deviceId || d?.userId || d?.emailHash || d?.id || null;
}

function supportersFromDonations(donations, causeIds, from, to) {
  const idSet = new Set(causeIds || []);
  const keys = new Set();
  (donations || []).forEach((d) => {
    const causeId = String(d.causeId || d.cause_id || '').trim();
    if (!causeId || !idSet.has(causeId)) return;
    const at = parseDate(d.date || d.createdAt || d.created_at);
    if (from != null || to != null) {
      if (!inBounds(at, from, to)) return;
    }
    const key = donorKey(d);
    if (key) keys.add(String(key));
  });
  return keys;
}

function dayKey(iso) {
  const d = parseDate(iso);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function bucketByDay(events, type) {
  const map = new Map();
  events.forEach((e) => {
    if (e.type !== type) return;
    const day = dayKey(e.at);
    if (!day) return;
    map.set(day, (map.get(day) || 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

function emptyCauseMetrics() {
  return {
    views: 0,
    uniqueViewers: 0,
    clicks: 0,
    uniqueClickers: 0,
    supporters: 0,
    raised: 0,
    donations: 0,
    supportConversionRate: null,
  };
}

/**
 * Build Cause analytics payload for one Foundation.
 * @param {object} opts
 * @param {string} opts.foundationId
 * @param {string} [opts.range='30d']
 * @param {Array} [opts.causes] - already publicCause-mapped list
 * @param {Array} [opts.donations] - successful donations for this foundation only
 */
async function buildCauseAnalyticsPayload({
  foundationId,
  range = '30d',
  causes = null,
  donations = [],
} = {}) {
  const fid = String(foundationId || '').trim();
  const rangeKey = ['7d', '30d', '90d', 'all'].includes(range) ? range : '30d';

  let causeList = causes;
  if (!causeList) {
    const ws = await readWorkspace(fid);
    causeList = (ws.causes || [])
      .filter((c) => !c.status || c.status === 'active')
      .map(publicCause)
      .filter(Boolean);
  }

  const causeIds = causeList.map((c) => c.id).filter(Boolean);
  const doc = await readCauseAnalytics(fid);
  const { from, to, days } = rangeBounds(rangeKey);

  const currentEvents = filterEvents(doc.events, { from, to, causeIds });
  const currentTally = tallyEvents(currentEvents);
  const donationSupporters = supportersFromDonations(donations, causeIds, from, to);
  const supporterUnion = new Set([
    ...currentTally.supportersFromEvents,
    ...donationSupporters,
  ]);

  // Previous equivalent period (finite ranges only)
  let comparison = { available: false };
  if (days != null && from != null) {
    const prevFrom = from - (to - from);
    const prevTo = from;
    const prevEvents = filterEvents(doc.events, { from: prevFrom, to: prevTo, causeIds });
    const prevTally = tallyEvents(prevEvents);
    const prevDonationSupporters = supportersFromDonations(donations, causeIds, prevFrom, prevTo);
    const prevSupporters = new Set([
      ...prevTally.supportersFromEvents,
      ...prevDonationSupporters,
    ]);
    comparison = {
      available: true,
      viewsChangePct: pctChange(currentTally.views, prevTally.views),
      clicksChangePct: pctChange(currentTally.clicks, prevTally.clicks),
      supportersChangePct: pctChange(supporterUnion.size, prevSupporters.size),
    };
  }

  // Per-cause metrics for the selected range
  const byCause = {};
  causeIds.forEach((id) => {
    const events = currentEvents.filter((e) => e.causeId === id);
    const tally = tallyEvents(events);
    const causeDonationSupporters = supportersFromDonations(donations, [id], from, to);
    const supporters = new Set([
      ...tally.supportersFromEvents,
      ...causeDonationSupporters,
    ]);

    let raised = 0;
    let donationCount = 0;
    (donations || []).forEach((d) => {
      const causeId = String(d.causeId || d.cause_id || '').trim();
      if (causeId !== id) return;
      const at = parseDate(d.date || d.createdAt || d.created_at);
      if (from != null || to != null) {
        if (!inBounds(at, from, to)) return;
      }
      const amount = Number(d.amount);
      if (Number.isFinite(amount) && amount > 0) {
        raised += amount;
        donationCount += 1;
      }
    });

    const supportConversionRate = tally.uniqueViewers > 0
      ? Math.round((supporters.size / tally.uniqueViewers) * 1000) / 10
      : null;

    byCause[id] = {
      views: tally.views,
      uniqueViewers: tally.uniqueViewers,
      clicks: tally.clicks,
      uniqueClickers: tally.uniqueClickers,
      supporters: supporters.size,
      raised: Math.round(raised * 100) / 100,
      donations: donationCount,
      averageDonation: donationCount > 0
        ? Math.round((raised / donationCount) * 100) / 100
        : null,
      supportConversionRate,
    };
  });

  const supportConversionRate = currentTally.uniqueViewers > 0
    ? Math.round((supporterUnion.size / currentTally.uniqueViewers) * 1000) / 10
    : null;

  // Relative distribution of views across Causes
  const totalViews = currentTally.views || 0;
  const distribution = causeList.map((c) => {
    const m = byCause[c.id] || emptyCauseMetrics();
    return {
      causeId: c.id,
      title: c.title || 'Untitled Cause',
      views: m.views,
      clicks: m.clicks,
      supporters: m.supporters,
      shareOfViews: totalViews > 0
        ? Math.round((m.views / totalViews) * 1000) / 10
        : null,
    };
  }).sort((a, b) => b.views - a.views || b.clicks - a.clicks);

  return {
    ok: true,
    range: rangeKey,
    definitions: {
      totalCauses: 'Number of active Causes belonging to this Foundation.',
      views: 'Cause detail-page view events (cause_viewed) in the selected period.',
      uniqueViewers: 'Distinct visitors who generated cause_viewed events.',
      clicks: 'Cause-card → detail entry events (cause_card_clicked) in the selected period.',
      uniqueClickers: 'Distinct visitors who generated cause_card_clicked events.',
      supporters: 'Unique World Choir donors/supporters attributed to these Causes (causeId on donation or cause_supported).',
      supportConversionRate: 'Unique supporters ÷ unique Cause viewers for the period.',
    },
    overview: {
      totalCauses: causeList.length,
      totalViews: currentTally.views,
      totalClicks: currentTally.clicks,
      supporters: supporterUnion.size,
      uniqueViewers: currentTally.uniqueViewers,
      uniqueClickers: currentTally.uniqueClickers,
      supportConversionRate,
      comparison,
    },
    byCause,
    series: {
      views: bucketByDay(currentEvents, 'cause_viewed'),
      clicks: bucketByDay(currentEvents, 'cause_card_clicked'),
      supporters: bucketByDay(currentEvents, 'cause_supported'),
    },
    distribution,
    causes: causeList,
  };
}

module.exports = {
  EVENT_TYPES,
  recordCauseEvent,
  readCauseAnalytics,
  buildCauseAnalyticsPayload,
  rangeBounds,
};
