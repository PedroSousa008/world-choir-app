/**
 * World Choir — Event configuration & state machine
 */
const WorldChoirConfig = (() => {
  /** Design preview — unlocks all stamps without real achievement rules. Agent toggles on when reviewing layout. */
  const PASSPORT_STAMPS_PREVIEW_MODE = true;

  /** Dev replay — replays the center-to-corner reveal without saving to localStorage. Agent toggles on when reviewing animation. */
  const PASSPORT_STAMPS_DEV_REPLAY = false;

  /** Dev test — treat the 100-country global milestone as reached. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_100_COUNTRIES_MILESTONE = false;

  /** Dev test — treat the 1-million-voices global milestone as reached. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_1_MILLION_VOICES_MILESTONE = false;

  /** TEMP PREVIEW — set to false before launch to hide Memory until event ends */
  const MEMORY_PREVIEW_MODE = false;

  const ACTIVE_EVENT = {
    id: 'world-choir-2027',
    title: 'World Choir 2027',
    songName: 'Imagine',
    artistName: 'John Lennon',
    eventDateUTC: '2027-09-21T16:00:00.000Z',
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

  /** Shared Passport bottom-right world map — replace public/images/passport/passport-world-map.png for all users */
  const PASSPORT_WORLD_MAP = {
    src: 'images/passport/passport-world-map.png',
    version: '20260820b',
    alt: 'World Choir world map',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Shared Passport left feature image (replaces the old blue circle).
   * Drop your asset at: public/images/passport/passport-feature.png
   * Then bump `version` so all clients refresh the image.
   */
  const PASSPORT_FEATURE_IMAGE = {
    src: 'images/passport/passport-feature.png',
    version: '20260821b',
    alt: 'World Choir Passport feature',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Shared Passport inside-page background (shown after tapping the feature image).
   * Drop your asset at: public/images/passport/passport-inside-bg.png
   * Recommended size: 1080 × 1543 px (aspect 0.7, same as the card).
   * Then bump `version` so all clients refresh the image.
   */
  const PASSPORT_INSIDE_BACKGROUND = {
    src: 'images/passport/passport-inside-bg.png',
    version: '20260827c',
    alt: 'World Choir Passport inside page',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Shared Passport inside-page logo (top-right on History page).
   * Drop your asset at: public/images/passport/passport-inside-logo.png
   * Displayed at the same size as the cover logo (68×68).
   */
  const PASSPORT_INSIDE_LOGO = {
    src: 'images/passport/passport-inside-logo.png',
    version: '20260827b',
    alt: 'World Choir',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "I SANG — WORLD CHOIR 2027"
   * Drop your artwork at: public/images/passport/stamps/world-choir-2027-i-sang.png
   * Recommended size: 512 × 512 px (PNG with transparency).
   * Displayed at 85 × 85 px on Passport page 2 (bottom-right) when unlocked.
   * Then bump `version` so all clients refresh the image.
   */
  const PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG = {
    src: 'images/passport/stamps/world-choir-2027-i-sang.png',
    version: '20260828c',
    width: 1295,
    height: 1214,
    alt: 'I Sang — World Choir 2027 stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the World Choir 2027 stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/world-choir-2027-i-sang-locked.png
   * Same display slot as the unlocked stamp: 85 × 85 px, bottom-right on page 2.
   */
  const PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG_LOCKED = {
    src: 'images/passport/stamps/world-choir-2027-i-sang-locked.png',
    version: '20260828d',
    width: 1305,
    height: 1206,
    alt: 'Locked World Choir 2027 stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "WORLD CHOIR — 100 COUNTRIES — ONE WORLD • ONE VOICE"
   * Drop your artwork at: public/images/passport/stamps/100-countries-stamp.png
   * Native 1672 × 941 px (RGBA). Display slot 140 × 80 px, 25 px from right, 135 px from bottom.
   */
  const PASSPORT_STAMP_100_COUNTRIES = {
    src: 'images/passport/stamps/100-countries-stamp.png',
    version: '20260828b',
    width: 1672,
    height: 941,
    alt: 'World Choir 100 Countries stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the 100 Countries stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/100-countries-stamp-locked.png
   * Native 1672 × 941 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_100_COUNTRIES_LOCKED = {
    src: 'images/passport/stamps/100-countries-stamp-locked.png',
    version: '20260828b',
    width: 1672,
    height: 941,
    alt: 'Locked World Choir 100 Countries stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "YOUR VOICE JOINED"
   * Drop your artwork at: public/images/passport/stamps/your-voice-joined.png
   * Native 1774 × 887 px (RGBA). Display slot 140 × 70 px, left side of page 2.
   * Unlocks when the user pledges via “I’ll Sing”.
   */
  const PASSPORT_STAMP_YOUR_VOICE_JOINED = {
    src: 'images/passport/stamps/your-voice-joined.png',
    version: '20260829a',
    width: 1774,
    height: 887,
    alt: 'Your Voice Joined — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the Your Voice Joined stamp (shown before pledge).
   * Drop your artwork at: public/images/passport/stamps/your-voice-joined-locked.png
   * Native 1994 × 789 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_YOUR_VOICE_JOINED_LOCKED = {
    src: 'images/passport/stamps/your-voice-joined-locked.png',
    version: '20260829b',
    width: 1994,
    height: 789,
    alt: 'Locked Your Voice Joined stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "1 MILLION VOICES"
   * Drop your artwork at: public/images/passport/stamps/1-million-voices.png
   * Native 1312 × 1199 px (RGBA). Display slot 85 × 85 px, bottom-left on page 2.
   */
  const PASSPORT_STAMP_1_MILLION_VOICES = {
    src: 'images/passport/stamps/1-million-voices.png',
    version: '20260829a',
    width: 1312,
    height: 1199,
    alt: '1 Million Voices — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the 1 Million Voices stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/1-million-voices-locked.png
   * Native 1297 × 1212 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_1_MILLION_VOICES_LOCKED = {
    src: 'images/passport/stamps/1-million-voices-locked.png',
    version: '20260829a',
    width: 1297,
    height: 1212,
    alt: 'Locked 1 Million Voices stamp',
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

  /** Calendar invite duration (10 minutes) — separate from live song length */
  const CALENDAR_EVENT_DURATION_MS = 10 * 60 * 1000;

  function getCalendarEventEnd() {
    const songMs = ACTIVE_EVENT.songDurationSeconds * 1000;
    const durationMs = songMs > 0 ? songMs : CALENDAR_EVENT_DURATION_MS;
    return new Date(getEventStart().getTime() + durationMs);
  }

  function getWebsiteUrl() {
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin;
      const path = window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
      return origin + (path || '');
    }
    return 'https://world-choir-app.vercel.app';
  }

  function getCalendarDescription() {
    return getReminderDescription();
  }

  function getReminderDescription() {
    return [
      'Once a year, the world sings the same song at the exact same time.',
      '',
      'World Choir 2027',
      'Song: Imagine — John Lennon',
    ].join('\n');
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
   * Global event state — not user-specific.
   * POST_EVENT_PROMISE is per-user only; globally after song end = COMPLETED.
   */
  function getGlobalEventState(now = new Date()) {
    const eventStart = getEventStart();
    const eventEnd = getEventEnd();
    const finalHourStart = getFinalHourStart();

    if (now < finalHourStart) return EventState.UPCOMING;
    if (now >= finalHourStart && now < eventStart) return EventState.FINAL_HOUR;
    if (now >= eventStart && now < eventEnd) return EventState.LIVE;
    return EventState.COMPLETED;
  }

  /** Memory tab unlocks globally once the active event song has finished. */
  function isMemoryUnlocked(now = new Date()) {
    if (MEMORY_PREVIEW_MODE) return true;
    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.hasCompletedEvents()) {
      return true;
    }
    return getGlobalEventState(now) === EventState.COMPLETED;
  }

  function isMemoryPreviewMode() {
    return MEMORY_PREVIEW_MODE;
  }

  function isPassportStampsPreviewMode() {
    return PASSPORT_STAMPS_PREVIEW_MODE;
  }

  function isPassportStampsDevReplay() {
    return PASSPORT_STAMPS_DEV_REPLAY;
  }

  function isTestForce100CountriesMilestone() {
    return TEST_FORCE_100_COUNTRIES_MILESTONE;
  }

  function isTestForce1MillionVoicesMilestone() {
    return TEST_FORCE_1_MILLION_VOICES_MILESTONE;
  }

  function getGlobalEventStatus(now = new Date()) {
    return getGlobalEventState(now);
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
    PASSPORT_WORLD_MAP,
    PASSPORT_FEATURE_IMAGE,
    PASSPORT_INSIDE_BACKGROUND,
    PASSPORT_INSIDE_LOGO,
    PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG,
    PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG_LOCKED,
    PASSPORT_STAMP_100_COUNTRIES,
    PASSPORT_STAMP_100_COUNTRIES_LOCKED,
    PASSPORT_STAMP_YOUR_VOICE_JOINED,
    PASSPORT_STAMP_YOUR_VOICE_JOINED_LOCKED,
    PASSPORT_STAMP_1_MILLION_VOICES,
    PASSPORT_STAMP_1_MILLION_VOICES_LOCKED,
    EventState,
    AppState,
    getEventDate: getEventStart,
    getEventStart,
    getEventEnd,
    getCalendarEventEnd,
    getCalendarDescription,
    getReminderDescription,
    getWebsiteUrl,
    CALENDAR_EVENT_DURATION_MS,
    getSongEndDate: getEventEnd,
    getFinalHourStart,
    SONG_DURATION_MS: getSongDurationMs(),
    getSongDurationMs,
    getTimeRemaining,
    formatCountdown,
    formatCountdownLong,
    formatCountdownFinalHour,
    getEventState,
    getGlobalEventState,
    getGlobalEventStatus,
    isMemoryUnlocked,
    isMemoryPreviewMode,
    isPassportStampsPreviewMode,
    isPassportStampsDevReplay,
    isTestForce100CountriesMilestone,
    isTestForce1MillionVoicesMilestone,
    getAppState,
    formatEventDate,
    formatEventTime,
    getLocalEventTime,
    getMovementStats,
    getGlobalStats,
  };
})();
