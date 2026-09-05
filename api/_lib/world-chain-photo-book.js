/**
 * World Chain Photo Book — optional post-participation contributions.
 * Completely separate from Voice connect / chain progression.
 * Entries are real participants only; photo and note are both optional.
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
  listOwnerWorldChainSnapshots,
} = require('./world-chain');

const ROOT = 'wc-data/world-chain/photo-book';
const MAX_MESSAGE = 80;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** One-time exception: Voice #5 may replace selfie/note once, then never again. */
const ONE_TIME_EDIT_VOICE_NUMBER = 5;
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

/** Stable offer id per participant Voice on a chain (includes final Voice). */
function participantConnectionId(chainId, userId) {
  return `${String(chainId)}:participant:${String(userId)}`;
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
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

/** Public-facing photo URL — null after Owner removal. */
function entryPublicPhotoUrl(entry) {
  if (!entry || entry.photoRemovedAt || entry.deletedAt) return null;
  return entry.imageUrl || null;
}

/** Public-facing note — null after Owner removal or empty. */
function entryPublicNote(entry) {
  if (!entry || entry.descriptionRemovedAt || entry.deletedAt) return null;
  const note = String(entry.message || '').trim();
  return note || null;
}

function entryHasPublicPhoto(entry) {
  return !!entryPublicPhotoUrl(entry);
}

function entryHasPublicNote(entry) {
  return !!entryPublicNote(entry);
}

function entryHasAnyContribution(entry) {
  return entryHasPublicPhoto(entry) || entryHasPublicNote(entry);
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

function connectedParticipantSteps(chain) {
  const steps = Array.isArray(chain?.route) ? chain.route : [];
  const lastIdx = steps.length - 1;
  const out = [];
  const seen = new Set();
  for (const step of steps) {
    if (!step || step.status !== 'connected') continue;
    const userId = step.assignedVoiceId || null;
    const voiceNumber = Number(step.assignedVoiceNumber);
    const key = userId || (Number.isFinite(voiceNumber) ? `vn:${voiceNumber}` : null);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      userId,
      voiceNumber: Number.isFinite(voiceNumber) ? voiceNumber : null,
      country: step.country || null,
      city: step.assignedCity || step.requiredCity || null,
      chainPosition: Number.isFinite(step.position) ? step.position : out.length,
      isFinalVoice: Number(step.position) === lastIdx,
      completedAt: step.connectedAt || null,
    });
  }
  return out;
}

function isPhotoBookParticipant(chain, userId) {
  if (!chain || !userId) return false;
  return connectedParticipantSteps(chain).some((p) => p.userId === userId);
}

async function hasExistingClaim(eventId, connectionId, userId) {
  try {
    const existing = await readBlobJson(claimPath(eventId, claimKeyFor(connectionId, userId)));
    return !!(existing?.entryId);
  } catch {
    return false;
  }
}

async function readEntryIndex(eventId, chainId) {
  try {
    return await readBlobJson(chainIndexPath(eventId, chainId));
  } catch {
    return { chainId, entryIds: [] };
  }
}

async function loadEntriesByVoice(eventId, chainId) {
  const index = await readEntryIndex(eventId, chainId);
  const byUserId = new Map();
  const byVoiceNumber = new Map();
  for (const id of index.entryIds || []) {
    try {
      const row = await readBlobJson(entryPath(eventId, id));
      if (!row || row.deletedAt) continue;
      if (row.userId) byUserId.set(row.userId, row);
      if (Number.isFinite(Number(row.voiceNumber))) {
        byVoiceNumber.set(Number(row.voiceNumber), row);
      }
    } catch {
      /* skip */
    }
  }
  return { byUserId, byVoiceNumber };
}

/**
 * Optional contribute offer for a viewer who already participated
 * (including the final Voice) and has not submitted yet.
 */
async function resolveViewerPhotoBookOffer(chain, viewer, eventId = DEFAULT_EVENT_ID) {
  if (!chain?.id || !viewer?.userId) return null;
  if (!isPhotoBookParticipant(chain, viewer.userId)) return null;
  const connectionId = participantConnectionId(chain.id, viewer.userId);
  if (await hasExistingClaim(eventId, connectionId, viewer.userId)) return null;
  // Also hide offer if they already have an entry (older claim ids).
  const { byUserId } = await loadEntriesByVoice(eventId, chain.id);
  if (byUserId.has(viewer.userId)) return null;
  const step = connectedParticipantSteps(chain).find((p) => p.userId === viewer.userId);
  return {
    chainId: chain.id,
    connectionId,
    stepPosition: step?.chainPosition ?? null,
    country: step?.country || null,
    city: step?.city || null,
    dailyChainNumber: chain.dailyChainNumber,
    dayKey: chain.dayKey,
    connectedAt: step?.completedAt || null,
    isFinalVoice: !!step?.isFinalVoice,
  };
}

/** Voice #5 only — one replacement of selfie/note, then permanently locked. */
function resolveViewerOneTimeEditOffer(chain, viewer, entry) {
  if (!chain?.id || !viewer?.userId || !entry?.id) return null;
  const voiceNum = Number(viewer.voiceNumber);
  if (voiceNum !== ONE_TIME_EDIT_VOICE_NUMBER) return null;
  if (Number(entry.voiceNumber) !== ONE_TIME_EDIT_VOICE_NUMBER
    && entry.userId !== viewer.userId) {
    return null;
  }
  if (entry.userId && entry.userId !== viewer.userId) return null;
  if (entry.oneTimeEditCompleted) return null;
  return {
    chainId: chain.id,
    entryId: entry.id,
    connectionId: entry.connectionId || participantConnectionId(chain.id, viewer.userId),
    dailyChainNumber: chain.dailyChainNumber,
    currentNote: entryPublicNote(entry) || '',
    currentPhotoUrl: entryPublicPhotoUrl(entry),
    voiceNumber: ONE_TIME_EDIT_VOICE_NUMBER,
  };
}

async function updateChainPhotoBookEntryOneTime({
  deviceId,
  eventId = DEFAULT_EVENT_ID,
  chainId,
  entryId,
  dataUrl,
  message = '',
  fileName = '',
}) {
  assertBlobConfigured();
  const eid = String(eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
  const cid = String(chainId || '').trim();
  const eidEntry = String(entryId || '').trim();
  if (!deviceId || !cid || !eidEntry) {
    const err = new Error('Missing Photo Book edit details');
    err.statusCode = 400;
    throw err;
  }

  const user = await findUserByDevice(deviceId);
  if (!user?.id) {
    const err = new Error('Join World Choir before editing the Photo Book.');
    err.statusCode = 403;
    throw err;
  }

  const pledge = await readPledge(eid, user.id).catch(() => null);
  const voiceNum = Number(pledge?.voice_number);
  if (voiceNum !== ONE_TIME_EDIT_VOICE_NUMBER) {
    const err = new Error('This one-time edit is not available for your Voice.');
    err.statusCode = 403;
    throw err;
  }

  let entry;
  try {
    entry = await readBlobJson(entryPath(eid, eidEntry));
  } catch {
    entry = null;
  }
  if (!entry || entry.deletedAt) {
    const err = new Error('Photo Book page not found');
    err.statusCode = 404;
    throw err;
  }
  if (entry.chainId !== cid) {
    const err = new Error('Photo Book page not found on this chain');
    err.statusCode = 404;
    throw err;
  }
  if (entry.userId !== user.id) {
    const err = new Error('You can only edit your own Photo Book page.');
    err.statusCode = 403;
    throw err;
  }
  if (entry.oneTimeEditCompleted) {
    const err = new Error('This page was already updated and can no longer be changed.');
    err.statusCode = 403;
    throw err;
  }

  const chain = await readStoredChain(eid, cid);
  if (!chain || !isPhotoBookParticipant(chain, user.id)) {
    const err = new Error('This Photo Book moment is not available for your account.');
    err.statusCode = 403;
    throw err;
  }

  const cleanMessage = sanitizeMessage(message);
  const parsedImage = dataUrl ? parseDataUrl(dataUrl) : null;
  if (!parsedImage && !cleanMessage && !entry.imageUrl) {
    const err = new Error('Add a selfie or a short note to update your page.');
    err.code = 'EMPTY_CONTRIBUTION';
    err.statusCode = 400;
    throw err;
  }

  const updatedAt = new Date().toISOString();
  let imagePath = entry.imagePath || null;
  let imageUrl = entry.imageUrl || null;

  if (parsedImage) {
    const contentType = parsedImage.contentType;
    if (!IMAGE_MIME_RE.test(contentType)) {
      const err = new Error('That file is not a supported image');
      err.code = 'INVALID_IMAGE';
      err.statusCode = 400;
      throw err;
    }
    if (parsedImage.buffer.length > MAX_IMAGE_BYTES) {
      const err = new Error('Image must be under 12 MB');
      err.code = 'IMAGE_TOO_LARGE';
      err.statusCode = 400;
      throw err;
    }
    const subtype = contentType.replace(/^image\//, '');
    const ext = IMAGE_EXT_MAP[subtype] || 'jpg';
    // New path so browsers / CDN do not keep serving the old selfie.
    imagePath = mediaFilePath(eid, user.id, `${entry.id}-edit1`, ext);
    await putPrivateBinary(imagePath, parsedImage.buffer, contentType, { overwrite: true });
    imageUrl = mediaProxyUrl(imagePath);
  }

  const next = {
    ...entry,
    message: cleanMessage,
    imagePath,
    imageUrl,
    fileName: parsedImage ? String(fileName || '').slice(0, 120) : (entry.fileName || ''),
    updatedAt,
    oneTimeEditCompleted: true,
    oneTimeEditCompletedAt: updatedAt,
  };
  if (parsedImage) {
    next.photoRemovedAt = null;
    next.photoRemovedBy = null;
  }
  // Restoring a note via one-time edit clears prior Owner description removal.
  if (cleanMessage) {
    next.descriptionRemovedAt = null;
    next.descriptionRemovedBy = null;
  }

  await writeJson(entryPath(eid, entry.id), next, { overwrite: true });

  return {
    ok: true,
    updated: true,
    oneTimeEditCompleted: true,
    entry: {
      id: next.id,
      chainId: next.chainId,
      connectionId: next.connectionId,
      message: next.message,
      imageUrl: next.imageUrl,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    },
  };
}

function buildPhotoBookOfferAfterConnect(chain, viewer, activeStep) {
  if (!chain?.id || !viewer?.userId) return null;
  return {
    chainId: chain.id,
    connectionId: participantConnectionId(chain.id, viewer.userId),
    stepPosition: activeStep?.position ?? null,
    country: activeStep?.country || null,
    city: activeStep?.requiredCity || activeStep?.assignedCity || null,
    dailyChainNumber: chain.dailyChainNumber,
    dayKey: chain.dayKey,
    connectedAt: activeStep?.connectedAt || null,
    isFinalVoice: false,
  };
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
  let connId = String(connectionId || '').trim();
  if (!deviceId || !cid) {
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
  if (!connId) {
    connId = participantConnectionId(cid, user.id);
  }

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

  if (!isPhotoBookParticipant(chain, user.id)) {
    const err = new Error('This Photo Book moment is not available for your account.');
    err.statusCode = 403;
    throw err;
  }

  const cleanMessage = sanitizeMessage(message);
  const parsedImage = dataUrl ? parseDataUrl(dataUrl) : null;
  if (!parsedImage && !cleanMessage) {
    const err = new Error('Add a selfie or a short note — or skip for now.');
    err.code = 'EMPTY_CONTRIBUTION';
    err.statusCode = 400;
    throw err;
  }

  let imagePath = null;
  let imageUrl = null;
  let contentType = null;

  if (parsedImage) {
    contentType = parsedImage.contentType;
    if (!IMAGE_MIME_RE.test(contentType)) {
      const err = new Error('That file is not a supported image');
      err.code = 'INVALID_IMAGE';
      err.statusCode = 400;
      throw err;
    }
    if (parsedImage.buffer.length > MAX_IMAGE_BYTES) {
      const err = new Error('Image must be under 12 MB');
      err.code = 'IMAGE_TOO_LARGE';
      err.statusCode = 400;
      throw err;
    }
  }

  const voiceNum = Number(pledge?.voice_number);
  const entryId = randomUUID();
  const createdAt = new Date().toISOString();

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

  if (parsedImage) {
    const subtype = contentType.replace(/^image\//, '');
    const ext = IMAGE_EXT_MAP[subtype] || 'jpg';
    imagePath = mediaFilePath(eid, user.id, entryId, ext);
    await putPrivateBinary(imagePath, parsedImage.buffer, contentType, { overwrite: true });
    imageUrl = mediaProxyUrl(imagePath);
  }

  const participant = connectedParticipantSteps(chain).find((p) => p.userId === user.id);

  const entry = {
    id: entryId,
    eventId: eid,
    chainId: cid,
    connectionId: connId,
    dailyChainNumber: chain.dailyChainNumber || null,
    dayKey: chain.dayKey || dayKeyUTC(new Date()),
    userId: user.id,
    voiceNumber: Number.isFinite(voiceNum) ? voiceNum : (participant?.voiceNumber ?? null),
    city: pledge?.city || participant?.city || null,
    country: pledge?.country || participant?.country || null,
    message: cleanMessage,
    imagePath,
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

/**
 * Photo Book page payload: real participating Voices + optional selfie/note.
 * Never invents photos, notes, or future-country placeholders.
 */
async function listChainPhotoBook(eventId, chainId, deviceId = '') {
  const eid = String(eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
  const cid = String(chainId || '').trim();
  if (!cid) {
    return {
      chainId: null,
      dailyChainNumber: null,
      participants: [],
      viewerOffer: null,
    };
  }

  const chain = await readStoredChain(eid, cid);
  if (!chain) {
    const err = new Error('World Chain not found');
    err.statusCode = 404;
    throw err;
  }

  const { byUserId, byVoiceNumber } = await loadEntriesByVoice(eid, cid);
  const steps = connectedParticipantSteps(chain);
  const participants = steps.map((p) => {
    const entry = (p.userId && byUserId.get(p.userId))
      || (Number.isFinite(p.voiceNumber) ? byVoiceNumber.get(p.voiceNumber) : null)
      || null;
    const note = entryPublicNote(entry);
    return {
      voiceId: p.userId,
      voiceNumber: p.voiceNumber,
      country: p.country,
      city: p.city,
      photoUrl: entryPublicPhotoUrl(entry),
      note,
      chainPosition: p.chainPosition,
      isFinalVoice: !!p.isFinalVoice,
      completedAt: p.completedAt || entry?.createdAt || null,
      entryId: entry?.id || null,
    };
  });

  let viewerOffer = null;
  let viewerEditOffer = null;
  if (deviceId) {
    const user = await findUserByDevice(deviceId).catch(() => null);
    if (user?.id) {
      const pledge = await readPledge(eid, user.id).catch(() => null);
      const viewer = {
        userId: user.id,
        voiceNumber: Number(pledge?.voice_number) || null,
      };
      viewerOffer = await resolveViewerPhotoBookOffer(chain, viewer, eid);
      const ownEntry = byUserId.get(user.id)
        || (Number.isFinite(viewer.voiceNumber) ? byVoiceNumber.get(viewer.voiceNumber) : null)
        || null;
      viewerEditOffer = resolveViewerOneTimeEditOffer(chain, viewer, ownEntry);
    }
  }

  return {
    chainId: chain.id,
    dailyChainNumber: chain.dailyChainNumber || null,
    dayKey: chain.dayKey || null,
    status: chain.status || null,
    participants,
    viewerOffer,
    viewerEditOffer,
  };
}

function buildOwnerParticipant(step, entry, routeLen) {
  const photoUrl = entryPublicPhotoUrl(entry);
  const note = entryPublicNote(entry);
  const submittedAt = entry?.updatedAt || entry?.createdAt || step.completedAt || null;
  return {
    entryId: entry?.id || null,
    voiceId: step.userId,
    voiceNumber: step.voiceNumber,
    country: step.country,
    city: step.city,
    chainPosition: step.chainPosition,
    isFinalVoice: !!step.isFinalVoice || step.chainPosition === routeLen - 1,
    photoUrl,
    note,
    hasPhoto: !!photoUrl,
    hasDescription: !!note,
    hasContribution: !!(photoUrl || note),
    submittedAt,
    photoSubmittedAt: photoUrl ? (entry?.updatedAt || entry?.createdAt || null) : null,
    descriptionSubmittedAt: note ? (entry?.updatedAt || entry?.createdAt || null) : null,
    photoRemovedAt: entry?.photoRemovedAt || null,
    descriptionRemovedAt: entry?.descriptionRemovedAt || null,
  };
}

function summarizeOwnerParticipants(participants) {
  const total = participants.length;
  const withPhotos = participants.filter((p) => p.hasPhoto).length;
  const withDescriptions = participants.filter((p) => p.hasDescription).length;
  const withContribution = participants.filter((p) => p.hasContribution).length;
  const missingContent = participants.filter((p) => !p.hasPhoto || !p.hasDescription).length;
  return {
    participants: total,
    withContribution,
    photos: withPhotos,
    descriptions: withDescriptions,
    missingContent,
  };
}

async function buildOwnerChainDetail(chain, eventId) {
  const { byUserId, byVoiceNumber } = await loadEntriesByVoice(eventId, chain.id);
  const steps = connectedParticipantSteps(chain);
  const routeLen = (chain.route || []).length;
  const participants = steps.map((step) => {
    const entry = (step.userId && byUserId.get(step.userId))
      || (Number.isFinite(step.voiceNumber) ? byVoiceNumber.get(step.voiceNumber) : null)
      || null;
    return buildOwnerParticipant(step, entry, routeLen);
  });
  const counts = summarizeOwnerParticipants(participants);
  const start = (chain.route || [])[0];
  const final = (chain.route || [])[routeLen - 1];
  const routeSummary = start && final
    ? `${start.country || '?'} → ${final.requiredCity || final.country || '?'}`
    : '';
  return {
    chainId: chain.id,
    dailyChainNumber: chain.dailyChainNumber || null,
    dayKey: chain.dayKey || null,
    status: chain.status || null,
    completedAt: chain.completedAt || null,
    startsAt: chain.startsAt || null,
    routeSummary,
    publicUrl: `/world-chain.html?chain=${encodeURIComponent(chain.id)}&view=photo-book`,
    counts,
    participants,
  };
}

/** Owner overview: all chains sorted by chain number descending. */
async function listOwnerPhotoBookChains(eventId = DEFAULT_EVENT_ID) {
  const eid = String(eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
  const snapshots = await listOwnerWorldChainSnapshots(eid);
  const chains = [];
  for (const chain of snapshots) {
    const detail = await buildOwnerChainDetail(chain, eid);
    chains.push({
      chainId: detail.chainId,
      dailyChainNumber: detail.dailyChainNumber,
      dayKey: detail.dayKey,
      status: detail.status,
      completedAt: detail.completedAt,
      startsAt: detail.startsAt,
      routeSummary: detail.routeSummary,
      publicUrl: detail.publicUrl,
      counts: detail.counts,
      dateLabel: detail.dayKey || (detail.completedAt || detail.startsAt || '').slice(0, 10) || null,
    });
  }
  return {
    eventId: eid,
    serverNow: new Date().toISOString(),
    chains,
  };
}

async function getOwnerPhotoBookChain(eventId, chainId) {
  const eid = String(eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
  const cid = String(chainId || '').trim();
  if (!cid) {
    const err = new Error('chainId required');
    err.statusCode = 400;
    throw err;
  }
  const chain = await readStoredChain(eid, cid);
  if (!chain) {
    // Fall back to owner snapshots (archive / today)
    const snapshots = await listOwnerWorldChainSnapshots(eid);
    const found = snapshots.find((c) => c.id === cid);
    if (!found) {
      const err = new Error('World Chain not found');
      err.statusCode = 404;
      throw err;
    }
    return buildOwnerChainDetail(found, eid);
  }
  return buildOwnerChainDetail(chain, eid);
}

async function loadEntryForOwnerModeration(eventId, chainId, entryId) {
  const eid = String(eventId || DEFAULT_EVENT_ID).trim() || DEFAULT_EVENT_ID;
  const cid = String(chainId || '').trim();
  const id = String(entryId || '').trim();
  if (!cid || !id) {
    const err = new Error('chainId and entryId required');
    err.statusCode = 400;
    throw err;
  }
  let entry;
  try {
    entry = await readBlobJson(entryPath(eid, id));
  } catch {
    entry = null;
  }
  if (!entry || entry.deletedAt) {
    const err = new Error('Photo Book entry not found');
    err.statusCode = 404;
    throw err;
  }
  if (entry.chainId !== cid) {
    const err = new Error('Entry does not belong to this chain');
    err.statusCode = 404;
    throw err;
  }
  return { eid, cid, entry };
}

async function removeOwnerPhotoBookPhoto({
  eventId = DEFAULT_EVENT_ID,
  chainId,
  entryId,
  removedBy = 'owner',
}) {
  assertBlobConfigured();
  const { eid, entry } = await loadEntryForOwnerModeration(eventId, chainId, entryId);
  if (!entryPublicPhotoUrl(entry)) {
    const err = new Error('This entry has no photo to remove');
    err.statusCode = 400;
    throw err;
  }
  const at = new Date().toISOString();
  const next = {
    ...entry,
    imageUrl: null,
    // Keep imagePath for audit; public API ignores when photoRemovedAt is set.
    photoRemovedAt: at,
    photoRemovedBy: String(removedBy || 'owner').slice(0, 120),
    updatedAt: at,
  };
  await writeJson(entryPath(eid, entry.id), next, { overwrite: true });
  return {
    ok: true,
    removed: 'photo',
    entryId: entry.id,
    chainId: entry.chainId,
    photoRemovedAt: at,
  };
}

async function removeOwnerPhotoBookDescription({
  eventId = DEFAULT_EVENT_ID,
  chainId,
  entryId,
  removedBy = 'owner',
}) {
  assertBlobConfigured();
  const { eid, entry } = await loadEntryForOwnerModeration(eventId, chainId, entryId);
  if (!entryPublicNote(entry)) {
    const err = new Error('This entry has no description to remove');
    err.statusCode = 400;
    throw err;
  }
  const at = new Date().toISOString();
  const next = {
    ...entry,
    message: '',
    descriptionRemovedAt: at,
    descriptionRemovedBy: String(removedBy || 'owner').slice(0, 120),
    updatedAt: at,
  };
  await writeJson(entryPath(eid, entry.id), next, { overwrite: true });
  return {
    ok: true,
    removed: 'description',
    entryId: entry.id,
    chainId: entry.chainId,
    descriptionRemovedAt: at,
  };
}

module.exports = {
  MAX_MESSAGE,
  ONE_TIME_EDIT_VOICE_NUMBER,
  createChainPhotoBookEntry,
  updateChainPhotoBookEntryOneTime,
  listChainPhotoBook,
  listOwnerPhotoBookChains,
  getOwnerPhotoBookChain,
  removeOwnerPhotoBookPhoto,
  removeOwnerPhotoBookDescription,
  claimKeyFor,
  participantConnectionId,
  resolveViewerPhotoBookOffer,
  buildPhotoBookOfferAfterConnect,
  isPhotoBookParticipant,
};
