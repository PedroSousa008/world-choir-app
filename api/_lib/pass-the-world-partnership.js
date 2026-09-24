/**
 * Pass the World — Owner Partnership control (versioned configs + activity periods).
 *
 * History is immutable: changing the current draft/logos never rewrites past periods.
 * Calendar dates are derived in UTC (Pass the World ritual clock).
 */
const { randomUUID } = require('crypto');
const {
  readBlobJson,
  writeJson,
  putPrivateBinary,
  assertBlobConfigured,
  mediaProxyUrl,
} = require('./store');
const { normalizeUploadImage } = require('./normalize-upload-image');

const ROOT = 'wc-data/pass-the-world/partnership';
const STATE_PATH = `${ROOT}/state.json`;
const CONFIGS_ROOT = `${ROOT}/configs`;
const PERIODS_ROOT = `${ROOT}/periods`;
const MEDIA_ROOT = `${ROOT}/media`;
const INDEX_PATH = `${ROOT}/index.json`;

/** Business calendar timezone for history day keys — matches PTW UTC ritual. */
const HISTORY_TIMEZONE = 'UTC';

const SUBTITLE_MAX_CHARS = 120;
const LINK_URL_MAX_CHARS = 2048;
const TAB_LOGO_RECOMMENDED = { width: 512, height: 512 };
const MAP_LOGO_RECOMMENDED = { width: 512, height: 512 };
const LINK_IMAGE_RECOMMENDED = { width: 1200, height: 630 };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_MIME_RE = /^image\/[a-z0-9.+-]+$/i;
const IMAGE_EXT_MAP = {
  png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif',
  svg: 'svg', 'svg+xml': 'svg', avif: 'avif', bmp: 'bmp',
  heic: 'heic', heif: 'heif', tiff: 'tiff', 'tif': 'tiff',
  'x-icon': 'ico', 'vnd.microsoft.icon': 'ico',
};

const IMAGE_FIELDS = new Set(['tabLogo', 'mapLogo', 'linkImage']);

function nowIso() {
  return new Date().toISOString();
}

function emptyImage() {
  return null;
}

function emptyDraft() {
  return {
    subtitle: '',
    tabLogo: emptyImage(),
    mapLogo: emptyImage(),
    linkImage: emptyImage(),
    linkUrl: '',
    updatedAt: null,
  };
}

/**
 * Normalize optional Link Image website. Empty is allowed.
 * Accepts bare domains (adds https://). Only http/https.
 */
function normalizeLinkUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';
  if (value.length > LINK_URL_MAX_CHARS) {
    value = value.slice(0, LINK_URL_MAX_CHARS);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    value = `https://${value}`;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw Object.assign(new Error('Link Image website must be a valid http or https URL'), {
      statusCode: 400,
      code: 'INVALID_LINK_URL',
    });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Link Image website must start with http:// or https://'), {
      statusCode: 400,
      code: 'INVALID_LINK_URL',
    });
  }
  return parsed.toString();
}

function emptyState() {
  return {
    version: 1,
    revision: 1,
    enabled: false,
    draft: emptyDraft(),
    activeConfigId: null,
    activePeriodId: null,
    updatedAt: null,
    updatedBy: null,
  };
}

function emptyIndex() {
  return {
    version: 1,
    configs: [],
    periods: [],
    updatedAt: null,
  };
}

function normalizeImage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = String(raw.url || '').trim();
  const pathname = String(raw.pathname || '').trim();
  if (!url && !pathname) return null;
  return {
    url: url || (pathname ? mediaProxyUrl(pathname) : ''),
    pathname: pathname || null,
    fileName: String(raw.fileName || '').trim() || null,
    contentType: String(raw.contentType || '').trim() || null,
    uploadedAt: raw.uploadedAt || null,
  };
}

function normalizeDraft(raw = {}, { strictLinkUrl = false } = {}) {
  let linkUrl = '';
  try {
    linkUrl = normalizeLinkUrl(raw.linkUrl);
  } catch (err) {
    if (strictLinkUrl) throw err;
    // Lenient read of stored/legacy drafts — keep empty rather than crash Owner UI.
    linkUrl = '';
  }
  return {
    subtitle: String(raw.subtitle || '').slice(0, SUBTITLE_MAX_CHARS),
    tabLogo: normalizeImage(raw.tabLogo),
    mapLogo: normalizeImage(raw.mapLogo),
    linkImage: normalizeImage(raw.linkImage),
    linkUrl,
    updatedAt: raw.updatedAt || null,
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState();
  return {
    version: 1,
    revision: Number(raw.revision) || 1,
    enabled: Boolean(raw.enabled),
    draft: normalizeDraft(raw.draft),
    activeConfigId: raw.activeConfigId ? String(raw.activeConfigId) : null,
    activePeriodId: raw.activePeriodId ? String(raw.activePeriodId) : null,
    updatedAt: raw.updatedAt || null,
    updatedBy: raw.updatedBy || null,
  };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  let linkUrl = '';
  try {
    linkUrl = normalizeLinkUrl(raw.linkUrl);
  } catch {
    linkUrl = '';
  }
  return {
    id,
    version: Number(raw.version) || 1,
    partnerId: String(raw.partnerId || '').trim() || null,
    subtitle: String(raw.subtitle || '').slice(0, SUBTITLE_MAX_CHARS),
    tabLogo: normalizeImage(raw.tabLogo),
    mapLogo: normalizeImage(raw.mapLogo),
    linkImage: normalizeImage(raw.linkImage),
    linkUrl,
    createdAt: raw.createdAt || null,
    createdBy: raw.createdBy || null,
  };
}

function normalizePeriod(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  return {
    id,
    configurationId: String(raw.configurationId || '').trim() || null,
    startedAt: raw.startedAt || null,
    endedAt: raw.endedAt || null,
    createdAt: raw.createdAt || null,
    createdBy: raw.createdBy || null,
    events: Array.isArray(raw.events) ? raw.events : [],
  };
}

function configPath(id) {
  return `${CONFIGS_ROOT}/${id}.json`;
}

function periodPath(id) {
  return `${PERIODS_ROOT}/${id}.json`;
}

function draftIsComplete(draft) {
  const d = normalizeDraft(draft);
  const missing = [];
  if (!String(d.subtitle || '').trim()) missing.push('subtitle');
  if (!d.tabLogo?.url) missing.push('tabLogo');
  if (!d.mapLogo?.url) missing.push('mapLogo');
  if (!d.linkImage?.url) missing.push('linkImage');
  return { ok: missing.length === 0, missing };
}

function draftsEqual(a, b) {
  const x = normalizeDraft(a);
  const y = normalizeDraft(b);
  const imgKey = (img) => (img?.pathname || img?.url || '');
  return (
    String(x.subtitle || '') === String(y.subtitle || '')
    && String(x.linkUrl || '') === String(y.linkUrl || '')
    && imgKey(x.tabLogo) === imgKey(y.tabLogo)
    && imgKey(x.mapLogo) === imgKey(y.mapLogo)
    && imgKey(x.linkImage) === imgKey(y.linkImage)
  );
}

function configFromDraft(draft, { createdBy, createdAt, version = 1, partnerId = null } = {}) {
  const d = normalizeDraft(draft, { strictLinkUrl: true });
  return {
    id: `cfg_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    version,
    partnerId: String(partnerId || '').trim() || `ptr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    subtitle: d.subtitle,
    tabLogo: d.tabLogo,
    mapLogo: d.mapLogo,
    linkImage: d.linkImage,
    linkUrl: d.linkUrl || '',
    createdAt: createdAt || nowIso(),
    createdBy: createdBy || null,
  };
}

function partnerMatchKey(configOrDraft) {
  const pathname = configOrDraft?.mapLogo?.pathname || '';
  if (pathname) return `logo:${pathname}`;
  const subtitle = String(configOrDraft?.subtitle || '').trim().toLowerCase();
  if (subtitle) return `sub:${subtitle}`;
  const link = String(configOrDraft?.linkUrl || '').trim().toLowerCase();
  if (link) {
    try {
      return `host:${new URL(link).hostname}`;
    } catch {
      return `link:${link}`;
    }
  }
  return null;
}

async function resolvePartnerIdForDraft(draft, { previousConfigId = null } = {}) {
  if (previousConfigId) {
    const prev = await readConfig(previousConfigId);
    if (prev?.partnerId) return prev.partnerId;
  }
  const key = partnerMatchKey(draft);
  if (!key) return null;
  const index = await readIndex();
  for (const entry of index.configs || []) {
    const cfg = await readConfig(entry.id);
    if (!cfg) continue;
    if (partnerMatchKey(cfg) === key && cfg.partnerId) return cfg.partnerId;
  }
  return null;
}

function publicConfigProjection(config) {
  if (!config) return null;
  return {
    id: config.id,
    subtitle: config.subtitle || '',
    tabLogoUrl: config.tabLogo?.url || null,
    mapLogoUrl: config.mapLogo?.url || null,
    linkImageUrl: config.linkImage?.url || null,
    linkUrl: config.linkUrl || '',
  };
}

async function readState() {
  assertBlobConfigured();
  try {
    return normalizeState(await readBlobJson(STATE_PATH));
  } catch {
    return emptyState();
  }
}

async function writeState(state) {
  assertBlobConfigured();
  const next = normalizeState(state);
  next.revision = (Number(next.revision) || 0) + 1;
  next.updatedAt = nowIso();
  await writeJson(STATE_PATH, next, { overwrite: true });
  return next;
}

async function readIndex() {
  try {
    const data = await readBlobJson(INDEX_PATH);
    return {
      version: 1,
      configs: Array.isArray(data?.configs) ? data.configs : [],
      periods: Array.isArray(data?.periods) ? data.periods : [],
      updatedAt: data?.updatedAt || null,
    };
  } catch {
    return emptyIndex();
  }
}

async function writeIndex(index) {
  const next = {
    version: 1,
    configs: Array.isArray(index.configs) ? index.configs : [],
    periods: Array.isArray(index.periods) ? index.periods : [],
    updatedAt: nowIso(),
  };
  await writeJson(INDEX_PATH, next, { overwrite: true });
  return next;
}

async function readConfig(id) {
  if (!id) return null;
  try {
    return normalizeConfig(await readBlobJson(configPath(id)));
  } catch {
    return null;
  }
}

async function writeConfig(config) {
  const row = normalizeConfig(config);
  if (!row) throw new Error('Invalid partnership configuration');
  await writeJson(configPath(row.id), row, { overwrite: false });
  return row;
}

async function readPeriod(id) {
  if (!id) return null;
  try {
    return normalizePeriod(await readBlobJson(periodPath(id)));
  } catch {
    return null;
  }
}

async function writePeriod(period, { overwrite = true } = {}) {
  const row = normalizePeriod(period);
  if (!row) throw new Error('Invalid partnership period');
  await writeJson(periodPath(row.id), row, { overwrite });
  return row;
}

function parseDataUrl(dataUrl, fileName = '') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw Object.assign(new Error('Choose an image from your device'), { statusCode: 400 });
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw Object.assign(new Error('Could not read that image file'), { statusCode: 400 });
  }

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

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw Object.assign(new Error('Image file was empty'), { statusCode: 400 });
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('Image must be under 8 MB'), { statusCode: 400 });
  }

  const subtype = contentType.replace(/^image\//, '');
  const ext = IMAGE_EXT_MAP[subtype] || subtype.replace(/[^a-z0-9]/gi, '') || 'img';
  return { contentType, buffer, ext, fileName: String(fileName || '').trim() };
}

async function uploadPartnershipImage({ field, dataUrl, fileName = '', actor = null } = {}) {
  assertBlobConfigured();
  if (!IMAGE_FIELDS.has(field)) {
    throw Object.assign(new Error('Unknown image field'), { statusCode: 400 });
  }
  const parsed = parseDataUrl(dataUrl, fileName);
  const normalized = await normalizeUploadImage(parsed.buffer, {
    contentType: parsed.contentType,
    fileName: parsed.fileName || fileName,
  });
  const ext = normalized.ext || parsed.ext || 'jpg';
  const contentType = normalized.contentType;
  const pathname = `${MEDIA_ROOT}/${field}-${randomUUID().slice(0, 12)}.${ext}`;
  await putPrivateBinary(pathname, normalized.buffer, contentType, { overwrite: false });
  const image = {
    url: mediaProxyUrl(pathname),
    pathname,
    fileName: (parsed.fileName || `${field}.${ext}`).replace(/\.(heic|heif)$/i, '.jpg'),
    contentType,
    uploadedAt: nowIso(),
  };
  // Image is stored immutably; draft is updated only on Save / Activate.
  return { image, field, uploadedBy: actor || null };
}

async function removePartnershipImage({ field, actor = null } = {}) {
  assertBlobConfigured();
  if (!IMAGE_FIELDS.has(field)) {
    throw Object.assign(new Error('Unknown image field'), { statusCode: 400 });
  }
  // Historical media files are never deleted. Draft clearing happens on Save.
  return { field, removed: true, by: actor || null };
}

function ownerSnapshot(state, extras = {}) {
  return {
    enabled: Boolean(state.enabled),
    draft: normalizeDraft(state.draft),
    activeConfigId: state.activeConfigId,
    activePeriodId: state.activePeriodId,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    revision: state.revision,
    limits: {
      subtitleMaxChars: SUBTITLE_MAX_CHARS,
      linkUrlMaxChars: LINK_URL_MAX_CHARS,
      tabLogoRecommended: TAB_LOGO_RECOMMENDED,
      mapLogoRecommended: MAP_LOGO_RECOMMENDED,
      linkImageRecommended: LINK_IMAGE_RECOMMENDED,
      maxImageBytes: MAX_IMAGE_BYTES,
    },
    historyTimezone: HISTORY_TIMEZONE,
    ...extras,
  };
}

async function getOwnerPartnership() {
  const state = await readState();
  let activeConfig = null;
  if (state.activeConfigId) {
    activeConfig = await readConfig(state.activeConfigId);
  }
  return ownerSnapshot(state, {
    activeConfig: publicConfigProjection(activeConfig),
    completeness: draftIsComplete(state.draft),
  });
}

async function savePartnershipDraft({ draft, actor = null, confirmLiveUpdate = false } = {}) {
  assertBlobConfigured();
  const state = await readState();
  const nextDraft = normalizeDraft({
    ...state.draft,
    ...draft,
    // Preserve images unless explicitly cleared (null) or replaced.
    tabLogo: draft && Object.prototype.hasOwnProperty.call(draft, 'tabLogo')
      ? normalizeImage(draft.tabLogo)
      : state.draft.tabLogo,
    mapLogo: draft && Object.prototype.hasOwnProperty.call(draft, 'mapLogo')
      ? normalizeImage(draft.mapLogo)
      : state.draft.mapLogo,
    linkImage: draft && Object.prototype.hasOwnProperty.call(draft, 'linkImage')
      ? normalizeImage(draft.linkImage)
      : state.draft.linkImage,
    linkUrl: draft && Object.prototype.hasOwnProperty.call(draft, 'linkUrl')
      ? draft.linkUrl
      : state.draft.linkUrl,
    updatedAt: nowIso(),
  }, { strictLinkUrl: true });

  if (String(nextDraft.subtitle || '').length > SUBTITLE_MAX_CHARS) {
    throw Object.assign(new Error(`Subtitle must be ${SUBTITLE_MAX_CHARS} characters or fewer`), { statusCode: 400 });
  }

  const unchanged = draftsEqual(state.draft, nextDraft);
  state.draft = nextDraft;
  state.updatedBy = actor || state.updatedBy;

  // While OFF: saving only updates the prepared draft (not live, no history).
  if (!state.enabled) {
    const saved = await writeState(state);
    return {
      ok: true,
      liveUpdated: false,
      state: ownerSnapshot(saved, { completeness: draftIsComplete(saved.draft) }),
    };
  }

  // While ON: saving creates a new immutable config version + period split.
  if (unchanged) {
    const saved = await writeState(state);
    return {
      ok: true,
      liveUpdated: false,
      state: ownerSnapshot(saved, {
        activeConfig: publicConfigProjection(await readConfig(saved.activeConfigId)),
        completeness: draftIsComplete(saved.draft),
      }),
    };
  }

  if (!confirmLiveUpdate) {
    throw Object.assign(new Error('Live partnership update requires confirmation'), {
      statusCode: 409,
      code: 'CONFIRM_LIVE_UPDATE',
    });
  }

  const completeness = draftIsComplete(nextDraft);
  if (!completeness.ok) {
    throw Object.assign(new Error('Complete the partnership information before updating the live experience.'), {
      statusCode: 400,
      missing: completeness.missing,
    });
  }

  const stamp = nowIso();
  const prevConfigId = state.activeConfigId;
  const partnerId = await resolvePartnerIdForDraft(nextDraft, { previousConfigId: prevConfigId });
  const config = configFromDraft(nextDraft, {
    createdBy: actor,
    createdAt: stamp,
    partnerId,
  });
  await writeConfig(config);

  // Close current period
  if (state.activePeriodId) {
    const period = await readPeriod(state.activePeriodId);
    if (period && !period.endedAt) {
      period.endedAt = stamp;
      period.events = [
        ...(period.events || []),
        { at: stamp, type: 'superseded', configurationId: period.configurationId, by: actor || null },
      ];
      await writePeriod(period);
      await upsertIndexPeriod(period);
    }
  }

  const period = {
    id: `prd_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    configurationId: config.id,
    startedAt: stamp,
    endedAt: null,
    createdAt: stamp,
    createdBy: actor || null,
    events: [
      { at: stamp, type: 'updated', configurationId: config.id, by: actor || null },
    ],
  };
  await writePeriod(period, { overwrite: false });
  await upsertIndexConfig(config);
  await upsertIndexPeriod(period);

  state.enabled = true;
  state.activeConfigId = config.id;
  state.activePeriodId = period.id;
  const saved = await writeState(state);

  return {
    ok: true,
    liveUpdated: true,
    state: ownerSnapshot(saved, {
      activeConfig: publicConfigProjection(config),
      completeness: draftIsComplete(saved.draft),
    }),
  };
}

async function upsertIndexConfig(config) {
  const index = await readIndex();
  const entry = {
    id: config.id,
    createdAt: config.createdAt,
    subtitle: config.subtitle,
    tabLogoUrl: config.tabLogo?.url || null,
  };
  const i = index.configs.findIndex((c) => c.id === config.id);
  if (i >= 0) index.configs[i] = entry;
  else index.configs.push(entry);
  await writeIndex(index);
}

async function upsertIndexPeriod(period) {
  const index = await readIndex();
  const entry = {
    id: period.id,
    configurationId: period.configurationId,
    startedAt: period.startedAt,
    endedAt: period.endedAt,
  };
  const i = index.periods.findIndex((p) => p.id === period.id);
  if (i >= 0) index.periods[i] = entry;
  else index.periods.push(entry);
  // Keep newest first for convenience
  index.periods.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  await writeIndex(index);
}

async function setPartnershipEnabled({ enabled, actor = null } = {}) {
  assertBlobConfigured();
  const wantOn = Boolean(enabled);
  const state = await readState();

  if (wantOn === state.enabled) {
    return {
      ok: true,
      unchanged: true,
      state: ownerSnapshot(state, {
        activeConfig: publicConfigProjection(await readConfig(state.activeConfigId)),
        completeness: draftIsComplete(state.draft),
      }),
    };
  }

  if (wantOn) {
    const completeness = draftIsComplete(state.draft);
    if (!completeness.ok) {
      throw Object.assign(new Error('Complete the partnership information before activating.'), {
        statusCode: 400,
        missing: completeness.missing,
        code: 'INCOMPLETE',
      });
    }

    const stamp = nowIso();
    const partnerId = await resolvePartnerIdForDraft(state.draft, {
      previousConfigId: state.activeConfigId,
    });
    const config = configFromDraft(state.draft, {
      createdBy: actor,
      createdAt: stamp,
      partnerId,
    });
    await writeConfig(config);

    // Safety: close any dangling open period
    if (state.activePeriodId) {
      const dangling = await readPeriod(state.activePeriodId);
      if (dangling && !dangling.endedAt) {
        dangling.endedAt = stamp;
        dangling.events = [
          ...(dangling.events || []),
          { at: stamp, type: 'closed_before_activate', configurationId: dangling.configurationId, by: actor || null },
        ];
        await writePeriod(dangling);
        await upsertIndexPeriod(dangling);
      }
    }

    const period = {
      id: `prd_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      configurationId: config.id,
      startedAt: stamp,
      endedAt: null,
      createdAt: stamp,
      createdBy: actor || null,
      events: [
        { at: stamp, type: 'activated', configurationId: config.id, by: actor || null },
      ],
    };
    await writePeriod(period, { overwrite: false });
    await upsertIndexConfig(config);
    await upsertIndexPeriod(period);

    state.enabled = true;
    state.activeConfigId = config.id;
    state.activePeriodId = period.id;
    state.updatedBy = actor || state.updatedBy;
    const saved = await writeState(state);
    return {
      ok: true,
      enabled: true,
      state: ownerSnapshot(saved, {
        activeConfig: publicConfigProjection(config),
        completeness: draftIsComplete(saved.draft),
      }),
    };
  }

  // Turn OFF — close period, keep draft intact
  const stamp = nowIso();
  if (state.activePeriodId) {
    const period = await readPeriod(state.activePeriodId);
    if (period && !period.endedAt) {
      period.endedAt = stamp;
      period.events = [
        ...(period.events || []),
        { at: stamp, type: 'deactivated', configurationId: period.configurationId, by: actor || null },
      ];
      await writePeriod(period);
      await upsertIndexPeriod(period);
    }
  }

  state.enabled = false;
  state.activeConfigId = null;
  state.activePeriodId = null;
  state.updatedBy = actor || state.updatedBy;
  const saved = await writeState(state);
  return {
    ok: true,
    enabled: false,
    state: ownerSnapshot(saved, { completeness: draftIsComplete(saved.draft) }),
  };
}

/** UTC calendar day key YYYY-MM-DD */
function dateKeyUTC(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function monthBoundsUTC(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw Object.assign(new Error('Invalid year/month'), { statusCode: 400 });
  }
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart).getTime();
  const ae = aEnd ? new Date(aEnd).getTime() : Number.POSITIVE_INFINITY;
  const bs = new Date(bStart).getTime();
  const be = bEnd ? new Date(bEnd).getTime() : Number.POSITIVE_INFINITY;
  return as < be && bs < ae;
}

async function loadPeriodsOverlapping(startIso, endIso) {
  const index = await readIndex();
  const candidates = (index.periods || []).filter((p) => {
    if (!p?.startedAt) return false;
    return rangesOverlap(p.startedAt, p.endedAt, startIso, endIso);
  });

  const periods = [];
  for (const entry of candidates) {
    const full = await readPeriod(entry.id);
    if (full) periods.push(full);
  }
  periods.sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
  return periods;
}

async function loadConfigsForPeriods(periods) {
  const ids = [...new Set(periods.map((p) => p.configurationId).filter(Boolean))];
  const map = new Map();
  await Promise.all(ids.map(async (id) => {
    const cfg = await readConfig(id);
    if (cfg) map.set(id, cfg);
  }));
  return map;
}

function dayKeyInRange(startMs, endMsExclusive, dayKey) {
  const dayStart = Date.parse(`${dayKey}T00:00:00.000Z`);
  const dayEnd = dayStart + 86400000;
  return startMs < dayEnd && endMsExclusive > dayStart;
}

async function getPartnershipHistoryMonth({ year, month } = {}) {
  const { start, end, startIso, endIso } = monthBoundsUTC(year, month);
  const todayKey = dateKeyUTC(new Date());
  const periods = await loadPeriodsOverlapping(startIso, endIso);
  const configs = await loadConfigsForPeriods(periods);

  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  const days = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isFuture = key > todayKey;
    const dayStart = Date.parse(`${key}T00:00:00.000Z`);
    const dayEnd = dayStart + 86400000;

    if (isFuture) {
      days.push({
        date: key,
        status: 'future',
        logos: [],
        periodCount: 0,
      });
      continue;
    }

    const activeOnDay = periods.filter((p) => {
      const ps = new Date(p.startedAt).getTime();
      const pe = p.endedAt ? new Date(p.endedAt).getTime() : Number.POSITIVE_INFINITY;
      return dayKeyInRange(ps, pe, key);
    });

    if (!activeOnDay.length) {
      days.push({
        date: key,
        status: 'off',
        logos: [],
        periodCount: 0,
      });
      continue;
    }

    const logos = [];
    const seen = new Set();
    for (const p of activeOnDay) {
      const cfg = configs.get(p.configurationId);
      // Calendar thumbnails use Map Logo (not Tab Logo).
      const url = cfg?.mapLogo?.url || null;
      if (url && !seen.has(url)) {
        seen.add(url);
        logos.push({
          url,
          configurationId: p.configurationId,
          periodId: p.id,
        });
      }
    }

    days.push({
      date: key,
      status: 'active',
      logos,
      periodCount: activeOnDay.length,
    });
  }

  return {
    year: Number(year),
    month: Number(month),
    timezone: HISTORY_TIMEZONE,
    today: todayKey,
    days,
    legend: {
      active: 'Partnership active',
      off: 'Partnership off',
      future: 'Future day',
    },
  };
}

async function getPartnershipDayDetail({ date } = {}) {
  const key = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw Object.assign(new Error('date must be YYYY-MM-DD'), { statusCode: 400 });
  }
  const dayStart = `${key}T00:00:00.000Z`;
  const dayEnd = new Date(Date.parse(dayStart) + 86400000).toISOString();
  const periods = await loadPeriodsOverlapping(dayStart, dayEnd);
  const configs = await loadConfigsForPeriods(periods);
  const todayKey = dateKeyUTC(new Date());

  if (key > todayKey) {
    return {
      date: key,
      timezone: HISTORY_TIMEZONE,
      status: 'future',
      segments: [],
      events: [],
    };
  }

  const segments = periods.map((p) => {
    const cfg = configs.get(p.configurationId);
    const segStart = p.startedAt;
    const segEnd = p.endedAt;
    return {
      periodId: p.id,
      configurationId: p.configurationId,
      startedAt: segStart,
      endedAt: segEnd,
      subtitle: cfg?.subtitle || '',
      tabLogoUrl: cfg?.tabLogo?.url || null,
      mapLogoUrl: cfg?.mapLogo?.url || null,
      linkImageUrl: cfg?.linkImage?.url || null,
      linkUrl: cfg?.linkUrl || '',
      tabLogoFileName: cfg?.tabLogo?.fileName || null,
      mapLogoFileName: cfg?.mapLogo?.fileName || null,
      linkImageFileName: cfg?.linkImage?.fileName || null,
    };
  });

  // Day modal no longer lists history events — skip that scan for faster opens.
  const base = {
    date: key,
    timezone: HISTORY_TIMEZONE,
    status: segments.length ? 'active' : 'off',
    segments,
    events: [],
  };

  try {
    const {
      getPartnershipDayAnalytics,
    } = require('./pass-the-world-partnership-analytics');
    base.analytics = await getPartnershipDayAnalytics({
      date: key,
      segments,
      now: new Date(),
    });
  } catch (err) {
    base.analytics = {
      available: false,
      unavailable: false,
      error: true,
      unavailableReason: err.message || 'Daily analytics could not be loaded.',
      timeline: null,
      metrics: null,
      byConfiguration: [],
    };
  }

  return base;
}

/**
 * Public projection for Pass the World user experience.
 * When disabled, returns { enabled: false } only — no partnership content.
 */
async function getPublicPartnership() {
  try {
    const state = await readState();
    if (!state.enabled || !state.activeConfigId) {
      return { enabled: false };
    }
    const config = await readConfig(state.activeConfigId);
    if (!config) return { enabled: false };
    return {
      enabled: true,
      subtitle: config.subtitle || '',
      tabLogoUrl: config.tabLogo?.url || null,
      mapLogoUrl: config.mapLogo?.url || null,
      linkImageUrl: config.linkImage?.url || null,
      linkUrl: config.linkUrl || '',
      configurationId: config.id,
    };
  } catch {
    return { enabled: false };
  }
}

/**
 * Group historical configs into stable partnership identities.
 * Config updates while ON (supersede) stay the same partner.
 * Explicit partnerId is preferred; otherwise lineage + logo/subtitle match.
 */
async function buildPartnerGroups(periods, configsById) {
  const sorted = [...(periods || [])].sort((a, b) => (
    String(a.startedAt || '').localeCompare(String(b.startedAt || ''))
  ));

  const parent = new Map();
  const find = (id) => {
    if (!id) return null;
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id);
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a, b) => {
    if (!a || !b) return;
    const ra = find(a);
    const rb = find(b);
    if (ra && rb && ra !== rb) parent.set(ra, rb);
  };

  for (const cfg of configsById.values()) {
    if (cfg?.id) find(cfg.id);
  }

  // Explicit partnerId unions
  const byPartnerId = new Map();
  for (const cfg of configsById.values()) {
    if (!cfg?.id) continue;
    if (cfg.partnerId) {
      if (byPartnerId.has(cfg.partnerId)) union(cfg.id, byPartnerId.get(cfg.partnerId));
      else byPartnerId.set(cfg.partnerId, cfg.id);
    }
  }

  // Supersede lineage: consecutive periods sharing end/start stamp
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a?.configurationId || !b?.configurationId) continue;
    const aEnd = a.endedAt ? new Date(a.endedAt).getTime() : null;
    const bStart = b.startedAt ? new Date(b.startedAt).getTime() : null;
    if (!Number.isFinite(aEnd) || !Number.isFinite(bStart)) continue;
    if (Math.abs(aEnd - bStart) > 5000) continue;
    const events = a.events || [];
    const superseded = events.some((ev) => (
      ev && (ev.type === 'superseded' || ev.type === 'updated' || ev.type === 'closed_before_activate')
    ));
    const bEvents = b.events || [];
    const updated = bEvents.some((ev) => ev && (ev.type === 'updated' || ev.type === 'activated'));
    if (superseded || updated) {
      union(a.configurationId, b.configurationId);
    }
  }

  // Match key unions for configs still alone
  const byKey = new Map();
  for (const cfg of configsById.values()) {
    if (!cfg?.id) continue;
    const key = partnerMatchKey(cfg);
    if (!key) continue;
    if (byKey.has(key)) union(cfg.id, byKey.get(key));
    else byKey.set(key, cfg.id);
  }

  const groupsMap = new Map();
  for (const cfg of configsById.values()) {
    if (!cfg?.id) continue;
    const root = find(cfg.id);
    if (!groupsMap.has(root)) {
      groupsMap.set(root, {
        rootConfigId: root,
        configurationIds: [],
        configs: [],
      });
    }
    const g = groupsMap.get(root);
    g.configurationIds.push(cfg.id);
    g.configs.push(cfg);
  }

  // Only include groups that actually had activity periods
  const activeConfigIds = new Set((periods || []).map((p) => p.configurationId).filter(Boolean));
  const groups = [];
  for (const g of groupsMap.values()) {
    const ids = g.configurationIds.filter((id) => activeConfigIds.has(id));
    if (!ids.length) continue;
    const relatedPeriods = (periods || [])
      .filter((p) => ids.includes(p.configurationId))
      .sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
    if (!relatedPeriods.length) continue;

    const latestCfg = [...g.configs].sort((a, b) => (
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    ))[0];
    const firstStart = relatedPeriods[0].startedAt;
    const last = relatedPeriods[relatedPeriods.length - 1];
    const lastEnd = last.endedAt || null;
    const partnerId = latestCfg?.partnerId || `ptr_legacy_${g.rootConfigId}`;
    const startKey = firstStart ? String(firstStart).slice(0, 10) : null;
    const endKey = lastEnd ? String(lastEnd).slice(0, 10) : null;

    groups.push({
      partnerId,
      label: latestCfg?.subtitle || 'Partnership',
      mapLogoUrl: latestCfg?.mapLogo?.url || null,
      configurationIds: [...new Set(ids)],
      dateRange: {
        startAt: firstStart,
        endAt: lastEnd,
        startDate: startKey,
        endDate: endKey,
        open: !lastEnd,
      },
    });
  }

  groups.sort((a, b) => String(b.dateRange?.startAt || '').localeCompare(String(a.dateRange?.startAt || '')));
  return groups;
}

async function getPartnershipOverall() {
  assertBlobConfigured();
  const index = await readIndex();
  const periodIds = [...new Set((index.periods || []).map((p) => p.id).filter(Boolean))];
  const periods = [];
  for (const id of periodIds) {
    const full = await readPeriod(id);
    if (full) periods.push(full);
  }
  periods.sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));

  const configIds = [...new Set(periods.map((p) => p.configurationId).filter(Boolean))];
  // Also load all indexed configs so partner matching can see unused siblings
  for (const entry of index.configs || []) {
    if (entry?.id) configIds.push(entry.id);
  }
  const uniqueConfigIds = [...new Set(configIds)];
  const configsById = new Map();
  for (const id of uniqueConfigIds) {
    const cfg = await readConfig(id);
    if (cfg) configsById.set(id, cfg);
  }

  const partnerGroups = await buildPartnerGroups(periods, configsById);
  const {
    getPartnershipOverallAnalytics,
  } = require('./pass-the-world-partnership-analytics');
  return getPartnershipOverallAnalytics({
    periods,
    partnerGroups,
    now: new Date(),
  });
}

module.exports = {
  HISTORY_TIMEZONE,
  SUBTITLE_MAX_CHARS,
  LINK_URL_MAX_CHARS,
  TAB_LOGO_RECOMMENDED,
  MAP_LOGO_RECOMMENDED,
  LINK_IMAGE_RECOMMENDED,
  getOwnerPartnership,
  savePartnershipDraft,
  setPartnershipEnabled,
  uploadPartnershipImage,
  removePartnershipImage,
  getPartnershipHistoryMonth,
  getPartnershipDayDetail,
  getPartnershipOverall,
  getPublicPartnership,
  draftIsComplete,
  normalizeLinkUrl,
  MEDIA_ROOT,
};
