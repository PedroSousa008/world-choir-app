const { put, list, get } = require('@vercel/blob');
const { randomUUID } = require('crypto');

const ROOT = 'wc-data';
const STORAGE_UNAVAILABLE_MESSAGE =
  'World Choir records are temporarily unavailable. Nothing has been deleted.';

function isBlobUnavailable(err) {
  const msg = String(err?.message || err || '');
  const code = err?.status || err?.statusCode || err?.code;
  return (
    code === 403 ||
    err?.code === 'STORAGE_UNAVAILABLE' ||
    /403|forbidden|suspended|store is blocked|this store has been suspended/i.test(msg)
  );
}

function wrapBlobError(err) {
  if (!isBlobUnavailable(err)) return err;
  if (err && err.code === 'STORAGE_UNAVAILABLE') return err;
  const wrapped = new Error(STORAGE_UNAVAILABLE_MESSAGE);
  wrapped.code = 'STORAGE_UNAVAILABLE';
  wrapped.cause = err;
  wrapped.statusCode = 503;
  wrapped.storageUnavailable = true;
  return wrapped;
}

async function jsonStorageError(err) {
  const wrapped = wrapBlobError(err);
  const payload = {
    error: wrapped.code === 'STORAGE_UNAVAILABLE'
      ? STORAGE_UNAVAILABLE_MESSAGE
      : (wrapped.message || 'Service unavailable'),
    storageUnavailable: wrapped.code === 'STORAGE_UNAVAILABLE',
  };
  if (payload.storageUnavailable) {
    try {
      payload.inventory = await buildStorageInventory();
    } catch {
      /* listing can also be blocked */
    }
  }
  return payload;
}

function mapPledgeRow(pledge) {
  if (!pledge) return null;
  return {
    id: pledge.id,
    user_id: pledge.user_id,
    event_id: pledge.event_id,
    voiceNumber: pledge.voice_number,
    voiceName: pledge.voice_name,
    display_name: pledge.voice_name,
    city: pledge.city,
    country: pledge.country,
    latitude: pledge.latitude,
    longitude: pledge.longitude,
    pledged_at: pledge.pledged_at,
    updated_at: pledge.updated_at,
  };
}

function assertBlobConfigured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Participation is temporarily unavailable. Please try again in a moment.');
  }
}

async function streamToText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readBlobJson(pathname) {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode === 304 || !result.stream) {
      throw new Error(`Blob not found: ${pathname}`);
    }
    return JSON.parse(await streamToText(result.stream));
  } catch (err) {
    throw wrapBlobError(err);
  }
}

async function listBlobs(prefix) {
  const out = [];
  let cursor;
  do {
    const result = await list({ prefix, limit: 1000, cursor });
    out.push(...(result.blobs || []));
    cursor = result.hasMore ? result.cursor : null;
  } while (cursor);
  return out;
}

function buildInventoryFromBlobs(blobs) {
  const paths = (blobs || []).map((b) => b.pathname);
  return {
    files: paths.length,
    voices: paths.filter((p) => p.includes('/pledges/') && p.endsWith('.json')).length,
    users: paths.filter((p) => p.includes('/users-by-device/')).length,
    foundations: paths.some((p) => p.endsWith('members/influencers.json')) ? 1 : 0,
    donationsLedger: paths.some((p) => p.endsWith('members/donations-ledger.json')),
    dailyActs: paths.filter((p) => p.includes('/daily-peace/assignments/')).length,
  };
}

async function buildStorageInventory() {
  const blobs = await listBlobs(`${ROOT}/`);
  return buildInventoryFromBlobs(blobs);
}

async function readJsonBlobs(blobs) {
  const rows = [];
  for (const blob of blobs) {
    try {
      rows.push(await readBlobJson(blob.pathname));
    } catch (err) {
      if (isBlobUnavailable(err)) throw wrapBlobError(err);
    }
  }
  return rows.filter(Boolean);
}

async function writeJson(pathname, data, { overwrite = true } = {}) {
  try {
    await put(pathname, JSON.stringify(data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: overwrite,
      contentType: 'application/json',
    });
  } catch (err) {
    throw wrapBlobError(err);
  }
}

/**
 * Binary upload for private Blob stores. Returns the blob pathname (not a public CDN URL).
 */
async function putPrivateBinary(pathname, body, contentType, { overwrite = true } = {}) {
  assertBlobConfigured();
  await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType,
  });
  return pathname;
}

async function readPrivateBinary(pathname) {
  assertBlobConfigured();
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode === 304 || !result.stream) {
      throw new Error(`Blob not found: ${pathname}`);
    }
    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType: result.contentType || 'application/octet-stream',
    };
  } catch (err) {
    throw wrapBlobError(err);
  }
}

/** Build a stable app URL that proxies private foundation media. */
function mediaProxyUrl(pathname) {
  return `/api/media?path=${encodeURIComponent(pathname)}`;
}

const OWNER_AUTH_PATH = `${ROOT}/admin/owner-auth.json`;

async function getOwnerAuthData() {
  try {
    return await readBlobJson(OWNER_AUTH_PATH);
  } catch {
    return {};
  }
}

async function getOwnerPasswordHash() {
  const data = await getOwnerAuthData();
  if (data?.password_hash) return data.password_hash;
  return process.env.OWNER_PASSWORD_HASH || '';
}

async function getOwnerEmailOverride() {
  const data = await getOwnerAuthData();
  return (data?.email || '').trim().toLowerCase();
}

async function saveOwnerPasswordHash(passwordHash) {
  assertBlobConfigured();
  const existing = await getOwnerAuthData();
  await writeJson(OWNER_AUTH_PATH, {
    ...existing,
    password_hash: passwordHash,
    updated_at: new Date().toISOString(),
  }, { overwrite: true });
}

async function saveOwnerEmail(email) {
  assertBlobConfigured();
  const existing = await getOwnerAuthData();
  await writeJson(OWNER_AUTH_PATH, {
    ...existing,
    email: String(email || '').trim().toLowerCase(),
    updated_at: new Date().toISOString(),
  }, { overwrite: true });
}

function eventPrefix(eventId) {
  return `${ROOT}/${eventId}`;
}

function userPath(eventId, deviceId) {
  return `${eventPrefix(eventId)}/users/${encodeURIComponent(deviceId)}.json`;
}

function pledgePath(eventId, userId) {
  return `${eventPrefix(eventId)}/pledges/${userId}.json`;
}

function claimPath(eventId, voiceNumber) {
  return `${eventPrefix(eventId)}/claims/v${voiceNumber}.json`;
}

function counterPath(eventId) {
  return `${eventPrefix(eventId)}/counter.json`;
}

async function readCounter(eventId) {
  try {
    const data = await readBlobJson(counterPath(eventId));
    return Number(data.counter) || 0;
  } catch (err) {
    if (isBlobUnavailable(err)) throw wrapBlobError(err);
    return 0;
  }
}

async function saveCounter(eventId, counter) {
  await writeJson(counterPath(eventId), { counter }, { overwrite: true });
}

async function allocateVoiceNumber(eventId) {
  let start = (await readCounter(eventId)) + 1;
  for (let n = start; n < start + 50; n++) {
    try {
      await writeJson(claimPath(eventId, n), { voice_number: n }, { overwrite: false });
      await saveCounter(eventId, n);
      return n;
    } catch {
      // Another request claimed this number — try the next one.
    }
  }
  throw new Error('Could not assign a voice number. Please try again.');
}

async function ensureUser(deviceId) {
  assertBlobConfigured();
  const trimmed = String(deviceId).trim();
  if (!trimmed) throw new Error('deviceId required');

  const probePath = `${ROOT}/users-by-device/${encodeURIComponent(trimmed)}.json`;
  try {
    const existing = await readBlobJson(probePath);
    // Grandfather accounts that predate onboarding so they never see it unexpectedly.
    if (existing.hasCompletedWorldChoirOnboarding === undefined) {
      const upgraded = {
        ...existing,
        hasCompletedWorldChoirOnboarding: true,
        updated_at: new Date().toISOString(),
      };
      try {
        await writeJson(probePath, upgraded, { overwrite: true });
        return upgraded;
      } catch (err) {
        if (isBlobUnavailable(err)) throw wrapBlobError(err);
        return { ...existing, hasCompletedWorldChoirOnboarding: true };
      }
    }
    return existing;
  } catch (err) {
    if (isBlobUnavailable(err)) throw wrapBlobError(err);
    const user = {
      id: randomUUID(),
      anonymous_device_id: trimmed,
      created_at: new Date().toISOString(),
      hasCompletedWorldChoirOnboarding: false,
    };
    try {
      await writeJson(probePath, user, { overwrite: false });
      return user;
    } catch (err) {
      if (isBlobUnavailable(err)) throw wrapBlobError(err);
      return readBlobJson(probePath);
    }
  }
}

async function setUserOnboardingCompleted(deviceId, completed = true) {
  assertBlobConfigured();
  const trimmed = String(deviceId).trim();
  if (!trimmed) throw new Error('deviceId required');

  const probePath = `${ROOT}/users-by-device/${encodeURIComponent(trimmed)}.json`;
  const existing = await ensureUser(trimmed);
  const next = {
    ...existing,
    hasCompletedWorldChoirOnboarding: completed === true,
    updated_at: new Date().toISOString(),
  };
  await writeJson(probePath, next, { overwrite: true });
  return next;
}

async function findUserByDevice(deviceId) {
  assertBlobConfigured();
  const trimmed = String(deviceId).trim();
  if (!trimmed) return null;
  try {
    return await readBlobJson(`${ROOT}/users-by-device/${encodeURIComponent(trimmed)}.json`);
  } catch (err) {
    if (isBlobUnavailable(err)) throw wrapBlobError(err);
    return null;
  }
}

async function readPledge(eventId, userId) {
  try {
    return await readBlobJson(pledgePath(eventId, userId));
  } catch (err) {
    if (isBlobUnavailable(err)) throw wrapBlobError(err);
    return null;
  }
}

async function joinWorldChoir({ deviceId, eventId, city, country, latitude, longitude }) {
  assertBlobConfigured();
  const trimmedEvent = String(eventId).trim();
  const trimmedCity = String(city).trim();
  const trimmedCountry = String(country).trim();

  const user = await ensureUser(deviceId);
  await writeJson(userPath(trimmedEvent, user.anonymous_device_id), user, { overwrite: true });

  const existing = await readPledge(trimmedEvent, user.id);
  if (existing) return existing;

  const voiceNumber = await allocateVoiceNumber(trimmedEvent);
  const now = new Date().toISOString();
  const pledge = {
    id: randomUUID(),
    user_id: user.id,
    event_id: trimmedEvent,
    voice_number: voiceNumber,
    voice_name: `Voice ${voiceNumber}`,
    city: trimmedCity,
    country: trimmedCountry,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    pledged_at: now,
    updated_at: now,
  };

  try {
    await writeJson(pledgePath(trimmedEvent, user.id), pledge, { overwrite: false });
  } catch {
    const raced = await readPledge(trimmedEvent, user.id);
    if (raced) return raced;
    throw new Error('Could not save participation. Please try again.');
  }

  return pledge;
}

async function updatePledgeLocation({ deviceId, eventId, city, country, latitude, longitude }) {
  assertBlobConfigured();
  const trimmedEvent = String(eventId).trim();
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const pledge = await readPledge(trimmedEvent, user.id);
  if (!pledge) throw new Error('pledge not found');

  const updated = {
    ...pledge,
    city: String(city).trim(),
    country: String(country).trim(),
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    updated_at: new Date().toISOString(),
  };

  await writeJson(pledgePath(trimmedEvent, user.id), updated, { overwrite: true });
  return updated;
}

async function listPledges(eventId) {
  assertBlobConfigured();
  const prefix = `${eventPrefix(eventId)}/pledges/`;
  const blobs = await listBlobs(prefix);
  const pledges = await readJsonBlobs(blobs);
  return pledges.sort((a, b) => a.voice_number - b.voice_number);
}

async function listAllUsers() {
  assertBlobConfigured();
  const blobs = await listBlobs(`${ROOT}/users-by-device/`);
  return readJsonBlobs(blobs);
}

async function listAllPledges() {
  assertBlobConfigured();
  const blobs = await listBlobs(`${ROOT}/`);
  const pledgeBlobs = blobs.filter(
    (b) => b.pathname.includes('/pledges/') && b.pathname.endsWith('.json')
  );
  const pledges = await readJsonBlobs(pledgeBlobs);
  return pledges.sort((a, b) => {
    if (a.event_id !== b.event_id) return a.event_id.localeCompare(b.event_id);
    return a.voice_number - b.voice_number;
  });
}

function promisePath(userId, eventId) {
  return `${ROOT}/promises/${userId}/${eventId}.json`;
}

async function savePromise({ userId, eventId, promiseText, city, country, voiceNumber, voiceName }) {
  assertBlobConfigured();
  const trimmedEvent = String(eventId).trim();
  const trimmedUser = String(userId).trim();
  const now = new Date().toISOString();

  const existing = await readPromise(trimmedUser, trimmedEvent);
  if (existing) return existing;

  const promise = {
    id: randomUUID(),
    user_id: trimmedUser,
    event_id: trimmedEvent,
    promise_text: String(promiseText).trim(),
    city: city || null,
    country: country || null,
    voice_number: voiceNumber ?? null,
    voice_name: voiceName || null,
    submitted_at: now,
  };

  await writeJson(promisePath(trimmedUser, trimmedEvent), promise, { overwrite: false });
  return promise;
}

async function readPromise(userId, eventId) {
  try {
    return await readBlobJson(promisePath(userId, eventId));
  } catch (err) {
    if (isBlobUnavailable(err)) throw wrapBlobError(err);
    return null;
  }
}

async function listAllPromises() {
  assertBlobConfigured();
  const blobs = await listBlobs(`${ROOT}/promises/`);
  return readJsonBlobs(blobs);
}

async function buildOwnerDatabaseRows() {
  const [users, pledges, promises] = await Promise.all([
    listAllUsers(),
    listAllPledges(),
    listAllPromises(),
  ]);

  const promiseByUserEvent = new Map();
  promises.forEach((p) => {
    promiseByUserEvent.set(`${p.user_id}|${p.event_id}`, p);
  });

  const pledgeByUserEvent = new Map();
  pledges.forEach((p) => {
    pledgeByUserEvent.set(`${p.user_id}|${p.event_id}`, p);
  });

  const userIdsFromPledges = new Set(pledges.map((p) => p.user_id));
  const allUserIds = new Set([...users.map((u) => u.id), ...userIdsFromPledges]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const rows = [];

  pledges.forEach((pledge) => {
    const user = userById.get(pledge.user_id);
    const promise = promiseByUserEvent.get(`${pledge.user_id}|${pledge.event_id}`);
    rows.push({
      userId: pledge.user_id,
      voiceNumber: pledge.voice_number,
      voiceName: pledge.voice_name,
      city: pledge.city,
      country: pledge.country,
      pledgeStatus: 'pledged',
      promiseText: promise?.promise_text || null,
      promiseSubmittedAt: promise?.submitted_at || null,
      eventId: pledge.event_id,
      createdAt: user?.created_at || pledge.pledged_at,
    });
  });

  users.forEach((user) => {
    if (userIdsFromPledges.has(user.id)) return;
    rows.push({
      userId: user.id,
      voiceNumber: null,
      voiceName: null,
      city: null,
      country: null,
      pledgeStatus: 'none',
      promiseText: null,
      promiseSubmittedAt: null,
      eventId: null,
      createdAt: user.created_at,
    });
  });

  rows.sort((a, b) => {
    const aVoice = a.voiceNumber ?? Number.MAX_SAFE_INTEGER;
    const bVoice = b.voiceNumber ?? Number.MAX_SAFE_INTEGER;
    if (aVoice !== bVoice) return aVoice - bVoice;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  return {
    totals: {
      users: allUserIds.size,
      participants: pledges.length,
    },
    rows,
  };
}

module.exports = {
  mapPledgeRow,
  ensureUser,
  setUserOnboardingCompleted,
  joinWorldChoir,
  updatePledgeLocation,
  listPledges,
  findUserByDevice,
  readPledge,
  savePromise,
  listAllUsers,
  listAllPledges,
  listAllPromises,
  buildOwnerDatabaseRows,
  getOwnerPasswordHash,
  getOwnerEmailOverride,
  saveOwnerPasswordHash,
  saveOwnerEmail,
  readBlobJson,
  writeJson,
  putPrivateBinary,
  readPrivateBinary,
  mediaProxyUrl,
  assertBlobConfigured,
  isBlobUnavailable,
  wrapBlobError,
  jsonStorageError,
  buildStorageInventory,
  STORAGE_UNAVAILABLE_MESSAGE,
};
