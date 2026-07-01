// Global singing event configuration
export const EVENT_CONFIG = {
  EVENT_DATE: new Date('2026-06-15T16:00:00.000Z'),
  SONG_DURATION_MS: 3 * 60 * 1000,
  FINAL_HOUR_MS: 60 * 60 * 1000,
  EVENT_TITLE: 'World Choir 2026',
  EVENT_DESCRIPTION: 'Once a year, the entire world sings the same song at the exact same time.',
  SONG_NAME: 'Imagine',
  ARTIST_NAME: 'John Lennon',
  OFFICIAL_HASHTAG: '#WorldChoir2026',
  NOTIFICATION_TIMES: {
    ONE_HOUR_BEFORE: 60,
    FIVE_MINUTES_BEFORE: 5,
  },
  SHARE_MESSAGE: "I'll be singing with the world on June 15, 2026. Join me for World Choir:",
  SHARE_URL: 'https://world-choir-app.vercel.app',
  MAP_UPDATE_INTERVAL: 10000,
  HEAT_MAP_RADIUS: 50,
};

export const THEME = {
  bgVoid: '#020204',
  bgPrimary: '#05060a',
  bgCard: 'rgba(12, 14, 22, 0.72)',
  textPrimary: '#f4f4f6',
  textSecondary: '#a8abb8',
  textMuted: '#6b6f7d',
  accentBlue: '#3d7cff',
  accentViolet: '#6b5ce7',
  accentAurora: '#4ec5e8',
  accentGold: '#c9a962',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
};

export enum AppState {
  UPCOMING = 'upcoming',
  FINAL_HOUR = 'final_hour',
  LIVE = 'live',
  POST_EVENT_PROMISE = 'post_event_promise',
  WAITING_NEXT = 'waiting_next',
}

export enum EventState {
  COUNTDOWN = 'countdown',
  LIVE = 'live',
  COMPLETED = 'completed',
}

export const getEventState = (): EventState => {
  const now = new Date();
  const eventTime = EVENT_CONFIG.EVENT_DATE;
  const songEnd = new Date(eventTime.getTime() + EVENT_CONFIG.SONG_DURATION_MS);

  if (now < eventTime) return EventState.COUNTDOWN;
  if (now < songEnd) return EventState.LIVE;
  return EventState.COMPLETED;
};

export const getAppState = (hasSubmittedPromise = false): AppState => {
  const now = new Date();
  const eventTime = EVENT_CONFIG.EVENT_DATE;
  const songEnd = new Date(eventTime.getTime() + EVENT_CONFIG.SONG_DURATION_MS);
  const msUntil = eventTime.getTime() - now.getTime();

  if (now >= songEnd) {
    return hasSubmittedPromise ? AppState.WAITING_NEXT : AppState.POST_EVENT_PROMISE;
  }
  if (now >= eventTime) return AppState.LIVE;
  if (msUntil <= EVENT_CONFIG.FINAL_HOUR_MS) return AppState.FINAL_HOUR;
  return AppState.UPCOMING;
};

export const getTimeRemaining = (): { days: number; hours: number; minutes: number; seconds: number } => {
  const now = new Date();
  const eventTime = EVENT_CONFIG.EVENT_DATE;
  const diff = eventTime.getTime() - now.getTime();

  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
};
