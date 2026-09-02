/**
 * Authoritative global live-event transition state.
 * Stores when the pre-event video ended and the live song began (first write wins).
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

function isSongStartValidForCurrentSchedule(songStartUtc) {
  if (!songStartUtc) return false;
  const songStart = Date.parse(songStartUtc);
  if (Number.isNaN(songStart)) return false;
  const preStart = Date.parse(schedule.getPreEventStartUtc());
  const eventEnd = Date.parse(schedule.getEventEndUtc());
  return songStart >= preStart - 60_000 && songStart <= eventEnd + 120_000;
}

async function sanitizeLiveEventState(state, eventId = DEFAULT_EVENT_ID) {
  if (
    state.actualLiveSongStartUtc
    && schedule.isTestOverrideActive()
    && !isSongStartValidForCurrentSchedule(state.actualLiveSongStartUtc)
  ) {
    return clearLiveEventState(eventId);
  }
  return state;
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
 * @returns {{ state: object, created: boolean }}
 */
async function recordVideoEnded(eventId = DEFAULT_EVENT_ID, serverNowIso = new Date().toISOString()) {
  const existing = await readLiveEventState(eventId);
  if (existing.actualLiveSongStartUtc) {
    return { state: existing, created: false };
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
  readLiveEventState,
  recordVideoEnded,
  clearLiveEventState,
  getLiveEventSchedule,
};
