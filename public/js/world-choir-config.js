/**
 * World Choir — Event configuration & state machine
 */
const WorldChoirConfig = (() => {
  const ACTIVE_EVENT = {
    id: 'world-choir-2027',
    title: 'World Choir 2027',
    songName: 'Imagine',
    artistName: 'John Lennon',
    eventDateUTC: '2027-07-01T16:00:00.000Z',
    songDurationSeconds: 183,
    hashtag: '#WorldChoir2027',
    theme: 'Hope & Unity',
  };

  // Backward-compatible alias used across the app
  const CURRENT_EVENT = {
    id: ACTIVE_EVENT.id,
    title: ACTIVE_EVENT.title,
    songName: ACTIVE_EVENT.songName,
    artistName: ACTIVE_EVENT.artistName,
    eventDateUtc: ACTIVE_EVENT.eventDateUTC,
    officialHashtag: ACTIVE_EVENT.hashtag,
    theme: ACTIVE_EVENT.theme,
  };

  const LOGO = {
    src: 'images/world-choir-logo.png',
    version: '20270706',
    alt: 'World Choir App',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  const EventState = {
    UPCOMING: 'upcoming',
    FINAL_HOUR: 'final_hour',
    LIVE: 'live',
    POST_EVENT_PROMISE: 'post_event_promise',
    COMPLETED: 'completed',
  };

  // Legacy alias
  const AppState = EventState;

  function getEventStart() {
    return new Date(ACTIVE_EVENT.eventDateUTC);
  }

  function getEventEnd() {
    return new Date(getEventStart().getTime() + ACTIVE_EVENT.songDurationSeconds * 1000);
  }

  function getFinalHourStart() {
    return new Date(getEventStart().getTime() - 60 * 60 * 1000);
  }

  function getSongDurationMs() {
    return ACTIVE_EVENT.songDurationSeconds * 1000;
  }

  function getTimeRemaining(now = new Date()) {
    const diff = getEventStart().getTime() - now.getTime();
    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
    }
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
      totalMs: diff,
    };
  }

  /** e.g. 364d 08h 22m 41s */
  function formatCountdownLong(t) {
    return `${t.days}d ${String(t.hours).padStart(2, '0')}h ${String(t.minutes).padStart(2, '0')}m ${String(t.seconds).padStart(2, '0')}s`;
  }

  /** e.g. 00h 59m 42s */
  function formatCountdownFinalHour(t) {
    const totalHours = t.days * 24 + t.hours;
    return `${String(totalHours).padStart(2, '0')}h ${String(t.minutes).padStart(2, '0')}m ${String(t.seconds).padStart(2, '0')}s`;
  }

  function formatCountdown(t) {
    if (t.days > 0) return formatCountdownLong(t);
    return formatCountdownFinalHour(t);
  }

  /**
   * Core state machine — promise ONLY after event end + user participated + no promise yet.
   */
  function getEventState(now = new Date(), options = {}) {
    const userParticipated = options.userParticipated === true;
    const userSubmittedPromise = options.userSubmittedPromise === true;

    const eventStart = getEventStart();
    const eventEnd = getEventEnd();
    const finalHourStart = getFinalHourStart();

    if (now < finalHourStart) return EventState.UPCOMING;
    if (now >= finalHourStart && now < eventStart) return EventState.FINAL_HOUR;
    if (now >= eventStart && now < eventEnd) return EventState.LIVE;
    if (now >= eventEnd && userParticipated && !userSubmittedPromise) {
      return EventState.POST_EVENT_PROMISE;
    }
    return EventState.COMPLETED;
  }

  function getAppState(now, options) {
    return getEventState(now, options);
  }

  function formatEventDate() {
    return getEventStart().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  function formatEventTime() {
    return '16:00 UTC';
  }

  function getLocalEventTime() {
    return getEventStart().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  /** Real movement stats from pledges only — never fake production numbers */
  function getMovementStats() {
    const pledges = typeof WorldChoirDB !== 'undefined'
      ? WorldChoirDB.getPledgesForEvent(ACTIVE_EVENT.id)
      : [];

    const voices = pledges.length;
    const countries = new Set(pledges.map((p) => p.country).filter(Boolean)).size;
    const cities = new Set(pledges.map((p) => `${p.city}|${p.country}`).filter((k) => !k.startsWith('|'))).size;

    return {
      voices,
      countries,
      cities,
      hasData: voices > 0,
      // DEV: demo placeholders — never shown as real production counts in UI
      demo: { voices: 0, countries: 0, cities: 0 },
    };
  }

  // Legacy — redirects to real stats
  function getGlobalStats() {
    return getMovementStats();
  }

  return {
    ACTIVE_EVENT,
    CURRENT_EVENT,
    LOGO,
    EventState,
    AppState,
    getEventDate: getEventStart,
    getEventStart,
    getEventEnd,
    getSongEndDate: getEventEnd,
    getFinalHourStart,
    SONG_DURATION_MS: getSongDurationMs(),
    getSongDurationMs,
    getTimeRemaining,
    formatCountdown,
    formatCountdownLong,
    formatCountdownFinalHour,
    getEventState,
    getAppState,
    formatEventDate,
    formatEventTime,
    getLocalEventTime,
    getMovementStats,
    getGlobalStats,
  };
})();
