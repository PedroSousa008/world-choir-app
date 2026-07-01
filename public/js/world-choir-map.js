/**
 * World Choir — Map Tab
 */
const WorldChoirMap = (() => {
  let map = null;
  let lightsLayer = null;
  let pulsePhase = 0;
  let animFrame = null;
  let lastLights = [];
  let highlightCityKey = null;
  let pulseCityKey = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lightProps() {
    return { core: 5, glow: 18, opacity: 0.85 };
  }

  function cityKey(c) {
    return `${c.city}|${c.country}`;
  }

  function voiceCountForCity(city, country) {
    return WorldChoirDB.getPledgesForEvent().filter(
      (p) => p.city === city && p.country === country
    ).length;
  }

  /* ─── Canvas light overlay (layer-point coords so lights stay on geography while panning) ─── */
  const LightsOverlay = L.Layer.extend({
    onAdd(m) {
      this._map = m;
      this._canvas = L.DomUtil.create('canvas', 'map-lights-canvas');
      this._canvas.style.position = 'absolute';
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.zIndex = '450';
      m.getPanes().overlayPane.appendChild(this._canvas);
      m.on('move', this._reposition, this);
      m.on('zoomend resize', this._reset, this);
      this._reset();
      this._animate();
    },

    onRemove(m) {
      cancelAnimationFrame(this._animId);
      L.DomUtil.remove(this._canvas);
      m.off('move', this._reposition, this);
      m.off('zoomend resize', this._reset, this);
    },

    _reposition() {
      if (!this._map || !this._canvas) return;
      L.DomUtil.setPosition(this._canvas, this._map.containerPointToLayerPoint([0, 0]));
      this._draw();
    },

    _reset() {
      const size = this._map.getSize();
      const dpr = window.devicePixelRatio || 1;
      L.DomUtil.setPosition(this._canvas, this._map.containerPointToLayerPoint([0, 0]));
      this._canvas.width = size.x * dpr;
      this._canvas.height = size.y * dpr;
      this._canvas.style.width = size.x + 'px';
      this._canvas.style.height = size.y + 'px';
      this._ctx = this._canvas.getContext('2d');
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._draw();
    },

    _animate() {
      pulsePhase += 0.025;
      this._draw();
      this._animId = requestAnimationFrame(() => this._animate());
    },

    _draw() {
      if (!this._ctx || !this._map) return;
      const ctx = this._ctx;
      const size = this._map.getSize();
      ctx.clearRect(0, 0, size.x, size.y);

      const breath = 0.5 + 0.5 * Math.sin(pulsePhase);

      lastLights.forEach((light) => {
        const pt = this._map.latLngToLayerPoint([light.latitude, light.longitude]);
        if (pt.x < -100 || pt.y < -100 || pt.x > size.x + 100 || pt.y > size.y + 100) return;

        const props = lightProps();
        const key = cityKey(light);
        const isPulse = key === pulseCityKey;
        const extra = isPulse ? 0.3 + 0.3 * Math.sin(pulsePhase * 3) : 0;
        const glowR = props.glow * (1 + extra + breath * 0.08);
        const coreR = props.core * (1 + extra * 0.5);
        const alpha = props.opacity * (0.85 + breath * 0.15);

        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, glowR);
        grad.addColorStop(0, `rgba(200, 230, 255, ${alpha})`);
        grad.addColorStop(0.15, `rgba(126, 184, 255, ${alpha * 0.7})`);
        grad.addColorStop(0.45, `rgba(61, 124, 255, ${alpha * 0.25})`);
        grad.addColorStop(1, 'rgba(61, 124, 255, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, coreR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 248, 255, ${Math.min(1, alpha + 0.2)})`;
        ctx.fill();
      });

      const gatherings = WorldChoirDB.getGatheringPlaces();
      gatherings.forEach((g) => {
        const pt = this._map.latLngToLayerPoint([g.latitude, g.longitude]);
        const r = 6 + breath * 1.5;
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3);
        grad.addColorStop(0, 'rgba(201, 169, 98, 0.9)');
        grad.addColorStop(0.4, 'rgba(201, 169, 98, 0.35)');
        grad.addColorStop(1, 'rgba(201, 169, 98, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#c9a962';
        ctx.fill();
      });
    },
  });

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

    lightsLayer = new LightsOverlay();
    lightsLayer.addTo(map);

    map.on('click', onMapClick);
  }

  function onMapClick(e) {
    const clickPt = map.latLngToLayerPoint(e.latlng);
    let nearest = null;
    let minDist = 30;

    lastLights.forEach((light) => {
      const pt = map.latLngToLayerPoint([light.latitude, light.longitude]);
      const d = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y);
      if (d < minDist) {
        minDist = d;
        nearest = light;
      }
    });

    if (nearest) showCityCard(nearest);
    else hideCityCard();
  }

  function showCityCard(light) {
    const card = document.getElementById('city-card');
    const count = voiceCountForCity(light.city, light.country);
    const hasGathering = WorldChoirDB.hasGatheringNear(light.city, light.country);
    document.getElementById('city-card-place').textContent = `${light.city}, ${light.country}`;
    document.getElementById('city-card-voices').textContent =
      `${formatNumber(count)} voice${count !== 1 ? 's' : ''}`;
    const gatheringEl = document.getElementById('city-card-gathering');
    gatheringEl.textContent = hasGathering ? 'Official gathering nearby' : '';
    gatheringEl.style.display = hasGathering ? 'block' : 'none';
    card.classList.add('visible');
    highlightCityKey = cityKey(light);
    setTimeout(() => card.classList.remove('visible'), 4000);
  }

  function hideCityCard() {
    document.getElementById('city-card').classList.remove('visible');
  }

  function refreshMapData() {
    lastLights = WorldChoirDB.getUserLights();
    updateStats();
    updateEmptyState();
    updateInfoSheet();
    if (lightsLayer) lightsLayer._draw();
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
      setTimeout(() => { if (pulseCityKey === key) pulseCityKey = null; }, 3000);
    });
    window.addEventListener('wc-pledge-updated', refreshMapData);
    window.addEventListener('storage', (e) => {
      if (e.key === 'wc_pledges') refreshMapData();
    });

    checkVoiceJoinedFromSession();
  }

  return { init, refreshMapData, runVoiceJoinedAnimation };
})();
