import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';
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

// Request calendar permissions
export const requestCalendarPermissions = async (): Promise<boolean> => {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting calendar permissions:', error);
    return false;
  }
};

// Add event to calendar
export const addEventToCalendar = async (): Promise<boolean> => {
  try {
    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      console.log('Calendar permission denied');
      return false;
    }

    // Get default calendar
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const defaultCalendar = calendars.find(cal => cal.isPrimary) || calendars[0];
    
    if (!defaultCalendar) {
      console.log('No calendar found');
      return false;
    }

    // Create event
    const eventDetails = {
      title: EVENT_CONFIG.EVENT_TITLE,
      notes: EVENT_CONFIG.EVENT_DESCRIPTION,
      startDate: EVENT_CONFIG.EVENT_DATE,
      endDate: new Date(EVENT_CONFIG.EVENT_DATE.getTime() + 30 * 60 * 1000), // 30 minutes
      timeZone: 'UTC',
      location: 'Global - Go outside and sing!',
      alarms: [
        { relativeOffset: -60 }, // 1 hour before
        { relativeOffset: -5 },  // 5 minutes before
      ],
    };

    const eventId = await Calendar.createEventAsync(defaultCalendar.id, eventDetails);
    console.log('Event added to calendar:', eventId);
    return true;
  } catch (error) {
    console.error('Error adding event to calendar:', error);
    return false;
  }
};

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