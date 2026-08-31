/**
 * Pass the World — map layer (same basemap as Map tab, no city pins).
 * Plane is an HTML overlay above Leaflet/MapLibre so it always stays visible.
 */
const PassTheWorldMap = (() => {
  const WORLD_BOUNDS = [[-85, -170], [84, 179]];
  const FALLBACK_CENTER = [41.5518, -8.4229]; // Braga seed

  let map = null;
  let routeLayer = null;
  let historyLayer = null;
  let inviteLayer = null;
  let cityMarkers = null;
  let planeEl = null;
  let containerId = 'ptw-map';
  let focusLatLng = FALLBACK_CENTER.slice();
  let planeLatLng = null;
  let planeBearing = 0;
  let lockedWorldZoom = null;

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

  function ensurePlaneEl() {
    const wrap = document.getElementById(containerId)?.parentElement;
    if (!wrap) return null;
    if (planeEl && planeEl.isConnected) return planeEl;
    planeEl = document.createElement('div');
    planeEl.className = 'ptw-plane-overlay';
    planeEl.setAttribute('aria-hidden', 'true');
    planeEl.innerHTML = `
      <span class="ptw-plane-overlay__glow"></span>
      <svg class="ptw-plane-overlay__icon" viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path fill="currentColor" d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>`;
    wrap.appendChild(planeEl);
    return planeEl;
  }

  function syncPlaneOverlay() {
    const el = ensurePlaneEl();
    if (!el || !map || !planeLatLng) {
      if (el) el.style.opacity = '0';
      return;
    }
    const pt = map.latLngToContainerPoint(planeLatLng);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = '1';
    el.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px) rotate(${planeBearing}deg)`;
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

  function frameOnPlane({ animate = false } = {}) {
    if (!map) return;
    map.invalidateSize({ animate: false, pan: false });
    if (typeof map.stop === 'function') map.stop();

    const zoom = resolveWorldZoom();
    const center = focusLatLng || FALLBACK_CENTER;
    map.setView(center, zoom, { animate: !!animate, reset: true });
    syncPlaneOverlay();

    if (map.getZoom() <= 1.85) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }

  function fitFullWorld(opts) {
    frameOnPlane(opts);
  }

  function syncInteraction() {
    if (!map) return;
    if (map.getZoom() <= 1.85) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
    syncPlaneOverlay();
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
      scrollWheelZoom: false,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      fadeAnimation: false,
      zoomAnimation: false,
    });

    if (typeof WorldChoirMapTiles !== 'undefined') {
      WorldChoirMapTiles.addBasemapLayers(map);
    }

    // Dedicated high pane so route/city dots sit above MapLibre canvas.
    if (!map.getPane('ptwOverlay')) {
      const pane = map.createPane('ptwOverlay');
      pane.style.zIndex = 650;
      pane.style.pointerEvents = 'none';
    }

    historyLayer = L.layerGroup([], { pane: 'ptwOverlay' }).addTo(map);
    routeLayer = L.layerGroup([], { pane: 'ptwOverlay' }).addTo(map);
    inviteLayer = L.layerGroup([], { pane: 'ptwOverlay' }).addTo(map);
    cityMarkers = L.layerGroup([], { pane: 'ptwOverlay' }).addTo(map);

    ensurePlaneEl();
    map.on('zoomend move moveend zoom viewreset', syncPlaneOverlay);
    map.on('zoomend', syncInteraction);

    requestAnimationFrame(() => {
      frameOnPlane({ animate: false });
      setTimeout(() => frameOnPlane({ animate: false }), 100);
    });

    return map;
  }

  function resetWorldView() {
    frameOnPlane({ animate: false });
  }

  function renderJourney(payload = {}) {
    if (!map || !routeLayer) return;
    const { itinerary = [], journey = {} } = payload;
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
        48
      );
      segs.forEach((seg) => {
        if (seg.length < 2) return;
        L.polyline(seg, {
          color: 'rgba(255,255,255,0.18)',
          weight: 1.25,
          opacity: 1,
          interactive: false,
          pane: 'ptwOverlay',
        }).addTo(historyLayer);
      });
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

    if (journey.status === 'TRAVELLING' && journey.origin && journey.destination) {
      const from = [journey.origin.latitude, journey.origin.longitude];
      const to = [journey.destination.latitude, journey.destination.longitude];
      const segs = greatCirclePoints(from, to, 72);
      segs.forEach((seg) => {
        if (seg.length < 2) return;
        L.polyline(seg, {
          color: 'rgba(255,255,255,0.92)',
          weight: 2,
          opacity: 1,
          interactive: false,
          pane: 'ptwOverlay',
        }).addTo(routeLayer);
      });

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

      const progress = Number(journey.progress?.progress) || 0;
      const planePos = interpolateAlong(segs, progress) || from;
      setPlane(planePos, bearingAlong(segs, progress));
    } else if (journey.current?.latitude != null) {
      setPlane([journey.current.latitude, journey.current.longitude], 0);
    } else if (parked?.latitude != null) {
      setPlane([parked.latitude, parked.longitude], 0);
    } else {
      setPlane(FALLBACK_CENTER, 0);
    }

    // Invite lights only during the 60-second ritual window.
    renderInvites(
      journey.status === 'INVITATION_OPEN' ? (journey.invitedCities || []) : []
    );
    frameOnPlane({ animate: false });
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
    syncPlaneOverlay();
  }

  function destroy() {
    if (map) {
      map.off('zoomend move moveend zoom viewreset', syncPlaneOverlay);
      map.off('zoomend', syncInteraction);
      map.remove();
      map = null;
    }
    if (planeEl) {
      planeEl.remove();
      planeEl = null;
    }
    routeLayer = null;
    historyLayer = null;
    inviteLayer = null;
    cityMarkers = null;
    planeLatLng = null;
    planeBearing = 0;
    lockedWorldZoom = null;
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
  };
})();
