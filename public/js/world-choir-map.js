/**
 * World Choir — Map Tab
 * City lights are Leaflet markers anchored to geocoded lat/lng from real pledges.
 */
const WorldChoirMap = (() => {
  let map = null;
  let cityLightsLayer = null;
  let gatheringLayer = null;
  let pulseCityKey = null;
  let pulseClearTimer = null;
  let voiceJoinedAnimating = false;
  let lastAppliedHomeKey = null;
  let lastMarkersSignature = '';
  let refreshScheduled = false;

  const DEFAULT_CENTER = [20, 0];
  const DEFAULT_ZOOM = 2;
  const USER_HOME_ZOOM = 5;
  const MAP_HOME_STORAGE_KEY = 'wc_map_user_home';
  const MAP_HEADER_STORAGE_KEY = 'wc_map_header_minimized';

  function pulseCity(key, durationMs = 3000) {
    if (!key) return;
    pulseCityKey = key;
    refreshMapData();
    if (pulseClearTimer) clearTimeout(pulseClearTimer);
    pulseClearTimer = setTimeout(() => {
      if (pulseCityKey === key) {
        pulseCityKey = null;
        refreshMapData();
      }
    }, durationMs);
  }

  function pickPulseCity(detail = {}) {
    const { newCityKeys = [], grownCityKeys = [] } = detail;
    return newCityKeys[0] || grownCityKeys[0] || null;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function cityKey(c) {
    return `${c.city}|${c.country}`;
  }

  function readCachedUserMapHome() {
    try {
      const raw = localStorage.getItem(MAP_HOME_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
        return { lat: data.lat, lng: data.lng };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function cacheUserMapHome(lat, lng) {
    try {
      localStorage.setItem(MAP_HOME_STORAGE_KEY, JSON.stringify({ lat, lng }));
    } catch {
      /* ignore */
    }
  }

  function clampMapCenter(lat, lng) {
    return {
      lat: clamp(lat, -85, 85),
      lng: clamp(((lng + 180) % 360 + 360) % 360 - 180, -180, 180),
    };
  }

  function getUserMapCenter() {
    const pledge = typeof WorldChoirDB !== 'undefined'
      ? WorldChoirDB.getPledgeForCurrentUser?.()
      : null;

    if (pledge?.latitude != null && pledge?.longitude != null) {
      return { lat: pledge.latitude, lng: pledge.longitude, zoom: USER_HOME_ZOOM };
    }

    if (pledge?.city && pledge?.country && typeof WorldChoirDB.getAggregatedCities === 'function') {
      const match = WorldChoirDB.getAggregatedCities().find(
        (city) => city.city === pledge.city && city.country === pledge.country
      );
      if (match?.latitude != null && match?.longitude != null) {
        return { lat: match.latitude, lng: match.longitude, zoom: USER_HOME_ZOOM };
      }
    }

    const user = typeof WorldChoirDB !== 'undefined' ? WorldChoirDB.getCurrentUser?.() : null;
    if (user?.latitude != null && user?.longitude != null) {
      return { lat: user.latitude, lng: user.longitude, zoom: USER_HOME_ZOOM };
    }

    const cached = readCachedUserMapHome();
    if (cached) {
      return { lat: cached.lat, lng: cached.lng, zoom: USER_HOME_ZOOM };
    }

    return null;
  }

  function userHomeKey(center) {
    if (!center) return null;
    return `${center.lat.toFixed(4)}|${center.lng.toFixed(4)}`;
  }

  function getInitialMapView() {
    const center = getUserMapCenter();
    if (center) {
      const { lat, lng } = clampMapCenter(center.lat, center.lng);
      return { center: [lat, lng], zoom: center.zoom ?? USER_HOME_ZOOM };
    }
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }

  function applyUserHomeCenter(options = {}) {
    if (!map || voiceJoinedAnimating) return false;

    const center = getUserMapCenter();
    if (!center) return false;

    const key = userHomeKey(center);
    if (!options.force && key === lastAppliedHomeKey && !options.animate) return true;

    const { lat, lng } = clampMapCenter(center.lat, center.lng);
    const zoom = center.zoom ?? USER_HOME_ZOOM;
    cacheUserMapHome(lat, lng);

    if (options.animate) {
      map.flyTo([lat, lng], zoom, { duration: options.duration ?? 1.2, easeLinearity: 0.22 });
    } else {
      map.setView([lat, lng], zoom, { animate: false });
    }

    lastAppliedHomeKey = key;
    return true;
  }

  function glowSize(count) {
    return clamp(Math.round(14 + Math.sqrt(count) * 6), 16, 56);
  }

  function createCityLightIcon(city) {
    const size = glowSize(city.count);
    const pulsing = cityKey(city) === pulseCityKey;
    return L.divIcon({
      className: 'city-light-icon',
      html:
        `<div class="city-light${pulsing ? ' city-light--pulse' : ''}" style="--glow:${size}px">` +
        '<span class="city-light__glow"></span><span class="city-light__core"></span></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function createGatheringIcon() {
    return L.divIcon({
      className: 'gathering-icon',
      html:
        '<div class="gathering-marker">' +
        '<span class="gathering-marker__glow"></span><span class="gathering-marker__core"></span></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  function getMarkersSignature() {
    if (!WorldChoirDB.isMapDataReady?.() && !WorldChoirDB.isPledgesLoaded()) return '';

    const cities = WorldChoirDB.getAggregatedCities();
    const gatherings = WorldChoirDB.getGatheringPlaces();
    const citySig = cities
      .map((city) => `${city.city}|${city.country}:${city.count}:${city.latitude}:${city.longitude}`)
      .join(';');
    const gatheringSig = gatherings
      .map((g) => `${g.latitude}:${g.longitude}`)
      .join(';');

    return `${citySig}::${gatheringSig}::${pulseCityKey || ''}`;
  }

  function rebuildMarkers() {
    if (!cityLightsLayer || !gatheringLayer) return;
    if (!WorldChoirDB.isMapDataReady?.() && !WorldChoirDB.isPledgesLoaded()) return;

    const signature = getMarkersSignature();
    if (signature && signature === lastMarkersSignature) return;
    lastMarkersSignature = signature;

    cityLightsLayer.clearLayers();
    gatheringLayer.clearLayers();

    WorldChoirDB.getAggregatedCities().forEach((city) => {
      const lat = Number(city.latitude);
      const lng = Number(city.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.marker([lat, lng], {
        icon: createCityLightIcon(city),
        interactive: true,
        keyboard: false,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showCityCard(city);
      });
      cityLightsLayer.addLayer(marker);
    });

    WorldChoirDB.getGatheringPlaces().forEach((g) => {
      const lat = Number(g.latitude);
      const lng = Number(g.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      gatheringLayer.addLayer(
        L.marker([lat, lng], {
          icon: createGatheringIcon(),
          interactive: false,
          keyboard: false,
        })
      );
    });
  }

  function initMap() {
    const view = getInitialMapView();
    // MapLibre GL paints the basemap in a separate canvas from Leaflet markers.
    // CSS zoom animations desync those two systems at extreme zoom-out and can
    // leave city lights sitting on the wrong geography (e.g. Braga over Spain).
    // Instant Leaflet zoom keeps markers and basemap on the same CRS always.
    const useVectorBasemap = typeof WorldChoirMapTiles !== 'undefined'
      && typeof WorldChoirMapTiles.canUseMapLibre === 'function'
      && WorldChoirMapTiles.canUseMapLibre();

    map = L.map('world-map', {
      center: view.center,
      zoom: view.zoom,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
      fadeAnimation: false,
      zoomAnimation: !useVectorBasemap,
      markerZoomAnimation: !useVectorBasemap,
      bounceAtZoomLimits: true,
      inertia: true,
      inertiaDeceleration: 2800,
      wheelDebounceTime: 30,
      preferCanvas: false,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    WorldChoirMapTiles.addBasemapLayers(map);

    cityLightsLayer = L.layerGroup().addTo(map);
    gatheringLayer = L.layerGroup().addTo(map);

    map.on('click', hideCityCard);

    const resyncBasemap = () => {
      if (typeof WorldChoirMapTiles?.syncToMap === 'function') {
        WorldChoirMapTiles.syncToMap(map);
      }
    };
    map.on('zoomend', resyncBasemap);
    map.on('moveend', resyncBasemap);
    // Catch late GL transform frames after maxBounds clamp / pinch settle.
    map.on('zoomend', () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resyncBasemap);
      });
    });

    bindMapResizeHandlers();
    scheduleMapResize();
  }

  function scheduleMapResize() {
    requestAnimationFrame(() => {
      map?.invalidateSize({ animate: false, pan: false });
    });
    setTimeout(() => map?.invalidateSize({ animate: false, pan: false }), 120);
  }

  function bindMapResizeHandlers() {
    let resizeTimer = null;

    const refresh = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        map?.invalidateSize({ animate: false, pan: false });
      }, 80);
    };

    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', refresh, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleMapResize();
    });
  }

  function showCityCard(city) {
    const card = document.getElementById('city-card');
    const hasGathering = WorldChoirDB.hasGatheringNear(city.city, city.country);
    document.getElementById('city-card-place').textContent = `${city.city}, ${city.country}`;
    document.getElementById('city-card-voices').textContent =
      `${formatNumber(city.count)} voice${city.count !== 1 ? 's' : ''}`;
    const gatheringEl = document.getElementById('city-card-gathering');
    gatheringEl.textContent = hasGathering ? 'Official gathering nearby' : '';
    gatheringEl.style.display = hasGathering ? 'block' : 'none';
    card.classList.add('visible');
    setTimeout(() => card.classList.remove('visible'), 4000);
  }

  function hideCityCard() {
    document.getElementById('city-card').classList.remove('visible');
  }

  function updateLoadingState() {
    const mapDataState = WorldChoirDB.getMapDataState();
    const loadingEl = document.getElementById('map-data-loading');
    const loadingText = document.getElementById('map-data-loading-text');
    const mapStats = document.getElementById('map-stats');

    // Never block the Map tab with a loading message — only surface real errors.
    const showError = mapDataState === 'error';
    loadingEl?.classList.toggle('is-visible', showError);
    if (loadingEl) loadingEl.hidden = !showError;
    mapStats?.classList.toggle('map-stats--loading', mapDataState === 'loading');
    mapStats?.classList.toggle('map-stats--loaded', mapDataState === 'loaded_empty' || mapDataState === 'loaded_with_voices');
    mapStats?.classList.toggle('map-stats--error', mapDataState === 'error');

    if (loadingText) {
      loadingText.textContent = mapDataState === 'error'
        ? 'World Choir records are temporarily unavailable. Voices have not been deleted.'
        : '';
    }
  }

  function updateStats() {
    const stats = WorldChoirDB.getMapStats();
    if (!stats) return;

    document.getElementById('stat-voices').textContent = formatNumber(stats.voices);
    document.getElementById('stat-cities').textContent = formatNumber(stats.cities);
    document.getElementById('stat-countries').textContent = formatNumber(stats.countries);
  }

  function updateEmptyState() {
    const mapDataState = WorldChoirDB.getMapDataState();
    const empty = document.getElementById('map-empty');
    const btn = document.getElementById('map-empty-btn');
    const skeleton = document.getElementById('map-empty-btn-skeleton');
    const pledgeState = WorldChoirPledgeState.getState();

    if (mapDataState !== 'loaded_empty') {
      empty?.classList.add('hidden');
      btn.hidden = true;
      skeleton?.classList.remove('visible');
      return;
    }

    empty?.classList.remove('hidden');
    empty.classList.toggle('map-empty--resolving', pledgeState === 'loading');

    const postEvent = typeof WorldChoirPostEventJoin !== 'undefined'
      ? WorldChoirPostEventJoin.isPostEventComplete()
      : (typeof WorldChoirConfig !== 'undefined'
        && WorldChoirConfig.getGlobalEventState?.() === WorldChoirConfig.EventState?.COMPLETED);
    const ctaLabel = postEvent
      ? (WorldChoirPostEventJoin?.CTA_LABEL || 'Be a part of the World Choir')
      : "I'll Sing";
    if (btn) btn.textContent = ctaLabel;

    if (pledgeState === 'loading') {
      btn.hidden = true;
      skeleton?.classList.add('visible');
    } else if (pledgeState === 'pledged') {
      btn.hidden = true;
      skeleton?.classList.remove('visible');
    } else {
      btn.hidden = false;
      skeleton?.classList.remove('visible');
    }
  }

  function refreshMapData() {
    if (refreshScheduled) return;
    refreshScheduled = true;

    requestAnimationFrame(() => {
      refreshScheduled = false;
      updateLoadingState();

      const mapDataState = WorldChoirDB.getMapDataState();
      if (mapDataState === 'loading' || mapDataState === 'error') {
        return;
      }

      rebuildMarkers();
      updateStats();
      updateEmptyState();
    });
  }

  function updateCountdown() {
    const t = WorldChoirConfig.getTimeRemaining();
    const el = document.getElementById('map-countdown');
    if (t.totalMs <= 0) {
      el.textContent = 'The world is singing now';
    } else {
      el.textContent = `Singing in ${WorldChoirConfig.formatCountdownLong(t)}`;
    }
  }

  function isMapHeaderMinimized() {
    try {
      return localStorage.getItem(MAP_HEADER_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function syncMapHeaderUi(minimized) {
    const header = document.getElementById('map-header');
    if (!header) return;
    header.classList.toggle('map-header--minimized', minimized);
    header.setAttribute('aria-expanded', minimized ? 'false' : 'true');
    if (typeof MapSponsorBar !== 'undefined' && MapSponsorBar.syncHeaderAriaLabel) {
      MapSponsorBar.syncHeaderAriaLabel();
    } else {
      header.setAttribute(
        'aria-label',
        minimized ? 'The Earth Breathes — tap to expand' : 'The Earth Breathes — tap to minimize'
      );
    }
  }

  function persistMapHeaderMinimized(minimized) {
    try {
      localStorage.setItem(MAP_HEADER_STORAGE_KEY, minimized ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function setMapHeaderMinimized(minimized) {
    if (minimized && typeof MapSponsorBar !== 'undefined' && MapSponsorBar.hasActiveSponsors()) {
      return;
    }
    syncMapHeaderUi(minimized);
    persistMapHeaderMinimized(minimized);
  }

  function restoreMapHeaderFromStorage() {
    syncMapHeaderUi(isMapHeaderMinimized());
  }

  function initMapHeader() {
    const header = document.getElementById('map-header');
    if (!header) return;
    const sponsorLocked = typeof MapSponsorBar !== 'undefined' && MapSponsorBar.hasActiveSponsors();
    syncMapHeaderUi(sponsorLocked ? false : isMapHeaderMinimized());
    header.addEventListener('click', () => {
      if (typeof MapSponsorBar !== 'undefined' && MapSponsorBar.hasActiveSponsors()) return;
      setMapHeaderMinimized(!header.classList.contains('map-header--minimized'));
    });
  }

  async function runVoiceJoinedAnimation(data) {
    if (!data?.lat || !data?.lng) return;

    voiceJoinedAnimating = true;
    pulseCityKey = `${data.city}|${data.country}`;
    refreshMapData();

    const overlay = document.getElementById('voice-joined');
    overlay.classList.add('active');

    await flyTo(data.lat, data.lng, 9, 2.2);
    await wait(2200);
    overlay.classList.remove('active');

    cacheUserMapHome(data.lat, data.lng);
    lastAppliedHomeKey = userHomeKey({ lat: data.lat, lng: data.lng });

    const home = getUserMapCenter() || { lat: data.lat, lng: data.lng, zoom: USER_HOME_ZOOM };
    const { lat, lng } = clampMapCenter(home.lat, home.lng);
    await flyTo(lat, lng, home.zoom ?? USER_HOME_ZOOM, 1.8);

    voiceJoinedAnimating = false;
    pulseCityKey = null;
    refreshMapData();
    sessionStorage.removeItem('wc_voice_joined');
  }

  function flyTo(lat, lng, zoom, durationSec) {
    return new Promise((resolve) => {
      map.flyTo([lat, lng], zoom, { duration: durationSec, easeLinearity: 0.22 });
      map.once('moveend', resolve);
    });
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function checkVoiceJoinedFromSession() {
    const raw = sessionStorage.getItem('wc_voice_joined');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setTimeout(() => runVoiceJoinedAnimation(data), 400);
    } catch (_) {
      sessionStorage.removeItem('wc_voice_joined');
    }
  }

  async function onParticipationSuccess(pledge) {
    refreshMapData();
    if (pledge?.latitude && pledge?.longitude) {
      await runVoiceJoinedAnimation({
        lat: pledge.latitude,
        lng: pledge.longitude,
        city: pledge.city,
        country: pledge.country,
      });
      return;
    }
    applyUserHomeCenter({ force: true, animate: true });
  }

  let mapBootstrapped = false;
  let mapStartPromise = null;

  function recenterMapAfterLayout() {
    if (!map) return;
    map.invalidateSize({ animate: false, pan: false });
    // After soft-tab reveal, Leaflet often keeps a stale center from a 0-size container.
    if (!applyUserHomeCenter({ force: true, animate: false })) {
      const view = getInitialMapView();
      map.setView(view.center, view.zoom, { animate: false });
    }
    // City lights may need a second pass once size is real.
    refreshMapData();
  }

  function isMapTabActive() {
    try {
      if (typeof WorldChoirTabs !== 'undefined' && WorldChoirTabs.isHosted?.()) {
        return WorldChoirTabs.getActive?.() === 'map';
      }
    } catch {
      /* fall through */
    }
    // Hard navigation to map.html (soft-tab host not attached yet).
    const file = (window.location.pathname || '').split('/').pop() || '';
    return file === 'map.html' || file === 'map';
  }

  /** Map locks body scroll — only while Map is the visible tab (never during silent preload). */
  function setMapBodyLock(on) {
    if (on) {
      if (window.__WC_TAB_SILENT_INIT) return;
      if (typeof WorldChoirTabs !== 'undefined' && WorldChoirTabs.isHosted?.() && !isMapTabActive()) {
        return;
      }
      document.body.classList.add('map-page');
      return;
    }
    // Do not strip the lock while Map is genuinely showing.
    if (!window.__WC_TAB_SILENT_INIT && isMapTabActive()) return;
    document.body.classList.remove('map-page');
  }

  function onTabShow() {
    // Soft-tab preload calls onShow under __WC_TAB_SILENT_INIT — must not lock scroll.
    if (window.__WC_TAB_SILENT_INIT) {
      return ensureMapStarted().then(() => {
        setMapBodyLock(false);
        void checkVoiceJoinedFromSession();
      });
    }

    setMapBodyLock(true);
    // Force layout before Leaflet measures the container.
    const panel = document.querySelector('.wc-tab-panel[data-wc-tab="map"]');
    if (panel) void panel.offsetWidth;
    const mapEl = document.getElementById('world-map');
    if (mapEl) void mapEl.offsetWidth;

    return ensureMapStarted().then(() => {
      if (!window.__WC_TAB_SILENT_INIT && isMapTabActive()) setMapBodyLock(true);
      else setMapBodyLock(false);
      requestAnimationFrame(() => {
        recenterMapAfterLayout();
        setTimeout(recenterMapAfterLayout, 60);
        setTimeout(recenterMapAfterLayout, 220);
      });
      // Never leave the map boot skeleton on soft switches.
      const skel = document.getElementById('map-boot-skel');
      if (skel) {
        skel.classList.add('is-done');
        skel.setAttribute('aria-busy', 'false');
        skel.remove();
      }
      void checkVoiceJoinedFromSession();
    });
  }

  function resetToRoot() {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* ignore */
    }
    return onTabShow();
  }

  function init() {
    if (map && mapBootstrapped) {
      if (!window.__WC_TAB_SILENT_INIT) return onTabShow();
      return Promise.resolve();
    }
    if (mapStartPromise) return mapStartPromise;

    // Soft-tab preload: fetch/assets/shell only. Full Leaflet starts on first show.
    if (window.__WC_TAB_SILENT_INIT) {
      return Promise.resolve();
    }

    return ensureMapStarted();
  }

  function ensureMapStarted() {
    if (map && mapBootstrapped) return Promise.resolve();

    // Only reuse an in-flight start. Never reuse a settled promise without a live map.
    if (mapStartPromise) {
      return mapStartPromise.then(() => {
        if (map && mapBootstrapped) return;
        mapStartPromise = null;
        return ensureMapStarted();
      }).catch(() => {
        mapStartPromise = null;
        return ensureMapStarted();
      });
    }

    mapStartPromise = (async () => {
      if (typeof L === 'undefined' || !L?.map) {
        throw new Error('Leaflet is not loaded');
      }
      const mapEl = document.getElementById('world-map');
      if (!mapEl) throw new Error('Map container missing');
      setMapBodyLock(true);
      WorldChoirMapTiles.warmBasemap?.();
      await startMap({ silent: !!window.__WC_TAB_SILENT_INIT });
      if (!map) throw new Error('Map failed to create Leaflet instance');
      mapBootstrapped = true;
      refreshMapData();
      // Async start can finish after the user left Map — never leave scroll locked.
      if (window.__WC_TAB_SILENT_INIT || !isMapTabActive()) setMapBodyLock(false);
      else setMapBodyLock(true);
      requestAnimationFrame(() => {
        map?.invalidateSize({ animate: false, pan: false });
      });
    })().catch((err) => {
      mapBootstrapped = false;
      mapStartPromise = null;
      throw err;
    });
    return mapStartPromise;
  }

  async function startMap({ silent = false } = {}) {
    if (!silent) setMapBodyLock(true);
    WorldChoirNav.startWatcher('map');

    const clearBootSkel = () => {
      const skel = document.getElementById('map-boot-skel');
      if (!skel || skel.classList.contains('is-done')) return;
      skel.classList.add('is-done');
      skel.setAttribute('aria-busy', 'false');
      setTimeout(() => skel.remove(), 220);
      if (typeof WorldChoirBoot !== 'undefined') WorldChoirBoot.ready();
    };
    // Keep map boot skeleton extremely short.
    setTimeout(clearBootSkel, 200);

    const hasVoiceJoinedSession = !!sessionStorage.getItem('wc_voice_joined');

    if (typeof MapSponsorData !== 'undefined') MapSponsorData.prefetch?.();

    const sponsorInit = (typeof MapSponsorBar !== 'undefined')
      ? Promise.race([
        MapSponsorBar.init().catch((err) => {
          console.warn('Map sponsor bar failed to initialize:', err);
        }),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ])
      : Promise.resolve();

    initMap();
    await sponsorInit;
    initMapHeader();
    refreshMapData();
    clearBootSkel();
    WorldChoirPledgeState.subscribe(() => updateEmptyState());
    updateCountdown();
    setInterval(updateCountdown, 1000);

    WorldChoirDB.startMapAggregateSync({ intervalMs: 1500 });

    WorldChoirParticipation.init({
      onSuccess: onParticipationSuccess,
    });

    document.getElementById('map-empty-btn')?.addEventListener('click', () => {
      if (WorldChoirPledgeState.isPledged()) return;
      const postEvent = typeof WorldChoirPostEventJoin !== 'undefined'
        && WorldChoirPostEventJoin.isPostEventComplete();
      WorldChoirParticipation.open({
        postEvent,
        onSuccess: onParticipationSuccess,
      });
    });

    window.addEventListener('wc-pledge-added', (e) => {
      pulseCity(`${e.detail?.city}|${e.detail?.country}`);
      if (e.detail?.latitude != null && e.detail?.longitude != null) {
        cacheUserMapHome(e.detail.latitude, e.detail.longitude);
      }
      void WorldChoirDB.syncMapAggregates?.().catch(() => {});
    });
    window.addEventListener('wc-pledge-updated', (e) => {
      refreshMapData();
      if (e.detail?.latitude != null && e.detail?.longitude != null) {
        applyUserHomeCenter({ force: true, animate: true });
      }
      void WorldChoirDB.syncMapAggregates?.().catch(() => {});
    });
    window.addEventListener('wc-pledges-synced', refreshMapData);
    window.addEventListener('wc-map-aggregate-synced', refreshMapData);
    window.addEventListener('wc-map-data-state', refreshMapData);
    window.addEventListener('wc-voices-live-update', (e) => {
      const key = pickPulseCity(e.detail);
      if (key) pulseCity(key);
      else refreshMapData();
    });

    WorldChoirPledgeState.init({ mode: 'myPledge' }).then(() => {
      refreshMapData();
      updateEmptyState();
      if (!hasVoiceJoinedSession) {
        applyUserHomeCenter({ animate: false });
      }
    }).catch((err) => {
      console.error('Failed to connect to World Choir database:', err);
      refreshMapData();
      if (!hasVoiceJoinedSession) {
        applyUserHomeCenter({ animate: false });
      }
    });

    checkVoiceJoinedFromSession();
    if (silent || window.__WC_TAB_SILENT_INIT || !isMapTabActive()) {
      setMapBodyLock(false);
    }
  }

  const api = { init, onTabShow, resetToRoot, refreshMapData, runVoiceJoinedAnimation, restoreMapHeaderFromStorage };
  window.WorldChoirMap = api;
  return api;
})();
