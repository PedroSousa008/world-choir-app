/**
 * World Choir — global Light / Dark theme
 * Default: dark (existing design). Preference persists in localStorage.
 */
const WorldChoirTheme = (() => {
  const STORAGE_KEY = 'wc_theme_v1';
  const DEFAULT = 'dark';
  const EVENT = 'wc:themechange';
  let animTimer = null;

  function normalize(value) {
    return value === 'light' ? 'light' : 'dark';
  }

  function get() {
    try {
      return normalize(localStorage.getItem(STORAGE_KEY));
    } catch {
      return DEFAULT;
    }
  }

  function bootBg(theme) {
    return theme === 'light' ? '#ffffff' : '#000000';
  }

  function syncBrandLogos(theme) {
    const mode = normalize(theme || get());
    let darkUrl = 'images/world-choir-logo.png?v=20270706';
    let lightUrl = 'images/world-choir-light.png?v=20260911logoOnly';
    try {
      if (typeof WorldChoirConfig !== 'undefined') {
        if (WorldChoirConfig.LOGO?.url) darkUrl = WorldChoirConfig.LOGO.url;
        if (WorldChoirConfig.LOGO_LIGHT?.url) lightUrl = WorldChoirConfig.LOGO_LIGHT.url;
      }
    } catch {
      /* ignore */
    }
    const next = mode === 'light' ? lightUrl : darkUrl;
    document.querySelectorAll('img.home-logo, img.profile-logo').forEach((img) => {
      if (img.getAttribute('src') !== next) img.setAttribute('src', next);
    });
  }

  function apply(theme, { animate = false } = {}) {
    const next = normalize(theme);
    const root = document.documentElement;
    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    root.style.setProperty('--wc-boot-bg', bootBg(next));

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bootBg(next));

    if (animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      root.classList.add('wc-theme-animating');
      clearTimeout(animTimer);
      animTimer = setTimeout(() => {
        root.classList.remove('wc-theme-animating');
      }, 280);
    }

    syncToggles(next);
    syncBrandLogos(next);
    try {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { theme: next } }));
    } catch {
      /* ignore */
    }
    return next;
  }

  function set(theme, opts) {
    const next = normalize(theme);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    return apply(next, opts);
  }

  function toggle(opts) {
    return set(get() === 'dark' ? 'light' : 'dark', { animate: true, ...opts });
  }

  function sunIcon() {
    return `<svg class="profile-theme-toggle__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56"/>
    </svg>`;
  }

  function moonIcon() {
    return `<svg class="profile-theme-toggle__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"/>
    </svg>`;
  }

  function syncToggles(theme) {
    const mode = theme || get();
    document.querySelectorAll('[data-wc-theme-toggle]').forEach((btn) => {
      const toLight = mode === 'dark';
      btn.setAttribute('aria-label', toLight ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      btn.setAttribute('title', toLight ? 'Light Mode' : 'Dark Mode');
      btn.setAttribute('data-theme-target', toLight ? 'light' : 'dark');
      btn.innerHTML = toLight ? sunIcon() : moonIcon();
    });
  }

  function bindToggle(el) {
    if (!el || el.dataset.wcThemeBound === '1') return;
    el.dataset.wcThemeBound = '1';
    el.setAttribute('data-wc-theme-toggle', '');
    el.type = 'button';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      toggle();
    });
    syncToggles(get());
  }

  function init() {
    apply(get(), { animate: false });
    document.querySelectorAll('[data-wc-theme-toggle]').forEach(bindToggle);
  }

  // Apply as soon as the module loads (pages that skipped inline boot still get correct theme).
  apply(get(), { animate: false });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-wc-theme-toggle]').forEach(bindToggle);
      syncBrandLogos(get());
    });
  } else {
    syncBrandLogos(get());
  }

  return {
    STORAGE_KEY,
    EVENT,
    get,
    set,
    toggle,
    apply,
    bindToggle,
    syncToggles,
    syncBrandLogos,
    init,
    isLight: () => get() === 'light',
    isDark: () => get() === 'dark',
  };
})();

window.WorldChoirTheme = WorldChoirTheme;
