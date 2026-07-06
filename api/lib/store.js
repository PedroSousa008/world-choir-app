const { put, list, get } = require('@vercel/blob');
const { randomUUID } = require('crypto');

const ROOT = 'wc-data';

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
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode === 304 || !result.stream) {
    throw new Error(`Blob not found: ${pathname}`);
  }
  return JSON.parse(await streamToText(result.stream));
}

async function writeJson(pathname, data, { overwrite = true } = {}) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: 'application/json',
  });
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
  } catch {
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
    return await readBlobJson(probePath);
  } catch {
    const user = {
      id: randomUUID(),
      anonymous_device_id: trimmed,
      created_at: new Date().toISOString(),
    };
    try {
      await writeJson(probePath, user, { overwrite: false });
      return user;
    } catch {
      return readBlobJson(probePath);
    }
  }
}

async function findUserByDevice(deviceId) {
  assertBlobConfigured();
  const trimmed = String(deviceId).trim();
  if (!trimmed) return null;
  try {
    return await readBlobJson(`${ROOT}/users-by-device/${encodeURIComponent(trimmed)}.json`);
  } catch {
    return null;
  }
}

async function readPledge(eventId, userId) {
  try {
    return await readBlobJson(pledgePath(eventId, userId));
  } catch {
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
  const { blobs } = await list({ prefix, limit: 1000 });
  const pledges = await Promise.all(
    blobs.map(async (blob) => {
      try {
        return await readBlobJson(blob.pathname);
      } catch {
        return null;
      }
    })
  );
  return pledges
    .filter(Boolean)
    .sort((a, b) => a.voice_number - b.voice_number);
}

module.exports = {
  mapPledgeRow,
  ensureUser,
  joinWorldChoir,
  updatePledgeLocation,
  listPledges,
  findUserByDevice,
  readPledge,
};
