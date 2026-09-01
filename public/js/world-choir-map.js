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
    if (!WorldChoirDB.isPledgesLoaded()) return '';

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
    if (!WorldChoirDB.isPledgesLoaded()) return;

    const signature = getMarkersSignature();
    if (signature && signature === lastMarkersSignature) return;
    lastMarkersSignature = signature;

    cityLightsLayer.clearLayers();
    gatheringLayer.clearLayers();

    WorldChoirDB.getAggregatedCities().forEach((city) => {
      const marker = L.marker([city.latitude, city.longitude], {
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
      if (g.latitude == null || g.longitude == null) return;
      gatheringLayer.addLayer(
        L.marker([g.latitude, g.longitude], {
          icon: createGatheringIcon(),
          interactive: false,
          keyboard: false,
        })
      );
    });
  }

  function initMap() {
    const view = getInitialMapView();
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
      zoomAnimation: true,
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
    syncMapHeaderUi(minimized);
    persistMapHeaderMinimized(minimized);
  }

  function initMapHeader() {
    const header = document.getElementById('map-header');
    if (!header) return;
    syncMapHeaderUi(isMapHeaderMinimized());
    header.addEventListener('click', () => {
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

  function init() {
    WorldChoirMapTiles.warmBasemap?.();
    startMap();
  }

  async function startMap() {
    document.body.classList.add('map-page');
    WorldChoirNav.startWatcher('map');

    const hasVoiceJoinedSession = !!sessionStorage.getItem('wc_voice_joined');

    initMap();
    initMapHeader();
    if (typeof MapSponsorBar !== 'undefined') {
      MapSponsorBar.init().catch((err) => {
        console.warn('Map sponsor bar failed to initialize:', err);
      });
    }
    refreshMapData();
    WorldChoirPledgeState.subscribe(() => updateEmptyState());
    updateCountdown();
    setInterval(updateCountdown, 1000);

    WorldChoirDB.startLiveSync({ intervalMs: 2000 });

    WorldChoirParticipation.init({
      onSuccess: onParticipationSuccess,
    });

    document.getElementById('map-empty-btn')?.addEventListener('click', () => {
      if (WorldChoirPledgeState.isPledged()) return;
      WorldChoirParticipation.open();
    });

    window.addEventListener('wc-pledge-added', (e) => {
      pulseCity(`${e.detail?.city}|${e.detail?.country}`);
      if (e.detail?.latitude != null && e.detail?.longitude != null) {
        cacheUserMapHome(e.detail.latitude, e.detail.longitude);
      }
    });
    window.addEventListener('wc-pledge-updated', (e) => {
      refreshMapData();
      if (e.detail?.latitude != null && e.detail?.longitude != null) {
        applyUserHomeCenter({ force: true, animate: true });
      }
    });
    window.addEventListener('wc-pledges-synced', refreshMapData);
    window.addEventListener('wc-map-data-state', refreshMapData);
    window.addEventListener('wc-voices-live-update', (e) => {
      const key = pickPulseCity(e.detail);
      if (key) pulseCity(key);
      else refreshMapData();
    });

    WorldChoirPledgeState.init().then(() => {
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
  }

  return { init, refreshMapData, runVoiceJoinedAnimation };
})();
