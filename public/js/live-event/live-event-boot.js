/**
 * Immediate live-window gate + ensure the live runtime exists on every public page.
 * Passport, letter, legal pages, etc. must takeover even if they forgot the full script list.
 */
(function wcLiveBoot() {
  const VERSION = '20260904ap';

  function inLiveWindow() {
    try {
      if (typeof WorldChoirLiveConfig === 'undefined') return false;
      const pre = WorldChoirLiveConfig.getPreEventStartMs();
      const end = WorldChoirLiveConfig.getEventStartMs() + WorldChoirLiveConfig.getSongDurationMs();
      const now = Date.now();
      return now >= pre && now < end;
    } catch {
      return false;
    }
  }

  if (inLiveWindow()) {
    document.documentElement.classList.add('wc-live-gate');
  }

  function ensureStylesheet() {
    if (document.querySelector('link[href*="css/live-event.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `css/live-event.css?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const name = src.split('?')[0];
      const existing = [...document.scripts].find((s) => (s.src || '').includes(name));
      if (existing) {
        if (existing.dataset.loaded === '1' || existing.getAttribute('data-loaded') === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => resolve(), { once: true });
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(src));
      document.head.appendChild(el);
    });
  }

  async function ensureRuntime() {
    ensureStylesheet();
    if (typeof GlobalLiveEvent !== 'undefined') {
      await GlobalLiveEvent.init();
      return;
    }

    const scripts = [
      `js/world-choir-practice-config.js?v=${VERSION}`,
      `js/profile/lyrics-display.js?v=${VERSION}`,
      `js/live-event/server-time-sync.js?v=${VERSION}`,
      `js/live-event/global-live-event.js?v=${VERSION}`,
      `js/world-choir-live-event.js?v=${VERSION}`,
    ];
    for (const src of scripts) {
      try {
        await loadScript(src);
      } catch {
        /* keep going — init will no-op if a piece is missing */
      }
    }
    if (typeof GlobalLiveEvent !== 'undefined') {
      await GlobalLiveEvent.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureRuntime().catch(() => {});
    });
  } else {
    ensureRuntime().catch(() => {});
  }
})();
