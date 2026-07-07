import { Platform, Linking, Alert } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { EVENT_CONFIG } from '../constants/event';

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
}

function buildIcsContent(): string {
  const start = EVENT_CONFIG.EVENT_DATE;
  const end = new Date(start.getTime() + EVENT_CONFIG.CALENDAR_DURATION_MS);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//World Choir//World Choir 2027//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:world-choir-2027@world-choir-app.vercel.app',
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(EVENT_CONFIG.EVENT_TITLE)}`,
    `LOCATION:${escapeIcsText(EVENT_CONFIG.EVENT_LOCATION)}`,
    `DESCRIPTION:${escapeIcsText(EVENT_CONFIG.EVENT_DESCRIPTION)}`,
    `URL:${EVENT_CONFIG.SHARE_URL}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

async function shareIcsFile(): Promise<boolean> {
  const path = `${FileSystem.cacheDirectory}world-choir-2027.ics`;
  await FileSystem.writeAsStringAsync(path, buildIcsContent(), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  await Sharing.shareAsync(path, {
    mimeType: 'text/calendar',
    dialogTitle: 'Add World Choir 2027 to your calendar',
    UTI: 'public.calendar-event',
  });
  return true;
}

async function openIcsDataUrl(): Promise<boolean> {
  const dataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcsContent())}`;
  const canOpen = await Linking.canOpenURL(dataUrl);
  if (!canOpen) return false;
  await Linking.openURL(dataUrl);
  return true;
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

export const addEventToCalendar = async (): Promise<'success' | 'denied' | 'failed'> => {
  try {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        const shared = await shareIcsFile();
        if (shared) return 'success';
      } catch (error) {
        console.warn('ICS share failed, trying native calendar API', error);
      }

      if (Platform.OS === 'ios') {
        try {
          const opened = await openIcsDataUrl();
          if (opened) return 'success';
        } catch (error) {
          console.warn('ICS data URL failed on iOS', error);
        }
      }
    }

    const hasPermission = await requestCalendarPermissions();
    if (!hasPermission) {
      return 'denied';
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const defaultCalendar = calendars.find((cal) => cal.isPrimary) || calendars[0];

    if (!defaultCalendar) {
      return 'failed';
    }

    const endDate = new Date(
      EVENT_CONFIG.EVENT_DATE.getTime() + EVENT_CONFIG.CALENDAR_DURATION_MS
    );

    await Calendar.createEventAsync(defaultCalendar.id, {
      title: EVENT_CONFIG.EVENT_TITLE,
      notes: EVENT_CONFIG.EVENT_DESCRIPTION,
      startDate: EVENT_CONFIG.EVENT_DATE,
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
