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
      'js/world-choir-db.js?v=20260816a',
    ],
    map: [
      'map.html',
      'css/map.css?v=20260811d',
      'js/world-choir-map.js?v=20260811d',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    ],
    donate: [
      'donate.html',
      'css/donate.css?v=20260813y',
      'js/donate/creator-foundations-store.js?v=20260812m',
      'js/donate/donation-flow.js?v=20260812n',
      'js/donate/donate-page.js?v=20260817g',
      '/api/creator-foundations',
      '/api/donations?action=config',
    ],
    profile: [
      'profile.html',
      'css/profile.css?v=20260813n',
      'js/profile/profile-page.js?v=20260816a',
      'js/profile/daily-acts-peace.js?v=20260810i',
      'js/profile/daily-acts-button.js?v=20260810i',
      'js/world-choir-onboarding.js?v=20260816a',
      'js/world-choir-db.js?v=20260816a',
    ],
    memory: [
      'memory.html',
    ],
    'daily-acts': [
      'daily-acts.html',
      'css/daily-acts-page.css?v=20260817b',
      'js/daily-acts-page.js?v=20260817g',
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
