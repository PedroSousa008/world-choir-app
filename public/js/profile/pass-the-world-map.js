/**
 * Pass the World — map layer (same basemap as Map tab, no city pins).
 * Plane, route, and destination stop are HTML/SVG overlays (same projection).
 * World framing resets only on mount / leave / refresh — user zoom is kept.
 */
const PassTheWorldMap = (() => {
  const WORLD_BOUNDS = [[-85, -170], [84, 179]];
  const FALLBACK_CENTER = [41.5518, -8.4229]; // Braga seed
  const ROUTE_STEPS = 120;
  const HISTORY_STEPS = 72;
  /** Same blue as active nav tab letter color (--accent-aurora). */
  const ROUTE_BLUE = '#4ec5e8';

  let map = null;
  let historyLayer = null;
  let inviteLayer = null;
  let planeEl = null;
  let destEl = null;
  let routeSvg = null;
  let routeGlowEl = null;
  let routePathEl = null;
  let containerId = 'ptw-map';
  let focusLatLng = FALLBACK_CENTER.slice();
  let planeLatLng = null;
  let planeBearing = 0;
  let destLatLng = null;
  let lockedWorldZoom = null;
  let userHasZoomed = false;

  /** Geographic quadratic control for the active route (from → control → to). */
  let routeCurve = null;
  let travelPts = null;
  let travelDepartMs = null;
  let travelArriveMs = null;
  let destPopupMeta = null;
  let destPopupOpen = false;
  let serverSkewMs = 0;
  let animRaf = null;
  let lastCenterSync = 0;
  let onProgressCb = null;
  let etaTimer = null;

  function toRad(d) { return (d * Math.PI) / 180; }
  function toDeg(r) { return (r * 180) / Math.PI; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function destinationPoint(lat, lon, bearingDeg, distanceKm) {
    const δ = distanceKm / 6371;
    const θ = toRad(bearingDeg);
    const φ1 = toRad(lat);
    const λ1 = toRad(lon);
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
    );
    const λ2 = λ1 + Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
    return [toDeg(φ2), ((toDeg(λ2) + 540) % 360) - 180];
  }

  function normalizeLon(lon) {
    return ((lon + 540) % 360) - 180;
  }

  function unwrapLon(base, lon) {
    let x = lon;
    while (x - base > 180) x -= 360;
    while (x - base < -180) x += 360;
    return x;
  }

  function bearingDegrees(a, b) {
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const dLon = toRad(unwrapLon(a[1], b[1]) - a[1]);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
      - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function readLatLng(obj, fallback) {
    if (!obj) return fallback || null;
    const lat = Number(obj.latitude ?? obj.lat);
    const lng = Number(obj.longitude ?? obj.lng ?? obj.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback || null;
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      // Guard against accidental [lng, lat] payloads.
      return [lng, lat];
    }
    return [lat, lng];
  }

  /**
   * Build a gently bulged quadratic curve between two cities.
   * Returns { from, control, to } in [lat, lng] and sampled points for the plane.
   */
  function buildCurve(from, to, steps = ROUTE_STEPS) {
    const lat1 = Number(from[0]);
    const lon1 = Number(from[1]);
    const lat2 = Number(to[0]);
    const lon2raw = Number(to[1]);
    const lon2 = unwrapLon(lon1, lon2raw);

    const dist = haversineKm(lat1, lon1, lat2, lon2raw);
    const mid = [(lat1 + lat2) / 2, (lon1 + lon2) / 2];
    const bearing = bearingDegrees([lat1, lon1], [lat2, lon2]);
    const bulgeKm = Math.min(1400, Math.max(400, dist * 0.18));
    const controlRaw = destinationPoint(mid[0], mid[1], bearing - 90, bulgeKm);
    const control = [controlRaw[0], unwrapLon(lon1, controlRaw[1])];
    const toUnwrapped = [lat2, lon2];

    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      const lat = (u * u * lat1) + (2 * u * t * control[0]) + (t * t * toUnwrapped[0]);
      const lon = normalizeLon(
        (u * u * lon1) + (2 * u * t * control[1]) + (t * t * toUnwrapped[1])
      );
      pts.push([lat, lon]);
    }

    return {
      from: [lat1, lon1],
      control: [control[0], normalizeLon(control[1])],
      to: [lat2, lon2raw],
      points: pts,
    };
  }

  function interpolateAlong(points, progress) {
    if (!points?.length) return null;
    if (progress <= 0) return points[0];
    if (progress >= 1) return points[points.length - 1];
    const idx = progress * (points.length - 1);
    const i = Math.floor(idx);
    const t = idx - i;
    const a = points[i];
    const b = points[Math.min(i + 1, points.length - 1)];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function bearingAlong(points, progress) {
    if (!points || points.length < 2) return 0;
    const idx = Math.max(0, Math.min(points.length - 2, Math.floor(progress * (points.length - 1))));
    return bearingDegrees(points[idx], points[Math.min(idx + 1, points.length - 1)]);
  }

  function inviteIcon() {
    return L.divIcon({
      className: 'ptw-invite-icon',
      html: '<span class="ptw-invite-pulse"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  function drawHistoryArc(from, to, layer) {
    const curve = buildCurve(from, to, HISTORY_STEPS);
    L.polyline(curve.points, {
      color: 'rgba(78, 197, 232, 0.18)',
      weight: 1.25,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 1.5,
      interactive: false,
      pane: 'ptwOverlay',
      className: 'ptw-route-history',
    }).addTo(layer);
  }

  function ensureOverlayEls() {
    const wrap = document.getElementById(containerId)?.parentElement;
    if (!wrap) return null;

    if (!routeSvg || !routeSvg.isConnected) {
      routeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      routeSvg.classList.add('ptw-route-overlay');
      routeSvg.setAttribute('aria-hidden', 'true');

      routeGlowEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      routeGlowEl.classList.add('ptw-route-overlay__glow');
      routeGlowEl.setAttribute('fill', 'none');

      routePathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      routePathEl.classList.add('ptw-route-overlay__path');
      routePathEl.setAttribute('fill', 'none');

      routeSvg.appendChild(routeGlowEl);
      routeSvg.appendChild(routePathEl);
      wrap.appendChild(routeSvg);
    }

    if (!destEl || !destEl.isConnected) {
      destEl = document.createElement('button');
      destEl.type = 'button';
      destEl.className = 'ptw-dest-overlay';
      destEl.setAttribute('aria-label', 'Destination');
      destEl.innerHTML = `
        <span class="ptw-dest-overlay__dot"></span>
        <span class="ptw-dest-overlay__popup" hidden>
          <span class="ptw-dest-overlay__city"></span>
          <span class="ptw-dest-overlay__eta"></span>
        </span>`;
      destEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDestPopup();
      });
      wrap.appendChild(destEl);
    }

    if (!planeEl || !planeEl.isConnected) {
      planeEl = document.createElement('div');
      planeEl.className = 'ptw-plane-overlay';
      planeEl.setAttribute('aria-hidden', 'true');
      planeEl.innerHTML = `
        <span class="ptw-plane-overlay__glow"></span>
        <svg class="ptw-plane-overlay__icon" viewBox="0 0 24 24" width="18" height="18" focusable="false">
          <path fill="currentColor" d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>`;
      wrap.appendChild(planeEl);
    }

    return wrap;
  }

  function project(ll) {
    if (!map || !ll) return null;
    const pt = map.latLngToContainerPoint(ll);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
    return pt;
  }

  /** Single SVG quadratic — perfectly smooth at every zoom. */
  function syncRouteOverlay() {
    ensureOverlayEls();
    if (!routeSvg || !routePathEl || !routeGlowEl || !map) return;

    const size = map.getSize();
    routeSvg.setAttribute('width', String(size.x));
    routeSvg.setAttribute('height', String(size.y));
    routeSvg.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);

    if (!routeCurve) {
      routePathEl.setAttribute('d', '');
      routeGlowEl.setAttribute('d', '');
      routeSvg.style.opacity = '0';
      return;
    }

    const a = project(routeCurve.from);
    const c = project(routeCurve.control);
    const b = project(routeCurve.to);
    if (!a || !c || !b) {
      routeSvg.style.opacity = '0';
      return;
    }

    const d = `M${a.x.toFixed(2)} ${a.y.toFixed(2)} Q${c.x.toFixed(2)} ${c.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
    routeGlowEl.setAttribute('d', d);
    routePathEl.setAttribute('d', d);
    routeSvg.style.opacity = '1';
  }

  function syncPlaneOverlay() {
    ensureOverlayEls();
    if (!planeEl || !map || !planeLatLng) {
      if (planeEl) planeEl.style.opacity = '0';
      return;
    }
    const pt = project(planeLatLng);
    if (!pt) {
      planeEl.style.opacity = '0';
      return;
    }
    planeEl.style.opacity = '1';
    planeEl.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px) rotate(${planeBearing}deg)`;
  }

  function syncDestOverlay() {
    ensureOverlayEls();
    if (!destEl || !map || !destLatLng) {
      if (destEl) destEl.style.opacity = '0';
      return;
    }
    const pt = project(destLatLng);
    if (!pt) {
      destEl.style.opacity = '0';
      return;
    }
    destEl.style.opacity = '1';
    destEl.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px)`;
    refreshDestPopupContent();
  }

  function syncOverlays() {
    syncRouteOverlay();
    syncDestOverlay();
    syncPlaneOverlay();
  }

  function setPlane(latlng, bearing = 0) {
    if (!latlng || latlng[0] == null || latlng[1] == null) {
      planeLatLng = null;
      syncPlaneOverlay();
      return;
    }
    planeLatLng = [Number(latlng[0]), Number(latlng[1])];
    planeBearing = Number(bearing) || 0;
    setFocus(planeLatLng[0], planeLatLng[1]);
    syncPlaneOverlay();
  }

  function setFocus(lat, lng) {
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return;
    }
    focusLatLng = [Number(lat), Number(lng)];
  }

  function resolveWorldZoom() {
    if (!map) return 1;
    const bounds = L.latLngBounds(WORLD_BOUNDS);
    const z = map.getBoundsZoom(bounds, false, L.point(2, 2));
    if (!Number.isFinite(z)) return lockedWorldZoom || 1;
    lockedWorldZoom = z;
    return z;
  }

  function syncInteraction() {
    if (!map) return;
    if (map.getZoom() <= 1.85) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
    syncOverlays();
  }

  function markUserZoom() {
    if (!map) return;
    const worldZ = lockedWorldZoom || resolveWorldZoom();
    if (Math.abs(map.getZoom() - worldZ) > 0.15) {
      userHasZoomed = true;
    }
  }

  function frameOnPlane({ animate = false, force = false } = {}) {
    if (!map) return;
    if (userHasZoomed && !force) {
      syncOverlays();
      syncInteraction();
      return;
    }

    map.invalidateSize({ animate: false, pan: false });
    if (typeof map.stop === 'function') map.stop();

    const zoom = resolveWorldZoom();
    const center = focusLatLng || FALLBACK_CENTER;
    map.setView(center, zoom, { animate: !!animate, reset: true });
    userHasZoomed = false;
    syncOverlays();
    syncInteraction();
  }

  function fitFullWorld(opts) {
    frameOnPlane({ ...(opts || {}), force: true });
  }

  function resetWorldView() {
    userHasZoomed = false;
    frameOnPlane({ animate: false, force: true });
  }

  function nowMs() {
    return Date.now() - serverSkewMs;
  }

  function travelProgress() {
    if (travelDepartMs == null || travelArriveMs == null) return 0;
    const span = travelArriveMs - travelDepartMs;
    if (span <= 0) return 1;
    return Math.max(0, Math.min(1, (nowMs() - travelDepartMs) / span));
  }

  function formatEta(arrivalMs) {
    const ms = Math.max(0, arrivalMs - nowMs());
    const totalMins = Math.max(0, Math.ceil(ms / 60000));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours <= 0) {
      if (mins <= 1) return '1 minute';
      return `${mins} minutes`;
    }
    if (mins === 0) {
      return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    const hLabel = hours === 1 ? '1 hour' : `${hours} hours`;
    const mLabel = mins === 1 ? '1 minute' : `${mins} minutes`;
    return `${hLabel} ${mLabel}`;
  }

  function refreshDestPopupContent() {
    if (!destEl || !destPopupMeta) return;
    const cityEl = destEl.querySelector('.ptw-dest-overlay__city');
    const etaEl = destEl.querySelector('.ptw-dest-overlay__eta');
    if (cityEl) cityEl.textContent = destPopupMeta.city || 'Destination';
    if (etaEl) etaEl.textContent = formatEta(destPopupMeta.arrivalMs);
  }

  function toggleDestPopup() {
    if (!destEl || !destPopupMeta) return;
    destPopupOpen = !destPopupOpen;
    const popup = destEl.querySelector('.ptw-dest-overlay__popup');
    if (!popup) return;
    if (destPopupOpen) {
      refreshDestPopupContent();
      popup.removeAttribute('hidden');
    } else {
      popup.setAttribute('hidden', '');
    }
  }

  function closeDestPopup() {
    destPopupOpen = false;
    const popup = destEl?.querySelector('.ptw-dest-overlay__popup');
    if (popup) popup.setAttribute('hidden', '');
  }

  function setDestination(latlng, destination, arrivalAt) {
    destLatLng = latlng ? [Number(latlng[0]), Number(latlng[1])] : null;
    if (!destLatLng) {
      destPopupMeta = null;
      closeDestPopup();
      if (destEl) destEl.style.opacity = '0';
      return;
    }
    destPopupMeta = {
      city: destination?.city || 'Destination',
      arrivalMs: new Date(arrivalAt).getTime(),
    };
    if (destEl) {
      destEl.setAttribute('aria-label', `${destPopupMeta.city} destination`);
    }
    refreshDestPopupContent();
    syncDestOverlay();
    startEtaTimer();
  }

  function stopEtaTimer() {
    if (etaTimer) {
      clearInterval(etaTimer);
      etaTimer = null;
    }
  }

  function startEtaTimer() {
    stopEtaTimer();
    etaTimer = setInterval(() => {
      if (destPopupOpen) refreshDestPopupContent();
    }, 15000);
  }

  function stopTravelAnimation() {
    if (animRaf) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
  }

  function tickTravel() {
    animRaf = null;
    if (!map || !travelPts) return;

    const progress = travelProgress();
    const pos = interpolateAlong(travelPts, progress);
    if (pos) {
      setPlane(pos, bearingAlong(travelPts, progress));
      if (!userHasZoomed) {
        const t = performance.now();
        if (t - lastCenterSync > 800) {
          lastCenterSync = t;
          map.setView(pos, map.getZoom(), { animate: false });
          syncOverlays();
        }
      }
    }

    if (typeof onProgressCb === 'function') {
      try {
        onProgressCb({
          progress,
          departureAt: travelDepartMs,
          arrivalAt: travelArriveMs,
        });
      } catch { /* ignore */ }
    }

    if (progress < 1) {
      animRaf = requestAnimationFrame(tickTravel);
    }
  }

  function startTravel(curve, departureAt, arrivalAt) {
    routeCurve = curve;
    travelPts = curve.points;
    travelDepartMs = new Date(departureAt).getTime();
    travelArriveMs = new Date(arrivalAt).getTime();
    stopTravelAnimation();
    lastCenterSync = 0;
    syncRouteOverlay();
    animRaf = requestAnimationFrame(tickTravel);
  }

  function clearTravel() {
    stopTravelAnimation();
    routeCurve = null;
    travelPts = null;
    travelDepartMs = null;
    travelArriveMs = null;
    setDestination(null);
    stopEtaTimer();
    syncRouteOverlay();
  }

  function setServerSkew(skewMs) {
    serverSkewMs = Number(skewMs) || 0;
  }

  function setOnProgress(cb) {
    onProgressCb = typeof cb === 'function' ? cb : null;
  }

  async function mount(id = 'ptw-map') {
    if (typeof L === 'undefined') {
      console.error('Leaflet required for PassTheWorldMap');
      return null;
    }
    destroy();
    containerId = id;
    const el = document.getElementById(containerId);
    if (!el) return null;

    userHasZoomed = false;

    map = L.map(containerId, {
      center: focusLatLng,
      zoom: 1,
      minZoom: 0.5,
      maxZoom: 8,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: false,
      maxBounds: [[-85.05, -180], [85.05, 180]],
      maxBoundsViscosity: 0.8,
      dragging: false,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      fadeAnimation: false,
      zoomAnimation: true,
    });

    if (typeof WorldChoirMapTiles !== 'undefined') {
      WorldChoirMapTiles.addBasemapLayers(map);
    }

    if (!map.getPane('ptwOverlay')) {
      const pane = map.createPane('ptwOverlay');
      pane.style.zIndex = 650;
      pane.style.pointerEvents = 'none';
    }

    historyLayer = L.layerGroup().addTo(map);
    inviteLayer = L.layerGroup().addTo(map);

    ensureOverlayEls();
    map.on('zoomend move moveend zoom viewreset', syncOverlays);
    map.on('zoomend', () => {
      markUserZoom();
      syncInteraction();
    });
    map.on('zoomstart', markUserZoom);
    map.on('click', () => closeDestPopup());

    requestAnimationFrame(() => {
      frameOnPlane({ animate: false, force: true });
      setTimeout(() => frameOnPlane({ animate: false, force: true }), 100);
    });

    return map;
  }

  function renderJourney(payload = {}) {
    if (!map) return;
    const { itinerary = [], journey = {} } = payload;

    if (journey.serverNow) {
      setServerSkew(Date.now() - new Date(journey.serverNow).getTime());
    }

    historyLayer.clearLayers();
    inviteLayer.clearLayers();

    for (let i = 1; i < itinerary.length; i += 1) {
      const prev = itinerary[i - 1];
      const curr = itinerary[i];
      const from = readLatLng(prev);
      const to = readLatLng(curr);
      if (!from || !to) continue;
      const isCurrent = journey.status === 'TRAVELLING'
        && journey.destination
        && curr.city === journey.destination.city
        && curr.country === journey.destination.country;
      if (isCurrent) continue;
      drawHistoryArc(from, to, historyLayer);
    }

    if (
      journey.status === 'TRAVELLING'
      && journey.origin
      && journey.destination
      && journey.departureAt
      && journey.arrivalAt
    ) {
      const from = readLatLng(journey.origin);
      const to = readLatLng(journey.destination);
      if (!from || !to) return;

      const curve = buildCurve(from, to, ROUTE_STEPS);
      setDestination(curve.to, journey.destination, journey.arrivalAt);
      startTravel(curve, journey.departureAt, journey.arrivalAt);

      const progress = travelProgress();
      const planePos = interpolateAlong(curve.points, progress) || from;
      setPlane(planePos, bearingAlong(curve.points, progress));
    } else {
      clearTravel();
      const current = readLatLng(journey.current) || FALLBACK_CENTER;
      setPlane(current, 0);
    }

    renderInvites(
      journey.status === 'INVITATION_OPEN' ? (journey.invitedCities || []) : []
    );

    if (!userHasZoomed) {
      frameOnPlane({ animate: false });
    } else {
      syncOverlays();
      syncInteraction();
    }
  }

  function renderInvites(cities) {
    if (!inviteLayer) return;
    inviteLayer.clearLayers();
    (cities || []).forEach((city) => {
      const ll = readLatLng(city);
      if (!ll) return;
      L.marker(ll, {
        icon: inviteIcon(),
        interactive: false,
        keyboard: false,
        pane: 'ptwOverlay',
      }).addTo(inviteLayer);
    });
  }

  function invalidateSize() {
    if (!map) return;
    map.invalidateSize({ animate: false, pan: false });
    syncOverlays();
  }

  function destroy() {
    stopTravelAnimation();
    stopEtaTimer();
    if (map) {
      map.off('zoomend move moveend zoom viewreset', syncOverlays);
      map.off('zoomstart', markUserZoom);
      map.remove();
      map = null;
    }
    if (planeEl) { planeEl.remove(); planeEl = null; }
    if (destEl) { destEl.remove(); destEl = null; }
    if (routeSvg) {
      routeSvg.remove();
      routeSvg = null;
      routePathEl = null;
      routeGlowEl = null;
    }
    historyLayer = null;
    inviteLayer = null;
    planeLatLng = null;
    destLatLng = null;
    planeBearing = 0;
    routeCurve = null;
    travelPts = null;
    travelDepartMs = null;
    travelArriveMs = null;
    destPopupMeta = null;
    destPopupOpen = false;
    lockedWorldZoom = null;
    userHasZoomed = false;
    focusLatLng = FALLBACK_CENTER.slice();
  }

  return {
    mount,
    destroy,
    renderJourney,
    renderInvites,
    resetWorldView,
    fitFullWorld,
    frameOnPlane,
    invalidateSize,
    setServerSkew,
    setOnProgress,
  };
})();
