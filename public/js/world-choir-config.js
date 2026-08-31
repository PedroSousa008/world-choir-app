/**
 * World Choir — Event configuration & state machine
 */
const WorldChoirConfig = (() => {
  /** Real unlock rules — stamps only unlock from actual achievements. */
  const PASSPORT_STAMPS_PREVIEW_MODE = false;

  /**
   * Permanent product behavior — hide locked stamp placeholders.
   * Stamps only appear once earned (with center-to-corner reveal on first view).
   * Locked artwork remains in the repo for future use if needed.
   */
  const PASSPORT_STAMPS_HIDE_LOCKED = true;

  /** Dev replay — replays every stamp reveal without saving. Keep false for normal one-time reveals. */
  const PASSPORT_STAMPS_DEV_REPLAY = false;

  /** Dev test — treat the 100-country global milestone as reached. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_100_COUNTRIES_MILESTONE = false;

  /** Dev test — treat the 1-million-voices global milestone as reached. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_1_MILLION_VOICES_MILESTONE = false;

  /** Dev test — treat the every-continent global milestone as reached. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_EVERY_CONTINENT_MILESTONE = false;

  /** Dev test — treat the made-my-promise stamp as unlocked. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_MADE_MY_PROMISE = false;

  /** Dev test — treat the major-city stamp as unlocked. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_MAJOR_CITY = false;

  /** Dev test — treat the creator-cause stamp as unlocked. Keep false in production. */
  const TEST_FORCE_CREATOR_CAUSE = false;

  /** Dev test — force only Creator Cause reveal animation. Keep false in production. */
  const TEST_FORCE_CREATOR_CAUSE_REVEAL_ONLY = false;

  /** Dev test — treat the daily-act-partner stamp as unlocked. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_DAILY_ACT_PARTNER = false;

  /** Dev test — treat the 405-completed stamp as unlocked. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_405_COMPLETED = false;

  /** Dev test — treat the peace-explorer stamp as unlocked. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_PEACE_EXPLORER = false;

  /** Dev test — treat the 1-year stamp as unlocked. Agent toggles on to test stamp unlock/reveal. */
  const TEST_FORCE_1_YEAR = false;

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
   * Native 1312 × 1199 px (RGBA). Display slot 110 × 110 px, 105 px from left, 200 px from bottom.
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

  /**
   * Passport stamp — "EVERY CONTINENT"
   * Drop your artwork at: public/images/passport/stamps/every-continent.png
   * Native 1586 × 992 px (RGBA). Display slot 105 × 66 px, top-center on page 2.
   */
  const PASSPORT_STAMP_EVERY_CONTINENT = {
    src: 'images/passport/stamps/every-continent.png',
    version: '20260831a',
    width: 1586,
    height: 992,
    alt: 'Every Continent — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the Every Continent stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/every-continent-locked.png
   * Native 1586 × 992 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_EVERY_CONTINENT_LOCKED = {
    src: 'images/passport/stamps/every-continent-locked.png',
    version: '20260831a',
    width: 1586,
    height: 992,
    alt: 'Locked Every Continent stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "MAP PIONEER"
   * Drop your artwork at: public/images/passport/stamps/map-pioneer.png
   * Native 1536 × 1024 px (RGBA). Display slot 72 × 48 px, top-left on page 2.
   * Rare: first 10 voices per country only. No locked artwork — hidden when not earned.
   */
  const PASSPORT_STAMP_MAP_PIONEER = {
    src: 'images/passport/stamps/map-pioneer.png',
    version: '20260831a',
    width: 1536,
    height: 1024,
    alt: 'Map Pioneer — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "MADE MY PROMISE"
   * Drop your artwork at: public/images/passport/stamps/made-my-promise.png
   * Native 1536 × 1024 px (RGBA). Display slot 95 × 60 px, top-right on page 2.
   * Unlocks after the event when the user shares their promise to the world.
   */
  const PASSPORT_STAMP_MADE_MY_PROMISE = {
    src: 'images/passport/stamps/made-my-promise.png',
    version: '20260831b',
    width: 1536,
    height: 1024,
    alt: 'Made My Promise — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the Made My Promise stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/made-my-promise-locked.png
   * Native 1672 × 940 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_MADE_MY_PROMISE_LOCKED = {
    src: 'images/passport/stamps/made-my-promise-locked.png',
    version: '20260831b',
    width: 1672,
    height: 940,
    alt: 'Locked Made My Promise stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "MAJOR CITY"
   * Drop your artwork at: public/images/passport/stamps/major-city.png
   * Native 1374 × 1145 px (RGBA). Display slot 90 × 75 px on page 2.
   * Unlocks when the user's pledged city reaches 50,000 voices.
   */
  const PASSPORT_STAMP_MAJOR_CITY = {
    src: 'images/passport/stamps/major-city.png',
    version: '20260831c',
    width: 1374,
    height: 1145,
    alt: 'Major City — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the Major City stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/major-city-locked.png
   * Native 1214 × 1295 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_MAJOR_CITY_LOCKED = {
    src: 'images/passport/stamps/major-city-locked.png',
    version: '20260831c',
    width: 1214,
    height: 1295,
    alt: 'Locked Major City stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "CREATOR CAUSE"
   * Drop your artwork at: public/images/passport/stamps/creator-cause.png
   * Native 1672 × 941 px (RGBA). Display slot 100 × 56 px on page 2.
   * Unlocks when the user completes at least one verified Creator Foundation donation.
   */
  const PASSPORT_STAMP_CREATOR_CAUSE = {
    src: 'images/passport/stamps/creator-cause.png',
    version: '20260831d',
    width: 1672,
    height: 941,
    alt: 'Creator Cause — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the Creator Cause stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/creator-cause-locked.png
   * Native 1672 × 940 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_CREATOR_CAUSE_LOCKED = {
    src: 'images/passport/stamps/creator-cause-locked.png',
    version: '20260831d',
    width: 1672,
    height: 940,
    alt: 'Locked Creator Cause stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "DAILY ACT PARTNER"
   * Drop your artwork at: public/images/passport/stamps/daily-act-partner.png
   * Native 1536 × 1024 px (RGBA). Display slot 90 × 60 px on page 2.
   * Unlocks when the user completes at least one partner-backed Daily Act of Peace.
   */
  const PASSPORT_STAMP_DAILY_ACT_PARTNER = {
    src: 'images/passport/stamps/daily-act-partner.png',
    version: '20260831e',
    width: 1536,
    height: 1024,
    alt: 'Daily Act Partner — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the Daily Act Partner stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/daily-act-partner-locked.png
   * Native 1774 × 887 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_DAILY_ACT_PARTNER_LOCKED = {
    src: 'images/passport/stamps/daily-act-partner-locked.png',
    version: '20260831e',
    width: 1774,
    height: 887,
    alt: 'Locked Daily Act Partner stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "405 COMPLETED"
   * Drop your artwork at: public/images/passport/stamps/405-completed.png
   * Native 1616 × 973 px (RGBA). Display slot 115 × 69 px on page 2.
   * Unlocks when the user completes at least 405 Daily Acts of Peace.
   */
  const PASSPORT_STAMP_405_COMPLETED = {
    src: 'images/passport/stamps/405-completed.png',
    version: '20260901b',
    width: 1616,
    height: 973,
    alt: '405 Daily Acts Completed — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the 405 Completed stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/405-completed-locked.png
   * Native 2172 × 724 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_405_COMPLETED_LOCKED = {
    src: 'images/passport/stamps/405-completed-locked.png',
    version: '20260901b',
    width: 2172,
    height: 724,
    alt: 'Locked 405 Daily Acts Completed stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "PEACE EXPLORER"
   * Drop your artwork at: public/images/passport/stamps/peace-explorer.png
   * Native 1254 × 1254 px (RGBA). Display slot 85 × 85 px on page 2.
   * Unlocks when the user completes at least one Daily Act in every peace theme.
   */
  const PASSPORT_STAMP_PEACE_EXPLORER = {
    src: 'images/passport/stamps/peace-explorer.png',
    version: '20260901c',
    width: 1254,
    height: 1254,
    alt: 'Peace Explorer — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the Peace Explorer stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/peace-explorer-locked.png
   * Native 1254 × 1254 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_PEACE_EXPLORER_LOCKED = {
    src: 'images/passport/stamps/peace-explorer-locked.png',
    version: '20260901c',
    width: 1254,
    height: 1254,
    alt: 'Locked Peace Explorer stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Passport stamp — "1 YEAR"
   * Drop your artwork at: public/images/passport/stamps/1-year.png
   * Native 1312 × 1199 px (RGBA). Display slot 85 × 85 px on page 2.
   * Unlocks when 365 calendar days have passed since the user pledged.
   */
  const PASSPORT_STAMP_1_YEAR = {
    src: 'images/passport/stamps/1-year.png',
    version: '20260901d',
    width: 1312,
    height: 1199,
    alt: '1 Year — World Choir stamp',
    get url() {
      return `${this.src}?v=${this.version}`;
    },
  };

  /**
   * Locked placeholder for the 1 Year stamp (shown before unlock).
   * Drop your artwork at: public/images/passport/stamps/1-year-locked.png
   * Native 1224 × 1285 px (RGBA). Same display slot as the unlocked stamp.
   */
  const PASSPORT_STAMP_1_YEAR_LOCKED = {
    src: 'images/passport/stamps/1-year-locked.png',
    version: '20260901d',
    width: 1224,
    height: 1285,
    alt: 'Locked 1 Year stamp',
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

  function isPassportStampsHideLocked() {
    return PASSPORT_STAMPS_HIDE_LOCKED;
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

  function isTestForceEveryContinentMilestone() {
    return TEST_FORCE_EVERY_CONTINENT_MILESTONE;
  }

  function isTestForceMadeMyPromise() {
    return TEST_FORCE_MADE_MY_PROMISE;
  }

  function isTestForceMajorCity() {
    return TEST_FORCE_MAJOR_CITY;
  }

  function isTestForceCreatorCause() {
    return TEST_FORCE_CREATOR_CAUSE;
  }

  function isTestForceCreatorCauseRevealOnly() {
    return TEST_FORCE_CREATOR_CAUSE_REVEAL_ONLY;
  }

  function isTestForceDailyActPartner() {
    return TEST_FORCE_DAILY_ACT_PARTNER;
  }

  function isTestForce405Completed() {
    return TEST_FORCE_405_COMPLETED;
  }

  function isTestForcePeaceExplorer() {
    return TEST_FORCE_PEACE_EXPLORER;
  }

  function isTestForce1Year() {
    return TEST_FORCE_1_YEAR;
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
    PASSPORT_STAMP_EVERY_CONTINENT,
    PASSPORT_STAMP_EVERY_CONTINENT_LOCKED,
    PASSPORT_STAMP_MAP_PIONEER,
    PASSPORT_STAMP_MADE_MY_PROMISE,
    PASSPORT_STAMP_MADE_MY_PROMISE_LOCKED,
    PASSPORT_STAMP_MAJOR_CITY,
    PASSPORT_STAMP_MAJOR_CITY_LOCKED,
    PASSPORT_STAMP_CREATOR_CAUSE,
    PASSPORT_STAMP_CREATOR_CAUSE_LOCKED,
    PASSPORT_STAMP_DAILY_ACT_PARTNER,
    PASSPORT_STAMP_DAILY_ACT_PARTNER_LOCKED,
    PASSPORT_STAMP_405_COMPLETED,
    PASSPORT_STAMP_405_COMPLETED_LOCKED,
    PASSPORT_STAMP_PEACE_EXPLORER,
    PASSPORT_STAMP_PEACE_EXPLORER_LOCKED,
    PASSPORT_STAMP_1_YEAR,
    PASSPORT_STAMP_1_YEAR_LOCKED,
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
    isPassportStampsHideLocked,
    isPassportStampsDevReplay,
    isTestForce100CountriesMilestone,
    isTestForce1MillionVoicesMilestone,
    isTestForceEveryContinentMilestone,
    isTestForceMadeMyPromise,
    isTestForceMajorCity,
    isTestForceCreatorCause,
    isTestForceCreatorCauseRevealOnly,
    isTestForceDailyActPartner,
    isTestForce405Completed,
    isTestForcePeaceExplorer,
    isTestForce1Year,
    getAppState,
    formatEventDate,
    formatEventTime,
    getLocalEventTime,
    getMovementStats,
    getGlobalStats,
  };
})();
