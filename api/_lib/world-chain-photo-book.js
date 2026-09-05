/**
 * World Chain Photo Book — optional post-connection contributions.
 * Completely separate from Voice connect / chain progression.
 */
const { randomUUID, createHash } = require('crypto');
const {
  assertBlobConfigured,
  findUserByDevice,
  readPledge,
  readBlobJson,
  writeJson,
  putPrivateBinary,
  mediaProxyUrl,
} = require('./store');
const {
  DEFAULT_EVENT_ID,
  dayKeyUTC,
  CHAIN_STORAGE_VERSION,
} = require('./world-chain');

const ROOT = 'wc-data/world-chain/photo-book';
const MAX_MESSAGE = 80;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const IMAGE_EXT_MAP = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
};

function eventRoot(eventId) {
  return `${ROOT}/${encodeURIComponent(String(eventId || DEFAULT_EVENT_ID).trim())}`;
}

function claimPath(eventId, claimKey) {
  return `${eventRoot(eventId)}/claims/${claimKey}.json`;
}

function entryPath(eventId, entryId) {
  return `${eventRoot(eventId)}/entries/${entryId}.json`;
}

function chainIndexPath(eventId, chainId) {
  return `${eventRoot(eventId)}/chains/${encodeURIComponent(chainId)}/index.json`;
}

function mediaFilePath(eventId, userId, entryId, ext) {
  return `${eventRoot(eventId)}/media/${userId}/${entryId}.${ext}`;
}

function claimKeyFor(connectionId, userId) {
  return createHash('sha256')
    .update(`${String(connectionId)}::${String(userId)}`)
    .digest('hex')
    .slice(0, 40);
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    const err = new Error('Take a selfie to add to the Photo Book.');
    err.code = 'INVALID_IMAGE';
    err.statusCode = 400;
    throw err;
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    const err = new Error('Could not read that image file');
    err.code = 'INVALID_IMAGE';
    err.statusCode = 400;
    throw err;
  }
  let contentType = String(match[1] || '').trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    const err = new Error('Image file was empty');
    err.code = 'INVALID_IMAGE';
    err.statusCode = 400;
    throw err;
  }
  return { contentType, buffer };
}

function sanitizeMessage(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return [...text].slice(0, MAX_MESSAGE).join('');
}

async function readStoredChain(eventId, chainId) {
  const day = dayKeyUTC(new Date());
  const livePath = `wc-data/world-chain/${CHAIN_STORAGE_VERSION}/${encodeURIComponent(eventId)}/${day}/chains/${chainId}.json`;
  try {
    return await readBlobJson(livePath);
  } catch {
    /* archive */
  }
  try {
    return await readBlobJson(
      `wc-data/world-chain/archive/${encodeURIComponent(eventId)}/chains/${encodeURIComponent(chainId)}.json`
    );
  } catch {
    return null;
  }
}

async function createChainPhotoBookEntry({
  deviceId,
  eventId = DEFAULT_EVENT_ID,
  chainId,
  connectionId,
  dataUrl,
  message = '',
  fileName = '',
}) {
  assertBlobConfigured();
  const eid = String(eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
  const cid = String(chainId || '').trim();
  const connId = String(connectionId || '').trim();
  if (!deviceId || !cid || !connId) {
    const err = new Error('Missing Photo Book details');
    err.statusCode = 400;
    throw err;
  }

  const user = await findUserByDevice(deviceId);
  if (!user?.id) {
    const err = new Error('Join World Choir before adding to the Photo Book.');
    err.statusCode = 403;
    throw err;
  }

  const pledge = await readPledge(eid, user.id).catch(() => null);
  const claimKey = claimKeyFor(connId, user.id);

  try {
    const existingClaim = await readBlobJson(claimPath(eid, claimKey));
    if (existingClaim?.entryId) {
      return {
        ok: true,
        alreadyExists: true,
        entryId: existingClaim.entryId,
      };
    }
  } catch {
    /* no claim yet */
  }

  const chain = await readStoredChain(eid, cid);
  if (!chain) {
    const err = new Error('World Chain not found');
    err.statusCode = 404;
    throw err;
  }

  const voiceNum = Number(pledge?.voice_number);
  const linked = (chain.route || []).some((s) => (
    s.selectedByVoiceId === user.id
    || (Number.isFinite(voiceNum) && Number(s.selectedByVoiceNumber) === voiceNum)
  ));
  if (!linked && chain.startingVoiceId !== user.id) {
    const err = new Error('This Photo Book moment is not available for your account.');
    err.statusCode = 403;
    throw err;
  }

  const { contentType, buffer } = parseDataUrl(dataUrl);
  if (!IMAGE_MIME_RE.test(contentType)) {
    const err = new Error('That file is not a supported image');
    err.code = 'INVALID_IMAGE';
    err.statusCode = 400;
    throw err;
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    const err = new Error('Image must be under 12 MB');
    err.code = 'IMAGE_TOO_LARGE';
    err.statusCode = 400;
    throw err;
  }

  const cleanMessage = sanitizeMessage(message);
  const entryId = randomUUID();
  const createdAt = new Date().toISOString();
  const subtype = contentType.replace(/^image\//, '');
  const ext = IMAGE_EXT_MAP[subtype] || 'jpg';
  const pathname = mediaFilePath(eid, user.id, entryId, ext);

  try {
    await writeJson(claimPath(eid, claimKey), {
      entryId,
      connectionId: connId,
      chainId: cid,
      userId: user.id,
      createdAt,
    }, { overwrite: false });
  } catch {
    const raced = await readBlobJson(claimPath(eid, claimKey)).catch(() => null);
    if (raced?.entryId) {
      return { ok: true, alreadyExists: true, entryId: raced.entryId };
    }
    const err = new Error('Could not reserve Photo Book slot. Try again.');
    err.statusCode = 409;
    throw err;
  }

  await putPrivateBinary(pathname, buffer, contentType, { overwrite: true });
  const imageUrl = mediaProxyUrl(pathname);

  const entry = {
    id: entryId,
    eventId: eid,
    chainId: cid,
    connectionId: connId,
    dailyChainNumber: chain.dailyChainNumber || null,
    dayKey: chain.dayKey || dayKeyUTC(new Date()),
    userId: user.id,
    voiceNumber: Number.isFinite(voiceNum) ? voiceNum : null,
    city: pledge?.city || null,
    country: pledge?.country || null,
    message: cleanMessage,
    imagePath: pathname,
    imageUrl,
    fileName: String(fileName || '').slice(0, 120),
    createdAt,
  };

  await writeJson(entryPath(eid, entryId), entry, { overwrite: true });

  try {
    let index = { chainId: cid, entryIds: [], updatedAt: createdAt };
    try {
      index = await readBlobJson(chainIndexPath(eid, cid));
    } catch {
      /* new index */
    }
    const entryIds = [entryId, ...(index.entryIds || []).filter((id) => id !== entryId)].slice(0, 500);
    await writeJson(chainIndexPath(eid, cid), {
      chainId: cid,
      entryIds,
      updatedAt: createdAt,
    }, { overwrite: true });
  } catch (err) {
    console.error('photo-book index update failed:', err);
  }

  return {
    ok: true,
    alreadyExists: false,
    entry: {
      id: entry.id,
      chainId: entry.chainId,
      connectionId: entry.connectionId,
      message: entry.message,
      imageUrl: entry.imageUrl,
      createdAt: entry.createdAt,
    },
  };
}

async function listChainPhotoBook(eventId, chainId) {
  const eid = String(eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
  const cid = String(chainId || '').trim();
  if (!cid) return { entries: [] };
  let index = null;
  try {
    index = await readBlobJson(chainIndexPath(eid, cid));
  } catch {
    return { entries: [] };
  }
  const entries = [];
  for (const id of index.entryIds || []) {
    try {
      const row = await readBlobJson(entryPath(eid, id));
      if (row && !row.deletedAt) {
        entries.push({
          id: row.id,
          voiceNumber: row.voiceNumber,
          city: row.city,
          country: row.country,
          message: row.message || '',
          imageUrl: row.imageUrl,
          createdAt: row.createdAt,
        });
      }
    } catch {
      /* skip */
    }
  }
  return { entries };
}

module.exports = {
  MAX_MESSAGE,
  createChainPhotoBookEntry,
  listChainPhotoBook,
  claimKeyFor,
};
