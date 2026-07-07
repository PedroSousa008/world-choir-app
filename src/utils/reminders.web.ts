import { Alert } from 'react-native';

/**
 * Expo web — reminder fallback (calendar alerts when native reminders unavailable)
 */
export function showWebReminderFallback(): void {
  Alert.alert(
    'Remind Me',
    "To make sure you don't miss World Choir 2027, add it to your device reminders.\n\nReminders aren't available from the browser, so we'll create calendar alerts instead.",
    [{ text: 'OK' }]
  );
}

export async function setWorldChoirRemindersWeb(): Promise<'success'> {
  showWebReminderFallback();
  return 'success';
}
