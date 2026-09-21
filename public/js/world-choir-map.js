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
  /** Forced city marker during join reveal (aggregate may lag). */
  let voiceJoinedSpotlight = null;
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
      const lat = Number(data?.lat);
      const lng = Number(data?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function cacheUserMapHome(lat, lng) {
    const safeLat = Number(lat);
    const safeLng = Number(lng);
    if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return;
    try {
      localStorage.setItem(MAP_HOME_STORAGE_KEY, JSON.stringify({ lat: safeLat, lng: safeLng }));
    } catch {
      /* ignore */
    }
  }

  function clampMapCenter(lat, lng) {
    const safeLat = Number(lat);
    const safeLng = Number(lng);
    if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return null;
    return {
      lat: clamp(safeLat, -85, 85),
      lng: clamp(((safeLng + 180) % 360 + 360) % 360 - 180, -180, 180),
    };
  }

  function coordsFromPoint(point) {
    if (!point) return null;
    const lat = Number(point.latitude ?? point.lat);
    const lng = Number(point.longitude ?? point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function getUserMapCenter() {
    const pledge = typeof WorldChoirDB !== 'undefined'
      ? WorldChoirDB.getPledgeForCurrentUser?.()
      : null;

    const fromPledge = coordsFromPoint(pledge);
    if (fromPledge) {
      return { ...fromPledge, zoom: USER_HOME_ZOOM };
    }

    if (pledge?.city && pledge?.country && typeof WorldChoirDB.getAggregatedCities === 'function') {
      const match = WorldChoirDB.getAggregatedCities().find(
        (city) => city.city === pledge.city && city.country === pledge.country
      );
      const fromMatch = coordsFromPoint(match);
      if (fromMatch) {
        return { ...fromMatch, zoom: USER_HOME_ZOOM };
      }
    }

    const user = typeof WorldChoirDB !== 'undefined' ? WorldChoirDB.getCurrentUser?.() : null;
    const fromUser = coordsFromPoint(user);
    if (fromUser) {
      return { ...fromUser, zoom: USER_HOME_ZOOM };
    }

    const cached = readCachedUserMapHome();
    if (cached) {
      return { lat: cached.lat, lng: cached.lng, zoom: USER_HOME_ZOOM };
    }

    return null;
  }

  function userHomeKey(center) {
    if (!center || !Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng))) {
      return null;
    }
    return `${Number(center.lat).toFixed(4)}|${Number(center.lng).toFixed(4)}`;
  }

  function getInitialMapView() {
    const center = getUserMapCenter();
    if (center) {
      const clamped = clampMapCenter(center.lat, center.lng);
      if (clamped) {
        return { center: [clamped.lat, clamped.lng], zoom: center.zoom ?? USER_HOME_ZOOM };
      }
    }
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }

  function isMapCameraReady() {
    if (!map) return false;
    if (window.__WC_TAB_SILENT_INIT) return false;
    if (!isMapTabActive()) return false;
    try {
      const size = map.getSize?.();
      if (!size || !(size.x > 0) || !(size.y > 0)) return false;
      const el = map.getContainer?.();
      if (el && (el.clientWidth <= 0 || el.clientHeight <= 0)) return false;
    } catch {
      return false;
    }
    return true;
  }

  function hasPendingVoiceJoined() {
    try {
      return !!sessionStorage.getItem('wc_voice_joined');
    } catch {
      return false;
    }
  }

  function safeSetView(latlng, zoom, options = {}) {
    if (!map || !latlng) return false;
    const lat = Number(latlng[0] ?? latlng.lat);
    const lng = Number(latlng[1] ?? latlng.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (!options.force && !isMapCameraReady()) return false;
    try {
      map.setView([lat, lng], zoom, options);
      return true;
    } catch (err) {
      console.warn('Map setView skipped:', err?.message || err);
      return false;
    }
  }

  function safeFlyTo(latlng, zoom, options = {}) {
    if (!map || !latlng) return false;
    const lat = Number(latlng[0] ?? latlng.lat);
    const lng = Number(latlng[1] ?? latlng.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (!options.force && !isMapCameraReady()) return false;
    try {
      map.flyTo([lat, lng], zoom, {
        duration: options.duration ?? 1.2,
        easeLinearity: options.easeLinearity ?? 0.22,
      });
      return true;
    } catch (err) {
      console.warn('Map flyTo skipped:', err?.message || err);
      return false;
    }
  }

  function applyUserHomeCenter(options = {}) {
    if (!map || voiceJoinedAnimating || hasPendingVoiceJoined()) return false;
    // Never move the camera while Map is hidden (0×0) — Leaflet throws Invalid LatLng (NaN, NaN).
    if (!options.allowHidden && !isMapCameraReady()) return false;

    const center = getUserMapCenter();
    if (!center) return false;

    const key = userHomeKey(center);
    if (!options.force && key === lastAppliedHomeKey && !options.animate) return true;

    const clamped = clampMapCenter(center.lat, center.lng);
    if (!clamped) return false;
    const { lat, lng } = clamped;
    const zoom = center.zoom ?? USER_HOME_ZOOM;
    cacheUserMapHome(lat, lng);

    const moved = options.animate
      ? safeFlyTo([lat, lng], zoom, { duration: options.duration ?? 1.2, easeLinearity: 0.22 })
      : safeSetView([lat, lng], zoom, { animate: false });
    if (!moved) return false;

    lastAppliedHomeKey = key;
    return true;
  }

  function glowSize(count) {
    return clamp(Math.round(14 + Math.sqrt(count) * 6), 16, 56);
  }

  function createCityLightIcon(city, { appear = false } = {}) {
    const size = glowSize(city.count);
    const pulsing = cityKey(city) === pulseCityKey;
    const appearClass = pulsing && appear ? ' city-light--appear' : '';
    return L.divIcon({
      className: 'city-light-icon',
      html:
        `<div class="city-light${pulsing ? ' city-light--pulse' : ''}${appearClass}" style="--glow:${size}px">` +
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

  function citiesForMarkers() {
    const cities = typeof WorldChoirDB.getAggregatedCities === 'function'
      ? [...WorldChoirDB.getAggregatedCities()]
      : [];
    if (voiceJoinedSpotlight?.city && voiceJoinedSpotlight?.country) {
      const key = cityKey(voiceJoinedSpotlight);
      const idx = cities.findIndex((c) => cityKey(c) === key);
      const spotlight = {
        city: voiceJoinedSpotlight.city,
        country: voiceJoinedSpotlight.country,
        latitude: voiceJoinedSpotlight.latitude,
        longitude: voiceJoinedSpotlight.longitude,
        count: Math.max(1, Number(cities[idx]?.count) || 1),
      };
      if (idx >= 0) cities[idx] = { ...cities[idx], ...spotlight };
      else cities.push(spotlight);
    }
    return cities;
  }

  function getMarkersSignature() {
    const hasData = WorldChoirDB.isMapDataReady?.() || WorldChoirDB.isPledgesLoaded?.();
    if (!hasData && !voiceJoinedSpotlight) return '';

    const cities = citiesForMarkers();
    const gatherings = typeof WorldChoirDB.getGatheringPlaces === 'function'
      ? WorldChoirDB.getGatheringPlaces()
      : [];
    const citySig = cities
      .map((city) => `${city.city}|${city.country}:${city.count}:${city.latitude}:${city.longitude}`)
      .join(';');
    const gatheringSig = gatherings
      .map((g) => `${g.latitude}:${g.longitude}`)
      .join(';');
    const spot = voiceJoinedSpotlight
      ? `${voiceJoinedSpotlight.city}|${voiceJoinedSpotlight.country}`
      : '';

    return `${citySig}::${gatheringSig}::${pulseCityKey || ''}::${spot}`;
  }

  function rebuildMarkers() {
    if (!cityLightsLayer || !gatheringLayer) return;
    const hasData = WorldChoirDB.isMapDataReady?.() || WorldChoirDB.isPledgesLoaded?.();
    if (!hasData && !voiceJoinedSpotlight) return;

    const signature = getMarkersSignature();
    if (signature && signature === lastMarkersSignature) return;
    lastMarkersSignature = signature;

    cityLightsLayer.clearLayers();
    gatheringLayer.clearLayers();

    const appearKey = voiceJoinedSpotlight ? cityKey(voiceJoinedSpotlight) : null;

    citiesForMarkers().forEach((city) => {
      const lat = Number(city.latitude);
      const lng = Number(city.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.marker([lat, lng], {
        icon: createCityLightIcon(city, { appear: appearKey === cityKey(city) }),
        interactive: true,
        keyboard: false,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showCityCard(city);
      });
      cityLightsLayer.addLayer(marker);
    });

    if (typeof WorldChoirDB.getGatheringPlaces === 'function') {
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
  }

  function isDesktopPointerMap() {
    try {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
      return !('ontouchstart' in window);
    }
  }

  /**
   * Desktop trackpads/mice fire dense wheel events — Leaflet's default feels
   * jumpy. Drive zoom ourselves with smaller steps and a hard per-frame cap.
   */
  function bindPreciseDesktopWheelZoom(leafletMap) {
    if (!leafletMap || !isDesktopPointerMap()) return;

    leafletMap.scrollWheelZoom.disable();

    const container = leafletMap.getContainer();
    const PX_PER_ZOOM = 180;
    const MAX_STEP = 0.35;
    const SNAP = 0.25;

    let pendingPx = 0;
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (!pendingPx || !leafletMap) return;

      const maxPx = MAX_STEP * PX_PER_ZOOM;
      const applyPx = Math.max(-maxPx, Math.min(maxPx, pendingPx));
      pendingPx -= applyPx;

      const deltaZoom = -applyPx / PX_PER_ZOOM;
      if (Math.abs(deltaZoom) >= 0.02) {
        const minZ = leafletMap.getMinZoom();
        const maxZ = leafletMap.getMaxZoom();
        const next = Math.max(minZ, Math.min(maxZ, leafletMap.getZoom() + deltaZoom));
        const snapped = Math.round(next / SNAP) * SNAP;
        if (Math.abs(snapped - leafletMap.getZoom()) >= 0.001) {
          leafletMap.setZoom(snapped, { animate: false });
        }
      }

      if (Math.abs(pendingPx) >= 1) {
        rafId = requestAnimationFrame(flush);
      } else {
        pendingPx = 0;
      }
    };

    const onWheel = (e) => {
      if (e.ctrlKey) return; // leave browser pinch-to-zoom page alone when held
      e.preventDefault();
      e.stopPropagation();

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines
      if (e.deltaMode === 2) dy *= leafletMap.getSize().y; // pages
      // One event cannot dump a huge jump into the accumulator.
      dy = Math.max(-90, Math.min(90, dy));
      pendingPx += dy;

      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    leafletMap.on('unload', () => {
      container.removeEventListener('wheel', onWheel, { capture: true });
      if (rafId) cancelAnimationFrame(rafId);
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
    const desktop = isDesktopPointerMap();

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
      // Desktop: finer snap + slower wheel; touch keeps Leaflet defaults.
      zoomSnap: desktop ? 0.25 : 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: desktop ? 160 : 60,
      wheelDebounceTime: desktop ? 50 : 30,
      scrollWheelZoom: !desktop,
      preferCanvas: false,
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    WorldChoirMapTiles.addBasemapLayers(map);
    bindPreciseDesktopWheelZoom(map);

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
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (voiceJoinedAnimating) return;

    // Claim the session so onTabShow + Home backup cannot double-run / steal the camera.
    sessionStorage.removeItem('wc_voice_joined');
    voiceJoinedAnimating = true;

    // Wait until Map is visible and sized — flyTo on a 0×0 panel throws Invalid LatLng (NaN, NaN).
    for (let i = 0; i < 40 && !isMapCameraReady(); i += 1) {
      try {
        map?.invalidateSize({ animate: false, pan: false });
      } catch { /* ignore */ }
      await wait(50);
    }
    if (!isMapCameraReady()) {
      cacheUserMapHome(lat, lng);
      voiceJoinedAnimating = false;
      try {
        sessionStorage.setItem('wc_voice_joined', JSON.stringify({
          lat, lng, city: data.city, country: data.country,
        }));
      } catch { /* ignore */ }
      return;
    }

    try {
      map.invalidateSize({ animate: false, pan: false });
    } catch { /* ignore */ }

    const overlay = document.getElementById('voice-joined');
    overlay?.classList.add('active');

    const CLOSE_ZOOM = 9;
    const START_ZOOM = 3;
    const cityLabel = {
      city: data.city,
      country: data.country,
      latitude: lat,
      longitude: lng,
      count: 1,
    };

    // Light appears immediately (aggregate can lag) — before / as zoom-in starts.
    voiceJoinedSpotlight = cityLabel;
    pulseCityKey = `${data.city}|${data.country}`;
    lastMarkersSignature = '';
    rebuildMarkers();

    // Start pulled back so the zoom-in reads as a smooth journey.
    safeSetView([lat, lng], START_ZOOM, { animate: false, force: true });
    await wait(80);

    // Smooth zoom in on the city (light already visible and pulsing)
    await flyTo(lat, lng, CLOSE_ZOOM, 2.4);
    await wait(900);

    // Zoom back out to normal home framing
    cacheUserMapHome(lat, lng);
    lastAppliedHomeKey = userHomeKey({ lat, lng });
    await flyTo(lat, lng, USER_HOME_ZOOM, 2.0);

    // Message leaves only after zoom-out has fully settled
    overlay?.classList.remove('active');
    await wait(450);

    voiceJoinedAnimating = false;
    pulseCityKey = null;
    voiceJoinedSpotlight = null;
    lastMarkersSignature = '';
    refreshMapData();
  }

  function flyTo(lat, lng, zoom, durationSec) {
    return new Promise((resolve) => {
      if (!map || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try { map.off('moveend', finish); } catch { /* ignore */ }
        resolve();
      };
      const ok = safeFlyTo([Number(lat), Number(lng)], zoom, {
        force: true,
        duration: durationSec,
        easeLinearity: 0.22,
      });
      if (!ok) {
        resolve();
        return;
      }
      map.once('moveend', finish);
      setTimeout(finish, Math.max(900, (durationSec || 1) * 1000 + 450));
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
      // Delay slightly so soft-tab layout + invalidateSize can settle first.
      setTimeout(() => runVoiceJoinedAnimation(data), 350);
    } catch (_) {
      sessionStorage.removeItem('wc_voice_joined');
    }
  }

  async function onParticipationSuccess(pledge) {
    refreshMapData();
    const lat = Number(pledge?.latitude);
    const lng = Number(pledge?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      await runVoiceJoinedAnimation({
        lat,
        lng,
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
    try {
      map.invalidateSize({ animate: false, pan: false });
    } catch {
      /* ignore */
    }
    if (!isMapCameraReady()) return;
    // After soft-tab reveal, Leaflet often keeps a stale center from a 0-size container.
    if (!applyUserHomeCenter({ force: true, animate: false })) {
      const view = getInitialMapView();
      safeSetView(view.center, view.zoom, { animate: false });
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
      const pendingReveal = hasPendingVoiceJoined();
      requestAnimationFrame(() => {
        // Don't steal the camera if the join reveal is about to play.
        if (!pendingReveal && !voiceJoinedAnimating) {
          recenterMapAfterLayout();
          setTimeout(recenterMapAfterLayout, 60);
          setTimeout(recenterMapAfterLayout, 220);
        } else {
          try {
            map?.invalidateSize({ animate: false, pan: false });
          } catch { /* ignore */ }
        }
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

    // Do not set a global onSuccess here — soft-tabs share Participation with Home.
    // Map empty-state open() passes onParticipationSuccess explicitly.
    WorldChoirParticipation.init({});

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
      const lat = Number(e.detail?.latitude);
      const lng = Number(e.detail?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        cacheUserMapHome(lat, lng);
      }
      // Refresh markers only — never flyTo while Home is showing (hidden map = NaN LatLng).
      refreshMapData();
      void WorldChoirDB.syncMapAggregates?.().catch(() => {});
    });
    window.addEventListener('wc-pledge-updated', (e) => {
      refreshMapData();
      const lat = Number(e.detail?.latitude);
      const lng = Number(e.detail?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        cacheUserMapHome(lat, lng);
        // Only recenter when Map is actually visible and sized.
        applyUserHomeCenter({ force: true, animate: isMapCameraReady() });
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
        // Only when Map is visible — startMap can finish while Home is still showing.
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
