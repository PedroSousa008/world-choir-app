/**
 * World Choir — Keep-alive primary tab host (Been-style)
 *
 * Primary tabs stay mounted in hidden panels. Soft switches never remount the
 * shell or show a blank/boot frame: the current tab stays visible until the
 * destination panel is ready, then swaps on the next frame.
 */
const WorldChoirTabs = (() => {
  const PRIMARY = {
    home: {
      href: 'index.html',
      title: 'World Choir',
      css: [
        'css/home.css?v=20260907voices',
        'css/privacy-consent.css?v=20260905a',
        'css/profile.css?v=20270706b',
        'css/daily-peace.css?v=20260810e',
        'css/live-event.css?v=20260904as',
      ],
      scripts: [
        'js/world-choir-thank-you.js?v=20260904e',
        'js/world-choir-calendar.js?v=20260902u',
        'js/reminders/reminders.web.js?v=20260902u',
        'js/reminders/reminders.native.js',
        'js/world-choir-reminders.js',
        'js/world-choir-pledge-state.js?v=20260906perf2',
        'js/world-choir-participation.js',
        'js/world-choir-post-event-join.js?v=20260907tabs',
        'js/world-choir-practice-config.js',
        'js/world-choir-live-event.js?v=20260904an',
        'js/profile/daily-acts-peace.js?v=20260906perf',
        'js/world-choir-home.js?v=20260907tabshydrate',
      ],
      selectors: [
        '#earth-canvas',
        '#ambient-bg',
        '#home-page',
      ],
      bodySelectors: [
        '#wc-global-live',
        '#wc-live-song-audio',
        '#participation-overlay',
        '#home-promise-sheet',
        '#live-event-mode',
      ],
      keepOutside: ['#wc-global-live', '#nav-root'],
      init: () => tabApi('home')?.init?.(),
      onShow: () => tabApi('home')?.onTabShow?.(),
    },
    map: {
      href: 'map.html',
      title: 'World Choir — The Earth Breathes',
      css: [
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
        'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
        'css/map.css?v=20260906mapfix2',
        'css/privacy-consent.css?v=20260905a',
        'css/profile.css?v=20270706b',
        'css/daily-peace.css?v=20260810e',
        'css/live-event.css?v=20260904as',
      ],
      scripts: [
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
        'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
        'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js',
        'js/world-choir-pledge-state.js?v=20260906perf2',
        'js/world-choir-participation.js',
        'js/world-choir-map-tiles.js?v=20260906mapfix2',
        'js/map/sponsor-constants.js?v=20260902k',
        'js/map/sponsor-data.js?v=20260902a',
        'js/map/sponsor-bar.js?v=20260905a',
        'js/world-choir-map.js?v=20260907tabshydrate',
      ],
      selectors: ['.map-page__stars', '#map-shell', '#voice-joined'],
      bodySelectors: ['#participation-overlay'],
      init: () => tabApi('map')?.init?.(),
      onShow: () => tabApi('map')?.onTabShow?.(),
    },
    donate: {
      href: 'donate.html',
      title: 'World Choir — Donate',
      css: [
        'css/foundation-public-card.css?v=20260904cd',
        'css/donate.css?v=20260907space',
        'css/privacy-consent.css?v=20260905a',
        'css/profile.css?v=20270706b',
        'css/daily-peace.css?v=20260810e',
        'css/live-event.css?v=20260904as',
      ],
      scripts: [
        'js/profile/change-location-modal.js',
        'js/donate/creator-foundations-store.js?v=20260907fee65',
        'js/donate/donation-flow.js?v=20260831a',
        'js/foundation-public-card.js?v=20260904cb',
        'js/donate/donate-page.js?v=20260907tabshydrate',
      ],
      selectors: ['.ambient-bg', '#donate-page'],
      init: () => tabApi('donate')?.init?.(),
      onShow: () => tabApi('donate')?.onTabShow?.(),
    },
    profile: {
      href: 'profile.html',
      title: 'World Choir — Profile',
      css: [
        'css/profile.css?v=20260907voices',
        'css/privacy-consent.css?v=20260905a',
        'css/world-choir-onboarding.css?v=20260816a',
        'css/daily-peace.css?v=20260810e',
        'css/live-event.css?v=20260904as',
        'css/practice-walkthrough.css?v=20260904d',
      ],
      scripts: [
        'js/world-choir-pledge-state.js?v=20260906perf2',
        'js/world-choir-participation.js',
        'js/world-choir-practice-config.js',
        'js/world-choir-onboarding.js?v=20260816a',
        'js/profile/change-location-modal.js',
        'js/profile/user-identity-card.js?v=20260907wchainbtn',
        'js/profile/participation-status-card.js?v=20260907a',
        'js/profile/practice-song-button.js',
        'js/profile/practice-countdown.js',
        'js/profile/lyrics-display.js?v=20260906perf',
        'js/profile/practice-complete-screen.js',
        'js/profile/practice-walkthrough.js?v=20260904d',
        'js/profile/practice-mode.js?v=20260904c',
        'js/profile/world-choir-history.js',
        'js/profile/invite-button.js?v=20260813p',
        'js/profile/daily-acts-peace.js?v=20260906perf',
        'js/profile/daily-acts-button.js?v=20260810i',
        'js/profile/owner-access.js?v=20270810c',
        'js/profile/profile-page.js?v=20260907tabshydrate',
      ],
      selectors: [
        '.ambient-bg',
        'main.profile-page',
      ],
      bodySelectors: [
        '#change-location-overlay',
        '#practice-mode',
      ],
      init: () => tabApi('profile')?.init?.(),
      onShow: () => tabApi('profile')?.onTabShow?.(),
    },
    memory: {
      href: 'memory.html',
      title: 'World Choir — The World Sang',
      css: [
        'css/donate.css?v=20260904cd',
        'css/passport.css?v=20260903o',
        'css/profile.css?v=20270706b',
        'css/daily-peace.css?v=20260810e',
        'css/memory-page.css?v=20260907wchain',
        'css/world-chain.css?v=20260905ac',
        'css/privacy-consent.css?v=20260905a',
        'css/live-event.css?v=20260904as',
      ],
      scripts: [
        'js/world-choir-participation.js',
        'js/profile/daily-acts-peace.js?v=20260906perf',
        'js/profile/passport-stamps.js?v=20260902a',
        'js/profile/world-choir-passport.js?v=20260902q',
        'js/world-choir-flags.js?v=20260902n',
        'js/memory/memory-data.js?v=20260907wchain',
        'js/memory/memory-feed.js?v=20260904bt',
        'js/memory/memory-page.js?v=20260907tabshydrate',
      ],
      selectors: ['.ambient-bg', '#memory-page'],
      init: () => tabApi('memory')?.init?.(),
      onShow: () => tabApi('memory')?.onTabShow?.(),
    },
  };

  const BODY_HOLD_IDS = new Set(['nav-root', 'wc-global-live', 'wc-tab-host']);
  const SHELL_OUTSIDE_SELECTORS = [
    '#nav-root',
    '#wc-global-live',
    '#wc-live-song-audio',
    '#participation-overlay',
    '#change-location-overlay',
    '#practice-mode',
    '#live-event-mode',
    '#home-promise-sheet',
  ];

  let hostEl = null;
  let activeId = null;
  let switchGen = 0;
  let popBound = false;
  let preloadStarted = false;
  const panels = Object.create(null);
  const loadPromises = Object.create(null);

  function tabApi(id) {
    // Prefer window exports (set by each page module). Fall back to lexical globals.
    if (id === 'home') {
      return window.WorldChoirHome || (typeof WorldChoirHome !== 'undefined' ? WorldChoirHome : null);
    }
    if (id === 'map') {
      return window.WorldChoirMap || (typeof WorldChoirMap !== 'undefined' ? WorldChoirMap : null);
    }
    if (id === 'donate') {
      return window.WorldChoirDonate || (typeof WorldChoirDonate !== 'undefined' ? WorldChoirDonate : null);
    }
    if (id === 'profile') {
      return window.ProfilePage || (typeof ProfilePage !== 'undefined' ? ProfilePage : null);
    }
    if (id === 'memory') {
      return window.WorldChoirMemory || (typeof WorldChoirMemory !== 'undefined' ? WorldChoirMemory : null);
    }
    return null;
  }

  function isPanelHydrated(id) {
    const panel = panels[id]?.el;
    if (!panel) return false;
    if (id === 'home') {
      // Real countdown/post-event UI — not the inline boot skeleton alone.
      return !!(
        panel.querySelector('.home-headline, .home-after-hero')
        && !panel.querySelector('.home-skeleton')
      );
    }
    if (id === 'map') {
      return !!(panel.querySelector('#map-shell .leaflet-container, #map.leaflet-container, .map-stats.map-stats--loaded, #stat-voices'));
    }
    if (id === 'donate') {
      const content = panel.querySelector('#donate-content');
      if (!content) return false;
      return !!(
        content.querySelector('.df-intro__title, .df-explore, .df-card, [role="listitem"], .df-search-trigger')
      );
    }
    if (id === 'profile') {
      // Inline HTML skeletons are not enough — need real profile widgets.
      if (panel.querySelector('.identity-card')) return true;
      const voices = panel.querySelector('.profile-voices-counter');
      if (voices && !voices.classList.contains('wc-skel')) return true;
      return false;
    }
    if (id === 'memory') {
      return !!(panel.querySelector('.mem-intro, .mem-feed, .memory-photo, .mem-stamps'));
    }
    return panel.childElementCount > 0;
  }

  function isPrimary(id) {
    return !!(id && PRIMARY[id]);
  }

  function isHosted() {
    return !!hostEl;
  }

  function getActive() {
    return activeId;
  }

  function isActive(id) {
    return activeId === id;
  }

  function hrefFor(id) {
    return PRIMARY[id]?.href || '';
  }

  function pageIdFromPath(pathname) {
    const file = (pathname || '').split('/').pop() || '';
    if (!file || file === 'index.html' || file === '') return 'home';
    const hit = Object.keys(PRIMARY).find((id) => PRIMARY[id].href === file);
    return hit || null;
  }

  function assetKey(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.pathname;
    } catch {
      return String(url).split('?')[0];
    }
  }

  function hasStylesheet(href) {
    const key = assetKey(href);
    return [...document.querySelectorAll('link[rel="stylesheet"]')].some(
      (l) => assetKey(l.getAttribute('href') || '') === key
    );
  }

  function hasScript(src) {
    const key = assetKey(src);
    return [...document.querySelectorAll('script[src]')].some(
      (s) => assetKey(s.getAttribute('src') || '') === key
    );
  }

  function loadStylesheet(href) {
    if (hasStylesheet(href)) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    if (hasScript(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
  }

  function ensurePanel(id) {
    if (panels[id]?.el) return panels[id];
    const el = document.createElement('div');
    el.className = 'wc-tab-panel';
    el.setAttribute('data-wc-tab', id);
    el.setAttribute('aria-hidden', 'true');
    el.hidden = false;
    hostEl.appendChild(el);
    panels[id] = { el, ready: false, loaded: false };
    return panels[id];
  }

  function moveEntryContentIntoPanel(entryId) {
    const panel = ensurePanel(entryId);
    const keep = new Set(BODY_HOLD_IDS);
    SHELL_OUTSIDE_SELECTORS.forEach((sel) => {
      const node = document.querySelector(sel);
      if (node?.id) keep.add(node.id);
    });
    (PRIMARY[entryId]?.keepOutside || []).forEach((sel) => {
      const node = document.querySelector(sel);
      if (node?.id) keep.add(node.id);
    });

    const moving = [];
    [...document.body.children].forEach((child) => {
      if (keep.has(child.id)) return;
      if (child === hostEl) return;
      if (child.id === 'nav-root') return;
      // Keep unmarked shell overlays outside panels even without ids.
      if (SHELL_OUTSIDE_SELECTORS.some((sel) => child.matches?.(sel))) return;
      moving.push(child);
    });
    moving.forEach((node) => panel.el.appendChild(node));
    panel.ready = true;
    panel.loaded = true;
  }

  function attach(entryId) {
    if (!isPrimary(entryId)) return false;
    if (hostEl) return true;

    hostEl = document.createElement('div');
    hostEl.id = 'wc-tab-host';
    hostEl.className = 'wc-tab-host';
    const navRoot = document.getElementById('nav-root');
    if (navRoot) document.body.insertBefore(hostEl, navRoot);
    else document.body.appendChild(hostEl);

    document.documentElement.classList.add('wc-tab-shell');
    document.body.classList.add('wc-tab-shell');

    activeId = entryId;
    moveEntryContentIntoPanel(entryId);
    applyPanelVisibility(entryId);
    applyBodyMode(entryId);
    syncTitle(entryId);

    try {
      history.replaceState(
        { ...(history.state || {}), wcTab: entryId },
        '',
        window.location.href
      );
    } catch {
      /* ignore */
    }

    bindPopState();
    schedulePreload(entryId);
    return true;
  }

  function bindPopState() {
    if (popBound) return;
    popBound = true;
    window.addEventListener('popstate', () => {
      const fromState = history.state?.wcTab;
      const fromPath = pageIdFromPath(window.location.pathname);
      const id = fromState || fromPath;
      if (!isPrimary(id)) return;
      void switchTo(id, { updateHistory: false });
      if (typeof WorldChoirNav !== 'undefined') {
        WorldChoirNav.setActivePage?.(id, { animate: true });
      }
    });
  }

  function applyBodyMode(id) {
    document.body.classList.toggle('map-page', id === 'map');
  }

  function syncTitle(id) {
    const title = PRIMARY[id]?.title;
    if (title) document.title = title;
  }

  function applyPanelVisibility(id) {
    Object.keys(panels).forEach((key) => {
      const panel = panels[key];
      if (!panel?.el) return;
      const on = key === id;
      panel.el.classList.toggle('is-active', on);
      panel.el.classList.remove('is-preparing');
      panel.el.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
  }

  /** Layout destination off-screen so Map/etc. can init without flashing empty UI. */
  function beginPrepare(id) {
    Object.keys(panels).forEach((key) => {
      const panel = panels[key];
      if (!panel?.el) return;
      if (key === id) {
        panel.el.classList.add('is-preparing');
        panel.el.classList.remove('is-active');
        panel.el.setAttribute('aria-hidden', 'true');
        try { void panel.el.offsetWidth; } catch { /* ignore */ }
      } else if (key !== activeId) {
        panel.el.classList.remove('is-preparing');
      }
    });
    if (id === 'map') document.body.classList.add('map-page');
  }

  function endPrepare(id) {
    const panel = panels[id];
    panel?.el?.classList.remove('is-preparing');
  }

  function reveal(id) {
    activeId = id;
    applyPanelVisibility(id);
    applyBodyMode(id);
    syncTitle(id);
  }

  async function prepareAndShow(id) {
    const spec = PRIMARY[id];
    beginPrepare(id);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const showWork = Promise.resolve(spec?.onShow?.());
    // Cap wait so a hung tab never traps navigation; fall through to reveal or hard nav.
    const capMs = id === 'map' ? 5000 : 3500;
    await Promise.race([
      showWork,
      new Promise((resolve) => setTimeout(resolve, capMs)),
    ]);
  }

  function collectNodes(doc, spec) {
    const nodes = [];
    const seen = new Set();
    const add = (sel, required) => {
      const node = doc.querySelector(sel);
      if (!node) {
        if (required) console.warn('[WorldChoirTabs] missing', sel);
        return;
      }
      if (seen.has(node)) return;
      // Skip duplicate IDs already in the live document.
      if (node.id && document.getElementById(node.id)) return;
      seen.add(node);
      nodes.push(node);
    };
    (spec.selectors || []).forEach((sel) => add(sel, true));
    (spec.optionalSelectors || []).forEach((sel) => add(sel, false));
    return nodes;
  }

  async function ensureAssets(spec) {
    await Promise.all((spec.css || []).map(loadStylesheet));
    for (const src of spec.scripts || []) {
      await loadScript(src);
    }
  }

  async function loadPanel(id) {
    // Previously marked ready but empty (failed silent window.* init) — force rehydrate.
    if (panels[id]?.ready && !isPanelHydrated(id)) {
      panels[id].ready = false;
      panels[id].loaded = false;
      delete loadPromises[id];
    }
    if (panels[id]?.ready) return panels[id];
    if (loadPromises[id]) return loadPromises[id];

    loadPromises[id] = (async () => {
      const spec = PRIMARY[id];
      if (!spec) throw new Error(`Unknown tab ${id}`);
      if (!hostEl) throw new Error('Tab host not attached');

      const panel = ensurePanel(id);
      if (panel.ready && isPanelHydrated(id)) return panel;

      // If shell exists but never hydrated, keep the shell and only re-run assets/init.
      const needsDom = panel.el.childElementCount === 0;
      if (needsDom) {
        const res = await fetch(spec.href, { credentials: 'same-origin', cache: 'force-cache' });
        if (!res.ok) throw new Error(`Failed to fetch ${spec.href}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const nodes = collectNodes(doc, spec);
        nodes.forEach((node) => panel.el.appendChild(document.adoptNode(node)));

        // Shell-level nodes (e.g. global live host) stay outside tab panels.
        (spec.bodySelectors || []).forEach((sel) => {
          const node = doc.querySelector(sel);
          if (!node) return;
          if (node.id && document.getElementById(node.id)) return;
          const navRoot = document.getElementById('nav-root');
          const adopted = document.adoptNode(node);
          if (navRoot) document.body.insertBefore(adopted, navRoot);
          else document.body.appendChild(adopted);
        });
      }

      await ensureAssets(spec);

      // Mark loaded before init so startWatcher can detect background init.
      panel.loaded = true;
      window.__WC_TAB_SILENT_INIT = true;
      try {
        await Promise.resolve(spec.init?.());
        // Some pages hydrate in onTabShow — call it during load too so preload is real content.
        await Promise.resolve(spec.onShow?.());
      } finally {
        window.__WC_TAB_SILENT_INIT = false;
      }

      // Wait briefly for async hydrate (Donate foundations, etc.).
      if (!isPanelHydrated(id)) {
        const waitUntil = performance.now() + (id === 'donate' ? 2500 : 1200);
        while (performance.now() < waitUntil && !isPanelHydrated(id)) {
          await new Promise((r) => setTimeout(r, 40));
          if (!isPanelHydrated(id)) {
            try { await Promise.resolve(spec.onShow?.()); } catch { /* ignore */ }
          }
        }
      }

      // One frame so layout/paint can settle before we allow reveal.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      if (!isPanelHydrated(id)) {
        throw new Error(`[WorldChoirTabs] ${id} panel failed to hydrate`);
      }

      panel.ready = true;
      return panel;
    })().catch((err) => {
      delete loadPromises[id];
      if (panels[id]) {
        panels[id].ready = false;
        panels[id].loaded = false;
      }
      throw err;
    });

    return loadPromises[id];
  }

  function preloadPanel(id) {
    if (!isPrimary(id) || !hostEl) return;
    if (id === 'memory' && !WorldChoirConfig?.isMemoryUnlocked?.()) return;
    void loadPanel(id).catch((err) => {
      console.warn('[WorldChoirTabs] preload failed', id, err);
    });
  }

  function schedulePreload(exceptId) {
    if (preloadStarted) return;
    preloadStarted = true;
    const run = () => {
      Object.keys(PRIMARY).forEach((id) => {
        if (id === exceptId) return;
        preloadPanel(id);
      });
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 1800 });
    } else {
      setTimeout(run, 400);
    }
  }

  /** After Memory unlocks mid-session, warm that panel without a full reload. */
  function preloadMemoryIfUnlocked() {
    if (!hostEl || !WorldChoirConfig?.isMemoryUnlocked?.()) return;
    preloadPanel('memory');
  }

  async function switchTo(id, { updateHistory = true } = {}) {
    if (!isPrimary(id)) {
      window.location.href = hrefFor(id) || id;
      return false;
    }
    if (id === 'memory' && !WorldChoirConfig?.isMemoryUnlocked?.()) {
      return switchTo('home', { updateHistory });
    }

    if (!hostEl) attach(activeId || id);

    const gen = ++switchGen;

    // Already visible and ready — chrome-only update.
    if (activeId === id && panels[id]?.ready) {
      if (updateHistory) {
        try {
          history.pushState({ ...(history.state || {}), wcTab: id }, '', PRIMARY[id].href);
        } catch {
          /* ignore */
        }
      }
      return true;
    }

    // Keep current tab visible until destination is prepared (never flash empty/skeleton).
    try {
      await loadPanel(id);
      if (gen !== switchGen) return false;
      await prepareAndShow(id);
    } catch (err) {
      console.error('[WorldChoirTabs] switch failed, falling back to full navigation', err);
      endPrepare(id);
      if (gen === switchGen) window.location.href = PRIMARY[id].href;
      return false;
    }

    if (gen !== switchGen) {
      endPrepare(id);
      return false;
    }

    reveal(id);

    if (updateHistory) {
      const url = PRIMARY[id].href + (window.location.search || '');
      try {
        if (history.state?.wcTab === id && pageIdFromPath(window.location.pathname) === id) {
          history.replaceState({ ...(history.state || {}), wcTab: id }, '', url);
        } else {
          history.pushState({ ...(history.state || {}), wcTab: id }, '', PRIMARY[id].href);
        }
      } catch {
        /* ignore */
      }
    }

    // Never re-arm black boot on soft tab switches.
    document.documentElement.classList.remove('wc-booting', 'wc-boot-skeletons', 'wc-nav-handoff');
    return true;
  }

  return {
    PRIMARY,
    isPrimary,
    isHosted,
    getActive,
    isActive,
    hrefFor,
    pageIdFromPath,
    attach,
    switchTo,
    preload: schedulePreload,
    preloadMemoryIfUnlocked,
    ensureLoaded: loadPanel,
  };
})();
