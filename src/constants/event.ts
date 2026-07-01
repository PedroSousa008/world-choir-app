// Global singing event configuration
export const EVENT_CONFIG = {
  // The global singing event date and time (UTC)
  // June 15, 2026 at 15:00 Portuguese time = 14:00 UTC (Portugal is UTC+1 in summer)
  EVENT_DATE: new Date('2026-06-15T14:00:00.000Z'),
  
  // Event title and description
  EVENT_TITLE: 'Global Moment of Unity',
  EVENT_DESCRIPTION: 'Join millions around the world in a synchronized moment of song and unity.',
  
  // Notification settings
  NOTIFICATION_TIMES: {
    ONE_HOUR_BEFORE: 60, // minutes
    FIVE_MINUTES_BEFORE: 5, // minutes
  },
  
  // Social sharing
  SHARE_MESSAGE: "I'll be singing with the world on June 15, 2026 at 15:00 🌍🎶. Join me:",
  SHARE_URL: "https://worldchoir.app", // Replace with actual app store links
  
  // Map settings
  MAP_UPDATE_INTERVAL: 10000, // 10 seconds
  HEAT_MAP_RADIUS: 50, // km
};

// Event states
export enum EventState {
  COUNTDOWN = 'countdown',
  LIVE = 'live',
  COMPLETED = 'completed',
}

// Get current event state
export const getEventState = (): EventState => {
  const now = new Date();
  const eventTime = EVENT_CONFIG.EVENT_DATE;
  
  if (now < eventTime) {
    return EventState.COUNTDOWN;
  } else if (now >= eventTime && now < new Date(eventTime.getTime() + 30 * 60 * 1000)) {
    return EventState.LIVE; // 30 minutes after event start
  } else {
    return EventState.COMPLETED;
  }
};

// Get time remaining until event
export const getTimeRemaining = (): { days: number; hours: number; minutes: number; seconds: number } => {
  const now = new Date();
  const eventTime = EVENT_CONFIG.EVENT_DATE;
  const diff = eventTime.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { days, hours, minutes, seconds };
}; 