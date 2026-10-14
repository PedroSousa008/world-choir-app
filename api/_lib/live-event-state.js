/**
 * Authoritative global live-event transition state.
 * Stores when the pre-event video ended and the live song began (first write wins).
 *
 * Song-start timestamps MUST fall inside the active schedule window.
 * Leftover test freezes (e.g. Oct 2026 while official is Sept 2027) are purged on read.
 */
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');
const schedule = require('./world-choir-event-schedule');

const LIVE_EVENT_ROOT = 'wc-data/live-event';
const DEFAULT_EVENT_ID = 'world-choir-2027';

/** In-process fallback when blob is unavailable (best-effort on warm instances). */
let memoryState = null;

function statePath(eventId = DEFAULT_EVENT_ID) {
  return `${LIVE_EVENT_ROOT}/${eventId}.json`;
}

function emptyState(eventId = DEFAULT_EVENT_ID) {
  return {
    eventId,
    actualLiveSongStartUtc: null,
    videoEndedRecordedAt: null,
    updatedAt: null,
  };
}

/**
 * True when songStartUtc sits inside the current schedule window
 * (pre-event start − 1m through event end + 2m).
 */
function isSongStartValidForCurrentSchedule(songStartUtc, now = new Date()) {
  if (!songStartUtc) return false;
  const songStart = Date.parse(songStartUtc);
  if (Number.isNaN(songStart)) return false;
  const preStart = Date.parse(schedule.getPreEventStartUtc(now));
  const eventEnd = Date.parse(schedule.getEventEndUtc(now));
  if (Number.isNaN(preStart) || Number.isNaN(eventEnd)) return false;
  return songStart >= preStart - 60_000 && songStart <= eventEnd + 120_000;
}

/**
 * Drop song-start values that do not belong to the active schedule and persist the clear.
 * Runs whether or not the temporary test override is on — production must never keep a test freeze.
 */
async function sanitizeLiveEventState(state, eventId = DEFAULT_EVENT_ID) {
  if (!state?.actualLiveSongStartUtc) return state || emptyState(eventId);
  if (isSongStartValidForCurrentSchedule(state.actualLiveSongStartUtc)) return state;
  return clearLiveEventState(eventId);
}

async function readLiveEventState(eventId = DEFAULT_EVENT_ID) {
  if (memoryState && memoryState.eventId === eventId) {
    return sanitizeLiveEventState({ ...memoryState }, eventId);
  }
  try {
    assertBlobConfigured();
    const raw = await readBlobJson(statePath(eventId));
    if (!raw || typeof raw !== 'object') return emptyState(eventId);
    const state = {
      eventId,
      actualLiveSongStartUtc: raw.actualLiveSongStartUtc || null,
      videoEndedRecordedAt: raw.videoEndedRecordedAt || null,
      updatedAt: raw.updatedAt || null,
    };
    return sanitizeLiveEventState(state, eventId);
  } catch {
    const fallback = memoryState && memoryState.eventId === eventId
      ? { ...memoryState }
      : emptyState(eventId);
    return sanitizeLiveEventState(fallback, eventId);
  }
}

/**
 * Record the global video → song transition. First successful write wins.
 * Refuses writes outside the active schedule window (blocks accidental early freezes).
 * @returns {{ state: object, created: boolean, rejected?: boolean }}
 */
async function recordVideoEnded(eventId = DEFAULT_EVENT_ID, serverNowIso = new Date().toISOString()) {
  const existing = await readLiveEventState(eventId);
  if (existing.actualLiveSongStartUtc) {
    return { state: existing, created: false };
  }

  if (!isSongStartValidForCurrentSchedule(serverNowIso)) {
    return { state: existing, created: false, rejected: true };
  }

  const next = {
    eventId,
    actualLiveSongStartUtc: serverNowIso,
    videoEndedRecordedAt: serverNowIso,
    updatedAt: serverNowIso,
  };

  try {
    assertBlobConfigured();
    await writeJson(statePath(eventId), next);
  } catch {
    /* fall through to memory */
  }

  memoryState = { ...next };
  return { state: { ...next }, created: true };
}

async function clearLiveEventState(eventId = DEFAULT_EVENT_ID) {
  const next = emptyState(eventId);
  next.updatedAt = new Date().toISOString();
  try {
    assertBlobConfigured();
    await writeJson(statePath(eventId), next);
  } catch {
    /* fall through to memory */
  }
  memoryState = { ...next };
  return { ...next };
}

function getLiveEventSchedule() {
  return {
    eventId: DEFAULT_EVENT_ID,
    eventStartUtc: schedule.getEventStartUtc(),
    preEventIntendedStartUtc: schedule.getPreEventStartUtc(),
    songDurationSeconds: schedule.SONG_DURATION_SECONDS,
    preEventVideoDurationSeconds: schedule.PRE_EVENT_VIDEO_DURATION_SECONDS,
    testOverrideEnabled: schedule.isTestOverrideActive(),
    officialEventStartUtc: schedule.OFFICIAL_EVENT_START_UTC,
  };
}

module.exports = {
  DEFAULT_EVENT_ID,
  isSongStartValidForCurrentSchedule,
  readLiveEventState,
  recordVideoEnded,
  clearLiveEventState,
  getLiveEventSchedule,
};
