/**
 * World Choir — Map Tab
 * City lights are Leaflet markers anchored to geocoded lat/lng from real pledges.
 */
const WorldChoirMap = (() => {
  let map = null;
  let cityLightsLayer = null;
  let gatheringLayer = null;
  let pulseCityKey = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function cityKey(c) {
    return `${c.city}|${c.country}`;
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

  function rebuildMarkers() {
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
    map = L.map('world-map', {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      noWrap: true,
      bounds: [[-85, -180], [85, 180]],
    }).addTo(map);

    cityLightsLayer = L.layerGroup().addTo(map);
    gatheringLayer = L.layerGroup().addTo(map);

    map.on('click', hideCityCard);
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

  function refreshMapData() {
    rebuildMarkers();
    updateStats();
    updateEmptyState();
    updateInfoSheet();
  }

  function updateStats() {
    const stats = WorldChoirDB.getMapStats();
    document.getElementById('stat-voices').textContent = formatNumber(stats.voices);
    document.getElementById('stat-cities').textContent = formatNumber(stats.cities);
    document.getElementById('stat-countries').textContent = formatNumber(stats.countries);
  }

  function updateEmptyState() {
    const stats = WorldChoirDB.getMapStats();
    const empty = document.getElementById('map-empty');
    const pledged = WorldChoirDB.hasPledged();
    if (stats.voices === 0) {
      empty.classList.remove('hidden');
      empty.querySelector('.map-empty__btn').style.display = pledged ? 'none' : 'inline-flex';
    } else {
      empty.classList.add('hidden');
    }
  }

  function updateInfoSheet() {
    const gatherings = WorldChoirDB.getGatheringPlaces();
    const goldRow = document.getElementById('info-gold-row');
    if (goldRow) goldRow.style.display = gatherings.length > 0 ? 'flex' : 'none';
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

  function toggleInfoSheet() {
    document.getElementById('map-info-sheet').classList.toggle('visible');
  }

  async function runVoiceJoinedAnimation(data) {
    if (!data?.lat || !data?.lng) return;

    pulseCityKey = `${data.city}|${data.country}`;
    refreshMapData();

    const overlay = document.getElementById('voice-joined');
    overlay.classList.add('active');

    await flyTo(data.lat, data.lng, 9, 2.2);
    await wait(2200);
    overlay.classList.remove('active');

    await flyTo(20, 0, 2, 1.8);
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
    }
  }

  function init() {
    WorldChoirDB.getOrCreateUser();
    document.body.classList.add('map-page');
    document.getElementById('nav-root').appendChild(renderWorldChoirNav('map'));

    initMap();
    refreshMapData();
    updateCountdown();
    setInterval(updateCountdown, 1000);

    WorldChoirParticipation.init({
      onSuccess: onParticipationSuccess,
    });

    document.getElementById('map-empty-btn')?.addEventListener('click', () => {
      if (!WorldChoirDB.hasPledged()) WorldChoirParticipation.open();
    });

    document.getElementById('map-info-btn')?.addEventListener('click', toggleInfoSheet);
    document.addEventListener('click', (e) => {
      const sheet = document.getElementById('map-info-sheet');
      const btn = document.getElementById('map-info-btn');
      if (!sheet.contains(e.target) && e.target !== btn) {
        sheet.classList.remove('visible');
      }
    });

    window.addEventListener('wc-pledge-added', (e) => {
      const key = `${e.detail?.city}|${e.detail?.country}`;
      pulseCityKey = key;
      refreshMapData();
      setTimeout(() => {
        if (pulseCityKey === key) {
          pulseCityKey = null;
          refreshMapData();
        }
      }, 3000);
    });
    window.addEventListener('wc-pledge-updated', refreshMapData);
    window.addEventListener('storage', (e) => {
      if (e.key === 'wc_pledges') refreshMapData();
    });

    checkVoiceJoinedFromSession();
  }

  return { init, refreshMapData, runVoiceJoinedAnimation };
})();
