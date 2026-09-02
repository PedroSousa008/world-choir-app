import { Platform, Alert } from 'react-native';
import * as Calendar from 'expo-calendar';
import { EVENT_CONFIG } from '../constants/event';

function getEventStartDate(): Date {
  // Always build from UTC parts (21 Sep 2027 · 16:00 UTC).
  return new Date(Date.UTC(2027, 8, 21, 16, 0, 0));
}

function getEventEndDate(): Date {
  const start = getEventStartDate();
  const songMs = EVENT_CONFIG.SONG_DURATION_MS;
  const duration = songMs > 0 ? songMs : EVENT_CONFIG.CALENDAR_DURATION_MS;
  return new Date(start.getTime() + duration);
}

export const requestCalendarPermissions = async (): Promise<boolean> => {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting calendar permissions:', error);
    return false;
  }
};

export const addEventToCalendar = async (): Promise<'success' | 'denied' | 'cancelled' | 'failed'> => {
  try {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return 'failed';
    }

    const available = await Calendar.isAvailableAsync();
    if (!available) {
      return 'failed';
    }

    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      return 'denied';
    }

    const startDate = getEventStartDate();
    const endDate = getEventEndDate();

    if (typeof Calendar.createEventInCalendarAsync === 'function') {
      const result = await Calendar.createEventInCalendarAsync({
        title: EVENT_CONFIG.EVENT_TITLE,
        startDate,
        endDate,
        timeZone: 'UTC',
        location: EVENT_CONFIG.EVENT_LOCATION,
        notes: EVENT_CONFIG.EVENT_DESCRIPTION,
        url: EVENT_CONFIG.SHARE_URL,
        allDay: false,
      });

      if (result.action === 'saved' || result.action === 'done') {
        return 'success';
      }
      if (result.action === 'canceled') {
        return 'cancelled';
      }
      return 'failed';
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const defaultCalendar = calendars.find((cal) => cal.isPrimary) || calendars[0];
    if (!defaultCalendar) return 'failed';

    await Calendar.createEventAsync(defaultCalendar.id, {
      title: EVENT_CONFIG.EVENT_TITLE,
      notes: EVENT_CONFIG.EVENT_DESCRIPTION,
      startDate,
      endDate,
      timeZone: 'UTC',
      location: EVENT_CONFIG.EVENT_LOCATION,
      url: EVENT_CONFIG.SHARE_URL,
      alarms: [
        { relativeOffset: -60 },
        { relativeOffset: -10 },
      ],
    });

    return 'success';
  } catch (error) {
    console.error('Error adding event to calendar:', error);
    return 'failed';
  }
};

export const showCalendarPermissionMessage = (): void => {
  Alert.alert(
    'Calendar access needed',
    'To add World Choir 2027 to your calendar, allow calendar access when prompted. You can try again anytime.',
    [{ text: 'OK' }]
  );
};
