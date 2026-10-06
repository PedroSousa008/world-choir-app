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

function utcDayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function makeCampaignId() {
  const raw = randomBytes(5).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 7).toUpperCase();
  return `qr_c_${raw || randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
}

function makeVisitorKey(deviceId, anonId) {
  const seed = String(deviceId || anonId || '').trim() || randomUUID();
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
      appOpens: 0,
      appOpenKeys: [],
      illSing: 0,
      voices: 0,
      shares: 0,
      voicesFromShares: 0,
      openedMap: 0,
      practicedSong: 0,
      dailyAct: 0,
      worldChain: 0,
      returnD1: 0,
      returnD7: 0,
      returnD30: 0,
    };
  }
  const c = row.campaigns[campaignId];
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
      c[counter] = (c[counter] || 0) + 1;
    }
  };

  switch (eventType) {
    case EVENT_TYPES.QR_SCAN:
      c.scans += 1;
      if (unique || visitorKey) addUnique('uniqueScanKeys', 'uniqueScans');
      else c.uniqueScans = c.uniqueScans || 0;
      break;
    case EVENT_TYPES.APP_OPEN:
      addUnique('appOpenKeys', 'appOpens');
      break;
    case EVENT_TYPES.ILL_SING:
      c.illSing += 1;
      break;
    case EVENT_TYPES.VOICE_CREATED:
      c.voices += 1;
      break;
    case EVENT_TYPES.SHARE_CLICKED:
      c.shares += 1;
      break;
    case EVENT_TYPES.REFERRED_VOICE:
      c.voicesFromShares += 1;
      break;
    case EVENT_TYPES.OPENED_MAP:
      c.openedMap += 1;
      break;
    case EVENT_TYPES.PRACTICED_SONG:
      c.practicedSong += 1;
      break;
    case EVENT_TYPES.DAILY_ACT:
      c.dailyAct += 1;
      break;
    case EVENT_TYPES.WORLD_CHAIN:
      c.worldChain += 1;
      break;
    case EVENT_TYPES.RETURN_D1:
      c.returnD1 += 1;
      break;
    case EVENT_TYPES.RETURN_D7:
      c.returnD7 += 1;
      break;
    case EVENT_TYPES.RETURN_D30:
      c.returnD30 += 1;
      break;
    default:
      break;
  }
  // Derive uniqueScans count from keys when present
  if (Array.isArray(c.uniqueScanKeys)) c.uniqueScans = c.uniqueScanKeys.length;
  row.updatedAt = new Date().toISOString();
  await writeJson(dayPath(day), row, { overwrite: true });
  return row;
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
  await bumpDay(campaignId, EVENT_TYPES.QR_SCAN, { unique: isNewUnique, visitorKey });
  return {
    ok: true,
    campaignId,
    visitorKey,
    firstTouch: visitor.firstCampaignId === campaignId,
    campaignName: campaign.name,
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
  const key = visitorKey || makeVisitorKey(deviceId, anonId);
  let visitor = await readVisitor(key);
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
      if (visitor.voiceCreatedAt) bumped = false;
      else {
        visitor.voiceCreatedAt = now;
        visitor.voiceUserId = userId || visitor.voiceUserId;
        visitor.voiceNumber = voiceNumber ?? visitor.voiceNumber;
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
    default:
      break;
  }
  visitor.updatedAt = now;
  if (deviceId && !visitor.deviceId) visitor.deviceId = deviceId;
  if (userId && !visitor.voiceUserId) visitor.voiceUserId = userId;
  await writeVisitor(visitor);
  if (bumped) await bumpDay(campaignId, type, { visitorKey: key });
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
  // Prefer index listing via listBlobs when wide range
  try {
    const blobs = await listBlobs({ prefix: `${ROOT}/days/`, limit: 500 });
    for (const b of blobs.blobs || []) {
      if (!b.pathname.endsWith('.json')) continue;
      const day = b.pathname.split('/').pop().replace('.json', '');
      if (fromDay && day < fromDay) continue;
      if (toDay && day > toDay) continue;
      try {
        out.push(await readBlobJson(b.pathname));
      } catch { /* skip */ }
    }
  } catch {
    // Fallback: walk last 400 days max from toDay
    const end = toDay ? new Date(`${toDay}T00:00:00.000Z`) : new Date();
    const start = fromDay ? new Date(`${fromDay}T00:00:00.000Z`) : new Date(end.getTime() - 400 * 86400000);
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const day = utcDayKey(new Date(t));
      try {
        out.push(await readBlobJson(dayPath(day)));
      } catch { /* none */ }
    }
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

  // Unique scans across days can over-count if summed — for ALL range use max of
  // uniqueScanKeys union when single campaign; for multi-campaign sum is acceptable approx.
  // Prefer stored uniqueScans sum as reported unique-scan-events; document as window unique approx.

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
      link: joinUrlForCampaign(origin, c.id),
    };
  });

  const journey = [
    { action: 'Opened Map', users: t.openedMap, pctOfVoices: pct(t.openedMap, t.voices) },
    { action: 'Practiced the Song', users: t.practicedSong, pctOfVoices: pct(t.practicedSong, t.voices) },
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
