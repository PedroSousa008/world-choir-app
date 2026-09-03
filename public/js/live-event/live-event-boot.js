/**
 * Immediate live-window gate — runs on every public page before the rest of the UI paints.
 */
(function wcLiveBoot() {
  try {
    if (typeof WorldChoirLiveConfig === 'undefined') return;
    const pre = WorldChoirLiveConfig.getPreEventStartMs();
    const end = WorldChoirLiveConfig.getEventStartMs() + WorldChoirLiveConfig.getSongDurationMs();
    const now = Date.now();
    if (now >= pre && now < end) {
      document.documentElement.classList.add('wc-live-gate');
    }
  } catch {
    /* ignore */
  }
})();
