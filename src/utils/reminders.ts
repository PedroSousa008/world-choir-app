import { Platform } from 'react-native';
import type { ReminderOptionKey } from './reminders.native';
import {
  REMINDER_OPTIONS,
  setWorldChoirRemindersNative,
  showReminderPermissionMessage,
  showReminderSuccessMessage,
} from './reminders.native';
import { setWorldChoirRemindersWeb } from './reminders.web';

export type { ReminderOptionKey };
export { REMINDER_OPTIONS, showReminderPermissionMessage, showReminderSuccessMessage };

export async function setWorldChoirReminders(
  keys: ReminderOptionKey[] = ['1d', '1h', '10m']
): Promise<'success' | 'denied' | 'failed'> {
  if (Platform.OS === 'web') {
    return setWorldChoirRemindersWeb();
  }
  return setWorldChoirRemindersNative(keys);
}
