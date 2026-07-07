/**
 * World Choir — Remind Me router (web vs native shell)
 */
const WorldChoirReminders = (() => {
  function open() {
    if (WorldChoirRemindersNative.isAvailable() && WorldChoirRemindersNative.open()) {
      return;
    }
    WorldChoirRemindersWeb.open();
  }

  function init() {
    WorldChoirRemindersWeb.init();
  }

  return { open, init };
})();
