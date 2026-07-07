import { Alert } from 'react-native';

/**
 * Expo web — calendar-with-alerts guidance (mirrors public/js/reminders/reminders.web.js)
 */
export function showWebReminderFallback(): void {
  Alert.alert(
    'Remind Me',
    "To make sure you don't miss World Choir 2027, add it to your Calendar with alerts.",
    [{ text: 'OK' }]
  );
}

export async function setWorldChoirRemindersWeb(): Promise<'success'> {
  showWebReminderFallback();
  return 'success';
}
