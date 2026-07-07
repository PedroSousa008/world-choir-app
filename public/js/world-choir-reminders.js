/**
 * World Choir — Reminders integration
 * - Native app (iOS): Apple Reminders via expo-calendar (see src/utils/reminders.ts)
 * - Native app (Android): task intent, then scheduled local notifications
 * - Web: scheduled local notifications (permission requested on tap only)
 */
const WorldChoirReminders = (() => {
  const STORAGE_KEY = 'wc_reminders';

  const OPTIONS = [
    { id: 'remind-1d', key: '1d', label: '1 day before', offsetMs: 24 * 60 * 60 * 1000 },
    { id: 'remind-1h', key: '1h', label: '1 hour before', offsetMs: 60 * 60 * 1000 },
    { id: 'remind-10m', key: '10m', label: '10 minutes before', offsetMs: 10 * 60 * 1000 },
  ];

  function isNativeAppShell() {
    return !!(window.ReactNativeWebView || window.expo);
  }

  function getSelectedOptions() {
    return OPTIONS.filter((opt) => document.getElementById(opt.id)?.checked);
  }

  async function scheduleWebNotifications(selected) {
    if (!('Notification' in window)) {
      return { ok: false, error: 'Notifications are not supported on this device.' };
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, denied: true };
    }

    const eventStart = WorldChoirConfig.getEventStart().getTime();
    const now = Date.now();
    const scheduled = [];

    selected.forEach((opt) => {
      const fireAt = eventStart - opt.offsetMs;
      if (fireAt > now) {
        scheduled.push({ label: opt.label, fireAt, fired: false });
      }
    });

    if (!scheduled.length) {
      return { ok: false, error: 'No reminders could be scheduled. The event may be too soon.' };
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduled));
    new Notification('World Choir', {
      body: 'Reminder set for World Choir 2027.',
    });

    return { ok: true };
  }

  function checkReminders() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      const reminders = JSON.parse(raw);
      let changed = false;
      const now = Date.now();

      reminders.forEach((r) => {
        if (!r.fired && now >= r.fireAt) {
          new Notification('World Choir 2027', {
            body: `${r.label}: The world sings together soon. Imagine — John Lennon`,
          });
          r.fired = true;
          changed = true;
        }
      });

      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    } catch {
      /* ignore */
    }
  }

  /**
   * @returns {Promise<{ ok: boolean, denied?: boolean, error?: string }>}
   */
  async function saveFromModal() {
    const selected = getSelectedOptions();
    if (!selected.length) {
      return { ok: false, error: 'Select at least one reminder time.' };
    }

    if (isNativeAppShell()) {
      return { ok: false, error: 'Use Remind Me in the World Choir app for native reminders.' };
    }

    const result = await scheduleWebNotifications(selected);
    if (result.denied) {
      return {
        ok: false,
        denied: true,
        error: 'Allow notifications to receive reminders for World Choir 2027.',
      };
    }
    return result;
  }

  function startWatcher() {
    checkReminders();
    return setInterval(checkReminders, 30000);
  }

  return {
    OPTIONS,
    saveFromModal,
    checkReminders,
    startWatcher,
  };
})();
