/**
 * QR Code Campaigns — acquisition attribution + Owner analytics.
 *
 * Attribution rules (deterministic, first-touch):
 * - First QR campaign that attributes a visitor wins permanently for that visitorKey.
 * - Later QR scans from other campaigns do not overwrite first-touch.
 * - Referral/share conversions credit the share token AND the originating campaign
 *   as amplification (voicesFromShares), without changing first-touch.
 * - Unique scans = distinct visitorKeys with ≥1 qr_scan in the selected window.
 * - Retention Day N uses Voices whose pledged_at + N days ≤ now; return =
 *   presence/activity day bucket OR qr engagement event after that day.
 */
const { randomUUID, createHash, randomBytes } = require('crypto');
const QRCode = require('qrcode');
const {
  readBlobJson,
  writeJson,
  listBlobs,
  findUserByDevice,
  readPledge,
  assertBlobConfigured,
} = require('./store');

const ROOT = 'wc-data/qr-campaigns';
const INDEX_PATH = `${ROOT}/index.json`;
const EVENT_ID_DEFAULT = 'world-choir-2027';

const CAMPAIGN_TYPES = Object.freeze(['Flyer', 'Poster', 'Event', 'Partner', 'Other']);
const RANGES = Object.freeze({
  all: null,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
});

const EVENT_TYPES = Object.freeze({
  QR_SCAN: 'qr_scan',
  APP_OPEN: 'qr_app_open',
  ILL_SING: 'ill_sing_clicked',
  VOICE_CREATED: 'voice_created',
  SHARE_ELIGIBLE: 'share_prompt_eligible',
  SHARE_OPENED: 'share_prompt_opened',
  SHARE_CLICKED: 'share_clicked',
  SHARE_LINK_OPENED: 'share_link_opened',
  REFERRED_VOICE: 'referred_voice_created',
  OPENED_MAP: 'opened_map',
  PRACTICED_SONG: 'practiced_song',
  DAILY_ACT: 'completed_daily_act',
  WORLD_CHAIN: 'used_world_chain',
  RETURN_D1: 'returned_day_1',
  RETURN_D7: 'returned_day_7',
  RETURN_D30: 'returned_day_30',
  FIRST_DAILY_ACT_PRESENTED: 'qr_first_daily_act_presented',
  FIRST_DAILY_ACT_COMPLETED: 'qr_first_daily_act_completed',
  FIRST_DAILY_ACT_DISMISSED: 'qr_first_daily_act_dismissed',
});

function campaignPath(id) {
  return `${ROOT}/campaigns/${encodeURIComponent(id)}.json`;
}
function visitorPath(key) {
  return `${ROOT}/visitors/${encodeURIComponent(key)}.json`;
}
function referralPath(token) {
  return `${ROOT}/referrals/${encodeURIComponent(token)}.json`;
}
function dayPath(day) {
  return `${ROOT}/days/${day}.json`;
}
function scanEventPath(day, eventId) {
  return `${ROOT}/scan-events/${day}/${encodeURIComponent(eventId)}.json`;
}
function engagementEventPath(day, eventId) {
  return `${ROOT}/engagement-events/${day}/${encodeURIComponent(eventId)}.json`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function utcDayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function makeCampaignId() {
  const raw = randomBytes(5).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 7).toUpperCase();
  return `qr_c_${raw || randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
}

function makeVisitorKey(deviceId, anonId) {
  // Prefer deviceId; when both exist, combine so anon-only and device-only paths
  // from the same handset still converge on one key when deviceId is present.
  const device = String(deviceId || '').trim();
  const anon = String(anonId || '').trim();
  const seed = device || anon || randomUUID();
  return createHash('sha256').update(`wc-qr-v1:${seed}`).digest('hex').slice(0, 32);
}

function makeReferralToken() {
  return `r_${randomBytes(9).toString('base64url')}`;
}

function publicOrigin(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'world-choir-app.vercel.app')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function joinUrlForCampaign(origin, campaignId) {
  return `${String(origin || '').replace(/\/$/, '')}/join/${encodeURIComponent(campaignId)}`;
}

function referralUrl(origin, token) {
  return `${String(origin || '').replace(/\/$/, '')}/join?ref=${encodeURIComponent(token)}`;
}

async function readIndex() {
  try {
    return await readBlobJson(INDEX_PATH);
  } catch {
    return { campaignIds: [], updatedAt: null };
  }
}

async function writeIndex(index) {
  await writeJson(INDEX_PATH, { ...index, updatedAt: new Date().toISOString() }, { overwrite: true });
}

async function readCampaign(id) {
  if (!id) return null;
  try {
    return await readBlobJson(campaignPath(id));
  } catch {
    return null;
  }
}

async function listCampaigns({ includeArchived = true } = {}) {
  const index = await readIndex();
  const rows = [];
  for (const id of index.campaignIds || []) {
    const c = await readCampaign(id);
    if (!c) continue;
    if (!includeArchived && c.status === 'archived') continue;
    rows.push(c);
  }
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return rows;
}

function normalizeCampaignInput(body = {}, existing = null) {
  const name = String(body.name || body.campaignName || '').trim();
  if (!name) {
    const err = new Error('Campaign name is required');
    err.statusCode = 400;
    throw err;
  }
  let type = String(body.type || body.campaignType || existing?.type || 'Flyer').trim();
  if (!CAMPAIGN_TYPES.includes(type)) type = 'Other';
  const costRaw = body.cost ?? body.campaignCost ?? existing?.cost ?? 0;
  const cost = Number(String(costRaw).replace(/[^\d.-]/g, ''));
  const unitsRaw = body.units ?? body.flyers ?? body.numberOfFlyers ?? existing?.units ?? null;
  const units = unitsRaw == null || unitsRaw === ''
    ? null
    : Math.max(0, Math.round(Number(String(unitsRaw).replace(/[^\d]/g, '')) || 0));

  return {
    name,
    type,
    location: String(body.location || existing?.location || '').trim() || null,
    distributionDate: String(body.distributionDate || existing?.distributionDate || '').trim() || null,
    units,
    cost: Number.isFinite(cost) ? cost : 0,
    currency: String(body.currency || existing?.currency || 'EUR').trim() || 'EUR',
    notes: String(body.notes || existing?.notes || '').trim() || null,
  };
}

async function createCampaign(body, { origin } = {}) {
  assertBlobConfigured();
  const fields = normalizeCampaignInput(body);
  const id = makeCampaignId();
  const now = new Date().toISOString();
  const campaign = {
    id,
    ...fields,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  await writeJson(campaignPath(id), campaign, { overwrite: false });
  const index = await readIndex();
  const ids = Array.isArray(index.campaignIds) ? index.campaignIds : [];
  if (!ids.includes(id)) ids.unshift(id);
  await writeIndex({ ...index, campaignIds: ids });
  const link = joinUrlForCampaign(origin, id);
  return { campaign, link, qrSvg: await QRCode.toString(link, { type: 'svg', margin: 1, width: 512 }) };
}

async function updateCampaign(id, body) {
  assertBlobConfigured();
  const existing = await readCampaign(id);
  if (!existing) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }
  const fields = normalizeCampaignInput({ ...existing, ...body }, existing);
  const next = {
    ...existing,
    ...fields,
    id: existing.id,
    createdAt: existing.createdAt,
    status: existing.status,
    archivedAt: existing.archivedAt,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(campaignPath(id), next, { overwrite: true });
  return next;
}

async function setCampaignStatus(id, status) {
  const existing = await readCampaign(id);
  if (!existing) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }
  const nextStatus = status === 'archived' ? 'archived' : 'active';
  const next = {
    ...existing,
    status: nextStatus,
    archivedAt: nextStatus === 'archived' ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(campaignPath(id), next, { overwrite: true });
  return next;
}

async function readVisitor(key) {
  if (!key) return null;
  try {
    return await readBlobJson(visitorPath(key));
  } catch {
    return null;
  }
}

async function writeVisitor(visitor) {
  await writeJson(visitorPath(visitor.visitorKey), visitor, { overwrite: true });
  return visitor;
}

async function bumpDay(campaignId, eventType, { unique = false, visitorKey = null } = {}) {
  const day = utcDayKey();
  let lastErr = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      let row;
      try {
        row = await readBlobJson(dayPath(day));
      } catch {
        row = { day, campaigns: {}, updatedAt: null };
      }
      if (!row.campaigns[campaignId]) {
        row.campaigns[campaignId] = {
          scans: 0,
          uniqueScanKeys: [],
          uniqueScans: 0,
          appOpens: 0,
          appOpenKeys: [],
          illSing: 0,
          voices: 0,
          shares: 0,
          voicesFromShares: 0,
          openedMap: 0,
          practicedSong: 0,
          dailyAct: 0,
          firstDailyActPresented: 0,
          firstDailyActCompleted: 0,
          worldChain: 0,
          returnD1: 0,
          returnD7: 0,
          returnD30: 0,
        };
      }
      const c = row.campaigns[campaignId];
      const beforeScans = Number(c.scans) || 0;
      const addUnique = (arrName, counter) => {
        if (!visitorKey) {
          c[counter] = (c[counter] || 0) + 1;
          return;
        }
        const arr = Array.isArray(c[arrName]) ? c[arrName] : [];
        if (!arr.includes(visitorKey)) {
          arr.push(visitorKey);
          if (arr.length > 5000) arr.splice(0, arr.length - 5000);
          c[arrName] = arr;
          c[counter] = arr.length;
        } else if (Array.isArray(c[arrName])) {
          c[counter] = c[arrName].length;
        }
      };

      switch (eventType) {
        case EVENT_TYPES.QR_SCAN:
          c.scans = beforeScans + 1;
          addUnique('uniqueScanKeys', 'uniqueScans');
          break;
        case EVENT_TYPES.APP_OPEN:
          addUnique('appOpenKeys', 'appOpens');
          break;
        case EVENT_TYPES.ILL_SING:
          c.illSing = (Number(c.illSing) || 0) + 1;
          break;
        case EVENT_TYPES.VOICE_CREATED:
          c.voices = (Number(c.voices) || 0) + 1;
          break;
        case EVENT_TYPES.SHARE_CLICKED:
          c.shares = (Number(c.shares) || 0) + 1;
          break;
        case EVENT_TYPES.REFERRED_VOICE:
          c.voicesFromShares = (Number(c.voicesFromShares) || 0) + 1;
          break;
        case EVENT_TYPES.OPENED_MAP:
          c.openedMap = (Number(c.openedMap) || 0) + 1;
          break;
        case EVENT_TYPES.PRACTICED_SONG:
          c.practicedSong = (Number(c.practicedSong) || 0) + 1;
          break;
        case EVENT_TYPES.DAILY_ACT:
          c.dailyAct = (Number(c.dailyAct) || 0) + 1;
          break;
        case EVENT_TYPES.FIRST_DAILY_ACT_PRESENTED:
          c.firstDailyActPresented = (Number(c.firstDailyActPresented) || 0) + 1;
          break;
        case EVENT_TYPES.FIRST_DAILY_ACT_COMPLETED:
          c.firstDailyActCompleted = (Number(c.firstDailyActCompleted) || 0) + 1;
          break;
        case EVENT_TYPES.WORLD_CHAIN:
          c.worldChain = (Number(c.worldChain) || 0) + 1;
          break;
        case EVENT_TYPES.RETURN_D1:
          c.returnD1 = (Number(c.returnD1) || 0) + 1;
          break;
        case EVENT_TYPES.RETURN_D7:
          c.returnD7 = (Number(c.returnD7) || 0) + 1;
          break;
        case EVENT_TYPES.RETURN_D30:
          c.returnD30 = (Number(c.returnD30) || 0) + 1;
          break;
        default:
          break;
      }
      if (Array.isArray(c.uniqueScanKeys)) c.uniqueScans = c.uniqueScanKeys.length;
      row.updatedAt = new Date().toISOString();
      await writeJson(dayPath(day), row, { overwrite: true });

      // Verify scan increments survived concurrent writers
      if (eventType === EVENT_TYPES.QR_SCAN) {
        try {
          const verify = await readBlobJson(dayPath(day));
          const v = verify?.campaigns?.[campaignId];
          if (v && Number(v.scans) >= beforeScans + 1) return verify;
        } catch {
          return row;
        }
        await sleep(25 * (attempt + 1));
        continue;
      }
      return row;
    } catch (err) {
      lastErr = err;
      await sleep(25 * (attempt + 1));
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function appendScanEvent({ campaignId, visitorKey, deviceId = null, anonId = null }) {
  const day = utcDayKey();
  const eventId = `${Date.now()}_${randomBytes(5).toString('hex')}`;
  const row = {
    id: eventId,
    type: EVENT_TYPES.QR_SCAN,
    campaignId,
    visitorKey,
    deviceId: deviceId || null,
    anonId: anonId || null,
    at: new Date().toISOString(),
    day,
  };
  await writeJson(scanEventPath(day, eventId), row, { overwrite: false });
  return row;
}

async function loadScanEvents(fromDay, toDay) {
  const out = [];
  const seen = new Set();
  const push = (row) => {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  };

  try {
    const blobs = await listBlobs(`${ROOT}/scan-events/`);
    for (const b of blobs || []) {
      const pathname = b?.pathname || '';
      if (!pathname.endsWith('.json')) continue;
      const parts = pathname.split('/');
      const day = parts[parts.length - 2];
      if (fromDay && day < fromDay) continue;
      if (toDay && day > toDay) continue;
      try {
        push(await readBlobJson(pathname));
      } catch { /* skip */ }
    }
  } catch (err) {
    console.warn('qr loadScanEvents list failed:', err?.message || err);
  }

  // Fresh writes can lag in list — always probe today (+ yesterday).
  const probeDays = [utcDayKey()];
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  probeDays.push(utcDayKey(y));
  for (const day of probeDays) {
    if (fromDay && day < fromDay) continue;
    if (toDay && day > toDay) continue;
    try {
      const blobs = await listBlobs(`${ROOT}/scan-events/${day}/`);
      for (const b of blobs || []) {
        if (!b?.pathname?.endsWith('.json')) continue;
        try {
          push(await readBlobJson(b.pathname));
        } catch { /* skip */ }
      }
    } catch { /* none */ }
  }

  return out;
}

function aggregateScanEvents(events, scopeIds) {
  const scope = new Set(scopeIds);
  const byCampaign = new Map();
  const byDay = new Map();
  const uniqueAll = new Set();
  let scans = 0;

  for (const e of events || []) {
    if (!e?.campaignId || !scope.has(e.campaignId)) continue;
    scans += 1;
    if (e.visitorKey) uniqueAll.add(e.visitorKey);

    if (!byCampaign.has(e.campaignId)) {
      byCampaign.set(e.campaignId, { scans: 0, unique: new Set() });
    }
    const c = byCampaign.get(e.campaignId);
    c.scans += 1;
    if (e.visitorKey) c.unique.add(e.visitorKey);

    const day = e.day || String(e.at || '').slice(0, 10);
    if (day) {
      if (!byDay.has(day)) byDay.set(day, { scans: 0, unique: new Set() });
      const d = byDay.get(day);
      d.scans += 1;
      if (e.visitorKey) d.unique.add(e.visitorKey);
    }
  }

  return {
    scans,
    uniqueScans: uniqueAll.size,
    byCampaign,
    byDay,
  };
}

async function appendEngagementEvent({
  type,
  campaignId,
  visitorKey,
  deviceId = null,
  anonId = null,
  meta = null,
}) {
  const day = utcDayKey();
  const eventId = `${type}_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const row = {
    id: eventId,
    type,
    campaignId,
    visitorKey: visitorKey || null,
    deviceId: deviceId || null,
    anonId: anonId || null,
    meta: meta && typeof meta === 'object' ? meta : null,
    at: new Date().toISOString(),
    day,
  };
  await writeJson(engagementEventPath(day, eventId), row, { overwrite: false });
  return row;
}

async function loadEngagementEvents(fromDay, toDay) {
  const out = [];
  const seen = new Set();
  const push = (row) => {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  };

  try {
    const blobs = await listBlobs(`${ROOT}/engagement-events/`);
    for (const b of blobs || []) {
      const pathname = b?.pathname || '';
      if (!pathname.endsWith('.json')) continue;
      const parts = pathname.split('/');
      const day = parts[parts.length - 2];
      if (fromDay && day < fromDay) continue;
      if (toDay && day > toDay) continue;
      try {
        push(await readBlobJson(pathname));
      } catch { /* skip */ }
    }
  } catch (err) {
    console.warn('qr loadEngagementEvents list failed:', err?.message || err);
  }

  const probeDays = [utcDayKey()];
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  probeDays.push(utcDayKey(y));
  for (const day of probeDays) {
    if (fromDay && day < fromDay) continue;
    if (toDay && day > toDay) continue;
    try {
      const blobs = await listBlobs(`${ROOT}/engagement-events/${day}/`);
      for (const b of blobs || []) {
        if (!b?.pathname?.endsWith('.json')) continue;
        try {
          push(await readBlobJson(b.pathname));
        } catch { /* skip */ }
      }
    } catch { /* none */ }
  }

  return out;
}

/** Unique visitor counts for first Daily Act presented/completed (immutable log). */
function aggregateFirstDailyActEvents(events, scopeIds) {
  const scope = new Set(scopeIds);
  const presented = new Set();
  const completed = new Set();
  const byCampaign = new Map();
  const byDay = new Map();

  const ensure = (map, id, factory) => {
    if (!map.has(id)) map.set(id, factory());
    return map.get(id);
  };

  for (const e of events || []) {
    if (!e?.campaignId || !scope.has(e.campaignId)) continue;
    if (
      e.type !== EVENT_TYPES.FIRST_DAILY_ACT_PRESENTED
      && e.type !== EVENT_TYPES.FIRST_DAILY_ACT_COMPLETED
    ) continue;

    const key = e.visitorKey || `${e.campaignId}:${e.deviceId || ''}:${e.anonId || ''}:${e.id}`;
    const day = e.day || String(e.at || '').slice(0, 10);
    const cBag = ensure(byCampaign, e.campaignId, () => ({
      presented: new Set(),
      completed: new Set(),
    }));
    const dBag = day
      ? ensure(byDay, day, () => ({ presented: new Set(), completed: new Set() }))
      : null;

    if (e.type === EVENT_TYPES.FIRST_DAILY_ACT_PRESENTED) {
      presented.add(key);
      cBag.presented.add(key);
      if (dBag) dBag.presented.add(key);
    } else if (e.type === EVENT_TYPES.FIRST_DAILY_ACT_COMPLETED) {
      completed.add(key);
      cBag.completed.add(key);
      if (dBag) dBag.completed.add(key);
      // Completing implies presentation for KPI denominator safety.
      presented.add(key);
      cBag.presented.add(key);
      if (dBag) dBag.presented.add(key);
    }
  }

  return {
    presented: presented.size,
    completed: completed.size,
    byCampaign,
    byDay,
  };
}

async function recordScan({ campaignId, deviceId, anonId, userAgent = null }) {
  assertBlobConfigured();
  const campaign = await readCampaign(campaignId);
  // Archived campaigns still accept scans so printed QR codes remain valid long-term.
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }
  const visitorKey = makeVisitorKey(deviceId, anonId);
  let visitor = await readVisitor(visitorKey);
  const now = new Date().toISOString();
  let isNewUnique = false;
  if (!visitor) {
    isNewUnique = true;
    visitor = {
      visitorKey,
      deviceId: deviceId || null,
      anonId: anonId || null,
      firstCampaignId: campaignId,
      firstCampaignType: campaign.type,
      acquisitionSource: 'qr_campaign',
      firstScanAt: now,
      lastScanAt: now,
      scanCount: 1,
      appOpenedAt: null,
      illSingAt: null,
      voiceUserId: null,
      voiceNumber: null,
      voiceCreatedAt: null,
      shareEligibleAt: null,
      shareDismissedAt: null,
      shareClickedAt: null,
      referralToken: null,
      engagement: {},
      returns: {},
      createdAt: now,
      updatedAt: now,
    };
  } else {
    visitor.lastScanAt = now;
    visitor.scanCount = (visitor.scanCount || 0) + 1;
    visitor.updatedAt = now;
    // First-touch preserved — do not overwrite firstCampaignId
  }
  await writeVisitor(visitor);
  // Immutable scan event first (source of truth — survives day-aggregate races)
  try {
    await appendScanEvent({
      campaignId,
      visitorKey,
      deviceId: deviceId || null,
      anonId: anonId || null,
    });
  } catch (err) {
    console.warn('qr appendScanEvent failed:', err?.message || err);
  }
  try {
    await bumpDay(campaignId, EVENT_TYPES.QR_SCAN, { unique: isNewUnique, visitorKey });
  } catch (err) {
    console.warn('qr bumpDay scan failed:', err?.message || err);
  }
  return {
    ok: true,
    campaignId,
    visitorKey,
    firstTouch: visitor.firstCampaignId === campaignId,
    campaignName: campaign.name,
    scanCount: visitor.scanCount,
  };
}

async function recordEvent({
  type,
  visitorKey,
  deviceId,
  anonId,
  campaignId: overrideCampaignId = null,
  userId = null,
  voiceNumber = null,
  meta = null,
}) {
  assertBlobConfigured();
  const candidateKeys = [];
  if (visitorKey) candidateKeys.push(String(visitorKey));
  if (deviceId) candidateKeys.push(makeVisitorKey(deviceId, null));
  if (anonId) candidateKeys.push(makeVisitorKey(null, anonId));
  if (deviceId && anonId) candidateKeys.push(makeVisitorKey(deviceId, anonId));

  let key = null;
  let visitor = null;
  for (const k of [...new Set(candidateKeys.filter(Boolean))]) {
    const row = await readVisitor(k);
    if (row) {
      key = row.visitorKey || k;
      visitor = row;
      break;
    }
  }
  if (!key) key = visitorKey || makeVisitorKey(deviceId, anonId);

  if (!visitor && !overrideCampaignId) {
    return { ok: false, reason: 'no_attribution' };
  }
  if (!visitor) {
    visitor = {
      visitorKey: key,
      deviceId: deviceId || null,
      anonId: anonId || null,
      firstCampaignId: overrideCampaignId,
      firstCampaignType: null,
      acquisitionSource: 'qr_campaign',
      firstScanAt: new Date().toISOString(),
      lastScanAt: new Date().toISOString(),
      scanCount: 0,
      appOpenedAt: null,
      illSingAt: null,
      voiceUserId: null,
      voiceNumber: null,
      voiceCreatedAt: null,
      shareEligibleAt: null,
      shareDismissedAt: null,
      shareClickedAt: null,
      referralToken: null,
      engagement: {},
      returns: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  const campaignId = visitor.firstCampaignId || overrideCampaignId;
  if (!campaignId) return { ok: false, reason: 'no_campaign' };
  const now = new Date().toISOString();
  let bumped = true;

  switch (type) {
    case EVENT_TYPES.APP_OPEN:
      if (visitor.appOpenedAt) bumped = false;
      else visitor.appOpenedAt = now;
      break;
    case EVENT_TYPES.ILL_SING:
      if (visitor.illSingAt) bumped = false;
      else visitor.illSingAt = now;
      break;
    case EVENT_TYPES.VOICE_CREATED:
      if (visitor.voiceCreatedAt) {
        bumped = false;
        // Historical heal: Voice exists but I'll Sing click was never recorded.
        if (!visitor.illSingAt) {
          visitor.illSingAt = visitor.voiceCreatedAt || now;
          try {
            await bumpDay(campaignId, EVENT_TYPES.ILL_SING, { visitorKey: key });
          } catch (err) {
            console.warn('qr illSing backfill failed:', err?.message || err);
          }
        }
      } else {
        visitor.voiceCreatedAt = now;
        visitor.voiceUserId = userId || visitor.voiceUserId;
        visitor.voiceNumber = voiceNumber ?? visitor.voiceNumber;
        // Completing join always means I'll Sing was used — backfill if the
        // client click event was missed (common with Home #pledge-btn / soft tabs).
        if (!visitor.illSingAt) {
          visitor.illSingAt = now;
          try {
            await bumpDay(campaignId, EVENT_TYPES.ILL_SING, { visitorKey: key });
          } catch (err) {
            console.warn('qr illSing backfill failed:', err?.message || err);
          }
        }
      }
      break;
    case EVENT_TYPES.SHARE_ELIGIBLE:
      if (!visitor.shareEligibleAt) visitor.shareEligibleAt = now;
      bumped = false;
      break;
    case EVENT_TYPES.SHARE_OPENED:
      bumped = false;
      break;
    case EVENT_TYPES.SHARE_CLICKED:
      if (visitor.shareClickedAt) bumped = false;
      else visitor.shareClickedAt = now;
      break;
    case EVENT_TYPES.OPENED_MAP:
    case EVENT_TYPES.PRACTICED_SONG:
    case EVENT_TYPES.DAILY_ACT:
    case EVENT_TYPES.WORLD_CHAIN: {
      const eng = visitor.engagement || {};
      if (eng[type]) bumped = false;
      else eng[type] = now;
      visitor.engagement = eng;
      break;
    }
    case EVENT_TYPES.RETURN_D1:
    case EVENT_TYPES.RETURN_D7:
    case EVENT_TYPES.RETURN_D30: {
      const ret = visitor.returns || {};
      if (ret[type]) bumped = false;
      else ret[type] = now;
      visitor.returns = ret;
      break;
    }
    case EVENT_TYPES.FIRST_DAILY_ACT_PRESENTED:
      if (visitor.firstDailyActPresentedAt) bumped = false;
      else {
        visitor.firstDailyActPresentedAt = now;
        visitor.firstDailyActId = meta?.actId || visitor.firstDailyActId || null;
        visitor.firstDailyActDate = meta?.actDate || visitor.firstDailyActDate || null;
      }
      break;
    case EVENT_TYPES.FIRST_DAILY_ACT_COMPLETED:
      if (visitor.firstDailyActCompletedAt) bumped = false;
      else {
        visitor.firstDailyActCompletedAt = now;
        visitor.firstDailyActId = meta?.actId || visitor.firstDailyActId || null;
        visitor.firstDailyActDate = meta?.actDate || visitor.firstDailyActDate || null;
        if (!visitor.firstDailyActPresentedAt) {
          visitor.firstDailyActPresentedAt = now;
        }
      }
      break;
    case EVENT_TYPES.FIRST_DAILY_ACT_DISMISSED:
      if (visitor.firstDailyActDismissedAt) bumped = false;
      else {
        visitor.firstDailyActDismissedAt = now;
        // Dismissal is not a day-aggregate counter — presentation already counted.
        bumped = false;
      }
      break;
    default:
      break;
  }
  visitor.updatedAt = now;
  if (deviceId && !visitor.deviceId) visitor.deviceId = deviceId;
  if (anonId && !visitor.anonId) visitor.anonId = anonId;
  if (userId && !visitor.voiceUserId) visitor.voiceUserId = userId;

  const wasFirstPresented = type === EVENT_TYPES.FIRST_DAILY_ACT_PRESENTED && bumped;
  const wasFirstCompleted = type === EVENT_TYPES.FIRST_DAILY_ACT_COMPLETED && bumped;
  const wasFirstDismissed = type === EVENT_TYPES.FIRST_DAILY_ACT_DISMISSED
    && visitor.firstDailyActDismissedAt === now;
  // If completion is first but presentation was never counted separately, heal denominator.
  const healPresentedWithCompletion = wasFirstCompleted
    && visitor.firstDailyActPresentedAt === now;

  await writeVisitor(visitor);

  if (wasFirstPresented || wasFirstCompleted || wasFirstDismissed || healPresentedWithCompletion) {
    try {
      if (healPresentedWithCompletion && !wasFirstPresented) {
        await appendEngagementEvent({
          type: EVENT_TYPES.FIRST_DAILY_ACT_PRESENTED,
          campaignId,
          visitorKey: key,
          deviceId,
          anonId,
          meta,
        });
      }
      if (wasFirstPresented || wasFirstCompleted || wasFirstDismissed) {
        await appendEngagementEvent({
          type,
          campaignId,
          visitorKey: key,
          deviceId,
          anonId,
          meta,
        });
      }
    } catch (err) {
      console.warn('qr appendEngagementEvent failed:', err?.message || err);
    }
  }

  if (healPresentedWithCompletion) {
    try {
      await bumpDay(campaignId, EVENT_TYPES.FIRST_DAILY_ACT_PRESENTED, { visitorKey: key });
    } catch (err) {
      console.warn('qr bumpDay firstDailyAct presented heal failed:', err?.message || err);
    }
  }
  if (bumped) {
    try {
      await bumpDay(campaignId, type, { visitorKey: key });
    } catch (err) {
      console.warn('qr bumpDay failed:', err?.message || err);
    }
  }
  return { ok: true, campaignId, visitorKey: key, visitor };
}

async function ensureReferralToken(visitorKey, deviceId, anonId) {
  const key = visitorKey || makeVisitorKey(deviceId, anonId);
  let visitor = await readVisitor(key);
  if (!visitor?.firstCampaignId) {
    const err = new Error('No QR attribution for this visitor');
    err.statusCode = 400;
    throw err;
  }
  if (visitor.referralToken) {
    return {
      token: visitor.referralToken,
      urlPath: `/join?ref=${encodeURIComponent(visitor.referralToken)}`,
    };
  }
  const token = makeReferralToken();
  const row = {
    token,
    visitorKey: key,
    campaignId: visitor.firstCampaignId,
    createdAt: new Date().toISOString(),
    openCount: 0,
    voiceCount: 0,
  };
  await writeJson(referralPath(token), row, { overwrite: false });
  visitor.referralToken = token;
  visitor.updatedAt = new Date().toISOString();
  await writeVisitor(visitor);
  // Share click is counted when the user actually shares (client SHARE_CLICKED), not when the link is minted.
  return { token, urlPath: `/join?ref=${encodeURIComponent(token)}` };
}

async function openReferral(token, { deviceId, anonId } = {}) {
  let ref;
  try {
    ref = await readBlobJson(referralPath(token));
  } catch {
    const err = new Error('Share link not found');
    err.statusCode = 404;
    throw err;
  }
  ref.openCount = (ref.openCount || 0) + 1;
  ref.lastOpenedAt = new Date().toISOString();
  await writeJson(referralPath(token), ref, { overwrite: true });

  // Friend gets referral attribution (separate from QR first-touch unless they already have one)
  const friendKey = makeVisitorKey(deviceId, anonId);
  let friend = await readVisitor(friendKey);
  const now = new Date().toISOString();
  if (!friend) {
    friend = {
      visitorKey: friendKey,
      deviceId: deviceId || null,
      anonId: anonId || null,
      firstCampaignId: null,
      referredByToken: token,
      referredByCampaignId: ref.campaignId,
      acquisitionSource: 'qr_share',
      firstScanAt: null,
      lastScanAt: null,
      scanCount: 0,
      appOpenedAt: null,
      illSingAt: null,
      voiceUserId: null,
      voiceNumber: null,
      voiceCreatedAt: null,
      shareEligibleAt: null,
      shareDismissedAt: null,
      shareClickedAt: null,
      referralToken: null,
      engagement: {},
      returns: {},
      createdAt: now,
      updatedAt: now,
    };
  } else if (!friend.referredByToken && !friend.firstCampaignId) {
    friend.referredByToken = token;
    friend.referredByCampaignId = ref.campaignId;
    friend.acquisitionSource = friend.acquisitionSource || 'qr_share';
    friend.updatedAt = now;
  }
  await writeVisitor(friend);
  await bumpDay(ref.campaignId, EVENT_TYPES.SHARE_LINK_OPENED, { visitorKey: friendKey });
  return { ok: true, campaignId: ref.campaignId, visitorKey: friendKey };
}

async function attributeVoiceCreated({ deviceId, userId, voiceNumber, eventId = EVENT_ID_DEFAULT, visitorKey = null, anonId = null }) {
  if (!deviceId && !userId && !visitorKey && !anonId) return { ok: false };
  let key = visitorKey || null;
  let visitor = key ? await readVisitor(key) : null;
  if (!visitor && deviceId) {
    key = makeVisitorKey(deviceId, null);
    visitor = await readVisitor(key);
  }
  if (!visitor && anonId) {
    key = makeVisitorKey(null, anonId);
    visitor = await readVisitor(key);
  }
  if (!visitor) return { ok: false, reason: 'no_visitor' };

  if (visitor.referredByToken && !visitor.firstCampaignId) {
    // Share-attributed voice
    if (!visitor.voiceCreatedAt) {
      visitor.voiceCreatedAt = new Date().toISOString();
      visitor.voiceUserId = userId;
      visitor.voiceNumber = voiceNumber;
      visitor.updatedAt = visitor.voiceCreatedAt;
      if (deviceId && !visitor.deviceId) visitor.deviceId = deviceId;
      await writeVisitor(visitor);
      const campaignId = visitor.referredByCampaignId;
      if (campaignId) {
        await bumpDay(campaignId, EVENT_TYPES.REFERRED_VOICE, { visitorKey: visitor.visitorKey });
        try {
          const ref = await readBlobJson(referralPath(visitor.referredByToken));
          ref.voiceCount = (ref.voiceCount || 0) + 1;
          await writeJson(referralPath(visitor.referredByToken), ref, { overwrite: true });
        } catch { /* ignore */ }
      }
      return { ok: true, kind: 'share', campaignId };
    }
    return { ok: true, kind: 'share_already' };
  }

  if (visitor.firstCampaignId) {
    return recordEvent({
      type: EVENT_TYPES.VOICE_CREATED,
      visitorKey: visitor.visitorKey,
      deviceId,
      anonId,
      userId,
      voiceNumber,
    });
  }
  return { ok: false, reason: 'no_campaign' };
}

function rangeStartDay(rangeKey) {
  const days = RANGES[rangeKey];
  if (days == null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return utcDayKey(d);
}

async function loadDayRows(fromDay, toDay) {
  const out = [];
  const seen = new Set();

  const pushRow = (row) => {
    if (!row?.day || seen.has(row.day)) return;
    seen.add(row.day);
    out.push(row);
  };

  // listBlobs(prefix: string) → Blob[] (not { blobs })
  try {
    const blobs = await listBlobs(`${ROOT}/days/`);
    for (const b of blobs || []) {
      const pathname = b?.pathname || '';
      if (!pathname.endsWith('.json')) continue;
      const day = pathname.split('/').pop().replace(/\.json$/, '');
      if (fromDay && day < fromDay) continue;
      if (toDay && day > toDay) continue;
      try {
        pushRow(await readBlobJson(pathname));
      } catch { /* skip corrupt/missing */ }
    }
  } catch (err) {
    console.warn('qr loadDayRows list failed, walking days:', err?.message || err);
  }

  // Always include today (list can lag behind a fresh write) + walk gaps for limited ranges.
  const end = toDay ? new Date(`${toDay}T00:00:00.000Z`) : new Date();
  const start = fromDay
    ? new Date(`${fromDay}T00:00:00.000Z`)
    : new Date(end.getTime() - Math.min(120, 400) * 86400000);

  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = utcDayKey(new Date(t));
    if (seen.has(day)) continue;
    if (fromDay && day < fromDay) continue;
    if (toDay && day > toDay) continue;
    try {
      pushRow(await readBlobJson(dayPath(day)));
    } catch { /* none for that day */ }
  }

  return out.sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

function emptyTotals() {
  return {
    scans: 0,
    uniqueScans: 0,
    appOpens: 0,
    illSing: 0,
    voices: 0,
    shares: 0,
    voicesFromShares: 0,
    openedMap: 0,
    practicedSong: 0,
    dailyAct: 0,
    firstDailyActPresented: 0,
    firstDailyActCompleted: 0,
    worldChain: 0,
    returnD1: 0,
    returnD7: 0,
    returnD30: 0,
  };
}

function mergeCampaignDay(into, src) {
  if (!src) return into;
  into.scans += Number(src.scans) || 0;
  into.uniqueScans += Number(src.uniqueScans) || (Array.isArray(src.uniqueScanKeys) ? src.uniqueScanKeys.length : 0);
  into.appOpens += Number(src.appOpens) || 0;
  into.illSing += Number(src.illSing) || 0;
  into.voices += Number(src.voices) || 0;
  into.shares += Number(src.shares) || 0;
  into.voicesFromShares += Number(src.voicesFromShares) || 0;
  into.openedMap += Number(src.openedMap) || 0;
  into.practicedSong += Number(src.practicedSong) || 0;
  into.dailyAct += Number(src.dailyAct) || 0;
  into.firstDailyActPresented += Number(src.firstDailyActPresented) || 0;
  into.firstDailyActCompleted += Number(src.firstDailyActCompleted) || 0;
  into.worldChain += Number(src.worldChain) || 0;
  into.returnD1 += Number(src.returnD1) || 0;
  into.returnD7 += Number(src.returnD7) || 0;
  into.returnD30 += Number(src.returnD30) || 0;
  return into;
}

function pct(num, den) {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

function costPerVoice(cost, voices) {
  if (!voices || voices <= 0) return null;
  if (!Number.isFinite(cost)) return null;
  return Math.round((cost / voices) * 100) / 100;
}

async function buildAnalytics({ campaignId = null, range = 'all', origin = '' } = {}) {
  const campaigns = await listCampaigns({ includeArchived: true });
  const active = campaigns.filter((c) => c.status !== 'archived' || campaignId);
  const fromDay = rangeStartDay(range);
  const toDay = utcDayKey();
  const days = await loadDayRows(fromDay, toDay);

  const totals = emptyTotals();
  const byCampaign = new Map();
  const seriesMap = new Map(); // day -> metric bag for selected scope

  const scopeIds = campaignId
    ? [campaignId]
    : campaigns.map((c) => c.id);

  for (const dayRow of days) {
    const dayKey = dayRow.day;
    if (!seriesMap.has(dayKey)) seriesMap.set(dayKey, emptyTotals());
    const series = seriesMap.get(dayKey);
    for (const id of scopeIds) {
      const src = dayRow.campaigns?.[id];
      if (!src) continue;
      if (!byCampaign.has(id)) byCampaign.set(id, emptyTotals());
      mergeCampaignDay(byCampaign.get(id), src);
      mergeCampaignDay(totals, src);
      mergeCampaignDay(series, src);
    }
  }

  // Authoritative scan / unique-scan counts from immutable scan-event log.
  // Day aggregates can lose increments under concurrent writes; take the max.
  const scanEvents = await loadScanEvents(fromDay, toDay);
  const eventStats = aggregateScanEvents(scanEvents, scopeIds);
  totals.scans = Math.max(Number(totals.scans) || 0, eventStats.scans);
  totals.uniqueScans = Math.max(Number(totals.uniqueScans) || 0, eventStats.uniqueScans);

  for (const [id, es] of eventStats.byCampaign.entries()) {
    if (!byCampaign.has(id)) byCampaign.set(id, emptyTotals());
    const m = byCampaign.get(id);
    m.scans = Math.max(Number(m.scans) || 0, es.scans);
    m.uniqueScans = Math.max(Number(m.uniqueScans) || 0, es.unique.size);
  }

  for (const [dayKey, es] of eventStats.byDay.entries()) {
    if (!seriesMap.has(dayKey)) seriesMap.set(dayKey, emptyTotals());
    const series = seriesMap.get(dayKey);
    series.scans = Math.max(Number(series.scans) || 0, es.scans);
    series.uniqueScans = Math.max(Number(series.uniqueScans) || 0, es.unique.size);
  }

  // Authoritative First Daily Act KPIs from immutable engagement-event log.
  const engEvents = await loadEngagementEvents(fromDay, toDay);
  const fdaStats = aggregateFirstDailyActEvents(engEvents, scopeIds);
  totals.firstDailyActPresented = Math.max(
    Number(totals.firstDailyActPresented) || 0,
    fdaStats.presented
  );
  totals.firstDailyActCompleted = Math.max(
    Number(totals.firstDailyActCompleted) || 0,
    fdaStats.completed
  );
  for (const [id, es] of fdaStats.byCampaign.entries()) {
    if (!byCampaign.has(id)) byCampaign.set(id, emptyTotals());
    const m = byCampaign.get(id);
    m.firstDailyActPresented = Math.max(
      Number(m.firstDailyActPresented) || 0,
      es.presented.size
    );
    m.firstDailyActCompleted = Math.max(
      Number(m.firstDailyActCompleted) || 0,
      es.completed.size
    );
  }
  for (const [dayKey, es] of fdaStats.byDay.entries()) {
    if (!seriesMap.has(dayKey)) seriesMap.set(dayKey, emptyTotals());
    const series = seriesMap.get(dayKey);
    series.firstDailyActPresented = Math.max(
      Number(series.firstDailyActPresented) || 0,
      es.presented.size
    );
    series.firstDailyActCompleted = Math.max(
      Number(series.firstDailyActCompleted) || 0,
      es.completed.size
    );
  }

  // Funnel invariant: every completed Voice required an I'll Sing click.
  // Heals Owner KPIs when client click tracking missed the Home pledge button.
  const applyIllSingFloor = (bag) => {
    if (!bag) return;
    bag.illSing = Math.max(Number(bag.illSing) || 0, Number(bag.voices) || 0);
  };
  applyIllSingFloor(totals);
  for (const m of byCampaign.values()) applyIllSingFloor(m);
  for (const m of seriesMap.values()) applyIllSingFloor(m);

  const t = totals;
  // Retention denominators: only Voices old enough for each window.
  const todayKey = utcDayKey();
  const todayMs = Date.parse(`${todayKey}T00:00:00.000Z`);
  let eligibleD1 = 0;
  let eligibleD7 = 0;
  let eligibleD30 = 0;
  for (const [dayKey, vals] of seriesMap.entries()) {
    const voices = Number(vals.voices) || 0;
    if (!voices) continue;
    const dayMs = Date.parse(`${dayKey}T00:00:00.000Z`);
    if (!Number.isFinite(dayMs) || !Number.isFinite(todayMs)) continue;
    const ageDays = Math.floor((todayMs - dayMs) / 86400000);
    if (ageDays >= 1) eligibleD1 += voices;
    if (ageDays >= 7) eligibleD7 += voices;
    if (ageDays >= 30) eligibleD30 += voices;
  }

  const funnel = [
    { key: 'scans', label: 'QR Scans', count: t.scans, pct: 100 },
    { key: 'appOpens', label: 'App Opens', count: t.appOpens, pct: pct(t.appOpens, t.scans) },
    { key: 'illSing', label: "I'll Sing Clicks", count: t.illSing, pct: pct(t.illSing, t.appOpens) },
    { key: 'voices', label: 'Voices Created', count: t.voices, pct: pct(t.voices, t.illSing) },
    { key: 'returnD7', label: 'Day 7 Retained', count: t.returnD7, pct: pct(t.returnD7, eligibleD7) },
  ];

  const series = [...seriesMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({ date, ...vals }));

  const campaignRows = campaigns.map((c) => {
    const m = byCampaign.get(c.id) || emptyTotals();
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      location: c.location,
      status: c.status,
      cost: c.cost,
      currency: c.currency || 'EUR',
      scans: m.scans,
      voices: m.voices,
      conversion: pct(m.voices, m.scans),
      costPerVoice: costPerVoice(c.cost, m.voices),
      firstDailyActPresented: m.firstDailyActPresented,
      firstDailyActCompleted: m.firstDailyActCompleted,
      firstDailyActCompletion: pct(m.firstDailyActCompleted, m.firstDailyActPresented),
      link: joinUrlForCampaign(origin, c.id),
    };
  });

  const journey = [
    { action: 'Opened Map', users: t.openedMap, pctOfVoices: pct(t.openedMap, t.voices) },
    { action: 'Practiced the Song', users: t.practicedSong, pctOfVoices: pct(t.practicedSong, t.voices) },
    { action: 'Completed First Daily Act', users: t.firstDailyActCompleted, pctOfVoices: pct(t.firstDailyActCompleted, t.voices) },
    { action: 'Completed a Daily Act of Peace', users: t.dailyAct, pctOfVoices: pct(t.dailyAct, t.voices) },
    { action: 'Used World Chain', users: t.worldChain, pctOfVoices: pct(t.worldChain, t.voices) },
    { action: 'Returned after 1 day', users: t.returnD1, pctOfVoices: pct(t.returnD1, t.voices) },
    { action: 'Returned after 7 days', users: t.returnD7, pctOfVoices: pct(t.returnD7, t.voices) },
    { action: 'Returned after 30 days', users: t.returnD30, pctOfVoices: pct(t.returnD30, t.voices) },
    { action: 'Shared World Choir', users: t.shares, pctOfVoices: pct(t.shares, t.voices) },
  ];

  return {
    range,
    campaignId: campaignId || null,
    generatedAt: new Date().toISOString(),
    kpis: {
      scans: t.scans,
      uniqueScans: t.uniqueScans,
      appOpens: t.appOpens,
      appOpensPctOfScans: pct(t.appOpens, t.scans),
      illSing: t.illSing,
      illSingPctOfOpens: pct(t.illSing, t.appOpens),
      voices: t.voices,
      voicesPctOfClicks: pct(t.voices, t.illSing),
      day1Retention: eligibleD1 > 0 ? pct(t.returnD1, eligibleD1) : null,
      day1Retained: t.returnD1,
      day1Eligible: eligibleD1,
      day7Retention: eligibleD7 > 0 ? pct(t.returnD7, eligibleD7) : null,
      day7Retained: t.returnD7,
      day7Eligible: eligibleD7,
      day30Retention: eligibleD30 > 0 ? pct(t.returnD30, eligibleD30) : null,
      day30Retained: t.returnD30,
      day30Eligible: eligibleD30,
      shares: t.shares,
      sharesPctOfVoices: pct(t.shares, t.voices),
      voicesFromShares: t.voicesFromShares,
      shareConversion: pct(t.voicesFromShares, t.shares),
      firstDailyActPresented: t.firstDailyActPresented,
      firstDailyActCompleted: t.firstDailyActCompleted,
      firstDailyActCompletion: t.firstDailyActPresented > 0
        ? pct(t.firstDailyActCompleted, t.firstDailyActPresented)
        : null,
    },
    funnel,
    series,
    campaigns: campaignRows,
    journey,
    performance: campaignRows.map((c) => ({
      id: c.id,
      name: c.name,
      cost: c.cost,
      currency: c.currency,
      costPerVoice: c.costPerVoice,
    })),
    campaignCount: campaigns.length,
    activeCampaignCount: active.filter((c) => c.status === 'active').length,
  };
}

async function getCampaignDetail(id, { range = 'all', origin = '' } = {}) {
  const campaign = await readCampaign(id);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }
  const analytics = await buildAnalytics({ campaignId: id, range, origin });
  const link = joinUrlForCampaign(origin, id);
  let qrSvg = null;
  try {
    qrSvg = await QRCode.toString(link, { type: 'svg', margin: 1, width: 512 });
  } catch {
    qrSvg = null;
  }
  return { campaign, link, qrSvg, analytics };
}

async function getQrSvg(campaignId, { origin } = {}) {
  const campaign = await readCampaign(campaignId);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.statusCode = 404;
    throw err;
  }
  const link = joinUrlForCampaign(origin, campaignId);
  const svg = await QRCode.toString(link, { type: 'svg', margin: 1, width: 1024, color: { dark: '#000000', light: '#ffffff' } });
  return { link, svg, campaign };
}

module.exports = {
  CAMPAIGN_TYPES,
  EVENT_TYPES,
  RANGES,
  makeVisitorKey,
  publicOrigin,
  joinUrlForCampaign,
  referralUrl,
  createCampaign,
  updateCampaign,
  setCampaignStatus,
  listCampaigns,
  readCampaign,
  recordScan,
  recordEvent,
  ensureReferralToken,
  openReferral,
  attributeVoiceCreated,
  buildAnalytics,
  getCampaignDetail,
  getQrSvg,
};
