/**
 * Pass the World — map layer (same basemap as Map tab, no city pins).
 * Default framing: zoomed-out world, always centered on the plane.
 */
const PassTheWorldMap = (() => {
  // Used only to derive a stable zoomed-out zoom level.
  const WORLD_BOUNDS = [[-85, -170], [84, 179]];
  const FALLBACK_CENTER = [41.5518, -8.4229]; // Braga seed

  let map = null;
  let routeLayer = null;
  let historyLayer = null;
  let inviteLayer = null;
  let planeMarker = null;
  let cityMarkers = null;
  let containerId = 'ptw-map';
  let focusLatLng = FALLBACK_CENTER.slice();
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

  function planeIcon(bearing = 0) {
    // ✈ glyph points roughly NE; offset so bearing 0° is north.
    const rot = Number(bearing) - 45;
    return L.divIcon({
      className: 'ptw-plane-icon',
      html: `<span class="ptw-plane" style="transform: rotate(${rot}deg)" aria-hidden="true">✈</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
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

  function setFocus(lat, lng) {
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return;
    }
    focusLatLng = [Number(lat), Number(lng)];
  }

  function resolveWorldZoom() {
    if (!map) return 1;
    // Recalculate for current container size so fullscreen vs card both stay zoomed-out.
    const bounds = L.latLngBounds(WORLD_BOUNDS);
    const z = map.getBoundsZoom(bounds, false, L.point(2, 2));
    if (!Number.isFinite(z)) return lockedWorldZoom || 1;
    lockedWorldZoom = z;
    return z;
  }

  /** Zoomed-out world look, always centered on the plane (or current city). */
  function frameOnPlane({ animate = false } = {}) {
    if (!map) return;
    map.invalidateSize({ animate: false, pan: false });
    if (typeof map.stop === 'function') map.stop();

    const zoom = resolveWorldZoom();
    const center = focusLatLng || FALLBACK_CENTER;
    map.setView(center, zoom, { animate: !!animate, reset: true });

    if (map.getZoom() <= 1.85) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }

  // Back-compat alias used by Pass the World UI.
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

    historyLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    inviteLayer = L.layerGroup().addTo(map);
    cityMarkers = L.layerGroup().addTo(map);

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
        }).addTo(historyLayer);
      });
    }

    const current = journey.destination && journey.status === 'TRAVELLING'
      ? null
      : journey.current;
    if (current?.latitude != null) {
      L.marker([current.latitude, current.longitude], {
        icon: cityDotIcon('current'),
        interactive: false,
        keyboard: false,
      }).addTo(cityMarkers);
    }

    let planePos = null;

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
        }).addTo(routeLayer);
      });

      L.marker(from, { icon: cityDotIcon('origin'), interactive: false }).addTo(cityMarkers);
      L.marker(to, { icon: cityDotIcon('destination'), interactive: false }).addTo(cityMarkers);

      const progress = Number(journey.progress?.progress) || 0;
      planePos = interpolateAlong(segs, progress) || from;
      const bearing = bearingAlong(segs, progress);
      if (planeMarker) {
        try { routeLayer.removeLayer(planeMarker); } catch { /* */ }
        try { cityMarkers.removeLayer(planeMarker); } catch { /* */ }
        planeMarker = null;
      }
      planeMarker = L.marker(planePos, {
        icon: planeIcon(bearing),
        interactive: false,
        keyboard: false,
      }).addTo(routeLayer);
    } else if (current?.latitude != null) {
      planePos = [current.latitude, current.longitude];
      if (planeMarker) {
        try { routeLayer.removeLayer(planeMarker); } catch { /* */ }
        try { cityMarkers.removeLayer(planeMarker); } catch { /* */ }
        planeMarker = null;
      }
      planeMarker = L.marker(planePos, {
        icon: planeIcon(0),
        interactive: false,
        keyboard: false,
      }).addTo(cityMarkers);
    }

    if (planePos) setFocus(planePos[0], planePos[1]);
    else if (current?.latitude != null) setFocus(current.latitude, current.longitude);

    renderInvites(journey.invitedCities || []);
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
      }).addTo(inviteLayer);
    });
  }

  function invalidateSize() {
    if (!map) return;
    map.invalidateSize({ animate: false, pan: false });
  }

  function destroy() {
    if (map) {
      map.remove();
      map = null;
    }
    routeLayer = null;
    historyLayer = null;
    inviteLayer = null;
    cityMarkers = null;
    planeMarker = null;
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
