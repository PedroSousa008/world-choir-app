// Global singing event configuration
export const EVENT_CONFIG = {
  EVENT_DATE: new Date('2027-07-01T16:00:00.000Z'),
  SONG_DURATION_MS: 183 * 1000,
  FINAL_HOUR_MS: 60 * 60 * 1000,
  EVENT_TITLE: 'World Choir 2027',
  EVENT_DESCRIPTION: [
    'Once a year, the world sings the same song at the exact same time.',
    '',
    'World Choir 2027',
    'Song: Imagine — John Lennon',
  ].join('\n'),
  EVENT_LOCATION: 'Worldwide',
  CALENDAR_DURATION_MS: 10 * 60 * 1000,
  SONG_NAME: 'Imagine',
  ARTIST_NAME: 'John Lennon',
  OFFICIAL_HASHTAG: '#WorldChoir2027',
  NOTIFICATION_TIMES: {
    ONE_HOUR_BEFORE: 60,
    FIVE_MINUTES_BEFORE: 5,
  },
  SHARE_MESSAGE: "I'll be singing with the world on July 1, 2027. Join me for World Choir:",
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

export enum EventState {
  UPCOMING = 'upcoming',
  FINAL_HOUR = 'final_hour',
  LIVE = 'live',
  POST_EVENT_PROMISE = 'post_event_promise',
  COMPLETED = 'completed',
}

export const getEventState = (
  userParticipated = false,
  userSubmittedPromise = false
): EventState => {
  const now = new Date();
  const eventStart = EVENT_CONFIG.EVENT_DATE;
  const eventEnd = new Date(eventStart.getTime() + EVENT_CONFIG.SONG_DURATION_MS);
  const finalHourStart = new Date(eventStart.getTime() - EVENT_CONFIG.FINAL_HOUR_MS);

  if (now < finalHourStart) return EventState.UPCOMING;
  if (now >= finalHourStart && now < eventStart) return EventState.FINAL_HOUR;
  if (now >= eventStart && now < eventEnd) return EventState.LIVE;
  if (now >= eventEnd && userParticipated && !userSubmittedPromise) {
    return EventState.POST_EVENT_PROMISE;
  }
  return EventState.COMPLETED;
};

export const getTimeRemaining = (): { days: number; hours: number; minutes: number; seconds: number } => {
  const now = new Date();
  const diff = EVENT_CONFIG.EVENT_DATE.getTime() - now.getTime();

  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
};
