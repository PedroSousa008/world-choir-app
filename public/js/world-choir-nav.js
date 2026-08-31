/**
 * World Choir — Shared bottom navigation
 * Donate is permanent. Memory appears only after the active event is globally completed.
 *
 * Also prefetches other tabs so switching feels as instant as Donate.
 */
const WorldChoirNav = (() => {
  let watchInterval = null;
  let prefetchStarted = false;
  const prefetched = new Set();

  const ALL_PAGES = [
    { id: 'home', href: 'index.html', label: 'Home', icon: '◉' },
    { id: 'map', href: 'map.html', label: 'Map', icon: '◎' },
    { id: 'donate', href: 'donate.html', label: 'Donate', icon: '♡' },
    { id: 'memory', href: 'memory.html', label: 'Memory', icon: '◇', requiresMemory: true },
    { id: 'profile', href: 'profile.html', label: 'Profile', icon: '○' },
  ];

  /** Critical assets per tab — warm the cache before the user taps. */
  const TAB_ASSETS = {
    home: [
      'index.html',
      'css/home.css?v=20270707h',
      'js/world-choir-home.js?v=20260816a',
      'js/world-choir-onboarding.js?v=20260816a',
      'js/world-choir-db.js?v=20260817j',
    ],
    map: [
      'map.html',
      'css/map.css?v=20260826d',
      'js/world-choir-map-tiles.js?v=20260826d',
      'js/world-choir-map.js?v=20260826d',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
      'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js',
      'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
    ],
    donate: [
      'donate.html',
      'css/foundation-public-card.css?v=20260819d',
      'css/donate.css?v=20260819d',
      'js/donate/creator-foundations-store.js?v=20260831a',
      'js/donate/donation-flow.js?v=20260831a',
      'js/foundation-public-card.js?v=20260819d',
      'js/donate/donate-page.js?v=20260819d',
      '/api/creator-foundations',
      '/api/donations?action=config',
    ],
    profile: [
      'profile.html',
      'css/profile.css?v=20260820b',
      'js/profile/profile-page.js?v=20260820c',
      'js/profile/daily-acts-peace.js?v=20260819a',
      'js/profile/daily-acts-button.js?v=20260810i',
      'js/world-choir-onboarding.js?v=20260816a',
      'js/world-choir-db.js?v=20260819h',
      'passport.html',
      'css/passport.css?v=20260901v',
      'js/profile/passport-route.js?v=20260901b',
      'js/profile/world-choir-passport.js?v=20260901f',
      'js/profile/passport-page.js?v=20260901h',
      'js/world-choir-flags.js?v=20260901a',
      'js/profile/pass-the-world-map.js?v=20260901o',
      'js/profile/pass-the-world.js?v=20260901n',
      'js/world-choir-map-tiles.js?v=20260826d',
      'images/passport/passport-inside-bg.png?v=20260827c',
      'js/profile/passport-wallet.js?v=20260820a',
      'passport-story.html',
      'js/profile/passport-story-page.js?v=20260901b',
      '/api/pass-the-world',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
      'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js',
    ],
    memory: [
      'memory.html',
    ],
    'daily-acts': [
      'daily-acts.html',
      'css/daily-acts-page.css?v=20260817b',
      'js/daily-acts-page.js?v=20260817j',
    ],
  };

  function getVisiblePages() {
    const memoryUnlocked = WorldChoirConfig.isMemoryUnlocked();
    return ALL_PAGES.filter((page) => !page.requiresMemory || memoryUnlocked);
  }

  function prefetchUrl(url) {
    if (!url || prefetched.has(url)) return;
    prefetched.add(url);
    try {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      link.as = url.endsWith('.js') || url.includes('.js?')
        ? 'script'
        : url.endsWith('.css') || url.includes('.css?')
          ? 'style'
          : url.includes('/api/')
            ? 'fetch'
            : 'document';
      if (url.includes('/api/')) {
        link.crossOrigin = 'anonymous';
      }
      document.head.appendChild(link);
    } catch {
      /* ignore */
    }
    // Also warm with fetch for APIs / HTML (best-effort, ignore errors)
    if (url.includes('/api/') || url.endsWith('.html')) {
      try {
        fetch(url, { credentials: url.includes('/api/') ? 'omit' : 'same-origin', cache: 'force-cache' })
          .catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }

  function prefetchTabs(activePage) {
    if (prefetchStarted) return;
    prefetchStarted = true;

    const run = () => {
      if (typeof WorldChoirMapTiles !== 'undefined') {
        WorldChoirMapTiles.warmBasemap?.();
      }
      Object.keys(TAB_ASSETS).forEach((id) => {
        if (id === activePage) return;
        if (id === 'memory' && !WorldChoirConfig.isMemoryUnlocked()) return;
        (TAB_ASSETS[id] || []).forEach(prefetchUrl);
      });
      // Always warm Daily Acts + foundations for snappy secondary entry points
      (TAB_ASSETS['daily-acts'] || []).forEach(prefetchUrl);
      (TAB_ASSETS.donate || []).forEach(prefetchUrl);
      try {
        if (typeof CreatorFoundationsStore !== 'undefined') {
          CreatorFoundationsStore.ready();
        }
      } catch {
        /* ignore */
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 1200 });
    } else {
      setTimeout(run, 200);
    }
  }

  function prefetchOnIntent(href) {
    const page = ALL_PAGES.find((p) => p.href === href);
    if (!page) return;
    (TAB_ASSETS[page.id] || [href]).forEach(prefetchUrl);
  }

  function renderWorldChoirNav(activePage) {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    getVisiblePages().forEach((page) => {
      const link = document.createElement('a');
      link.href = page.href;
      link.className = 'nav-item' + (activePage === page.id ? ' active' : '');
      link.innerHTML = `<span class="nav-icon">${page.icon}</span><span>${page.label}</span>`;
      const warm = () => prefetchOnIntent(page.href);
      link.addEventListener('pointerdown', warm, { passive: true });
      link.addEventListener('touchstart', warm, { passive: true });
      link.addEventListener('mouseenter', warm, { passive: true });
      nav.appendChild(link);
    });

    return nav;
  }

  function mount(activePage) {
    const root = document.getElementById('nav-root');
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(renderWorldChoirNav(activePage));
  }

  function startWatcher(activePage) {
    let wasUnlocked = WorldChoirConfig.isMemoryUnlocked();
    mount(activePage);
    prefetchTabs(activePage);

    if (watchInterval) clearInterval(watchInterval);
    watchInterval = setInterval(() => {
      if (typeof WorldChoirDB !== 'undefined') {
        WorldChoirDB.syncActiveEventStatus?.();
      }
      const unlocked = WorldChoirConfig.isMemoryUnlocked();
      if (unlocked !== wasUnlocked) {
        wasUnlocked = unlocked;
        mount(activePage);
      }
    }, 1000);
  }

  function guardMemoryRoute() {
    if (!WorldChoirConfig.isMemoryUnlocked()) {
      window.location.replace('index.html');
      return false;
    }
    return true;
  }

  return { renderWorldChoirNav, mount, startWatcher, guardMemoryRoute, getVisiblePages, prefetchTabs };
})();

/** @deprecated Use WorldChoirNav.mount — kept for compatibility */
function renderWorldChoirNav(activePage) {
  return WorldChoirNav.renderWorldChoirNav(activePage);
}

function initParticles(container, count = 24) {
  if (!container) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 18 + 's';
    p.style.animationDuration = 14 + Math.random() * 10 + 's';
    container.appendChild(p);
  }
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}
