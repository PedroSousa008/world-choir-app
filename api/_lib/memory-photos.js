/**
 * Memory photos — event-scoped chronological feed.
 * Photos live 24 hours from server publish time, then leave the public stream.
 * Users may post at most once every 24 hours (rolling window).
 * Blob layout under wc-data/memory/{eventId}/…
 */
const { randomUUID } = require('crypto');
const {
  assertBlobConfigured,
  findUserByDevice,
  readPledge,
  readBlobJson,
  writeJson,
  putPrivateBinary,
  mediaProxyUrl,
} = require('./store');

const ROOT = 'wc-data/memory';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_CAPTION = 200;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

const IMAGE_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const IMAGE_EXT_MAP = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
};

function eventRoot(eventId) {
  return `${ROOT}/${String(eventId || 'world-choir-2027').trim()}`;
}

function photoPath(eventId, photoId) {
  return `${eventRoot(eventId)}/photos/${photoId}.json`;
}

function progressPath(eventId, userId) {
  return `${eventRoot(eventId)}/progress/${userId}.json`;
}

/** Rolling 24h cooldown record (replaces calendar-day locks). */
function userCooldownPath(eventId, userId) {
  return `${eventRoot(eventId)}/by-user/${userId}/last-post.json`;
}

/** Short-lived create lock to reduce double-tap races. */
function userCreateLockPath(eventId, userId) {
  return `${eventRoot(eventId)}/by-user/${userId}/create-lock.json`;
}

function feedDayPath(eventId, day) {
  return `${eventRoot(eventId)}/feed-days/${day}.json`;
}

function feedMetaPath(eventId) {
  return `${eventRoot(eventId)}/feed-meta.json`;
}

function mediaPath(eventId, userId, photoId, ext) {
  return `${eventRoot(eventId)}/media/${userId}/${photoId}.${ext}`;
}

function utcDayString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function expiresAtFrom(createdAt) {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  return new Date(t + PHOTO_TTL_MS).toISOString();
}

function isWithinTtl(createdAt, nowMs = Date.now()) {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < PHOTO_TTL_MS;
}

function compareCursor(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const ca = String(a.createdAt || '');
  const cb = String(b.createdAt || '');
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  const ia = String(a.id || '');
  const ib = String(b.id || '');
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

function isAfterCursor(item, cursor) {
  if (!cursor || !cursor.createdAt) return true;
  return compareCursor(item, cursor) > 0;
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    const err = new Error('Choose an image from your device');
    err.code = 'INVALID_IMAGE';
    throw err;
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    const err = new Error('Could not read that image file');
    err.code = 'INVALID_IMAGE';
    throw err;
  }
  let contentType = String(match[1] || '').trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    const err = new Error('Image file was empty');
    err.code = 'INVALID_IMAGE';
    throw err;
  }
  return { contentType, buffer };
}

function sanitizeCaption(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length > MAX_CAPTION) {
    const err = new Error(`Caption must be ${MAX_CAPTION} characters or fewer`);
    err.code = 'CAPTION_TOO_LONG';
    throw err;
  }
  return text;
}

function publicPhoto(row, nowMs = Date.now()) {
  if (!row || row.deletedAt || row.moderationStatus === 'rejected') return null;
  if (row.moderationStatus && row.moderationStatus !== 'approved' && row.moderationStatus !== 'pending') {
    return null;
  }
  const createdAt = row.publishedAt || row.createdAt;
  if (!isWithinTtl(createdAt, nowMs)) return null;

  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    userName: row.userName || null,
    imageUrl: row.imageUrl,
    thumbnailUrl: row.thumbnailUrl || row.imageUrl,
    caption: row.caption || '',
    city: row.city || null,
    country: row.country || null,
    createdAt: row.createdAt,
    publishedAt: createdAt,
    expiresAt: row.expiresAt || expiresAtFrom(createdAt),
    moderationStatus: row.moderationStatus || 'approved',
  };
}

async function readFeedMeta(eventId) {
  try {
    return await readBlobJson(feedMetaPath(eventId));
  } catch {
    return { oldestDay: null, newestDay: null, photoCount: 0 };
  }
}

async function readFeedDay(eventId, day) {
  try {
    const data = await readBlobJson(feedDayPath(eventId, day));
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

async function writeFeedDay(eventId, day, items) {
  await writeJson(feedDayPath(eventId, day), {
    day,
    updatedAt: new Date().toISOString(),
    items,
  }, { overwrite: true });
}

function dayRange(fromDay, toDay) {
  if (!fromDay || !toDay) return [];
  const out = [];
  const cur = new Date(`${fromDay}T00:00:00.000Z`);
  const end = new Date(`${toDay}T00:00:00.000Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return [];
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function appendFeedIndex(eventId, entry) {
  const day = utcDayString(new Date(entry.createdAt));
  const items = await readFeedDay(eventId, day);
  if (!items.some((i) => i.id === entry.id)) {
    items.push({
      id: entry.id,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt || expiresAtFrom(entry.createdAt),
    });
    items.sort((a, b) => compareCursor(a, b));
    await writeFeedDay(eventId, day, items);
  }

  const meta = await readFeedMeta(eventId);
  if (!meta.oldestDay || day < meta.oldestDay) meta.oldestDay = day;
  if (!meta.newestDay || day > meta.newestDay) meta.newestDay = day;
  meta.photoCount = Number(meta.photoCount || 0) + 1;
  meta.updatedAt = new Date().toISOString();
  await writeJson(feedMetaPath(eventId), meta, { overwrite: true });
}

async function loadPhoto(eventId, photoId) {
  try {
    const row = await readBlobJson(photoPath(eventId, photoId));
    return publicPhoto(row);
  } catch {
    return null;
  }
}

async function getMemoryPhoto(eventId, photoId) {
  assertBlobConfigured();
  return loadPhoto(eventId, photoId);
}

function aliveWindowStartDay(nowMs = Date.now()) {
  return utcDayString(new Date(nowMs - PHOTO_TTL_MS));
}

/**
 * Cursor feed: oldest → newest after optional cursor.
 * Only photos still inside the 24h lifetime are returned.
 */
async function listMemoryPhotos({
  eventId,
  afterCreatedAt = null,
  afterId = null,
  limit = DEFAULT_LIMIT,
} = {}) {
  assertBlobConfigured();
  const id = String(eventId || 'world-choir-2027').trim();
  const take = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const nowMs = Date.now();
  const minAliveIso = new Date(nowMs - PHOTO_TTL_MS).toISOString();
  const cursor = afterCreatedAt
    ? { createdAt: String(afterCreatedAt), id: String(afterId || '') }
    : null;

  const meta = await readFeedMeta(id);
  if (!meta.oldestDay || !meta.newestDay) {
    return { items: [], nextCursor: null };
  }

  // Only scan days that can still contain alive photos.
  const aliveStart = aliveWindowStartDay(nowMs);
  const rangeStart = cursor?.createdAt
    ? String(cursor.createdAt).slice(0, 10)
    : aliveStart;
  const startDay = rangeStart < aliveStart ? aliveStart : rangeStart;
  if (startDay > meta.newestDay) {
    return { items: [], nextCursor: null };
  }

  const days = dayRange(startDay, meta.newestDay);
  const items = [];

  for (const day of days) {
    const dayItems = await readFeedDay(id, day);
    for (const entry of dayItems) {
      if (String(entry.createdAt || '') < minAliveIso) continue;
      if (!isAfterCursor(entry, cursor)) continue;
      const photo = await loadPhoto(id, entry.id);
      if (!photo) continue;
      items.push(photo);
      if (items.length >= take) {
        const last = items[items.length - 1];
        return {
          items,
          nextCursor: { createdAt: last.createdAt, id: last.id },
        };
      }
    }
  }

  return { items, nextCursor: null };
}

async function listNewerMemoryPhotos({
  eventId,
  afterCreatedAt,
  afterId,
  limit = DEFAULT_LIMIT,
} = {}) {
  return listMemoryPhotos({ eventId, afterCreatedAt, afterId, limit });
}

async function getUserProgress(eventId, userId) {
  try {
    return await readBlobJson(progressPath(eventId, userId));
  } catch {
    return null;
  }
}

async function saveUserProgress({ eventId, userId, lastConsumedPhotoId, lastConsumedCreatedAt }) {
  assertBlobConfigured();
  const existing = await getUserProgress(eventId, userId);
  const next = {
    lastConsumedPhotoId: String(lastConsumedPhotoId || ''),
    lastConsumedCreatedAt: String(lastConsumedCreatedAt || ''),
  };

  if (
    existing?.lastConsumedCreatedAt
    && compareCursor(
      { createdAt: next.lastConsumedCreatedAt, id: next.lastConsumedPhotoId },
      { createdAt: existing.lastConsumedCreatedAt, id: existing.lastConsumedPhotoId }
    ) <= 0
  ) {
    return existing;
  }

  const row = {
    userId,
    eventId,
    ...next,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(progressPath(eventId, userId), row, { overwrite: true });
  return row;
}

async function readUserCooldown(eventId, userId) {
  try {
    return await readBlobJson(userCooldownPath(eventId, userId));
  } catch {
    return null;
  }
}

function cooldownActive(cooldown, nowMs = Date.now()) {
  if (!cooldown?.createdAt) return false;
  return isWithinTtl(cooldown.createdAt, nowMs);
}

async function getPostStatus({ deviceId, eventId }) {
  const user = await findUserByDevice(deviceId);
  if (!user) {
    return {
      canPost: false,
      postedToday: false,
      onCooldown: false,
      reason: 'NO_USER',
      nextAllowedAt: null,
    };
  }
  const cooldown = await readUserCooldown(eventId, user.id);
  if (cooldownActive(cooldown)) {
    const nextAllowedAt = expiresAtFrom(cooldown.createdAt);
    return {
      canPost: false,
      postedToday: true,
      onCooldown: true,
      photoId: cooldown.photoId || null,
      lastPostedAt: cooldown.createdAt,
      nextAllowedAt,
    };
  }
  return {
    canPost: true,
    postedToday: false,
    onCooldown: false,
    nextAllowedAt: null,
  };
}

/** @deprecated use getPostStatus — kept for callers during rename */
async function getTodayPostStatus(args) {
  return getPostStatus(args);
}

function limitError(nextAllowedAt) {
  const err = new Error('You’ve already shared a memory. You can share another in 24 hours.');
  err.code = 'DAILY_MEMORY_LIMIT_REACHED';
  err.nextAllowedAt = nextAllowedAt || null;
  return err;
}

async function acquireCreateLock(eventId, userId, photoId, createdAt) {
  const lockPath = userCreateLockPath(eventId, userId);
  try {
    await writeJson(lockPath, { photoId, createdAt }, { overwrite: false });
    return;
  } catch {
    try {
      const existing = await readBlobJson(lockPath);
      const at = Date.parse(existing?.createdAt || '');
      // Stale lock (>2 min) can be taken over.
      if (Number.isFinite(at) && Date.now() - at < 2 * 60 * 1000) {
        throw limitError(expiresAtFrom(existing.createdAt));
      }
    } catch (err) {
      if (err?.code === 'DAILY_MEMORY_LIMIT_REACHED') throw err;
    }
    await writeJson(lockPath, { photoId, createdAt }, { overwrite: true });
  }
}

async function createMemoryPhoto({
  deviceId,
  eventId,
  dataUrl,
  caption = '',
  fileName = '',
}) {
  assertBlobConfigured();
  const eid = String(eventId || 'world-choir-2027').trim();
  const user = await findUserByDevice(deviceId);
  if (!user?.id) {
    const err = new Error('Join World Choir before sharing a memory.');
    err.code = 'NO_USER';
    throw err;
  }

  const pledge = await readPledge(eid, user.id).catch(() => null);
  const city = String(pledge?.city || user.city || '').trim();
  const country = String(pledge?.country || user.country || '').trim();
  if (!city || !country) {
    const err = new Error('Set your city and country in your profile before sharing.');
    err.code = 'NO_LOCATION';
    throw err;
  }

  const cleanCaption = sanitizeCaption(caption);
  const { contentType, buffer } = parseDataUrl(dataUrl);
  if (!IMAGE_MIME_RE.test(contentType)) {
    const err = new Error('That file is not a supported image');
    err.code = 'INVALID_IMAGE';
    throw err;
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    const err = new Error('Image must be under 12 MB');
    err.code = 'IMAGE_TOO_LARGE';
    throw err;
  }

  const existingCooldown = await readUserCooldown(eid, user.id);
  if (cooldownActive(existingCooldown)) {
    throw limitError(expiresAtFrom(existingCooldown.createdAt));
  }

  const photoId = randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = expiresAtFrom(createdAt);
  const subtype = contentType.replace(/^image\//, '');
  const ext = IMAGE_EXT_MAP[subtype] || 'jpg';

  await acquireCreateLock(eid, user.id, photoId, createdAt);

  // Re-check cooldown after lock (another request may have finished).
  const cooldownAgain = await readUserCooldown(eid, user.id);
  if (cooldownActive(cooldownAgain)) {
    throw limitError(expiresAtFrom(cooldownAgain.createdAt));
  }

  const pathname = mediaPath(eid, user.id, photoId, ext);
  await putPrivateBinary(pathname, buffer, contentType, { overwrite: true });
  const imageUrl = mediaProxyUrl(pathname);

  const voiceName = pledge?.voiceName || pledge?.display_name || null;
  const row = {
    id: photoId,
    eventId: eid,
    userId: user.id,
    userName: voiceName,
    imagePath: pathname,
    imageUrl,
    thumbnailUrl: imageUrl,
    caption: cleanCaption,
    city,
    country,
    createdAt,
    publishedAt: createdAt,
    expiresAt,
    postingDay: utcDayString(new Date(createdAt)),
    moderationStatus: 'approved',
    deletedAt: null,
    fileName: String(fileName || '').slice(0, 120),
  };

  await writeJson(photoPath(eid, photoId), row, { overwrite: true });
  await appendFeedIndex(eid, { id: photoId, createdAt, expiresAt });

  const cooldownRow = {
    userId: user.id,
    eventId: eid,
    photoId,
    createdAt,
    expiresAt,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(userCooldownPath(eid, user.id), cooldownRow, { overwrite: true });

  // If another create raced and wrote a different cooldown winner, drop ours.
  const confirmed = await readUserCooldown(eid, user.id);
  if (confirmed?.photoId && confirmed.photoId !== photoId && cooldownActive(confirmed)) {
    const confirmedEarlier = compareCursor(
      { createdAt: confirmed.createdAt, id: confirmed.photoId },
      { createdAt, id: photoId }
    ) < 0;
    if (confirmedEarlier || confirmed.photoId !== photoId) {
      await writeJson(photoPath(eid, photoId), {
        ...row,
        deletedAt: new Date().toISOString(),
        moderationStatus: 'rejected',
      }, { overwrite: true });
      throw limitError(expiresAtFrom(confirmed.createdAt));
    }
  }

  return publicPhoto(row);
}

module.exports = {
  listMemoryPhotos,
  listNewerMemoryPhotos,
  createMemoryPhoto,
  getMemoryPhoto,
  getUserProgress,
  saveUserProgress,
  getPostStatus,
  getTodayPostStatus,
  compareCursor,
  utcDayString,
  expiresAtFrom,
  isWithinTtl,
  PHOTO_TTL_MS,
  MAX_CAPTION,
};
