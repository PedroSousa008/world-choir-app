/**
 * Bootstraps the global synchronized live event on every public World Choir page.
 */
(function bootstrapGlobalLiveEvent() {
  function start() {
    if (typeof GlobalLiveEvent === 'undefined') return;
    GlobalLiveEvent.init().catch((err) => {
      console.warn('Global live event init failed:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
