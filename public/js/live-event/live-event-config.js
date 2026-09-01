/**
 * World Choir — Global live event configuration.
 * Replace video/audio URLs and lyrics here when final assets are ready.
 */
const WorldChoirLiveConfig = (() => {
  const EVENT = {
    eventId: 'world-choir-2027',
    eventStartUtc: '2027-09-21T16:00:00.000Z',

    preEvent: {
      intendedStartUtc: '2027-09-21T15:55:00.000Z',
      /** Placeholder until official pre-event film is delivered */
      videoUrl: '/video/pre-event.mp4',
      /** Expected duration — used for global timeline until metadata loads */
      videoDurationSeconds: 300,
    },

    liveSong: {
      title: 'Imagine',
      artist: 'John Lennon',
      audioUrl: '/audio/imagine.mp3',
      durationSeconds: 183,
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

  function getPreEventStartMs() {
    return parseUtc(EVENT.preEvent.intendedStartUtc);
  }

  function getEventStartMs() {
    return parseUtc(EVENT.eventStartUtc);
  }

  function getSongDurationMs() {
    return EVENT.liveSong.durationSeconds * 1000;
  }

  function getVideoDurationMs() {
    return EVENT.preEvent.videoDurationSeconds * 1000;
  }

  return {
    EVENT,
    getLyrics,
    parseUtc,
    getPreEventStartMs,
    getEventStartMs,
    getSongDurationMs,
    getVideoDurationMs,
  };
})();
