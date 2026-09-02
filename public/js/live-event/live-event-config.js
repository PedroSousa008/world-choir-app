/**
 * World Choir — Global live event configuration.
 * Timestamps come from WorldChoirEventSchedule (single source of truth).
 */
const WorldChoirLiveConfig = (() => {
  function schedule() {
    return typeof WorldChoirEventSchedule !== 'undefined' ? WorldChoirEventSchedule : null;
  }

  function getEventId() {
    return schedule()?.EVENT_ID || 'world-choir-2027';
  }

  function getEventStartUtc(now = new Date()) {
    return schedule()?.getEventStartUtc(now) || '2027-09-21T16:00:00.000Z';
  }

  function getPreEventStartUtc(now = new Date()) {
    return schedule()?.getPreEventStartUtc(now) || '2027-09-21T15:55:00.000Z';
  }

  function getVideoDurationSeconds() {
    return schedule()?.PRE_EVENT_VIDEO_DURATION_SECONDS || 301;
  }

  function getSongDurationSeconds() {
    return schedule()?.SONG_DURATION_SECONDS || 183;
  }

  const EVENT = {
    get eventId() { return getEventId(); },
    get eventStartUtc() { return getEventStartUtc(); },
    preEvent: {
      get intendedStartUtc() { return getPreEventStartUtc(); },
      /** Official film: public/video/pre-event.mp4 */
      videoUrl: '/video/pre-event.mp4',
      get videoDurationSeconds() { return getVideoDurationSeconds(); },
    },
    liveSong: {
      title: 'Imagine',
      artist: 'John Lennon',
      audioUrl: '/audio/imagine.mp3',
      get durationSeconds() { return getSongDurationSeconds(); },
    },
  };

  /** Timed lyrics — same source as practice until official live lyrics ship */
  function getLyrics() {
    if (typeof WorldChoirPracticeConfig !== 'undefined') {
      return WorldChoirPracticeConfig.PRACTICE_LYRICS.map((line) => ({
        startTime: line.time,
        endTime: null,
        text: line.text,
      }));
    }
    return [];
  }

  function parseUtc(iso) {
    return new Date(iso).getTime();
  }

  function getPreEventStartMs(now = new Date()) {
    return parseUtc(getPreEventStartUtc(now));
  }

  function getEventStartMs(now = new Date()) {
    return parseUtc(getEventStartUtc(now));
  }

  function getSongDurationMs() {
    return getSongDurationSeconds() * 1000;
  }

  function getVideoDurationMs() {
    return getVideoDurationSeconds() * 1000;
  }

  return {
    EVENT,
    getLyrics,
    parseUtc,
    getPreEventStartMs,
    getEventStartMs,
    getSongDurationMs,
    getVideoDurationMs,
    getEventStartUtc,
    getPreEventStartUtc,
  };
})();
