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

  /** Instagram-style shared tab indicator — arrives when the destination tab opens. */
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
  let arrivalTimer = null;
  let handoffActive = false;

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

  function clearArrivalTimer() {
    if (arrivalTimer) {
      clearTimeout(arrivalTimer);
      arrivalTimer = null;
    }
  }

  function peekStoredTransition() {
    try {
      const raw = sessionStorage.getItem(NAV_TRANSITION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.to !== 'string') return null;
      if (Date.now() - (data.at || 0) > 1500) return null;
      return data;
    } catch {
      return null;
    }
  }

  function clearStoredTransition() {
    try {
      sessionStorage.removeItem(NAV_TRANSITION_KEY);
    } catch {
      /* ignore */
    }
  }

  function storeTransition(from, to) {
    try {
      sessionStorage.setItem(
        NAV_TRANSITION_KEY,
        JSON.stringify({ from, to, at: Date.now() })
      );
      document.documentElement.classList.add('wc-nav-handoff');
    } catch {
      /* ignore */
    }
  }

  function setNavDuration(ms) {
    if (!navEl) return;
    const value = `${Math.max(0, ms)}ms`;
    navEl.style.setProperty('--nav-indicator-duration', value);
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

  function releaseNavGate() {
    handoffActive = false;
    document.documentElement.classList.remove('wc-nav-handoff');
    if (typeof WorldChoirBoot !== 'undefined') {
      WorldChoirBoot.setNavGate?.(false);
    }
  }

  function completeArrival(toPage) {
    clearArrivalTimer();
    clearStoredTransition();
    const toItem = getNavItem(toPage);
    currentActivePage = toPage;
    setActiveClasses(toPage);
    if (toItem) placeIndicatorOnItem(toItem, { animate: false, visible: true });
    setNavDuration(NAV_TRANSITION_MS);
    releaseNavGate();
  }

  /**
   * Indicator stays on the previous tab until the destination page is ready,
   * then finishes the slide so arrival and “tab open” land together.
   */
  function beginHandoffArrival(activePage, transition) {
    const fromItem = getNavItem(transition.from);
    const toItem = getNavItem(transition.to || activePage);
    if (!toItem) {
      clearStoredTransition();
      releaseNavGate();
      return;
    }

    handoffActive = true;
    document.documentElement.classList.add('wc-nav-handoff');
    if (typeof WorldChoirBoot !== 'undefined') {
      WorldChoirBoot.setNavGate?.(true);
    }

    // Park on the previous tab until the new page content is ready.
    if (fromItem) {
      setActiveClasses(transition.from);
      placeIndicatorOnItem(fromItem, { animate: false, visible: true });
    } else {
      setActiveClasses(activePage);
      placeIndicatorOnItem(toItem, { animate: false, visible: true });
    }
    currentActivePage = activePage;

    const startAt = transition.at || Date.now();

    const runArrival = () => {
      if (!handoffActive) return;
      const now = Date.now();
      const elapsed = now - startAt;
      let duration = 0;
      if (!prefersReducedMotion()) {
        if (elapsed >= transitionDurationMs()) {
          // Page took longer than the min window — still slide so arrival matches the reveal.
          duration = Math.min(NAV_TRANSITION_MS, 160);
        } else {
          // Page ready early — use the remaining time so tap→open ≈ 200ms.
          duration = transitionDurationMs() - elapsed;
        }
      }

      if (duration <= 0) {
        completeArrival(activePage);
        return;
      }

      setNavDuration(duration);
      setActiveClasses(activePage);
      placeIndicatorOnItem(toItem, { animate: true, visible: true });
      clearArrivalTimer();
      arrivalTimer = setTimeout(() => completeArrival(activePage), duration + 16);
    };

    if (typeof WorldChoirBoot !== 'undefined' && WorldChoirBoot.whenContentReady) {
      WorldChoirBoot.whenContentReady(runArrival);
    } else {
      runArrival();
    }
  }

  function navigateSoon(href) {
    clearPendingNavigation();
    pendingHref = href;
    const go = () => {
      pendingNavTimer = null;
      pendingHref = null;
      window.location.href = href;
    };
    // Allow one paint of the outgoing indicator motion, then open the tab immediately.
    pendingNavTimer = setTimeout(() => {
      requestAnimationFrame(go);
    }, 0);
  }

  function setActivePage(pageId, { animate = true } = {}) {
    if (!pageId) return;
    const target = getNavItem(pageId);
    currentActivePage = pageId;
    setActiveClasses(pageId);
    if (target) {
      setNavDuration(transitionDurationMs());
      placeIndicatorOnItem(target, {
        animate: !!animate && !prefersReducedMotion(),
        visible: true,
      });
    }
  }

  function pageIdFromPathname(pathname) {
    const file = (pathname || window.location.pathname || '').split('/').pop() || '';
    if (!file || file === 'index.html' || file === '') return 'home';
    const hit = ALL_PAGES.find((p) => p.href === file);
    return hit?.id || null;
  }

  /** Soft-switch primary tabs when the keep-alive host is available; else full navigation. */
  function navigateToPrimaryTab(pageId, { animate = true } = {}) {
    const page = ALL_PAGES.find((p) => p.id === pageId);
    if (!page) return false;

    if (page.requiresMemory && !WorldChoirConfig.isMemoryUnlocked()) {
      return navigateToPrimaryTab('home', { animate });
    }

    const tabs = typeof WorldChoirTabs !== 'undefined' ? WorldChoirTabs : null;
    if (tabs?.isPrimary?.(pageId)) {
      if (!tabs.isHosted()) {
        const entry = tabs.getActive?.() || currentActivePage || pageIdFromPathname() || pageId;
        if (tabs.isPrimary(entry)) tabs.attach(entry);
      }
      if (tabs.isHosted()) {
        clearPendingNavigation();
        clearStoredTransition();
        document.documentElement.classList.remove('wc-nav-handoff');
        setActivePage(pageId, { animate });
        void tabs.switchTo(pageId, { updateHistory: true });
        return true;
      }
    }

    window.location.href = page.href;
    return true;
  }

  /** Soft keep-alive open for World Chain (Home/Profile) — same speed as primary tabs. */
  function openWorldChain({ search = '', animate = false } = {}) {
    const href = `world-chain.html${search || ''}`;
    const tabs = typeof WorldChoirTabs !== 'undefined' ? WorldChoirTabs : null;

    if (tabs?.isPrimary?.('world-chain')) {
      if (!tabs.isHosted()) {
        const entry = tabs.getActive?.() || currentActivePage || pageIdFromPathname() || 'home';
        if (tabs.isPrimary(entry)) tabs.attach(entry);
      }
      if (tabs.isHosted()) {
        clearPendingNavigation();
        clearStoredTransition();
        document.documentElement.classList.remove('wc-nav-handoff');
        currentActivePage = 'world-chain';
        setActiveClasses('world-chain');
        placeIndicatorOnItem(null);
        void (async () => {
          const ok = await tabs.switchTo('world-chain', { updateHistory: true });
          if (!ok) {
            window.location.href = href;
            return;
          }
          if (search) {
            try {
              history.replaceState(
                { ...(history.state || {}), wcTab: 'world-chain' },
                '',
                href
              );
            } catch {
              /* ignore */
            }
            try {
              WorldChainPage?.onTabShow?.();
            } catch {
              /* ignore */
            }
          }
        })();
        return true;
      }
    }

    window.location.href = href;
    return true;
  }

  function activateTab(pageId, href, { navigate } = { navigate: true }) {
    if (!pageId) return;

    // Memory stays gated until the live event is completed.
    if (pageId === 'memory' && !WorldChoirConfig.isMemoryUnlocked()) {
      pageId = 'home';
      href = 'index.html';
    }

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

    if (handoffActive && pageId !== currentActivePage) {
      clearArrivalTimer();
      releaseNavGate();
    }

    const fromPage = handoffActive
      ? (peekStoredTransition()?.from || currentActivePage)
      : currentActivePage;
    const fromItem = getNavItem(fromPage);
    const shouldAnimate =
      indicatorReady &&
      !prefersReducedMotion() &&
      fromPage !== pageId &&
      (!!fromItem || redirecting || indicatorEl?.classList.contains('is-visible'));

    if (!navigate || !href) {
      currentActivePage = pageId;
      setNavDuration(NAV_TRANSITION_MS);
      setActiveClasses(pageId);
      placeIndicatorOnItem(target, { animate: shouldAnimate, visible: true });
      return;
    }

    // Soft keep-alive switch — same destination UI, no full reload.
    const tabs = typeof WorldChoirTabs !== 'undefined' ? WorldChoirTabs : null;
    if (tabs?.isPrimary?.(pageId)) {
      if (!tabs.isHosted()) {
        const entry = tabs.getActive?.() || fromPage || currentActivePage || pageId;
        if (tabs.isPrimary(entry)) tabs.attach(entry);
      }
      if (tabs.isHosted()) {
        clearPendingNavigation();
        clearStoredTransition();
        document.documentElement.classList.remove('wc-nav-handoff');
        currentActivePage = pageId;
        setNavDuration(NAV_TRANSITION_MS);
        setActiveClasses(pageId);
        placeIndicatorOnItem(target, { animate: shouldAnimate, visible: true });
        void tabs.switchTo(pageId, { updateHistory: true });
        return;
      }
    }

    currentActivePage = pageId;

    if (!shouldAnimate) {
      clearStoredTransition();
      setActiveClasses(pageId);
      placeIndicatorOnItem(target, { animate: false, visible: true });
      window.location.href = href;
      return;
    }

    // Keep the indicator on the current tab; it finishes on the destination page when that tab opens.
    setNavDuration(NAV_TRANSITION_MS);
    if (fromItem) {
      setActiveClasses(fromPage);
      placeIndicatorOnItem(fromItem, { animate: false, visible: true });
    }
    storeTransition(fromPage, pageId);
    navigateSoon(href);
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
    if (pageId === currentActivePage && !pendingHref && !handoffActive) return;

    // Same destination already pending — keep current animation/timer.
    if (pendingHref === href) return;

    activateTab(pageId, href, { navigate: true });
  }

  function syncIndicatorLayout({ animate } = { animate: false }) {
    if (handoffActive) return;
    const active = getNavItem(currentActivePage) || navEl?.querySelector('.nav-item.active');
    if (!active) {
      if (indicatorEl) indicatorEl.classList.remove('is-visible');
      return;
    }
    placeIndicatorOnItem(active, { animate: !!animate, visible: true });
  }

  function bindIndicatorChrome(nav, activePage, handoff) {
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
      if (handoff && handoff.to === activePage && !prefersReducedMotion()) {
        beginHandoffArrival(activePage, handoff);
        return;
      }
      clearStoredTransition();
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
      'css/home.css?v=20260911guideGrey',
      'js/world-choir-home.js?v=20260911logoSwap',
      'js/world-choir-db.js?v=20260907voices',
    ],
    map: [
      'map.html',
      'css/map.css?v=20260911theme',
      'js/map/sponsor-constants.js?v=20260902k',
      'js/map/sponsor-data.js?v=20260902a',
      'js/map/sponsor-bar.js?v=20260905a',
      '/api/map-sponsors',
      'js/world-choir-map-tiles.js?v=20260911theme',
      'js/world-choir-map.js?v=20260907mapstats',
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
      'css/donate.css?v=20260911theme2',
      'js/donate/creator-foundations-store.js?v=20260907fee65',
      'js/donate/donation-flow.js?v=20260831a',
      'js/foundation-public-card.js?v=20260904cb',
      'js/donate/donate-page.js?v=20260907tabshydrate',
      '/api/creator-foundations',
      '/api/donations?action=config',
    ],
    profile: [
      'profile.html',
      'css/profile.css?v=20260911logoSwap',
      'js/profile/profile-page.js?v=20260911theme',
      'js/profile/daily-acts-peace.js?v=20260906perf',
      'js/profile/daily-acts-button.js?v=20260810i',
      'js/world-choir-onboarding.js?v=20260816a',
      'js/world-choir-db.js?v=20260907voices',
      'passport.html',
      'css/passport.css?v=20260911theme',
      'js/profile/passport-route.js?v=20260901b',
      'js/profile/world-choir-passport.js?v=20260902h',
      'js/profile/passport-page.js?v=20260902j',
      'js/world-choir-flags.js?v=20260902n',
      'js/profile/pass-the-world-map.js?v=20260902b',
      'js/profile/pass-the-world.js?v=20260907itin7',
      'js/world-choir-map-tiles.js?v=20260911theme',
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
      'css/memory-page.css?v=20260911theme',
      'css/world-chain.css?v=20260911theme',
      'js/world-choir-flags.js?v=20260902n',
      'js/memory/memory-data.js?v=20260907wchain',
      'js/memory/memory-feed.js?v=20260904bt',
      'js/memory/memory-page.js?v=20260907tabshydrate',
      'js/profile/passport-stamps.js?v=20260902a',
      'js/profile/world-choir-passport.js?v=20260902q',
    ],
    'world-chain': [
      'world-chain.html',
      'css/world-chain.css?v=20260911theme',
      'js/world-choir-flags.js?v=20260905s',
      'js/world-chain-page.js?v=20260911wchain',
      '/api/world-chain',
      'images/chain-header.png?v=20260905h',
    ],
    'daily-acts': [
      'daily-acts.html',
      'css/daily-acts-page.css?v=20260911dapWhiteQ',
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

    // Warm World Chain immediately — Home/Profile entry must match tab speed.
    (TAB_ASSETS['world-chain'] || []).forEach(prefetchUrl);

    const run = () => {
      if (typeof WorldChoirMapTiles !== 'undefined') {
        WorldChoirMapTiles.warmBasemap?.();
      }
      Object.keys(TAB_ASSETS).forEach((id) => {
        if (id === activePage || id === 'world-chain') return;
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
      try {
        if (typeof WorldChainPage !== 'undefined') {
          WorldChainPage.warmTodayCache?.();
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

  function renderWorldChoirNav(activePage, handoff) {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    getVisiblePages().forEach((page) => {
      const link = document.createElement('a');
      link.href = page.href;
      // During handoff, keep the previous tab visually active until arrival runs.
      const initialActive = handoff && handoff.from
        ? page.id === handoff.from
        : activePage === page.id;
      link.className = 'nav-item' + (initialActive ? ' active' : '');
      link.setAttribute('data-nav-page', page.id);
      if (initialActive) link.setAttribute('aria-current', 'page');
      link.innerHTML = `${renderNavIcon(page)}<span>${page.label}</span>`;
      const warm = () => prefetchOnIntent(page.href);
      link.addEventListener('pointerdown', warm, { passive: true });
      link.addEventListener('touchstart', warm, { passive: true });
      link.addEventListener('mouseenter', warm, { passive: true });
      nav.appendChild(link);
    });

    bindIndicatorChrome(nav, activePage, handoff);
    return nav;
  }

  function mount(activePage) {
    if (typeof WorldChoirA11y !== 'undefined') {
      WorldChoirA11y.bindOverlays?.();
    }
    const root = document.getElementById('nav-root');
    if (!root) return;
    clearPendingNavigation();
    clearArrivalTimer();
    indicatorReady = false;
    handoffActive = false;
    const handoff = peekStoredTransition();
    if (handoff && handoff.to === activePage) {
      document.documentElement.classList.add('wc-nav-handoff');
    } else if (handoff) {
      clearStoredTransition();
    }
    root.innerHTML = '';
    root.appendChild(renderWorldChoirNav(activePage, handoff && handoff.to === activePage ? handoff : null));
  }

  function startWatcher(activePage) {
    // Background soft-tab preload must not steal the nav chrome.
    if (window.__WC_TAB_SILENT_INIT) return;

    let wasUnlocked = WorldChoirConfig.isMemoryUnlocked();
    mount(activePage);
    prefetchTabs(activePage);

    if (
      typeof WorldChoirTabs !== 'undefined' &&
      WorldChoirTabs.isPrimary?.(activePage)
    ) {
      WorldChoirTabs.attach(activePage);
    }

    if (watchInterval) clearInterval(watchInterval);
    watchInterval = setInterval(() => {
      if (typeof WorldChoirDB !== 'undefined') {
        WorldChoirDB.syncActiveEventStatus?.();
      }
      const unlocked = WorldChoirConfig.isMemoryUnlocked();
      if (unlocked !== wasUnlocked) {
        wasUnlocked = unlocked;
        mount(currentActivePage || activePage);
        if (unlocked && typeof WorldChoirTabs !== 'undefined') {
          WorldChoirTabs.preloadMemoryIfUnlocked?.();
        }
      }
    }, 1000);
  }

  function guardMemoryRoute() {
    if (!WorldChoirConfig.isMemoryUnlocked()) {
      if (
        typeof WorldChoirTabs !== 'undefined' &&
        WorldChoirTabs.isHosted?.() &&
        WorldChoirTabs.isPrimary?.('home')
      ) {
        void WorldChoirTabs.switchTo('home', { updateHistory: true });
        setActivePage('home', { animate: false });
        return false;
      }
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
    setActivePage,
    navigateToPrimaryTab,
    openWorldChain,
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
