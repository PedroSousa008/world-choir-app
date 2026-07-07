import * as Notifications from 'expo-notifications';
import { EVENT_CONFIG } from '../constants/event';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Request notification permissions
export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

// Schedule event notifications
export const scheduleEventNotifications = async (): Promise<void> => {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    // Cancel existing notifications
    await Notifications.cancelAllScheduledNotificationsAsync();

    // TODO: Fix notification trigger types for production
    // For now, notifications are disabled due to TypeScript issues
    console.log('Notifications scheduled (disabled for development)');
    
    // Schedule 1 hour before notification
    const oneHourBefore = new Date(EVENT_CONFIG.EVENT_DATE.getTime() - 60 * 60 * 1000);
    if (oneHourBefore > new Date()) {
      // await Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: '🌍 World Choir Event',
      //     body: 'The global moment of unity begins in 1 hour. Get ready to sing with the world!',
      //     sound: 'default',
      //   },
      //   trigger: oneHourBefore,
      // });
    }

    // Schedule 5 minutes before notification
    const fiveMinutesBefore = new Date(EVENT_CONFIG.EVENT_DATE.getTime() - 5 * 60 * 1000);
    if (fiveMinutesBefore > new Date()) {
      // await Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: '🎶 Almost Time!',
      //     body: 'The world is about to sing together. Go outside and join the global choir!',
      //     sound: 'default',
      //   },
      //   trigger: fiveMinutesBefore,
      // });
    }

    // Schedule live event notification
    if (EVENT_CONFIG.EVENT_DATE > new Date()) {
      // await Notifications.scheduleNotificationAsync({
      //   content: {
      //     title: '🎵 The World is Singing!',
      //     body: 'Right now, millions are singing together. Join the global moment of unity!',
      //     sound: 'default',
      //   },
      //   trigger: EVENT_CONFIG.EVENT_DATE,
      // });
    }
  } catch (error) {
    console.error('Error scheduling notifications:', error);
  }
};

// Calendar helpers live in ./calendar.ts
export {
  requestCalendarPermissions,
  addEventToCalendar,
  showCalendarPermissionMessage,
} from './calendar';

export {
  setWorldChoirReminders,
  showReminderPermissionMessage,
  showReminderSuccessMessage,
  REMINDER_OPTIONS,
} from './reminders';

// Check if notifications are enabled
export const checkNotificationStatus = async (): Promise<boolean> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking notification status:', error);
    return false;
  }
}; 