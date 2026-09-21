/**
 * Foundation page / funnel analytics (first-party, consent-gated on client).
 * Daily aggregates in Blob — never invents numbers.
 */
const { list } = require('@vercel/blob');
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');
const { findInfluencerById } = require('./members-store');

const ANALYTICS_ROOT = 'wc-data/foundation-analytics';
const MAX_UNIQUE_IDS = 4000;

const EVENT_TYPES = new Set([
  'page_view',
  'support_click',
  'checkout_start',
  'checkout_payment',
  'checkout_success',
  'project_click',
  'project_support',
]);

function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dailyPath(foundationId, date) {
  return `${ANALYTICS_ROOT}/${foundationId}/daily/${date}.json`;
}

function emptyDailyRow(foundationId, date) {
  return {
    foundationId,
    date,
    pageViews: 0,
    uniqueViewers: [],
    supportClicks: 0,
    uniqueSupportClickers: [],
    checkoutStarts: 0,
    uniqueCheckoutStarters: [],
    checkoutPayments: 0,
    uniqueCheckoutPayers: [],
    checkoutSuccesses: 0,
    uniqueCheckoutSuccess: [],
    projects: {},
    updatedAt: null,
  };
}

function capUnique(list, nextId) {
  const set = new Set(Array.isArray(list) ? list : []);
  if (nextId) set.add(String(nextId));
  const arr = [...set];
  if (arr.length <= MAX_UNIQUE_IDS) return arr;
  return arr.slice(arr.length - MAX_UNIQUE_IDS);
}

async function readDailyRow(foundationId, date) {
  const row = await readBlobJson(dailyPath(foundationId, date));
  if (!row || typeof row !== 'object') return emptyDailyRow(foundationId, date);
  return {
    ...emptyDailyRow(foundationId, date),
    ...row,
    projects: row.projects && typeof row.projects === 'object' ? row.projects : {},
  };
}

function ensureProjectBucket(row, projectId, projectTitle) {
  const id = String(projectId || '').trim();
  if (!id) return null;
  if (!row.projects[id]) {
    row.projects[id] = {
      projectId: id,
      title: String(projectTitle || '').trim().slice(0, 120),
      clicks: 0,
      supportClicks: 0,
    };
  } else if (projectTitle && !row.projects[id].title) {
    row.projects[id].title = String(projectTitle).trim().slice(0, 120);
  }
  return row.projects[id];
}

/**
 * Record one analytics event for a foundation.
 */
async function recordFoundationAnalyticsEvent({
  foundationId,
  eventType,
  visitorId = null,
  projectId = null,
  projectTitle = null,
} = {}) {
  assertBlobConfigured();
  const id = String(foundationId || '').trim();
  if (!id) {
    const err = new Error('foundationId is required');
    err.code = 'INVALID';
    throw err;
  }

  const type = String(eventType || '').trim();
  if (!EVENT_TYPES.has(type)) {
    const err = new Error('Invalid event type');
    err.code = 'INVALID';
    throw err;
  }

  const foundation = await findInfluencerById(id);
  if (!foundation || foundation.active === false) {
    const err = new Error('Foundation not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const date = utcDateString();
  const row = await readDailyRow(id, date);
  const visitor = String(visitorId || '').trim() || null;

  if (type === 'page_view') {
    row.pageViews += 1;
    if (visitor) row.uniqueViewers = capUnique(row.uniqueViewers, visitor);
  } else if (type === 'support_click') {
    row.supportClicks += 1;
    if (visitor) row.uniqueSupportClickers = capUnique(row.uniqueSupportClickers, visitor);
  } else if (type === 'checkout_start') {
    row.checkoutStarts += 1;
    if (visitor) row.uniqueCheckoutStarters = capUnique(row.uniqueCheckoutStarters, visitor);
  } else if (type === 'checkout_payment') {
    row.checkoutPayments += 1;
    if (visitor) row.uniqueCheckoutPayers = capUnique(row.uniqueCheckoutPayers, visitor);
  } else if (type === 'checkout_success') {
    row.checkoutSuccesses += 1;
    if (visitor) row.uniqueCheckoutSuccess = capUnique(row.uniqueCheckoutSuccess, visitor);
  } else if (type === 'project_click' || type === 'project_support') {
    const bucket = ensureProjectBucket(row, projectId, projectTitle);
    if (bucket) {
      if (type === 'project_click') bucket.clicks += 1;
      else bucket.supportClicks += 1;
    }
    if (type === 'project_support') {
      row.supportClicks += 1;
      if (visitor) row.uniqueSupportClickers = capUnique(row.uniqueSupportClickers, visitor);
    }
  }

  row.updatedAt = new Date().toISOString();
  await writeJson(dailyPath(id, date), row, { overwrite: true });
  return { ok: true, date };
}

function dateKeysBetween(fromMs, toMs) {
  const keys = [];
  if (fromMs == null && toMs == null) return null; // means "all" — list from blob
  const start = new Date(fromMs != null ? fromMs : toMs);
  const end = new Date(toMs != null ? toMs : Date.now());
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    keys.push(utcDateString(new Date(t)));
  }
  return keys;
}

async function listDailyDateKeys(foundationId) {
  assertBlobConfigured();
  const prefix = `${ANALYTICS_ROOT}/${foundationId}/daily/`;
  const { blobs } = await list({ prefix, limit: 1000 });
  return (blobs || [])
    .map((b) => {
      const name = String(b.pathname || '').split('/').pop() || '';
      return name.replace(/\.json$/i, '');
    })
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
}

/**
 * Aggregate funnel + content for a foundation over a time range.
 * @param {string} foundationId
 * @param {{ from?: number|null, to?: number|null }} bounds ms timestamps from rangeBounds
 */
async function summarizeFoundationPageAnalytics(foundationId, bounds = {}) {
  const id = String(foundationId || '').trim();
  if (!id) {
    return {
      available: false,
      note: 'Foundation id missing.',
      trackingSince: null,
      pageViews: 0,
      uniqueViewers: 0,
      supportClicks: 0,
      uniqueSupportClickers: 0,
      checkoutStarts: 0,
      checkoutPayments: 0,
      checkoutSuccesses: 0,
      conversionRate: null,
      conversionNote: null,
      funnel: { available: false, stages: [] },
      contentPerformance: { available: false, projects: [] },
    };
  }

  let dateKeys;
  try {
    if (bounds.from == null && bounds.to == null) {
      dateKeys = await listDailyDateKeys(id);
    } else {
      dateKeys = dateKeysBetween(bounds.from, bounds.to) || [];
    }
  } catch {
    dateKeys = [];
  }

  const totals = {
    pageViews: 0,
    supportClicks: 0,
    checkoutStarts: 0,
    checkoutPayments: 0,
    checkoutSuccesses: 0,
  };
  const viewers = new Set();
  const supportClickers = new Set();
  const checkoutStarters = new Set();
  const checkoutPayers = new Set();
  const checkoutSuccess = new Set();
  const projects = {};
  let trackingSince = null;

  await Promise.all(dateKeys.map(async (date) => {
    const row = await readDailyRow(id, date).catch(() => null);
    if (!row || !row.updatedAt) return;
    if (!trackingSince || row.date < trackingSince) trackingSince = row.date;
    totals.pageViews += Number(row.pageViews || 0);
    totals.supportClicks += Number(row.supportClicks || 0);
    totals.checkoutStarts += Number(row.checkoutStarts || 0);
    totals.checkoutPayments += Number(row.checkoutPayments || 0);
    totals.checkoutSuccesses += Number(row.checkoutSuccesses || 0);
    (row.uniqueViewers || []).forEach((v) => viewers.add(v));
    (row.uniqueSupportClickers || []).forEach((v) => supportClickers.add(v));
    (row.uniqueCheckoutStarters || []).forEach((v) => checkoutStarters.add(v));
    (row.uniqueCheckoutPayers || []).forEach((v) => checkoutPayers.add(v));
    (row.uniqueCheckoutSuccess || []).forEach((v) => checkoutSuccess.add(v));
    Object.values(row.projects || {}).forEach((p) => {
      if (!p?.projectId) return;
      if (!projects[p.projectId]) {
        projects[p.projectId] = {
          projectId: p.projectId,
          title: p.title || p.projectId,
          clicks: 0,
          supportClicks: 0,
        };
      }
      projects[p.projectId].clicks += Number(p.clicks || 0);
      projects[p.projectId].supportClicks += Number(p.supportClicks || 0);
      if (p.title) projects[p.projectId].title = p.title;
    });
  }));

  const uniqueViewers = viewers.size;
  const uniqueDonorsTracked = checkoutSuccess.size;
  const conversionRate = uniqueViewers > 0
    ? Math.round((uniqueDonorsTracked / uniqueViewers) * 1000) / 10
    : null;

  const hasAny = totals.pageViews > 0
    || totals.supportClicks > 0
    || totals.checkoutStarts > 0
    || totals.checkoutSuccesses > 0
    || Object.keys(projects).length > 0;

  const funnelStages = [
    { id: 'view', label: 'Page views', count: totals.pageViews, unique: uniqueViewers },
    { id: 'support', label: 'Support clicks', count: totals.supportClicks, unique: supportClickers.size },
    { id: 'checkout', label: 'Checkout started', count: totals.checkoutStarts, unique: checkoutStarters.size },
    { id: 'payment', label: 'Payment step', count: totals.checkoutPayments, unique: checkoutPayers.size },
    { id: 'success', label: 'Completed gifts', count: totals.checkoutSuccesses, unique: uniqueDonorsTracked },
  ];

  const projectList = Object.values(projects)
    .sort((a, b) => (b.supportClicks + b.clicks) - (a.supportClicks + a.clicks))
    .slice(0, 10);

  return {
    available: hasAny,
    note: hasAny
      ? null
      : 'Tracking is live. Numbers appear after visitors open this Foundation with analytics accepted.',
    trackingSince,
    pageViews: totals.pageViews,
    uniqueViewers,
    supportClicks: totals.supportClicks,
    uniqueSupportClickers: supportClickers.size,
    checkoutStarts: totals.checkoutStarts,
    checkoutPayments: totals.checkoutPayments,
    checkoutSuccesses: totals.checkoutSuccesses,
    conversionRate,
    conversionNote: uniqueViewers > 0
      ? 'Unique visitors who completed a gift ÷ unique page viewers (analytics consent).'
      : (hasAny
        ? 'Conversion needs page views in this period.'
        : 'Tracking is live. Conversion appears after consented page views are recorded.'),
    funnel: {
      available: hasAny,
      note: hasAny ? null : 'Funnel stages populate from Donate page activity.',
      stages: funnelStages,
    },
    contentPerformance: {
      available: projectList.length > 0,
      note: projectList.length
        ? null
        : 'Project engagement appears when visitors open or support a project.',
      projects: projectList,
    },
  };
}

module.exports = {
  EVENT_TYPES,
  recordFoundationAnalyticsEvent,
  summarizeFoundationPageAnalytics,
};
