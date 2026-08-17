/**
 * Daily Acts of Peace — Sponsorship / Partnership system
 *
 * Assignment priority (documented):
 * 1. Specific Calendar Day — active partnership for calendar date overrides daily pick
 * 2. Random Journey Day — user's Nth assignment uses sponsored act when slot matches
 * 3. Standard catalog pick — existing deterministic daily assignment
 *
 * Data is stored in Vercel Blob (real data only — no mock analytics).
 */
const { randomUUID } = require('crypto');
const {
  readBlobJson,
  writeJson,
  putPrivateBinary,
  mediaProxyUrl,
  assertBlobConfigured,
} = require('./store');

const PARTNERSHIPS_ROOT = 'wc-data/daily-peace/partnerships';
const PARTNERSHIPS_INDEX = `${PARTNERSHIPS_ROOT}/index.json`;
const COMPANY_ACTS_ROOT = 'wc-data/daily-peace/company-acts';
const USER_SLOTS_ROOT = 'wc-data/daily-peace/user-sponsor-slots';
const SPONSOR_EVENTS_ROOT = 'wc-data/daily-peace/sponsor-events';
const SPONSOR_ANALYTICS_ROOT = 'wc-data/daily-peace/sponsor-analytics';
const AUDIT_ROOT = 'wc-data/daily-peace/partnership-audit';

const STATUSES = new Set(['draft', 'scheduled', 'active', 'expired', 'paused', 'cancelled']);
const PAYMENT_STATUSES = new Set(['pending', 'partially_paid', 'paid', 'overdue', 'cancelled']);
const PARTNERSHIP_TYPES = new Set(['sponsored_standard', 'company_created']);
const ASSIGNMENT_METHODS = new Set(['random', 'specific_date']);
const THEME_IDS = new Set([
  'kindness', 'connection', 'courage', 'compassion',
  'understanding', 'generosity', 'presence', 'community',
]);

const IMAGE_MIME_RE = /^image\/[a-z0-9.+-]+$/i;
const IMAGE_EXT_MAP = {
  png: 'png',
  jpeg: 'jpg',
  jpg: 'jpg',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
  bmp: 'bmp',
  tiff: 'tiff',
  tif: 'tiff',
  heic: 'heic',
  heif: 'heif',
  svg: 'svg',
  'svg+xml': 'svg',
  ico: 'ico',
  'x-icon': 'ico',
  jfif: 'jpg',
  pjpeg: 'jpg',
  pjp: 'jpg',
};

let partnershipsCache = null;
let partnershipsCacheAt = 0;
const CACHE_MS = 8000;

function getUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function loadCatalogActs() {
  const catalog = require('../data/daily-acts-of-peace.json');
  return (catalog.acts || []).filter((a) => a.active !== false);
}

function getCatalogActCount() {
  return loadCatalogActs().length;
}

function partnershipPath(id) {
  return `${PARTNERSHIPS_ROOT}/${id}.json`;
}

function companyActPath(actId) {
  return `${COMPANY_ACTS_ROOT}/${actId}.json`;
}

function userSlotsPath(userId) {
  return `${USER_SLOTS_ROOT}/${userId}.json`;
}

function sponsorEventPath(partnershipId, eventId) {
  return `${SPONSOR_EVENTS_ROOT}/${partnershipId}/${eventId}.json`;
}

function sponsorDailyAnalyticsPath(partnershipId, date) {
  return `${SPONSOR_ANALYTICS_ROOT}/${partnershipId}/daily/${date}.json`;
}

function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.href;
  } catch {
    return '';
  }
}

function effectiveStatus(partnership, today = getUtcDateString()) {
  const status = partnership.status || 'draft';
  if (status === 'cancelled' || status === 'paused' || status === 'draft') return status;
  const start = partnership.startDate;
  const end = partnership.endDate;
  if (end && end < today) return 'expired';
  if (start && start > today) return 'scheduled';
  if (status === 'scheduled' || status === 'active') return 'active';
  return status;
}

function isPartnershipLive(partnership, today = getUtcDateString()) {
  return effectiveStatus(partnership, today) === 'active';
}

function publicSponsorship(partnership) {
  if (!partnership || !isPartnershipLive(partnership)) return null;
  return {
    partnershipId: partnership.id,
    companyName: partnership.companyName,
    companyLogoUrl: partnership.companyLogoUrl || null,
    companyWebsiteUrl: partnership.companyWebsiteUrl || null,
    partnershipType: partnership.partnershipType,
    assignmentMethod: partnership.assignmentMethod,
  };
}

async function readCompanyAct(actId) {
  try {
    return await readBlobJson(companyActPath(actId));
  } catch {
    return null;
  }
}

async function getAllActsById() {
  const map = new Map(loadCatalogActs().map((a) => [a.id, a]));
  assertBlobConfigured();
  const { list } = require('@vercel/blob');
  const { blobs } = await list({ prefix: `${COMPANY_ACTS_ROOT}/`, limit: 500 });
  await Promise.all(
    blobs.filter((b) => b.pathname.endsWith('.json')).map(async (blob) => {
      try {
        const act = await readBlobJson(blob.pathname);
        if (act?.id) map.set(act.id, act);
      } catch {
        /* ignore */
      }
    })
  );
  return map;
}

async function invalidatePartnershipsCache() {
  partnershipsCache = null;
  partnershipsCacheAt = 0;
}

async function loadAllPartnerships({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && partnershipsCache && now - partnershipsCacheAt < CACHE_MS) {
    return partnershipsCache;
  }
  assertBlobConfigured();
  let index = [];
  try {
    index = await readBlobJson(PARTNERSHIPS_INDEX);
  } catch {
    index = [];
  }
  if (!Array.isArray(index)) index = [];

  const partnerships = await Promise.all(
    index.map(async (entry) => {
      const id = typeof entry === 'string' ? entry : entry?.id;
      if (!id) return null;
      try {
        return await readBlobJson(partnershipPath(id));
      } catch {
        return null;
      }
    })
  );

  partnershipsCache = partnerships.filter(Boolean);
  partnershipsCacheAt = now;
  return partnershipsCache;
}

async function savePartnershipIndex(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  await writeJson(PARTNERSHIPS_INDEX, unique, { overwrite: true });
}

async function appendAuditLog(action, partnershipId, details = {}) {
  assertBlobConfigured();
  const entry = {
    id: randomUUID(),
    action,
    partnershipId,
    details,
    at: new Date().toISOString(),
  };
  await writeJson(`${AUDIT_ROOT}/${entry.id}.json`, entry, { overwrite: false });
  return entry;
}

function normalizeDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const eu = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
  if (eu) {
    const day = Number(eu[1]);
    const month = Number(eu[2]);
    const year = eu[3];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) {
    return new Date(iso).toISOString().slice(0, 10);
  }
  return '';
}

function validatePartnershipPayload(data, { partial = false } = {}) {
  const errors = [];
  const p = data || {};
  if (p.startDate !== undefined) p.startDate = normalizeDate(p.startDate) || p.startDate;
  if (p.endDate !== undefined) p.endDate = normalizeDate(p.endDate) || p.endDate;
  if (p.specificDate !== undefined) p.specificDate = normalizeDate(p.specificDate) || p.specificDate;

  if (!partial || p.companyName !== undefined) {
    if (!String(p.companyName || '').trim()) errors.push('Company name is required');
  }
  if (!partial || p.companyWebsiteUrl !== undefined) {
    const url = normalizeUrl(p.companyWebsiteUrl);
    if (!url) errors.push('A valid company website URL is required');
  }
  if (!partial || p.startDate !== undefined) {
    if (!normalizeDate(p.startDate)) errors.push('Partnership start date is required');
  }
  if (!partial || p.endDate !== undefined) {
    if (!normalizeDate(p.endDate)) errors.push('Partnership end date is required');
  }
  const start = normalizeDate(p.startDate);
  const end = normalizeDate(p.endDate);
  if (start && end && end < start) {
    errors.push('End date must be on or after start date');
  }
  if (!partial || p.partnershipType !== undefined) {
    if (!PARTNERSHIP_TYPES.has(p.partnershipType)) errors.push('Partnership type is required');
  }
  if (!partial || p.assignmentMethod !== undefined) {
    if (!ASSIGNMENT_METHODS.has(p.assignmentMethod)) errors.push('Assignment method is required');
  }
  if (p.assignmentMethod === 'specific_date') {
    const specific = normalizeDate(p.specificDate);
    if (!specific) {
      errors.push('Specific calendar date is required');
    } else if (start && end && (specific < start || specific > end)) {
      errors.push('Specific date must fall within the partnership period');
    }
  }
  if (p.assignmentMethod === 'random') {
    const min = Number(p.randomMinDay);
    const max = Number(p.randomMaxDay);
    const catalogMax = getCatalogActCount();
    if (!Number.isFinite(min) || min < 1) errors.push('Random minimum journey day must be at least 1');
    if (!Number.isFinite(max) || max < min) errors.push('Random maximum journey day must be ≥ minimum');
    if (max > catalogMax) errors.push(`Random maximum cannot exceed ${catalogMax} (catalog size)`);
  }
  if (p.partnershipType === 'company_created') {
    const act = p.companyAct || {};
    if (!String(act.text || act.title || '').trim()) errors.push('Act title is required');
    if (!String(act.explanation || act.description || '').trim()) errors.push('Act description is required');
    if (!THEME_IDS.has(String(act.category || ''))) errors.push('Act category is required');
  } else if (!partial || p.actId !== undefined) {
    if (!String(p.actId || '').trim()) errors.push('Daily Act selection is required');
  }
  if (p.paymentStatus && !PAYMENT_STATUSES.has(p.paymentStatus)) {
    errors.push('Invalid payment status');
  }
  return errors;
}

async function findSpecificDateConflict(date, excludeId = null) {
  const all = await loadAllPartnerships();
  return all.find((p) => {
    if (p.id === excludeId) return false;
    if (p.assignmentMethod !== 'specific_date') return false;
    if (p.specificDate !== date) return false;
    const status = effectiveStatus(p);
    return status === 'active' || status === 'scheduled';
  }) || null;
}

async function resolveActiveSpecificDatePartnership(date) {
  const all = await loadAllPartnerships();
  return all.find((p) => {
    if (p.assignmentMethod !== 'specific_date') return false;
    if (p.specificDate !== date) return false;
    return isPartnershipLive(p, date);
  }) || null;
}

async function readUserSlots(userId) {
  try {
    const data = await readBlobJson(userSlotsPath(userId));
    return data && typeof data === 'object' ? data : { userId, slots: {} };
  } catch {
    return { userId, slots: {} };
  }
}

async function writeUserSlots(userId, data) {
  await writeJson(userSlotsPath(userId), data, { overwrite: true });
}

function computeRandomJourneyDay(userId, partnershipId, minDay, maxDay, currentAssignmentCount) {
  const seed = hashString(`${userId}:${partnershipId}:sponsor-v1`);
  const range = Math.max(1, maxDay - minDay + 1);
  let day = minDay + (seed % range);
  const floor = Math.max(minDay, currentAssignmentCount + 1);
  if (day < floor) {
    if (floor > maxDay) return null;
    day = floor + (seed % (maxDay - floor + 1));
  }
  return day;
}

async function countUserAssignments(userId) {
  const { listUserAssignmentRows } = require('./daily-peace');
  const rows = await listUserAssignmentRows(userId);
  return rows.length;
}

async function userHasReceivedAct(userId, actId) {
  const { listUserAssignmentRows } = require('./daily-peace');
  const rows = await listUserAssignmentRows(userId);
  return rows.some((r) => r.act_id === actId);
}

async function ensureUserSponsorSlots(userId) {
  const all = await loadAllPartnerships();
  const randomActive = all.filter((p) => p.assignmentMethod === 'random' && isPartnershipLive(p));
  if (!randomActive.length) return;

  const slotsDoc = await readUserSlots(userId);
  const slots = { ...(slotsDoc.slots || {}) };
  const assignmentCount = await countUserAssignments(userId);
  let changed = false;

  for (const p of randomActive) {
    if (slots[p.id]) continue;
    if (await userHasReceivedAct(userId, p.actId)) continue;

    const journeyDay = computeRandomJourneyDay(
      userId,
      p.id,
      Number(p.randomMinDay) || 1,
      Number(p.randomMaxDay) || getCatalogActCount(),
      assignmentCount
    );
    if (!journeyDay) continue;

    slots[p.id] = {
      partnershipId: p.id,
      actId: p.actId,
      journeyDay,
      assignedAt: new Date().toISOString(),
    };
    changed = true;
  }

  if (changed) {
    await writeUserSlots(userId, { userId, slots });
  }
}

async function resolveRandomSponsorshipForJourneyDay(userId, journeyDay) {
  await ensureUserSponsorSlots(userId);
  const slotsDoc = await readUserSlots(userId);
  const slots = slotsDoc.slots || {};
  const match = Object.values(slots).find((s) => s.journeyDay === journeyDay);
  if (!match) return null;

  const partnership = (await loadAllPartnerships()).find((p) => p.id === match.partnershipId);
  if (!partnership || !isPartnershipLive(partnership)) return null;
  if (await userHasReceivedAct(userId, match.actId)) return null;
  return { partnership, actId: match.actId };
}

/**
 * Resolve sponsorship for a brand-new daily assignment.
 * Returns { act, partnershipId } or null.
 */
async function resolveSponsorshipForNewAssignment(user, date) {
  const specific = await resolveActiveSpecificDatePartnership(date);
  if (specific) {
    const actsById = await getAllActsById();
    const act = actsById.get(specific.actId);
    if (act) return { act, partnershipId: specific.id, partnership: specific };
  }

  const journeyDay = (await countUserAssignments(user.id)) + 1;
  const randomMatch = await resolveRandomSponsorshipForJourneyDay(user.id, journeyDay);
  if (randomMatch) {
    const actsById = await getAllActsById();
    const act = actsById.get(randomMatch.actId);
    if (act) {
      return {
        act,
        partnershipId: randomMatch.partnership.id,
        partnership: randomMatch.partnership,
      };
    }
  }

  return null;
}

async function getPartnershipById(id) {
  try {
    return await readBlobJson(partnershipPath(id));
  } catch {
    return null;
  }
}

async function getSponsorshipForAssignmentRow(row) {
  if (!row?.partnership_id) return null;
  const partnership = await getPartnershipById(row.partnership_id);
  return publicSponsorship(partnership);
}

async function recordSponsorEvent({
  partnershipId,
  userId,
  eventType,
  date,
  city = null,
  country = null,
  platform = 'web',
  meta = {},
}) {
  assertBlobConfigured();
  const allowed = new Set([
    'daily_act_assigned',
    'daily_act_viewed',
    'daily_act_completed',
    'sponsor_logo_impression',
    'sponsor_logo_clicked',
    'external_destination_opened',
  ]);
  if (!allowed.has(eventType)) throw new Error('invalid sponsor event');

  const eventId = randomUUID();
  const now = new Date().toISOString();
  const event = {
    id: eventId,
    partnershipId,
    userId,
    eventType,
    date: date || getUtcDateString(),
    timestamp: now,
    city: city || null,
    country: country || null,
    platform: platform || 'web',
    meta: meta && typeof meta === 'object' ? meta : {},
  };

  await writeJson(sponsorEventPath(partnershipId, eventId), event, { overwrite: false });
  await incrementDailyAnalytics(partnershipId, event.date, eventType, userId, meta);
  return event;
}

async function readDailyAnalytics(partnershipId, date) {
  try {
    return await readBlobJson(sponsorDailyAnalyticsPath(partnershipId, date));
  } catch {
    return {
      partnershipId,
      date,
      reached: 0,
      viewed: 0,
      completed: 0,
      logoImpressions: 0,
      uniqueLogoClicks: 0,
      totalLogoClicks: 0,
      uniqueUsersReached: [],
      uniqueUsersViewed: [],
      uniqueUsersCompleted: [],
      uniqueUsersClicked: [],
      countries: {},
      cities: {},
    };
  }
}

async function incrementDailyAnalytics(partnershipId, date, eventType, userId, meta = {}) {
  const row = await readDailyAnalytics(partnershipId, date);
  const uReached = new Set(row.uniqueUsersReached || []);
  const uViewed = new Set(row.uniqueUsersViewed || []);
  const uCompleted = new Set(row.uniqueUsersCompleted || []);
  const uClicked = new Set(row.uniqueUsersClicked || []);

  if (eventType === 'daily_act_assigned') {
    row.reached = Number(row.reached || 0) + 1;
    uReached.add(userId);
  }
  if (eventType === 'daily_act_viewed') {
    row.viewed = Number(row.viewed || 0) + 1;
    uViewed.add(userId);
  }
  if (eventType === 'daily_act_completed') {
    row.completed = Number(row.completed || 0) + 1;
    uCompleted.add(userId);
  }
  if (eventType === 'sponsor_logo_impression') {
    row.logoImpressions = Number(row.logoImpressions || 0) + 1;
  }
  if (eventType === 'sponsor_logo_clicked' || eventType === 'external_destination_opened') {
    row.totalLogoClicks = Number(row.totalLogoClicks || 0) + 1;
    uClicked.add(userId);
  }

  row.uniqueUsersReached = [...uReached];
  row.uniqueUsersViewed = [...uViewed];
  row.uniqueUsersCompleted = [...uCompleted];
  row.uniqueUsersClicked = [...uClicked];
  row.uniqueLogoClicks = uClicked.size;

  const country = meta.country || null;
  const city = meta.city || null;
  if (country) {
    row.countries = row.countries || {};
    row.countries[country] = row.countries[country] || { reached: 0, viewed: 0, completed: 0, clicks: 0 };
    if (eventType === 'daily_act_assigned') row.countries[country].reached += 1;
    if (eventType === 'daily_act_viewed') row.countries[country].viewed += 1;
    if (eventType === 'daily_act_completed') row.countries[country].completed += 1;
    if (eventType.includes('click')) row.countries[country].clicks += 1;
  }
  if (city && country) {
    const key = `${city}|${country}`;
    row.cities = row.cities || {};
    row.cities[key] = row.cities[key] || { city, country, reached: 0, viewed: 0, completed: 0, clicks: 0 };
    if (eventType === 'daily_act_assigned') row.cities[key].reached += 1;
    if (eventType === 'daily_act_viewed') row.cities[key].viewed += 1;
    if (eventType === 'daily_act_completed') row.cities[key].completed += 1;
    if (eventType.includes('click')) row.cities[key].clicks += 1;
  }

  await writeJson(sponsorDailyAnalyticsPath(partnershipId, date), row, { overwrite: true });
  return row;
}

async function aggregatePartnershipAnalytics(partnershipId) {
  assertBlobConfigured();
  const { list } = require('@vercel/blob');
  const prefix = `${SPONSOR_ANALYTICS_ROOT}/${partnershipId}/daily/`;
  const { blobs } = await list({ prefix, limit: 1000 });

  const totals = {
    reach: 0,
    views: 0,
    completions: 0,
    logoImpressions: 0,
    uniqueLogoClicks: 0,
    totalLogoClicks: 0,
    uniqueUsersReached: new Set(),
    uniqueUsersViewed: new Set(),
    uniqueUsersCompleted: new Set(),
    uniqueUsersClicked: new Set(),
    daily: [],
    countries: {},
    cities: {},
  };

  for (const blob of blobs) {
    if (!blob.pathname.endsWith('.json')) continue;
    let row;
    try {
      row = await readBlobJson(blob.pathname);
    } catch {
      continue;
    }
    totals.reach += Number(row.reached || 0);
    totals.views += Number(row.viewed || 0);
    totals.completions += Number(row.completed || 0);
    totals.logoImpressions += Number(row.logoImpressions || 0);
    totals.totalLogoClicks += Number(row.totalLogoClicks || 0);
    (row.uniqueUsersReached || []).forEach((u) => totals.uniqueUsersReached.add(u));
    (row.uniqueUsersViewed || []).forEach((u) => totals.uniqueUsersViewed.add(u));
    (row.uniqueUsersCompleted || []).forEach((u) => totals.uniqueUsersCompleted.add(u));
    (row.uniqueUsersClicked || []).forEach((u) => totals.uniqueUsersClicked.add(u));

    totals.daily.push({
      date: row.date,
      reached: row.reached || 0,
      viewed: row.viewed || 0,
      completed: row.completed || 0,
      logoImpressions: row.logoImpressions || 0,
      uniqueClicks: row.uniqueLogoClicks || 0,
      totalClicks: row.totalLogoClicks || 0,
    });

    for (const [country, stats] of Object.entries(row.countries || {})) {
      totals.countries[country] = totals.countries[country] || { reached: 0, viewed: 0, completed: 0, clicks: 0 };
      totals.countries[country].reached += stats.reached || 0;
      totals.countries[country].viewed += stats.viewed || 0;
      totals.countries[country].completed += stats.completed || 0;
      totals.countries[country].clicks += stats.clicks || 0;
    }
    for (const [, stats] of Object.entries(row.cities || {})) {
      const key = `${stats.city}|${stats.country}`;
      totals.cities[key] = totals.cities[key] || { ...stats, reached: 0, viewed: 0, completed: 0, clicks: 0 };
      totals.cities[key].reached += stats.reached || 0;
      totals.cities[key].viewed += stats.viewed || 0;
      totals.cities[key].completed += stats.completed || 0;
      totals.cities[key].clicks += stats.clicks || 0;
    }
  }

  totals.daily.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const uniqueReach = totals.uniqueUsersReached.size;
  const uniqueViews = totals.uniqueUsersViewed.size;
  const uniqueCompletions = totals.uniqueUsersCompleted.size;
  totals.uniqueLogoClicks = totals.uniqueUsersClicked.size;
  totals.completionRate = uniqueViews ? (uniqueCompletions / uniqueViews) * 100 : 0;
  totals.ctrUnique = totals.logoImpressions ? (totals.uniqueLogoClicks / totals.logoImpressions) * 100 : 0;
  totals.ctrTotal = totals.logoImpressions ? (totals.totalLogoClicks / totals.logoImpressions) * 100 : 0;
  totals.actOpenRate = uniqueReach ? (uniqueViews / uniqueReach) * 100 : 0;
  totals.reach = uniqueReach || totals.reach;
  totals.views = uniqueViews || totals.views;
  totals.completions = uniqueCompletions || totals.completions;

  delete totals.uniqueUsersReached;
  delete totals.uniqueUsersViewed;
  delete totals.uniqueUsersCompleted;
  delete totals.uniqueUsersClicked;

  return totals;
}

async function writeCompanyAct(partnership) {
  const act = partnership.companyAct || {};
  const actId = partnership.actId || `dap-co-${partnership.id.slice(0, 8)}`;
  const record = {
    id: actId,
    text: String(act.text || act.title || '').trim(),
    explanation: String(act.explanation || act.description || '').trim(),
    category: act.category,
    active: true,
    reflectionPrompt: act.reflectionPrompt || 'What would you like to remember about this act?',
    source: 'company_created',
    partnershipId: partnership.id,
  };
  await writeJson(companyActPath(actId), record, { overwrite: true });
  return actId;
}

async function createPartnership(payload) {
  assertBlobConfigured();
  const errors = validatePartnershipPayload(payload);
  if (errors.length) throw new Error(errors.join('; '));

  const id = randomUUID();
  const now = new Date().toISOString();
  let actId = payload.actId || null;

  if (payload.partnershipType === 'company_created') {
    actId = `dap-co-${id.slice(0, 8)}`;
  } else {
    const catalog = loadCatalogActs();
    if (!catalog.some((a) => a.id === actId)) throw new Error('Selected Daily Act not found in catalog');
  }

  if (payload.assignmentMethod === 'specific_date') {
    const conflict = await findSpecificDateConflict(payload.specificDate);
    if (conflict) {
      throw new Error(`This date already has a sponsored Daily Act (${conflict.companyName}).`);
    }
  }

  const partnership = {
    id,
    status: 'draft',
    partnershipType: payload.partnershipType,
    actId,
    companyName: String(payload.companyName).trim(),
    companyLogoUrl: payload.companyLogoUrl || null,
    companyWebsiteUrl: normalizeUrl(payload.companyWebsiteUrl),
    startDate: normalizeDate(payload.startDate),
    endDate: normalizeDate(payload.endDate),
    contractedAmount: Number(payload.contractedAmount) || 0,
    currency: String(payload.currency || 'EUR').trim().toUpperCase(),
    paymentStatus: payload.paymentStatus || 'pending',
    internalNotes: String(payload.internalNotes || '').trim(),
    assignmentMethod: payload.assignmentMethod,
    specificDate: payload.assignmentMethod === 'specific_date' ? normalizeDate(payload.specificDate) : null,
    randomMinDay: payload.assignmentMethod === 'random' ? Number(payload.randomMinDay) : null,
    randomMaxDay: payload.assignmentMethod === 'random' ? Number(payload.randomMaxDay) : null,
    companyAct: payload.partnershipType === 'company_created' ? {
      text: String(payload.companyAct.text || payload.companyAct.title || '').trim(),
      explanation: String(payload.companyAct.explanation || payload.companyAct.description || '').trim(),
      category: payload.companyAct.category,
      reflectionPrompt: payload.companyAct.reflectionPrompt || null,
    } : null,
    isTest: !!payload.isTest,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };

  await writeJson(partnershipPath(id), partnership, { overwrite: false });
  const index = await loadAllPartnerships({ fresh: true });
  await savePartnershipIndex([...index.map((p) => p.id), id]);
  await invalidatePartnershipsCache();
  await appendAuditLog('partnership_created', id, { companyName: partnership.companyName });
  return partnership;
}

async function updatePartnership(id, payload) {
  const existing = await getPartnershipById(id);
  if (!existing) throw new Error('Partnership not found');

  const merged = {
    ...existing,
    ...payload,
    id: existing.id,
    startDate: payload.startDate != null ? normalizeDate(payload.startDate) : existing.startDate,
    endDate: payload.endDate != null ? normalizeDate(payload.endDate) : existing.endDate,
    specificDate: payload.specificDate != null ? normalizeDate(payload.specificDate) : existing.specificDate,
    companyWebsiteUrl: payload.companyWebsiteUrl != null
      ? normalizeUrl(payload.companyWebsiteUrl)
      : existing.companyWebsiteUrl,
    updatedAt: new Date().toISOString(),
  };

  if (payload.assignmentMethod === 'specific_date' && payload.specificDate) {
    const conflict = await findSpecificDateConflict(payload.specificDate, id);
    if (conflict) {
      throw new Error(`This date already has a sponsored Daily Act (${conflict.companyName}).`);
    }
  }

  const errors = validatePartnershipPayload(merged);
  if (errors.length) throw new Error(errors.join('; '));

  if (merged.partnershipType === 'company_created' && merged.companyAct) {
    merged.companyAct = {
      text: String(merged.companyAct.text || merged.companyAct.title || '').trim(),
      explanation: String(merged.companyAct.explanation || merged.companyAct.description || '').trim(),
      category: merged.companyAct.category,
      reflectionPrompt: merged.companyAct.reflectionPrompt || null,
    };
  }

  await writeJson(partnershipPath(id), merged, { overwrite: true });
  await invalidatePartnershipsCache();
  await appendAuditLog('partnership_updated', id, { fields: Object.keys(payload || {}) });
  return merged;
}

async function publishPartnership(id) {
  const p = await getPartnershipById(id);
  if (!p) throw new Error('Partnership not found');

  const check = {
    ...p,
    companyLogoUrl: p.companyLogoUrl,
  };
  const errors = validatePartnershipPayload(check);
  if (!p.companyLogoUrl) errors.push('Company logo is required before publishing');
  if (errors.length) throw new Error(errors.join('; '));

  if (p.assignmentMethod === 'specific_date') {
    const conflict = await findSpecificDateConflict(p.specificDate, id);
    if (conflict) throw new Error(`Date conflict with ${conflict.companyName}`);
  }

  let actId = p.actId;
  if (p.partnershipType === 'company_created') {
    actId = await writeCompanyAct(p);
  }

  const today = getUtcDateString();
  let status = 'active';
  if (p.startDate > today) status = 'scheduled';

  const updated = {
    ...p,
    actId,
    status,
    publishedAt: p.publishedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeJson(partnershipPath(id), updated, { overwrite: true });
  await invalidatePartnershipsCache();
  await appendAuditLog('partnership_published', id, { status });
  return updated;
}

async function setPartnershipStatus(id, status) {
  if (!STATUSES.has(status)) throw new Error('Invalid status');
  const p = await getPartnershipById(id);
  if (!p) throw new Error('Partnership not found');
  const updated = { ...p, status, updatedAt: new Date().toISOString() };
  await writeJson(partnershipPath(id), updated, { overwrite: true });
  await invalidatePartnershipsCache();
  await appendAuditLog('partnership_status_changed', id, { status });
  return updated;
}

async function uploadPartnershipLogo(partnershipId, dataUrl, fileName = '') {
  assertBlobConfigured();
  const p = await getPartnershipById(partnershipId);
  if (!p) throw new Error('Partnership not found');

  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Choose an image from your device');
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error('Could not read that image file');

  let contentType = String(match[1] || '').trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  if (contentType === 'application/octet-stream' || !contentType) {
    const name = String(fileName || '').toLowerCase();
    const extGuess = name.split('.').pop();
    if (extGuess && IMAGE_EXT_MAP[extGuess]) {
      contentType = extGuess === 'svg' ? 'image/svg+xml' : `image/${extGuess === 'jpg' ? 'jpeg' : extGuess}`;
    } else {
      contentType = 'image/png';
    }
  }
  if (!IMAGE_MIME_RE.test(contentType) && !String(fileName || '').match(/\.(heic|heif|avif|bmp|tif|tiff|svg|ico|jfif|gif|webp|png|jpe?g)$/i)) {
    contentType = 'image/png';
  }

  const subtype = contentType.replace(/^image\//, '');
  const ext = IMAGE_EXT_MAP[subtype] || subtype.replace(/[^a-z0-9]/gi, '') || 'img';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw new Error('Image file was empty');
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error('Image must be under 8 MB');
  }

  const pathname = `${PARTNERSHIPS_ROOT}/media/${partnershipId}/logo-${randomUUID().slice(0, 8)}.${ext}`;
  await putPrivateBinary(pathname, buffer, contentType);
  const url = mediaProxyUrl(pathname);

  const updated = {
    ...p,
    companyLogoUrl: url,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(partnershipPath(partnershipId), updated, { overwrite: true });
  await invalidatePartnershipsCache();
  await appendAuditLog('partnership_logo_changed', partnershipId, { pathname });
  return updated;
}

async function buildOwnerPartnershipsLibrary() {
  const catalog = loadCatalogActs();
  const partnerships = await loadAllPartnerships({ fresh: true });
  const partnershipByAct = new Map();
  for (const p of partnerships) {
    if (p.actId) partnershipByAct.set(p.actId, p);
  }

  const { resolveTheme, categoryLabel } = require('./daily-peace');
  const acts = catalog.map((act) => {
    const theme = resolveTheme(act.category);
    const partnership = partnershipByAct.get(act.id) || null;
    return {
      actId: act.id,
      text: act.text,
      category: theme.category,
      categoryLabel: theme.categoryLabel,
      catalogCategory: act.category,
      source: 'standard',
      partnership: partnership ? summarizePartnership(partnership) : null,
    };
  });

  for (const p of partnerships.filter((x) => x.partnershipType === 'company_created')) {
    const act = p.companyAct || {};
    acts.push({
      actId: p.actId,
      text: act.text || '',
      category: act.category,
      categoryLabel: categoryLabel(act.category) || act.category,
      catalogCategory: act.category,
      source: 'company_created',
      partnership: summarizePartnership(p),
    });
  }

  return {
    catalogCount: catalog.length,
    totalActs: acts.length,
    partnerships: partnerships.map(summarizePartnership),
    acts,
    themes: [...THEME_IDS],
  };
}

function summarizePartnership(p) {
  if (!p) return null;
  const status = effectiveStatus(p);
  return {
    id: p.id,
    status,
    rawStatus: p.status,
    partnershipType: p.partnershipType,
    actId: p.actId,
    companyName: p.companyName,
    companyLogoUrl: p.companyLogoUrl,
    companyWebsiteUrl: p.companyWebsiteUrl,
    startDate: p.startDate,
    endDate: p.endDate,
    contractedAmount: p.contractedAmount,
    currency: p.currency,
    paymentStatus: p.paymentStatus,
    assignmentMethod: p.assignmentMethod,
    specificDate: p.specificDate,
    randomMinDay: p.randomMinDay,
    randomMaxDay: p.randomMaxDay,
    isTest: !!p.isTest,
    publishedAt: p.publishedAt,
    companyAct: p.companyAct || null,
    internalNotes: p.internalNotes || '',
  };
}

async function getPartnershipDetail(id) {
  const partnership = await getPartnershipById(id);
  if (!partnership) throw new Error('Partnership not found');
  const analytics = await aggregatePartnershipAnalytics(id);
  const actsById = await getAllActsById();
  const act = actsById.get(partnership.actId) || partnership.companyAct;
  return {
    partnership: summarizePartnership(partnership),
    act,
    analytics,
  };
}

function exportPartnershipReportCsv(detail) {
  const p = detail.partnership;
  const a = detail.analytics;
  const headers = [
    'Company', 'Act', 'Partnership Type', 'Start Date', 'End Date', 'Amount', 'Currency',
    'Users Reached', 'Views', 'Completions', 'Completion Rate', 'Logo Impressions',
    'Unique Clicks', 'Total Clicks', 'CTR Unique', 'CTR Total',
  ];
  const actText = detail.act?.text || '';
  const row = [
    p.companyName,
    actText,
    p.partnershipType,
    p.startDate,
    p.endDate,
    p.contractedAmount,
    p.currency,
    a.reach,
    a.views,
    a.completions,
    `${(a.completionRate || 0).toFixed(2)}%`,
    a.logoImpressions,
    a.uniqueLogoClicks,
    a.totalLogoClicks,
    `${(a.ctrUnique || 0).toFixed(2)}%`,
    `${(a.ctrTotal || 0).toFixed(2)}%`,
  ];
  const geoCountries = Object.entries(a.countries || {})
    .map(([country, s]) => `${country}:${s.reached}/${s.completed}/${s.clicks}`)
    .join('; ');
  const geoCities = Object.values(a.cities || {})
    .map((s) => `${s.city}, ${s.country}:${s.reached}/${s.completed}/${s.clicks}`)
    .join('; ');
  return `${headers.join(',')}\n${row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')}\nCountries,"${geoCountries.replace(/"/g, '""')}"\nCities,"${geoCities.replace(/"/g, '""')}"\n`;
}

module.exports = {
  STATUSES,
  PAYMENT_STATUSES,
  PARTNERSHIP_TYPES,
  ASSIGNMENT_METHODS,
  THEME_IDS,
  getCatalogActCount,
  loadAllPartnerships,
  getPartnershipById,
  createPartnership,
  updatePartnership,
  publishPartnership,
  setPartnershipStatus,
  uploadPartnershipLogo,
  findSpecificDateConflict,
  resolveSponsorshipForNewAssignment,
  getSponsorshipForAssignmentRow,
  publicSponsorship,
  recordSponsorEvent,
  aggregatePartnershipAnalytics,
  buildOwnerPartnershipsLibrary,
  getPartnershipDetail,
  exportPartnershipReportCsv,
  getAllActsById,
  effectiveStatus,
  isPartnershipLive,
  appendAuditLog,
  invalidatePartnershipsCache,
};
