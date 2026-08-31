/**
 * Pass the World — map layer (same basemap as Map tab, no city pins).
 * Plane + active route are HTML/SVG overlays above Leaflet/MapLibre.
 * World framing resets only on mount / leave / refresh — user zoom is kept.
 */
const PassTheWorldMap = (() => {
  const WORLD_BOUNDS = [[-85, -170], [84, 179]];
  const FALLBACK_CENTER = [41.5518, -8.4229]; // Braga seed
  const ROUTE_STEPS = 180;
  const HISTORY_STEPS = 96;
  /** Same blue as active nav tab letter color (--accent-aurora). */
  const ROUTE_BLUE = '#4ec5e8';

  let map = null;
  let routeLayer = null;
  let historyLayer = null;
  let inviteLayer = null;
  let cityMarkers = null;
  let planeEl = null;
  let routeSvg = null;
  let routePathEl = null;
  let containerId = 'ptw-map';
  let focusLatLng = FALLBACK_CENTER.slice();
  let planeLatLng = null;
  let planeBearing = 0;
  let lockedWorldZoom = null;
  let userHasZoomed = false;

  let travelSegs = null;
  let activeRouteSegs = null;
  let travelDepartMs = null;
  let travelArriveMs = null;
  let serverSkewMs = 0;
  let animRaf = null;
  let lastCenterSync = 0;
  let onProgressCb = null;

  function greatCirclePoints(a, b, steps = 64) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const lat1 = toRad(a[0]);
    const lon1 = toRad(a[1]);
    const lat2 = toRad(b[0]);
    const lon2 = toRad(b[1]);
    const d = 2 * Math.asin(Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
    ));
    if (!d || Number.isNaN(d)) return [a, b];

    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const f = i / steps;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
      const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
      const z = A * Math.sin(lat1) + B * Math.sin(lat2);
      const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
      const lon = Math.atan2(y, x);
      pts.push([toDeg(lat), toDeg(lon)]);
    }
    return splitAntimeridian(pts);
  }

  function splitAntimeridian(points) {
    const segments = [[]];
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const seg = segments[segments.length - 1];
      if (seg.length) {
        const prev = seg[seg.length - 1];
        if (Math.abs(p[1] - prev[1]) > 180) {
          segments.push([p]);
          continue;
        }
      }
      seg.push(p);
    }
    return segments;
  }

  function interpolateAlong(segments, progress) {
    const flat = segments.flat();
    if (!flat.length) return null;
    if (progress <= 0) return flat[0];
    if (progress >= 1) return flat[flat.length - 1];
    const idx = progress * (flat.length - 1);
    const i = Math.floor(idx);
    const t = idx - i;
    const a = flat[i];
    const b = flat[Math.min(i + 1, flat.length - 1)];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function bearingDegrees(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const dLon = toRad(b[1] - a[1]);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
      - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function bearingAlong(segments, progress) {
    const flat = segments.flat();
    if (flat.length < 2) return 0;
    const idx = Math.max(0, Math.min(flat.length - 2, Math.floor(progress * (flat.length - 1))));
    return bearingDegrees(flat[idx], flat[Math.min(idx + 1, flat.length - 1)]);
  }

  function cityDotIcon(kind = 'current') {
    return L.divIcon({
      className: `ptw-city-icon ptw-city-icon--${kind}`,
      html: '<span class="ptw-city-dot"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function inviteIcon() {
    return L.divIcon({
      className: 'ptw-invite-icon',
      html: '<span class="ptw-invite-pulse"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  function drawArc(segments, style, layer) {
    segments.forEach((seg) => {
      if (!seg || seg.length < 2) return;
      L.polyline(seg, {
        color: style.color,
        weight: style.weight,
        opacity: style.opacity,
        lineCap: 'round',
        lineJoin: 'round',
        smoothFactor: 0,
        interactive: false,
        pane: 'ptwOverlay',
        className: style.className || '',
      }).addTo(layer);
    });
  }

  function ensureOverlayEls() {
    const wrap = document.getElementById(containerId)?.parentElement;
    if (!wrap) return null;

    if (!routeSvg || !routeSvg.isConnected) {
      routeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      routeSvg.classList.add('ptw-route-overlay');
      routeSvg.setAttribute('aria-hidden', 'true');
      routePathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      routePathEl.classList.add('ptw-route-overlay__path');
      routePathEl.setAttribute('fill', 'none');
      routePathEl.setAttribute('stroke', ROUTE_BLUE);
      routePathEl.setAttribute('stroke-width', '1.5');
      routePathEl.setAttribute('stroke-linecap', 'round');
      routePathEl.setAttribute('stroke-linejoin', 'round');
      routePathEl.setAttribute('vector-effect', 'non-scaling-stroke');
      routeSvg.appendChild(routePathEl);
      wrap.appendChild(routeSvg);
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

  function syncRouteOverlay() {
    ensureOverlayEls();
    if (!routeSvg || !routePathEl || !map) return;

    const size = map.getSize();
    routeSvg.setAttribute('width', String(size.x));
    routeSvg.setAttribute('height', String(size.y));
    routeSvg.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);

    if (!activeRouteSegs || !activeRouteSegs.length) {
      routePathEl.setAttribute('d', '');
      routeSvg.style.opacity = '0';
      return;
    }

    const parts = [];
    activeRouteSegs.forEach((seg) => {
      if (!seg || seg.length < 2) return;
      seg.forEach((ll, idx) => {
        const pt = map.latLngToContainerPoint(ll);
        if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
        parts.push(`${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
      });
    });

    routePathEl.setAttribute('d', parts.join(' '));
    routeSvg.style.opacity = parts.length ? '1' : '0';
  }

  function syncPlaneOverlay() {
    ensureOverlayEls();
    if (!planeEl || !map || !planeLatLng) {
      if (planeEl) planeEl.style.opacity = '0';
      return;
    }
    const pt = map.latLngToContainerPoint(planeLatLng);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      planeEl.style.opacity = '0';
      return;
    }
    planeEl.style.opacity = '1';
    planeEl.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px) rotate(${planeBearing}deg)`;
  }

  function syncOverlays() {
    syncRouteOverlay();
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

  /** Default world framing — only on enter / leave / refresh, never while user is zoomed. */
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

  function stopTravelAnimation() {
    if (animRaf) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
  }

  function tickTravel() {
    animRaf = null;
    if (!map || !travelSegs) return;

    const progress = travelProgress();
    const pos = interpolateAlong(travelSegs, progress);
    if (pos) {
      setPlane(pos, bearingAlong(travelSegs, progress));
      // Follow the plane only while still in default world framing.
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
      } catch { /* ignore UI errors */ }
    }

    if (progress < 1) {
      animRaf = requestAnimationFrame(tickTravel);
    }
  }

  function startTravelAnimation(segs, departureAt, arrivalAt) {
    travelSegs = segs;
    activeRouteSegs = segs;
    travelDepartMs = new Date(departureAt).getTime();
    travelArriveMs = new Date(arrivalAt).getTime();
    stopTravelAnimation();
    lastCenterSync = 0;
    syncRouteOverlay();
    animRaf = requestAnimationFrame(tickTravel);
  }

  function clearActiveRoute() {
    activeRouteSegs = null;
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
    routeLayer = L.layerGroup().addTo(map);
    inviteLayer = L.layerGroup().addTo(map);
    cityMarkers = L.layerGroup().addTo(map);

    ensureOverlayEls();
    map.on('zoomend move moveend zoom viewreset', syncOverlays);
    map.on('zoomend', () => {
      markUserZoom();
      syncInteraction();
    });
    map.on('zoomstart', markUserZoom);

    requestAnimationFrame(() => {
      frameOnPlane({ animate: false, force: true });
      setTimeout(() => frameOnPlane({ animate: false, force: true }), 100);
    });

    return map;
  }

  function renderJourney(payload = {}) {
    if (!map || !routeLayer) return;
    const { itinerary = [], journey = {} } = payload;

    if (journey.serverNow) {
      setServerSkew(Date.now() - new Date(journey.serverNow).getTime());
    }

    historyLayer.clearLayers();
    routeLayer.clearLayers();
    cityMarkers.clearLayers();

    for (let i = 1; i < itinerary.length; i += 1) {
      const prev = itinerary[i - 1];
      const curr = itinerary[i];
      if (prev.latitude == null || curr.latitude == null) continue;
      const isCurrent = journey.status === 'TRAVELLING'
        && journey.destination
        && curr.city === journey.destination.city
        && curr.country === journey.destination.country;
      if (isCurrent) continue;
      const segs = greatCirclePoints(
        [prev.latitude, prev.longitude],
        [curr.latitude, curr.longitude],
        HISTORY_STEPS
      );
      drawArc(segs, {
        color: 'rgba(78, 197, 232, 0.22)',
        weight: 0.9,
        opacity: 1,
        className: 'ptw-route-history',
      }, historyLayer);
    }

    const parked = journey.status === 'TRAVELLING'
      ? null
      : journey.current;
    if (parked?.latitude != null) {
      L.marker([parked.latitude, parked.longitude], {
        icon: cityDotIcon('current'),
        interactive: false,
        keyboard: false,
        pane: 'ptwOverlay',
      }).addTo(cityMarkers);
    }

    if (
      journey.status === 'TRAVELLING'
      && journey.origin
      && journey.destination
      && journey.departureAt
      && journey.arrivalAt
    ) {
      const from = [journey.origin.latitude, journey.origin.longitude];
      const to = [journey.destination.latitude, journey.destination.longitude];
      const segs = greatCirclePoints(from, to, ROUTE_STEPS);

      L.marker(from, {
        icon: cityDotIcon('origin'),
        interactive: false,
        pane: 'ptwOverlay',
      }).addTo(cityMarkers);
      L.marker(to, {
        icon: cityDotIcon('destination'),
        interactive: false,
        pane: 'ptwOverlay',
      }).addTo(cityMarkers);

      startTravelAnimation(segs, journey.departureAt, journey.arrivalAt);
      const progress = travelProgress();
      const planePos = interpolateAlong(segs, progress) || from;
      setPlane(planePos, bearingAlong(segs, progress));
    } else {
      stopTravelAnimation();
      travelSegs = null;
      travelDepartMs = null;
      travelArriveMs = null;
      clearActiveRoute();
      if (journey.current?.latitude != null) {
        setPlane([journey.current.latitude, journey.current.longitude], 0);
      } else if (parked?.latitude != null) {
        setPlane([parked.latitude, parked.longitude], 0);
      } else {
        setPlane(FALLBACK_CENTER, 0);
      }
    }

    renderInvites(
      journey.status === 'INVITATION_OPEN' ? (journey.invitedCities || []) : []
    );

    // Keep the user's zoom if they pinched/double-tapped; only frame on first paint.
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
      if (city.latitude == null || city.longitude == null) return;
      L.marker([city.latitude, city.longitude], {
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
    if (map) {
      map.off('zoomend move moveend zoom viewreset', syncOverlays);
      map.off('zoomstart', markUserZoom);
      map.remove();
      map = null;
    }
    if (planeEl) {
      planeEl.remove();
      planeEl = null;
    }
    if (routeSvg) {
      routeSvg.remove();
      routeSvg = null;
      routePathEl = null;
    }
    routeLayer = null;
    historyLayer = null;
    inviteLayer = null;
    cityMarkers = null;
    planeLatLng = null;
    planeBearing = 0;
    travelSegs = null;
    activeRouteSegs = null;
    travelDepartMs = null;
    travelArriveMs = null;
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
