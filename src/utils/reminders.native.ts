import { Platform, Alert, Linking } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { EVENT_CONFIG } from '../constants/event';

export type ReminderOptionKey = '1d' | '1h' | '10m';

export const REMINDER_OPTIONS: { key: ReminderOptionKey; label: string; offsetMs: number }[] = [
  { key: '1d', label: '1 day before', offsetMs: 24 * 60 * 60 * 1000 },
  { key: '1h', label: '1 hour before', offsetMs: 60 * 60 * 1000 },
  { key: '10m', label: '10 minutes before', offsetMs: 10 * 60 * 1000 },
];

function getSelectedOffsets(keys: ReminderOptionKey[]) {
  return REMINDER_OPTIONS.filter((opt) => keys.includes(opt.key));
}

async function tryAndroidTaskIntent(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const title = encodeURIComponent(EVENT_CONFIG.EVENT_TITLE);
  const notes = encodeURIComponent(EVENT_CONFIG.EVENT_DESCRIPTION);
  const intents = [
    `intent://create#Intent;scheme=google.tasks;package=com.google.android.apps.tasks;S.title=${title};S.notes=${notes};end`,
    `intent://create#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.item/task;S.title=${title};S.notes=${notes};end`,
  ];

  for (const url of intents) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      /* try next */
    }
  }

  return false;
}

async function createIosReminder(keys: ReminderOptionKey[]): Promise<'success' | 'denied' | 'failed'> {
  if (typeof Calendar.requestRemindersPermissionsAsync !== 'function') {
    return 'failed';
  }

  const { status } = await Calendar.requestRemindersPermissionsAsync();
  if (status !== 'granted') {
    return 'denied';
  }

  const alarms = getSelectedOffsets(keys).map((opt) => ({
    relativeOffset: -(opt.offsetMs / 60000),
  }));

  if (!alarms.length) {
    return 'failed';
  }

  await Calendar.createReminderAsync(null, {
    title: EVENT_CONFIG.EVENT_TITLE,
    notes: EVENT_CONFIG.EVENT_DESCRIPTION,
    dueDate: EVENT_CONFIG.EVENT_DATE,
    timeZone: 'UTC',
    alarms,
  });

  return 'success';
}

async function scheduleLocalNotifications(keys: ReminderOptionKey[]): Promise<'success' | 'denied' | 'failed'> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    return 'denied';
  }

  const selected = getSelectedOffsets(keys);
  if (!selected.length) {
    return 'failed';
  }

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => n.identifier?.startsWith('wc-reminder-'))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  const now = Date.now();
  let scheduled = 0;

  for (const opt of selected) {
    const fireAt = new Date(EVENT_CONFIG.EVENT_DATE.getTime() - opt.offsetMs);
    if (fireAt.getTime() <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `wc-reminder-${opt.key}`,
      content: {
        title: 'World Choir 2027',
        body: `${opt.label}: The world sings together soon. Imagine — John Lennon`,
        sound: 'default',
      },
      trigger: fireAt,
    });
    scheduled += 1;
  }

  return scheduled > 0 ? 'success' : 'failed';
}

export async function setWorldChoirRemindersNative(
  keys: ReminderOptionKey[]
): Promise<'success' | 'denied' | 'failed'> {
  try {
    if (Platform.OS === 'ios') {
      return createIosReminder(keys);
    }

    if (Platform.OS === 'android') {
      const opened = await tryAndroidTaskIntent();
      if (opened) {
        return 'success';
      }
      return scheduleLocalNotifications(keys);
    }

    return 'failed';
  } catch (error) {
    console.error('setWorldChoirRemindersNative error:', error);
    return 'failed';
  }
}

export function showReminderPermissionMessage(): void {
  Alert.alert(
    'Permission needed',
    'To set reminders for World Choir 2027, allow access when prompted. You can try again anytime.',
    [{ text: 'OK' }]
  );
}

export function showReminderSuccessMessage(): void {
  Alert.alert('Reminder set', 'Reminder set for World Choir 2027.', [{ text: 'OK' }]);
}
