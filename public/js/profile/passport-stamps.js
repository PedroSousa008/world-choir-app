/**
 * PassportStamps — reusable Passport stamp registry, unlock logic, and rendering.
 *
 * Unlock dates are derived from each event's configured eventDateUTC plus
 * unlockOffsetDays (calendar-day math in UTC; isolated for future timezone support).
 *
 * Every stamp in PASSPORT_STAMPS automatically gets the one-time center-to-corner
 * reveal on first Stamps page visit after unlock (tracked per user in localStorage).
 */
const PassportStamps = (() => {
  const UnlockType = {
    EVENT_PARTICIPATION_COMPLETED: 'EVENT_PARTICIPATION_COMPLETED',
    GLOBAL_COUNTRY_MILESTONE: 'GLOBAL_COUNTRY_MILESTONE',
    GLOBAL_VOICE_MILESTONE: 'GLOBAL_VOICE_MILESTONE',
    GLOBAL_CONTINENT_MILESTONE: 'GLOBAL_CONTINENT_MILESTONE',
    MAP_PIONEER: 'MAP_PIONEER',
    PROMISE_SUBMITTED: 'PROMISE_SUBMITTED',
    MAJOR_CITY: 'MAJOR_CITY',
    CREATOR_CAUSE_DONATION: 'CREATOR_CAUSE_DONATION',
    DAILY_ACT_PARTNER_COMPLETED: 'DAILY_ACT_PARTNER_COMPLETED',
    DAILY_ACTS_405_COMPLETED: 'DAILY_ACTS_405_COMPLETED',
    PEACE_EXPLORER: 'PEACE_EXPLORER',
    PLEDGE_ANNIVERSARY_1_YEAR: 'PLEDGE_ANNIVERSARY_1_YEAR',
    PLEDGE_JOINED: 'PLEDGE_JOINED',
  };

  const REQUIRED_DAILY_ACTS_405_COUNT = 405;
  const REQUIRED_PEACE_THEME_COUNT = 8;
  const REQUIRED_PLEDGE_DAYS_1_YEAR = 365;

  const MAJOR_CITY_VOICE_THRESHOLD = 50_000;

  const REQUIRED_CONTINENTS = ['africa', 'america', 'asia', 'europe', 'oceania'];

  /**
   * Stamp registry — add future stamps here.
   * Each entry automatically inherits unlock rules + one-time reveal animation.
   * Artwork lives in public/images/passport/stamps/ (see WorldChoirConfig.PASSPORT_STAMP_*).
   */
  const PASSPORT_STAMPS = [
    {
      id: 'your-voice-joined',
      title: 'Your Voice Joined',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_YOUR_VOICE_JOINED',
      lockedImageKey: 'PASSPORT_STAMP_YOUR_VOICE_JOINED_LOCKED',
      unlockType: UnlockType.PLEDGE_JOINED,
      requiresPledge: true,
      displayWidth: 140,
      displayHeight: 70,
      position: { left: 28, bottom: 135 },
      revealOrder: 1,
      lockedMessage: 'Pledge to sing and join the World Choir.',
    },
    {
      id: 'world-choir-2027-i-sang',
      title: 'I Sang — World Choir 2027',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG',
      lockedImageKey: 'PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG_LOCKED',
      unlockType: UnlockType.EVENT_PARTICIPATION_COMPLETED,
      unlockOffsetDays: 1,
      placement: 'bottom-right',
      revealOrder: 2,
      lockedMessage: 'Complete the World Choir gathering to reveal this stamp.',
    },
    {
      id: 'world-choir-100-countries',
      title: '100 Countries — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_100_COUNTRIES',
      lockedImageKey: 'PASSPORT_STAMP_100_COUNTRIES_LOCKED',
      unlockType: UnlockType.GLOBAL_COUNTRY_MILESTONE,
      milestoneId: '100-countries',
      requiredCountryCount: 100,
      requiresPledge: true,
      requiresLocation: true,
      displayWidth: 140,
      displayHeight: 80,
      position: { right: 25, bottom: 135 },
      revealOrder: 3,
      lockedMessage: 'A global milestone is waiting to be reached.',
    },
    {
      id: 'world-choir-1-million-voices',
      title: '1 Million Voices — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_1_MILLION_VOICES',
      lockedImageKey: 'PASSPORT_STAMP_1_MILLION_VOICES_LOCKED',
      unlockType: UnlockType.GLOBAL_VOICE_MILESTONE,
      milestoneId: '1-million-voices',
      requiredVoiceCount: 1_000_000,
      requiresPledge: true,
      displayWidth: 110,
      displayHeight: 110,
      position: { left: 105, bottom: 200 },
      revealOrder: 4,
      lockedMessage: 'A global milestone is waiting to be reached.',
    },
    {
      id: 'world-choir-every-continent',
      title: 'Every Continent — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_EVERY_CONTINENT',
      lockedImageKey: 'PASSPORT_STAMP_EVERY_CONTINENT_LOCKED',
      unlockType: UnlockType.GLOBAL_CONTINENT_MILESTONE,
      milestoneId: 'every-continent',
      requiresPledge: true,
      displayWidth: 105,
      displayHeight: 66,
      position: { left: 134, top: 118 },
      revealOrder: 5,
      lockedMessage: 'A global milestone is waiting to be reached.',
    },
    {
      id: 'world-choir-map-pioneer',
      title: 'Map Pioneer — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_MAP_PIONEER',
      unlockType: UnlockType.MAP_PIONEER,
      requiresPledge: true,
      hideWhenLocked: true,
      displayWidth: 85,
      displayHeight: 57,
      position: { left: 190, top: 47 },
      revealOrder: 6,
    },
    {
      id: 'world-choir-made-my-promise',
      title: 'Made My Promise — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_MADE_MY_PROMISE',
      lockedImageKey: 'PASSPORT_STAMP_MADE_MY_PROMISE_LOCKED',
      unlockType: UnlockType.PROMISE_SUBMITTED,
      requiresPledge: true,
      displayWidth: 95,
      displayHeight: 60,
      position: { left: 15, bottom: 25 },
      revealOrder: 7,
      lockedMessage: 'Share your promise to the world after the gathering.',
    },
    {
      id: 'world-choir-major-city',
      title: 'Major City — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_MAJOR_CITY',
      lockedImageKey: 'PASSPORT_STAMP_MAJOR_CITY_LOCKED',
      unlockType: UnlockType.MAJOR_CITY,
      requiredCityVoiceCount: MAJOR_CITY_VOICE_THRESHOLD,
      requiresPledge: true,
      requiresLocation: true,
      displayWidth: 110,
      displayHeight: 82.5,
      position: { right: 2, top: 100 },
      revealOrder: 8,
      lockedMessage: 'Your city must reach 50,000 voices to unlock this stamp.',
    },
    {
      id: 'world-choir-creator-cause',
      title: 'Creator Cause — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_CREATOR_CAUSE',
      lockedImageKey: 'PASSPORT_STAMP_CREATOR_CAUSE_LOCKED',
      unlockType: UnlockType.CREATOR_CAUSE_DONATION,
      requiresPledge: false,
      displayWidth: 100,
      displayHeight: 56,
      position: { left: 5, top: 192 },
      revealOrder: 9,
      lockedMessage: 'Support a Creator Foundation cause to unlock this stamp.',
    },
    {
      id: 'world-choir-daily-act-partner',
      title: 'Daily Act Partner — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_DAILY_ACT_PARTNER',
      lockedImageKey: 'PASSPORT_STAMP_DAILY_ACT_PARTNER_LOCKED',
      unlockType: UnlockType.DAILY_ACT_PARTNER_COMPLETED,
      requiresPledge: false,
      displayWidth: 105,
      displayHeight: 70,
      position: { bottom: 30, centerX: true },
      revealOrder: 10,
      lockedMessage: 'Complete a partner-backed Daily Act of Peace to unlock this stamp.',
    },
    {
      id: 'world-choir-405-completed',
      title: '405 Daily Acts — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_405_COMPLETED',
      lockedImageKey: 'PASSPORT_STAMP_405_COMPLETED_LOCKED',
      unlockType: UnlockType.DAILY_ACTS_405_COMPLETED,
      requiredDailyActsCount: REQUIRED_DAILY_ACTS_405_COUNT,
      requiresPledge: false,
      displayWidth: 115,
      displayHeight: 69,
      position: { bottom: 88, centerX: true },
      revealOrder: 11,
      lockedMessage: 'Complete 405 Daily Acts of Peace to unlock this stamp.',
    },
    {
      id: 'world-choir-peace-explorer',
      title: 'Peace Explorer — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_PEACE_EXPLORER',
      lockedImageKey: 'PASSPORT_STAMP_PEACE_EXPLORER_LOCKED',
      unlockType: UnlockType.PEACE_EXPLORER,
      requiredThemeCount: REQUIRED_PEACE_THEME_COUNT,
      requiresPledge: false,
      displayWidth: 85,
      displayHeight: 85,
      position: { left: 5, top: 110 },
      revealOrder: 12,
      lockedMessage: 'Complete a Daily Act of Peace in every peace theme to unlock this stamp.',
    },
    {
      id: 'world-choir-1-year',
      title: '1 Year — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_1_YEAR',
      lockedImageKey: 'PASSPORT_STAMP_1_YEAR_LOCKED',
      unlockType: UnlockType.PLEDGE_ANNIVERSARY_1_YEAR,
      requiredPledgeDays: REQUIRED_PLEDGE_DAYS_1_YEAR,
      requiresPledge: true,
      displayWidth: 95,
      displayHeight: 95,
      position: { right: 5, top: 192 },
      revealOrder: 13,
      lockedMessage: 'Stay pledged for 365 days to unlock this stamp.',
    },
  ];

  function resolveStampImage(stamp, { unlocked = false } = {}) {
    const key = unlocked ? stamp.imageKey : (stamp.lockedImageKey || stamp.imageKey);
    if (key && typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig[key]) {
      return WorldChoirConfig[key];
    }
    if (stamp.imageKey && typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig[stamp.imageKey]) {
      return WorldChoirConfig[stamp.imageKey];
    }
    return stamp.image || null;
  }

  function getUtcCalendarDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
    };
  }

  function calendarDateToTimestamp({ year, month, day }) {
    return Date.UTC(year, month, day);
  }

  function addCalendarDays(calendarDate, offsetDays) {
    const d = new Date(calendarDateToTimestamp(calendarDate));
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return getUtcCalendarDate(d);
  }

  function compareCalendarDates(a, b) {
    return calendarDateToTimestamp(a) - calendarDateToTimestamp(b);
  }

  function getEventById(eventId) {
    if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.ACTIVE_EVENT?.id === eventId) {
      return WorldChoirConfig.ACTIVE_EVENT;
    }
    return null;
  }

  /** First calendar day the stamp may unlock (UTC), derived from event date + offset. */
  function getStampUnlockCalendarDate(stamp, event = null) {
    const ev = event || getEventById(stamp.eventId);
    if (!ev?.eventDateUTC) return null;
    const eventDay = getUtcCalendarDate(new Date(ev.eventDateUTC));
    const offset = Number(stamp.unlockOffsetDays) || 0;
    return addCalendarDays(eventDay, offset);
  }

  function getStampUnlockDate(stamp, event = null) {
    const calendarDate = getStampUnlockCalendarDate(stamp, event);
    if (!calendarDate) return null;
    return new Date(calendarDateToTimestamp(calendarDate));
  }

  function hasPledgedForEvent(eventId, context = {}) {
    if (typeof context.hasPledgedForEvent === 'function') {
      return context.hasPledgedForEvent(eventId);
    }
    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.hasPledged) {
      return WorldChoirDB.hasPledged(eventId);
    }
    return false;
  }

  function isPreviewMode() {
    return typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.isPassportStampsPreviewMode?.() === true;
  }

  function isDevReplay() {
    return typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.isPassportStampsDevReplay?.() === true;
  }

  function isTestForce100CountriesMilestone(stamp) {
    if (stamp?.milestoneId !== '100-countries' && stamp?.id !== 'world-choir-100-countries') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForce100CountriesMilestone?.() === true;
  }

  function isTestForce1MillionVoicesMilestone(stamp) {
    if (stamp?.milestoneId !== '1-million-voices' && stamp?.id !== 'world-choir-1-million-voices') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForce1MillionVoicesMilestone?.() === true;
  }

  function isTestForceEveryContinentMilestone(stamp) {
    if (stamp?.milestoneId !== 'every-continent' && stamp?.id !== 'world-choir-every-continent') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForceEveryContinentMilestone?.() === true;
  }

  function isTestForceMadeMyPromise(stamp) {
    if (stamp?.id !== 'world-choir-made-my-promise') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForceMadeMyPromise?.() === true;
  }

  function isTestForceMajorCity(stamp) {
    if (stamp?.id !== 'world-choir-major-city') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForceMajorCity?.() === true;
  }

  function isTestForceCreatorCause(stamp) {
    if (stamp?.id !== 'world-choir-creator-cause') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForceCreatorCause?.() === true;
  }

  function isTestForceDailyActPartner(stamp) {
    if (stamp?.id !== 'world-choir-daily-act-partner') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForceDailyActPartner?.() === true;
  }

  function isTestForce405Completed(stamp) {
    if (stamp?.id !== 'world-choir-405-completed') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForce405Completed?.() === true;
  }

  function isTestForcePeaceExplorer(stamp) {
    if (stamp?.id !== 'world-choir-peace-explorer') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForcePeaceExplorer?.() === true;
  }

  function isTestForce1Year(stamp) {
    if (stamp?.id !== 'world-choir-1-year') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForce1Year?.() === true;
  }

  function hasSupportedCreatorCause(context = {}) {
    if (context.hasSupportedCreatorCause === true) return true;
    if (typeof context.hasSupportedCreatorCause === 'function') {
      return context.hasSupportedCreatorCause() === true;
    }
    return false;
  }

  function hasCompletedPartnerDailyAct(context = {}) {
    if (context.hasCompletedPartnerDailyAct === true) return true;
    if (typeof context.hasCompletedPartnerDailyAct === 'function') {
      return context.hasCompletedPartnerDailyAct() === true;
    }
    return (Number(context.partnerDailyActsCompleted) || 0) >= 1;
  }

  function getDailyActsCompletedCount(context = {}) {
    if (typeof context.dailyActsCompleted === 'function') {
      return Number(context.dailyActsCompleted()) || 0;
    }
    return Number(context.dailyActsCompleted) || 0;
  }

  function hasCompleted405DailyActs(stamp, context = {}) {
    const threshold = Number(stamp?.requiredDailyActsCount) || REQUIRED_DAILY_ACTS_405_COUNT;
    return getDailyActsCompletedCount(context) >= threshold;
  }

  function hasCompletedAllPeaceThemes(stamp, context = {}) {
    if (context.hasCompletedAllPeaceThemes === true) return true;
    if (typeof context.hasCompletedAllPeaceThemes === 'function') {
      return context.hasCompletedAllPeaceThemes() === true;
    }
    const required = Number(stamp?.requiredThemeCount) || REQUIRED_PEACE_THEME_COUNT;
    const experienced = Number(context.themesExperienced ?? context.categoriesExperienced) || 0;
    return experienced >= required;
  }

  function resolvePledgedAt(context = {}) {
    if (typeof context.pledgedAt === 'function') {
      return context.pledgedAt();
    }
    return context.pledgedAt || null;
  }

  function getPledgeAnniversaryUnlockCalendarDate(stamp, context = {}) {
    const pledgedAt = resolvePledgedAt(context);
    if (!pledgedAt) return null;
    const pledgedDate = pledgedAt instanceof Date ? pledgedAt : new Date(pledgedAt);
    if (Number.isNaN(pledgedDate.getTime())) return null;
    const days = Number(stamp?.requiredPledgeDays) || REQUIRED_PLEDGE_DAYS_1_YEAR;
    return addCalendarDays(getUtcCalendarDate(pledgedDate), days);
  }

  function hasReachedPledgeAnniversary(stamp, context = {}) {
    const unlockCalendarDate = getPledgeAnniversaryUnlockCalendarDate(stamp, context);
    if (!unlockCalendarDate) return false;
    const currentDate = context.currentDate instanceof Date ? context.currentDate : new Date();
    return compareCalendarDates(getUtcCalendarDate(currentDate), unlockCalendarDate) >= 0;
  }

  function normalizeCityKey(city, country) {
    return `${String(city || '').trim().toLowerCase()}|${String(country || '').trim().toLowerCase()}`;
  }

  function getUserCityVoiceCount(context = {}) {
    if (Number.isFinite(context.userCityVoiceCount)) {
      return Number(context.userCityVoiceCount);
    }

    const city = String(context.userCity || '').trim();
    const country = String(context.userCountry || '').trim();
    if (!city || !country) return 0;

    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getAggregatedCities) {
      const cityKey = normalizeCityKey(city, country);
      const match = WorldChoirDB.getAggregatedCities().find(
        (entry) => normalizeCityKey(entry.city, entry.country) === cityKey
      );
      return Number(match?.count) || 0;
    }

    return 0;
  }

  function isMajorCityReached(stamp, context = {}) {
    if (isTestForceMajorCity(stamp) || context.forceMajorCity === true) {
      return true;
    }

    const threshold = Number(stamp.requiredCityVoiceCount) || MAJOR_CITY_VOICE_THRESHOLD;
    const city = String(context.userCity || '').trim();
    const country = String(context.userCountry || '').trim();
    if (!city || !country) return false;

    const cityKey = normalizeCityKey(city, country);
    const majorCities = context.majorCities || [];
    if (majorCities.some((entry) => String(entry).trim().toLowerCase() === cityKey)) {
      return true;
    }

    return getUserCityVoiceCount(context) >= threshold;
  }

  function hasSubmittedPromiseForEvent(eventId, context = {}) {
    if (typeof context.hasSubmittedPromiseForEvent === 'function') {
      return context.hasSubmittedPromiseForEvent(eventId) === true;
    }
    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.hasSubmittedPromise) {
      return WorldChoirDB.hasSubmittedPromise(eventId) === true;
    }
    return false;
  }

  function isEventEndedForStamp(stamp, context = {}) {
    const currentDate = context.currentDate instanceof Date ? context.currentDate : new Date();
    const event = getEventById(stamp.eventId);

    if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.getEventEnd) {
      if (event && WorldChoirConfig.ACTIVE_EVENT?.id === stamp.eventId) {
        return currentDate >= WorldChoirConfig.getEventEnd();
      }
    }

    if (!event?.eventDateUTC) return false;
    const durationMs = (Number(event.songDurationSeconds) || 183) * 1000;
    const eventEnd = new Date(new Date(event.eventDateUTC).getTime() + durationMs);
    return currentDate >= eventEnd;
  }

  function hasEveryContinent(representedContinents = []) {
    const set = new Set(
      representedContinents
        .map((continent) => String(continent || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return REQUIRED_CONTINENTS.every((continent) => set.has(continent));
  }

  function userHasValidLocation(context = {}) {
    if (typeof context.userHasValidLocation === 'function') {
      return context.userHasValidLocation() === true;
    }
    const country = String(context.userCountry || '').trim();
    const city = String(context.userCity || '').trim();
    return !!(country && city);
  }

  function resolveUserEligibility(stamp, context = {}) {
    const requiresPledge = stamp.requiresPledge !== false;
    const requiresLocation = stamp.requiresLocation === true;
    const eventId = stamp.eventId;
    const pledged = !requiresPledge || hasPledgedForEvent(eventId, context);
    const hasLocation = !requiresLocation || userHasValidLocation(context);
    return { pledged, hasLocation, requiresPledge, requiresLocation };
  }

  function isGlobalCountryMilestoneReached(stamp, context = {}) {
    if (isTestForce100CountriesMilestone(stamp) || context.force100CountriesMilestone === true) {
      return true;
    }

    const milestoneId = stamp.milestoneId || `${Number(stamp.requiredCountryCount) || 100}-countries`;
    const milestone = context.milestones?.[milestoneId];
    if (milestone?.reached === true) return true;

    const required = Number(stamp.requiredCountryCount) || 100;
    return (Number(context.representedCountryCount) || 0) >= required;
  }

  function isGlobalVoiceMilestoneReached(stamp, context = {}) {
    if (isTestForce1MillionVoicesMilestone(stamp) || context.force1MillionVoicesMilestone === true) {
      return true;
    }

    const milestoneId = stamp.milestoneId || '1-million-voices';
    const milestone = context.milestones?.[milestoneId];
    if (milestone?.reached === true) return true;

    const required = Number(stamp.requiredVoiceCount) || 1_000_000;
    return (Number(context.voiceCount) || 0) >= required;
  }

  function isGlobalContinentMilestoneReached(stamp, context = {}) {
    if (isTestForceEveryContinentMilestone(stamp) || context.forceEveryContinentMilestone === true) {
      return true;
    }

    const milestoneId = stamp.milestoneId || 'every-continent';
    const milestone = context.milestones?.[milestoneId];
    if (milestone?.reached === true) return true;

    return hasEveryContinent(context.representedContinents || []);
  }

  function evaluateStampUnlock(stamp, context = {}) {
    const event = getEventById(stamp.eventId);
    const eligibility = resolveUserEligibility(stamp, context);

    if (isPreviewMode()) {
      return {
        unlocked: true,
        pledged: eligibility.pledged,
        hasLocation: eligibility.hasLocation,
        unlockDate: getStampUnlockDate(stamp, event),
        reason: 'preview_mode',
      };
    }

    const currentDate = context.currentDate instanceof Date ? context.currentDate : new Date();

    if (stamp.unlockType === UnlockType.PLEDGE_JOINED) {
      const pledged = hasPledgedForEvent(stamp.eventId, context);
      return {
        unlocked: pledged,
        pledged,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: pledged ? 'unlocked' : 'not_pledged',
      };
    }

    if (stamp.unlockType === UnlockType.EVENT_PARTICIPATION_COMPLETED) {
      const pledged = eligibility.pledged;

      if (!event) {
        return { unlocked: false, pledged, hasLocation: eligibility.hasLocation, unlockDate: null, reason: 'event_not_found' };
      }
      if (!pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: getStampUnlockDate(stamp, event),
          reason: 'not_pledged',
        };
      }

      const unlockCalendarDate = getStampUnlockCalendarDate(stamp, event);
      const today = getUtcCalendarDate(currentDate);
      const unlocked = compareCalendarDates(today, unlockCalendarDate) >= 0;

      return {
        unlocked,
        pledged: true,
        hasLocation: eligibility.hasLocation,
        unlockDate: getStampUnlockDate(stamp, event),
        reason: unlocked ? 'unlocked' : 'before_unlock_date',
      };
    }

    if (stamp.unlockType === UnlockType.GLOBAL_COUNTRY_MILESTONE) {
      const milestoneReached = isGlobalCountryMilestoneReached(stamp, context);

      if (!milestoneReached) {
        return {
          unlocked: false,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'milestone_not_reached',
        };
      }
      if (!eligibility.pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }
      if (!eligibility.hasLocation) {
        return {
          unlocked: false,
          pledged: true,
          hasLocation: false,
          unlockDate: null,
          reason: 'no_valid_location',
        };
      }

      return {
        unlocked: true,
        pledged: true,
        hasLocation: true,
        unlockDate: null,
        reason: 'unlocked',
      };
    }

    if (stamp.unlockType === UnlockType.GLOBAL_VOICE_MILESTONE) {
      const milestoneReached = isGlobalVoiceMilestoneReached(stamp, context);

      if (!milestoneReached) {
        return {
          unlocked: false,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'milestone_not_reached',
        };
      }
      if (!eligibility.pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }

      return {
        unlocked: true,
        pledged: true,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: 'unlocked',
      };
    }

    if (stamp.unlockType === UnlockType.GLOBAL_CONTINENT_MILESTONE) {
      const milestoneReached = isGlobalContinentMilestoneReached(stamp, context);

      if (!milestoneReached) {
        return {
          unlocked: false,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'milestone_not_reached',
        };
      }
      if (!eligibility.pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }

      return {
        unlocked: true,
        pledged: true,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: 'unlocked',
      };
    }

    if (stamp.unlockType === UnlockType.MAP_PIONEER) {
      const isPioneer = context.isMapPioneer === true;
      if (!eligibility.pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }
      return {
        unlocked: isPioneer,
        pledged: true,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: isPioneer ? 'unlocked' : 'not_map_pioneer',
      };
    }

    if (stamp.unlockType === UnlockType.PROMISE_SUBMITTED) {
      if (isTestForceMadeMyPromise(stamp) || context.forceMadeMyPromise === true) {
        return {
          unlocked: true,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'test_force',
        };
      }

      const pledged = eligibility.pledged;
      const eventEnded = isEventEndedForStamp(stamp, context);
      const submittedPromise = hasSubmittedPromiseForEvent(stamp.eventId, context);

      if (!eventEnded) {
        return {
          unlocked: false,
          pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'before_event_end',
        };
      }
      if (!pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }
      if (!submittedPromise) {
        return {
          unlocked: false,
          pledged: true,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'promise_not_submitted',
        };
      }

      return {
        unlocked: true,
        pledged: true,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: 'unlocked',
      };
    }

    if (stamp.unlockType === UnlockType.MAJOR_CITY) {
      const cityReached = isMajorCityReached(stamp, context);

      if (!eligibility.pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }
      if (!eligibility.hasLocation) {
        return {
          unlocked: false,
          pledged: true,
          hasLocation: false,
          unlockDate: null,
          reason: 'no_valid_location',
        };
      }
      if (!cityReached) {
        return {
          unlocked: false,
          pledged: true,
          hasLocation: true,
          unlockDate: null,
          reason: 'city_threshold_not_reached',
        };
      }

      return {
        unlocked: true,
        pledged: true,
        hasLocation: true,
        unlockDate: null,
        reason: 'unlocked',
      };
    }

    if (stamp.unlockType === UnlockType.CREATOR_CAUSE_DONATION) {
      if (isTestForceCreatorCause(stamp) || context.forceCreatorCause === true) {
        return {
          unlocked: true,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'test_force',
        };
      }

      const supported = hasSupportedCreatorCause(context);
      return {
        unlocked: supported,
        pledged: eligibility.pledged,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: supported ? 'unlocked' : 'no_creator_cause_donation',
      };
    }

    if (stamp.unlockType === UnlockType.DAILY_ACT_PARTNER_COMPLETED) {
      if (isTestForceDailyActPartner(stamp) || context.forceDailyActPartner === true) {
        return {
          unlocked: true,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'test_force',
        };
      }

      const completedPartnerAct = hasCompletedPartnerDailyAct(context);
      return {
        unlocked: completedPartnerAct,
        pledged: eligibility.pledged,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: completedPartnerAct ? 'unlocked' : 'no_partner_daily_act',
      };
    }

    if (stamp.unlockType === UnlockType.DAILY_ACTS_405_COMPLETED) {
      if (isTestForce405Completed(stamp) || context.force405Completed === true) {
        return {
          unlocked: true,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'test_force',
        };
      }

      const completed405 = hasCompleted405DailyActs(stamp, context);
      return {
        unlocked: completed405,
        pledged: eligibility.pledged,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: completed405 ? 'unlocked' : 'daily_acts_405_not_reached',
      };
    }

    if (stamp.unlockType === UnlockType.PEACE_EXPLORER) {
      if (isTestForcePeaceExplorer(stamp) || context.forcePeaceExplorer === true) {
        return {
          unlocked: true,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'test_force',
        };
      }

      const exploredAllThemes = hasCompletedAllPeaceThemes(stamp, context);
      return {
        unlocked: exploredAllThemes,
        pledged: eligibility.pledged,
        hasLocation: eligibility.hasLocation,
        unlockDate: null,
        reason: exploredAllThemes ? 'unlocked' : 'peace_themes_incomplete',
      };
    }

    if (stamp.unlockType === UnlockType.PLEDGE_ANNIVERSARY_1_YEAR) {
      if (isTestForce1Year(stamp) || context.force1Year === true) {
        return {
          unlocked: true,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'test_force',
        };
      }

      if (!eligibility.pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }

      const unlockCalendarDate = getPledgeAnniversaryUnlockCalendarDate(stamp, context);
      if (!unlockCalendarDate) {
        return {
          unlocked: false,
          pledged: true,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'no_pledge_date',
        };
      }

      const anniversaryReached = hasReachedPledgeAnniversary(stamp, context);
      return {
        unlocked: anniversaryReached,
        pledged: true,
        hasLocation: eligibility.hasLocation,
        unlockDate: new Date(calendarDateToTimestamp(unlockCalendarDate)),
        reason: anniversaryReached ? 'unlocked' : 'before_pledge_anniversary',
      };
    }

    return {
      unlocked: false,
      pledged: eligibility.pledged,
      hasLocation: eligibility.hasLocation,
      unlockDate: null,
      reason: 'unsupported_unlock_type',
    };
  }

  function isPassportStampUnlocked(stamp, context = {}) {
    return evaluateStampUnlock(stamp, context).unlocked;
  }

  function resolveAllStatuses(context = {}) {
    return PASSPORT_STAMPS.map((stamp) => {
      const status = evaluateStampUnlock(stamp, context);
      const shouldReveal = status.unlocked
        && shouldAnimateReveal(stamp.id, context.userId);
      return {
        stamp,
        ...status,
        shouldReveal,
      };
    }).filter((status) => status.unlocked || status.stamp.hideWhenLocked !== true);
  }

  function revealStorageKey(stampId, userId) {
    return `wc_stamp_revealed_${stampId}_${userId || 'anonymous'}`;
  }

  function shouldAnimateReveal(stampId, userId) {
    if (isDevReplay()) return true;
    try {
      return localStorage.getItem(revealStorageKey(stampId, userId)) !== '1';
    } catch {
      return false;
    }
  }

  function markRevealSeen(stampId, userId) {
    if (isDevReplay()) return;
    try {
      localStorage.setItem(revealStorageKey(stampId, userId), '1');
    } catch {
      /* ignore */
    }
  }

  function usesBlurLockedPresentation(stamp, slotUnlocked) {
    if (slotUnlocked || stamp.lockedImageKey) return false;
    return stamp.lockedPresentation === 'blur' || !stamp.lockedImageKey;
  }

  function resolveStampDisplaySize(imgW, imgH, maxPx = 85) {
    if (!imgW || !imgH) return { width: maxPx, height: maxPx };
    const aspect = imgW / imgH;
    if (aspect >= 0.85 && aspect <= 1.15) {
      return { width: maxPx, height: maxPx };
    }
    if (aspect >= 1) {
      return { width: maxPx, height: Math.max(1, Math.round(maxPx / aspect)) };
    }
    return { width: Math.max(1, Math.round(maxPx * aspect)), height: maxPx };
  }

  function resolveStampLayout(stamp, imgW, imgH) {
    if (stamp.displayWidth && stamp.displayHeight) {
      return {
        width: Number(stamp.displayWidth),
        height: Number(stamp.displayHeight),
      };
    }
    return resolveStampDisplaySize(imgW, imgH);
  }

  function resolveStampPositionStyle(stamp) {
    const pos = stamp.position;
    if (!pos) return '';
    const parts = [];
    if (pos.top != null) parts.push(`top:${Number(pos.top)}px`);
    if (pos.right != null) parts.push(`right:${Number(pos.right)}px`);
    if (pos.bottom != null) parts.push(`bottom:${Number(pos.bottom)}px`);
    if (pos.centerX === true) {
      parts.push('left:50%');
      parts.push('transform:translateX(-50%)');
    } else if (pos.left != null) {
      parts.push(`left:${Number(pos.left)}px`);
    }
    return parts.join(';');
  }

  function renderStamp(stampStatus, esc) {
    const { stamp, unlocked, shouldReveal } = stampStatus;
    const slotUnlocked = unlocked && !shouldReveal;
    const image = resolveStampImage(stamp, { unlocked: slotUnlocked });
    const imgUrl = image?.url || image?.src || '';
    const imgAlt = unlocked ? (image?.alt || stamp.title) : (image?.alt || 'Locked passport stamp');
    const imgW = Number(image?.width) || 512;
    const imgH = Number(image?.height) || 512;
    const displaySize = resolveStampLayout(stamp, imgW, imgH);
    const stateClass = unlocked
      ? (shouldReveal ? 'passport-stamp--locked passport-stamp--reveal-slot' : 'passport-stamp--unlocked')
      : 'passport-stamp--locked';
    const blurClass = usesBlurLockedPresentation(stamp, slotUnlocked) ? ' passport-stamp--locked-blur' : '';
    const revealClass = unlocked && shouldReveal ? ' passport-stamp--revealing' : '';
    const lockedMsg = stamp.lockedMessage || 'Locked until your World Choir moment is complete.';
    const ariaLabel = unlocked
      ? stamp.title
      : `${stamp.title} — locked`;
    const placement = stamp.placement || (stamp.position ? 'custom' : 'bottom-right');
    const positionStyle = resolveStampPositionStyle(stamp);
    const articleStyle = [
      `width:${displaySize.width}px`,
      positionStyle,
    ].filter(Boolean).join(';');

    return `
      <article
        class="passport-stamp ${stateClass}${blurClass}${revealClass}"
        data-stamp-id="${esc(stamp.id)}"
        data-stamp-unlocked="${unlocked ? '1' : '0'}"
        data-should-reveal="${shouldReveal ? '1' : '0'}"
        data-placement="${esc(placement)}"
        style="${articleStyle}"
        aria-label="${esc(ariaLabel)}"
        role="listitem"
      >
        <div class="passport-stamp__frame" style="width:${displaySize.width}px;height:${displaySize.height}px">
          <img
            class="passport-stamp__img"
            src="${esc(imgUrl)}"
            alt="${esc(imgAlt)}"
            width="${imgW}"
            height="${imgH}"
            decoding="async"
            loading="lazy"
            draggable="false"
          >
        </div>
        ${unlocked ? '' : `<p class="passport-stamp__locked-msg">${esc(lockedMsg)}</p>`}
      </article>
    `;
  }

  function renderGrid(stampStatuses = [], { esc = (s) => String(s) } = {}) {
    if (!stampStatuses.length) {
      return '<div class="passport-stamps passport-stamps--empty" aria-hidden="true"></div>';
    }

    const items = stampStatuses.map((status) => renderStamp(status, esc)).join('');
    return `<div class="passport-stamps" role="list">${items}</div>`;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  }

  function getRevealUserId() {
    return typeof WorldChoirDB !== 'undefined'
      ? (WorldChoirDB.getCurrentUser?.()?.id || WorldChoirDB.getDeviceId?.())
      : 'anonymous';
  }

  function finishReveal(stampEl, card, stampId, userId, overlay) {
    const stampDef = PASSPORT_STAMPS.find((entry) => entry.id === stampId);
    const img = stampEl?.querySelector('.passport-stamp__img');
    if (stampDef && img) {
      const unlockedImage = resolveStampImage(stampDef, { unlocked: true });
      const unlockedSrc = unlockedImage?.url || unlockedImage?.src;
      if (unlockedSrc) img.src = unlockedSrc;
    }

    stampEl?.classList.remove(
      'passport-stamp--revealing',
      'passport-stamp--reveal-pending',
      'passport-stamp--reveal-slot',
      'passport-stamp--locked'
    );
    stampEl?.classList.add('passport-stamp--unlocked');
    card?.classList.remove('passport-card--stamp-reveal-active');
    overlay?.remove();
    if (stampId) markRevealSeen(stampId, userId);
  }

  function runStampReveal(stampEl, card, userId) {
    const stampId = stampEl.dataset.stampId;
    const frame = stampEl.querySelector('.passport-stamp__frame');
    const img = stampEl.querySelector('.passport-stamp__img');
    if (!frame || !img) {
      finishReveal(stampEl, card, stampId, userId, null);
      return Promise.resolve();
    }

    if (prefersReducedMotion()) {
      finishReveal(stampEl, card, stampId, userId, null);
      return Promise.resolve();
    }

    const stampDef = PASSPORT_STAMPS.find((entry) => entry.id === stampId);
    const lockedImage = stampDef ? resolveStampImage(stampDef, { unlocked: false }) : null;
    const unlockedImage = stampDef ? resolveStampImage(stampDef, { unlocked: true }) : null;
    const lockedSrc = lockedImage?.url || lockedImage?.src || img.src;
    const unlockedSrc = unlockedImage?.url || unlockedImage?.src || img.src;

    stampEl.classList.add('passport-stamp--reveal-pending');
    card.classList.add('passport-card--stamp-reveal-active');

    const overlay = document.createElement('div');
    overlay.className = 'passport-stamp-reveal-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const floater = document.createElement('div');
    floater.className = 'passport-stamp-reveal-floater';

    const floaterImg = document.createElement('img');
    floaterImg.className = 'passport-stamp-reveal-floater__img';
    floaterImg.src = lockedSrc;
    floaterImg.alt = img.alt || '';
    floaterImg.width = img.width || 512;
    floaterImg.height = img.height || 512;
    floaterImg.decoding = 'async';
    floaterImg.draggable = false;

    floater.appendChild(floaterImg);
    overlay.appendChild(floater);
    card.appendChild(overlay);

    const cardRect = card.getBoundingClientRect();
    const targetRect = frame.getBoundingClientRect();
    const startSize = Math.min(cardRect.width * 0.58, 240);

    const startLeft = cardRect.left + (cardRect.width - startSize) / 2;
    const startTop = cardRect.top + (cardRect.height - startSize) / 2;
    const endLeft = targetRect.left;
    const endTop = targetRect.top;
    const endWidth = targetRect.width;
    const endHeight = targetRect.height;

    Object.assign(floater.style, {
      left: `${startLeft}px`,
      top: `${startTop}px`,
      width: `${startSize}px`,
      height: `${startSize}px`,
    });

    floaterImg.style.filter = 'blur(14px)';
    floaterImg.style.opacity = '0.75';
    floater.style.opacity = '0';

    const preloadUnlocked = () => new Promise((resolve) => {
      if (unlockedSrc === lockedSrc) {
        resolve();
        return;
      }
      const preload = new Image();
      preload.onload = resolve;
      preload.onerror = resolve;
      preload.src = unlockedSrc;
    });

    return new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        finishReveal(stampEl, card, stampId, userId, overlay);
        resolve();
      };

      window.setTimeout(done, 5200);

      const CENTER_TOTAL_MS = 3000;
      const CENTER_INTRO_MS = 540;
      const CENTER_UNLOCK_MS = 520;
      const CENTER_HOLD_MS = CENTER_TOTAL_MS - CENTER_INTRO_MS - CENTER_UNLOCK_MS;

      const runFlight = () => {
        floater.style.opacity = '1';

        const fadeIn = floater.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 280, easing: 'ease-out', fill: 'forwards' }
        );

        const lockedPulse = floaterImg.animate(
          [
            { filter: 'blur(14px)', opacity: 0.75, transform: 'scale(0.98)' },
            { filter: 'blur(8px)', opacity: 0.92, transform: 'scale(1)' },
          ],
          { duration: 420, easing: 'ease-out', fill: 'forwards', delay: 120 }
        );

        Promise.all([fadeIn.finished, lockedPulse.finished, preloadUnlocked()]).then(() => {
          floaterImg.src = unlockedSrc;
          floaterImg.style.transform = 'scale(1)';

          const reveal = floaterImg.animate(
            [
              { filter: 'blur(8px)', opacity: 0.88, transform: 'scale(0.98)' },
              { filter: 'blur(0px)', opacity: 1, transform: 'scale(1)' },
            ],
            { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
          );

          reveal.finished.then(() => {
            window.setTimeout(() => {
              const flight = floater.animate(
                [
                  {
                    left: `${startLeft}px`,
                    top: `${startTop}px`,
                    width: `${startSize}px`,
                    height: `${startSize}px`,
                  },
                  {
                    left: `${endLeft}px`,
                    top: `${endTop}px`,
                    width: `${endWidth}px`,
                    height: `${endHeight}px`,
                  },
                ],
                {
                  duration: 980,
                  easing: 'cubic-bezier(0.34, 1.08, 0.42, 1)',
                  fill: 'forwards',
                }
              );

              const settle = floaterImg.animate(
                [
                  { transform: 'scale(1)' },
                  { transform: 'scale(1.06)', offset: 0.72 },
                  { transform: 'scale(1)' },
                ],
                {
                  duration: 980,
                  easing: 'cubic-bezier(0.34, 1.08, 0.42, 1)',
                  fill: 'forwards',
                }
              );

              Promise.all([flight.finished, settle.finished]).then(done).catch(done);
            }, CENTER_HOLD_MS);
          }).catch(done);
        }).catch(done);
      };

      if (floaterImg.complete && floaterImg.naturalWidth > 0) {
        requestAnimationFrame(() => requestAnimationFrame(runFlight));
        return;
      }

      floaterImg.addEventListener('load', () => {
        requestAnimationFrame(() => requestAnimationFrame(runFlight));
      }, { once: true });
      floaterImg.addEventListener('error', done, { once: true });
    });
  }

  async function bindRevealAnimations(root = document) {
    const scope = root.querySelector?.('.passport-card') || root.closest?.('.passport-card') || root;
    if (!scope) return;

    const userId = getRevealUserId();
    const queue = [...scope.querySelectorAll('.passport-stamp--revealing')].sort((a, b) => {
      const stampA = PASSPORT_STAMPS.find((entry) => entry.id === a.dataset.stampId);
      const stampB = PASSPORT_STAMPS.find((entry) => entry.id === b.dataset.stampId);
      return (Number(stampA?.revealOrder) || 999) - (Number(stampB?.revealOrder) || 999);
    });

    for (const el of queue) {
      if (el.dataset.revealBound === '1') continue;
      el.dataset.revealBound = '1';
      await runStampReveal(el, scope, userId);
    }
  }

  return {
    UnlockType,
    PASSPORT_STAMPS,
    getEventById,
    getStampUnlockCalendarDate,
    getStampUnlockDate,
    isPassportStampUnlocked,
    evaluateStampUnlock,
    resolveAllStatuses,
    renderGrid,
    bindRevealAnimations,
    shouldAnimateReveal,
    markRevealSeen,
  };
})();
