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

  /** Instagram-style shared tab indicator — keep in sync with page navigation. */
  const NAV_TRANSITION_MS = 200;
  const INDICATOR_WIDTH = 24;
  const NAV_TRANSITION_KEY = 'wc_nav_transition_v1';
  let navEl = null;
  let indicatorEl = null;
  let currentActivePage = null;
  let pendingNavTimer = null;
  let pendingHref = null;
  let indicatorX = 0;
  let indicatorReady = false;
  let resizeObserver = null;

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function transitionDurationMs() {
    return prefersReducedMotion() ? 0 : NAV_TRANSITION_MS;
  }

  function clearPendingNavigation() {
    if (pendingNavTimer) {
      clearTimeout(pendingNavTimer);
      pendingNavTimer = null;
    }
    pendingHref = null;
  }

  function readStoredTransition() {
    try {
      const raw = sessionStorage.getItem(NAV_TRANSITION_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(NAV_TRANSITION_KEY);
      const data = JSON.parse(raw);
      if (!data || typeof data.to !== 'string') return null;
      if (Date.now() - (data.at || 0) > 1200) return null;
      return data;
    } catch {
      return null;
    }
  }

  function storeTransition(from, to) {
    try {
      sessionStorage.setItem(
        NAV_TRANSITION_KEY,
        JSON.stringify({ from, to, at: Date.now(), duration: transitionDurationMs() })
      );
    } catch {
      /* ignore */
    }
  }

  function measureIndicatorX(item) {
    if (!navEl || !item) return 0;
    const navRect = navEl.getBoundingClientRect();
    const icon = item.querySelector('.nav-icon');
    const anchor = icon || item;
    const anchorRect = anchor.getBoundingClientRect();
    return anchorRect.left + anchorRect.width / 2 - navRect.left - INDICATOR_WIDTH / 2;
  }

  function measureIndicatorTop(item) {
    if (!navEl || !item) return 0;
    const navRect = navEl.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    // Match previous per-tab ::after { top: -1px } relative to the item.
    return itemRect.top - navRect.top - 1;
  }

  function setIndicatorTransform(x, { animate } = { animate: false }) {
    if (!indicatorEl) return;
    if (animate && indicatorEl.classList.contains('is-animated')) {
      // Freeze at the current visual X so a mid-flight retarget continues smoothly.
      try {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(indicatorEl).transform);
        indicatorEl.classList.remove('is-animated');
        indicatorEl.style.transform = `translate3d(${matrix.m41}px, 0, 0)`;
        void indicatorEl.offsetWidth;
      } catch {
        /* ignore */
      }
    }
    indicatorX = x;
    if (!animate) {
      indicatorEl.classList.remove('is-animated');
      indicatorEl.style.transform = `translate3d(${x}px, 0, 0)`;
      void indicatorEl.offsetWidth;
      return;
    }
    indicatorEl.classList.add('is-animated');
    indicatorEl.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function placeIndicatorOnItem(item, { animate, visible } = { animate: false, visible: true }) {
    if (!indicatorEl || !item) {
      if (indicatorEl) indicatorEl.classList.remove('is-visible');
      return;
    }
    const x = measureIndicatorX(item);
    const top = measureIndicatorTop(item);
    indicatorEl.style.top = `${top}px`;
    setIndicatorTransform(x, { animate: !!animate && indicatorReady });
    if (visible !== false) indicatorEl.classList.add('is-visible');
  }

  function getNavItem(pageId) {
    if (!navEl || !pageId) return null;
    return navEl.querySelector(`.nav-item[data-nav-page="${pageId}"]`);
  }

  function setActiveClasses(pageId) {
    if (!navEl) return;
    navEl.querySelectorAll('.nav-item').forEach((item) => {
      const isActive = item.getAttribute('data-nav-page') === pageId;
      item.classList.toggle('active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function navigateTo(href) {
    clearPendingNavigation();
    pendingHref = href;
    const delay = transitionDurationMs();
    const go = () => {
      pendingNavTimer = null;
      pendingHref = null;
      window.location.href = href;
    };
    if (delay <= 0) {
      go();
      return;
    }
    pendingNavTimer = setTimeout(go, delay);
  }

  function activateTab(pageId, href, { navigate } = { navigate: true }) {
    if (!pageId) return;
    const target = getNavItem(pageId);
    if (!target) {
      if (navigate && href) window.location.href = href;
      return;
    }

    // Fast re-tap while moving: retarget from current visual position.
    const redirecting = !!(pendingHref && pendingHref !== href);
    if (redirecting) {
      clearPendingNavigation();
    }

    const fromPage = currentActivePage;
    const fromItem = getNavItem(fromPage);
    // Animate when leaving a real tab, or when redirecting mid-flight (indicator already moving).
    const shouldAnimate =
      indicatorReady &&
      !prefersReducedMotion() &&
      fromPage !== pageId &&
      (!!fromItem || redirecting || indicatorEl?.classList.contains('is-visible'));

    currentActivePage = pageId;
    setActiveClasses(pageId);
    placeIndicatorOnItem(target, {
      animate: shouldAnimate,
      visible: true,
    });

    if (!navigate || !href) return;

    if (!shouldAnimate) {
      window.location.href = href;
      return;
    }

    storeTransition(fromPage, pageId);
    navigateTo(href);
  }

  function onNavClick(event) {
    const link = event.currentTarget;
    const pageId = link.getAttribute('data-nav-page');
    const href = link.getAttribute('href');
    if (!pageId || !href) return;

    // Allow modified clicks to behave like normal links.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    // Already on this tab and not mid-transition elsewhere.
    if (pageId === currentActivePage && !pendingHref) return;

    // Same destination already pending — keep current animation/timer.
    if (pendingHref === href) return;

    activateTab(pageId, href, { navigate: true });
  }

  function syncIndicatorLayout({ animate } = { animate: false }) {
    const active = getNavItem(currentActivePage) || navEl?.querySelector('.nav-item.active');
    if (!active) {
      if (indicatorEl) indicatorEl.classList.remove('is-visible');
      return;
    }
    placeIndicatorOnItem(active, { animate: !!animate, visible: true });
  }

  function bindIndicatorChrome(nav, activePage) {
    navEl = nav;
    currentActivePage = activePage;

    indicatorEl = document.createElement('div');
    indicatorEl.className = 'bottom-nav__indicator';
    indicatorEl.setAttribute('aria-hidden', 'true');
    nav.insertBefore(indicatorEl, nav.firstChild);

    nav.querySelectorAll('.nav-item').forEach((link) => {
      link.addEventListener('click', onNavClick);
    });

    const finishLayout = () => {
      indicatorReady = true;
      const active = getNavItem(activePage);
      if (active) {
        placeIndicatorOnItem(active, { animate: false, visible: true });
      } else if (indicatorEl) {
        indicatorEl.classList.remove('is-visible');
      }
    };

    // Position after layout so icon centers are accurate across widths.
    requestAnimationFrame(() => {
      requestAnimationFrame(finishLayout);
    });

    if (typeof ResizeObserver === 'function') {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(() => {
        syncIndicatorLayout({ animate: false });
      });
      resizeObserver.observe(nav);
    } else {
      window.addEventListener('resize', () => syncIndicatorLayout({ animate: false }));
    }
  }

  const NAV_ICON_SVGS = {
    home: `<svg class="nav-icon__svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 10.75 12 4l8 6.75V19a1.25 1.25 0 0 1-1.25 1.25H15v-5.5H9v5.5H5.25A1.25 1.25 0 0 1 4 19v-8.25Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></svg>`,
    map: `<svg class="nav-icon__svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M3 12h18M12 3c2.75 2.75 4.5 6.25 4.5 9s-1.75 6.25-4.5 9M12 3c-2.75 2.75-4.5 6.25-4.5 9s1.75 6.25 4.5 9" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
    memory: `<svg class="nav-icon__svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M12 4v16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
    profile: `<svg class="nav-icon__svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="12" cy="8" r="3.75" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M5 20.25c.9-3.35 3.75-5.25 7-5.25s6.1 1.9 7 5.25" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`,
  };

  const ALL_PAGES = [
    { id: 'home', href: 'index.html', label: 'Home', iconSvg: NAV_ICON_SVGS.home },
    { id: 'map', href: 'map.html', label: 'Map', iconSvg: NAV_ICON_SVGS.map },
    { id: 'donate', href: 'donate.html', label: 'Donate', icon: '♡' },
    { id: 'memory', href: 'memory.html', label: 'Memory', iconSvg: NAV_ICON_SVGS.memory, requiresMemory: true },
    { id: 'profile', href: 'profile.html', label: 'Profile', iconSvg: NAV_ICON_SVGS.profile },
  ];

  function renderNavIcon(page) {
    if (page.iconSvg) {
      return `<span class="nav-icon" aria-hidden="true">${page.iconSvg}</span>`;
    }
    return `<span class="nav-icon" aria-hidden="true">${page.icon}</span>`;
  }

  /** Critical assets per tab — warm the cache before the user taps. */
  const TAB_ASSETS = {
    home: [
      'index.html',
      'css/home.css?v=20260905b',
      'js/world-choir-home.js?v=20260906black',
      'js/world-choir-db.js?v=20260906perf2',
    ],
    map: [
      'map.html',
      'css/map.css?v=20260906mapfix2',
      'js/map/sponsor-constants.js?v=20260902k',
      'js/map/sponsor-data.js?v=20260902a',
      'js/map/sponsor-bar.js?v=20260905a',
      '/api/map-sponsors',
      'js/world-choir-map-tiles.js?v=20260906mapfix2',
      'js/world-choir-map.js?v=20260906black',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
      'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js',
      'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
    ],
    donate: [
      'donate.html',
      'css/foundation-public-card.css?v=20260904cd',
      'css/donate.css?v=20260906donate',
      'js/donate/creator-foundations-store.js?v=20260906donate',
      'js/donate/donation-flow.js?v=20260831a',
      'js/foundation-public-card.js?v=20260904cb',
      'js/donate/donate-page.js?v=20260906donate',
      '/api/creator-foundations',
      '/api/donations?action=config',
    ],
    profile: [
      'profile.html',
      'css/profile.css?v=20260906boot',
      'js/profile/profile-page.js?v=20260906black',
      'js/profile/daily-acts-peace.js?v=20260906perf',
      'js/profile/daily-acts-button.js?v=20260810i',
      'js/world-choir-onboarding.js?v=20260816a',
      'js/world-choir-db.js?v=20260906perf2',
      'passport.html',
      'css/passport.css?v=20260902q',
      'js/profile/passport-route.js?v=20260901b',
      'js/profile/world-choir-passport.js?v=20260902h',
      'js/profile/passport-page.js?v=20260902j',
      'js/world-choir-flags.js?v=20260902n',
      'js/profile/pass-the-world-map.js?v=20260902b',
      'js/profile/pass-the-world.js?v=20260902c',
      'js/world-choir-map-tiles.js?v=20260906mapfix2',
      'images/passport/passport-inside-bg.png?v=20260827c',
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
      'css/memory-page.css?v=20260904bt',
      'js/memory/memory-data.js?v=20260904bt',
      'js/memory/memory-feed.js?v=20260904bt',
      'js/memory/memory-page.js?v=20260906black',
      'js/profile/passport-stamps.js?v=20260902a',
      'js/profile/world-choir-passport.js?v=20260902q',
    ],
    'daily-acts': [
      'daily-acts.html',
      'css/daily-acts-page.css?v=20260902z',
      'js/daily-acts-page.js?v=20260906black',
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
      link.setAttribute('data-nav-page', page.id);
      if (activePage === page.id) link.setAttribute('aria-current', 'page');
      link.innerHTML = `${renderNavIcon(page)}<span>${page.label}</span>`;
      const warm = () => prefetchOnIntent(page.href);
      link.addEventListener('pointerdown', warm, { passive: true });
      link.addEventListener('touchstart', warm, { passive: true });
      link.addEventListener('mouseenter', warm, { passive: true });
      nav.appendChild(link);
    });

    bindIndicatorChrome(nav, activePage);
    return nav;
  }

  function mount(activePage) {
    if (typeof WorldChoirA11y !== 'undefined') {
      WorldChoirA11y.bindOverlays?.();
    }
    const root = document.getElementById('nav-root');
    if (!root) return;
    clearPendingNavigation();
    indicatorReady = false;
    root.innerHTML = '';
    root.appendChild(renderWorldChoirNav(activePage));
    // Animation already played on the previous page before navigation.
    readStoredTransition();
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

  return {
    renderWorldChoirNav,
    mount,
    startWatcher,
    guardMemoryRoute,
    getVisiblePages,
    prefetchTabs,
    getNavIconSvg: (key) => NAV_ICON_SVGS[key] || '',
    getNavGlyph: (pageId) => {
      const page = ALL_PAGES.find((p) => p.id === pageId);
      return page?.icon || '';
    },
  };
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
