/**
 * World Choir — Event configuration & app state machine
 */
const WorldChoirConfig = (() => {
  const SONG_DURATION_MS = 3 * 60 * 1000; // 3 minutes live window
  const FINAL_HOUR_MS = 60 * 60 * 1000;

  const CURRENT_EVENT = {
    id: 'wc-2026',
    title: 'World Choir 2026',
    songName: 'Imagine',
    artistName: 'John Lennon',
    eventDateUtc: '2026-06-15T16:00:00.000Z',
    officialHashtag: '#WorldChoir2026',
    theme: 'Hope & Unity',
  };

  const AppState = {
    UPCOMING: 'upcoming',
    FINAL_HOUR: 'final_hour',
    LIVE: 'live',
    POST_EVENT_PROMISE: 'post_event_promise',
    WAITING_NEXT: 'waiting_next',
  };

  function getEventDate() {
    return new Date(CURRENT_EVENT.eventDateUtc);
  }

  function getSongEndDate() {
    return new Date(getEventDate().getTime() + SONG_DURATION_MS);
  }

  function getTimeRemaining(now = new Date()) {
    const diff = getEventDate().getTime() - now.getTime();
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

  function formatCountdown(t) {
    if (t.days > 0) {
      return `${t.days}d ${String(t.hours).padStart(2, '0')}h ${String(t.minutes).padStart(2, '0')}m ${String(t.seconds).padStart(2, '0')}s`;
    }
    return `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}:${String(t.seconds).padStart(2, '0')}`;
  }

  function getAppState(now = new Date(), userHasSubmittedPromise = false) {
    const eventStart = getEventDate();
    const songEnd = getSongEndDate();
    const msUntilEvent = eventStart.getTime() - now.getTime();

    if (now >= songEnd) {
      if (userHasSubmittedPromise) return AppState.WAITING_NEXT;
      return AppState.POST_EVENT_PROMISE;
    }
    if (now >= eventStart) return AppState.LIVE;
    if (msUntilEvent <= FINAL_HOUR_MS) return AppState.FINAL_HOUR;
    return AppState.UPCOMING;
  }

  function formatEventDate() {
    const d = getEventDate();
    return d.toLocaleDateString('en-US', {
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
    const d = getEventDate();
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  // Simulated global stats (would come from backend)
  function getGlobalStats() {
    const base = 12482193;
    const pledges = WorldChoirDB ? WorldChoirDB.getPledgesForEvent(CURRENT_EVENT.id) : [];
    const extra = pledges.length;
    const voices = base + extra * 127;
    const countries = 146 + Math.min(extra, 12);
    const cities = 18430 + extra * 3;
    return { voices, countries, cities };
  }

  return {
    CURRENT_EVENT,
    AppState,
    SONG_DURATION_MS,
    getEventDate,
    getSongEndDate,
    getTimeRemaining,
    formatCountdown,
    getAppState,
    formatEventDate,
    formatEventTime,
    getLocalEventTime,
    getGlobalStats,
  };
})();
