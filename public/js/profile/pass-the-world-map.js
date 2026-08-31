/**
 * Pass the World — map layer (same basemap as Map tab, no city pins).
 */
const PassTheWorldMap = (() => {
  const WORLD_BOUNDS = [[-56, -168], [72, 178]];
  const WORLD_CENTER = [18, 10];

  let map = null;
  let routeLayer = null;
  let historyLayer = null;
  let inviteLayer = null;
  let planeMarker = null;
  let cityMarkers = null;
  let containerId = 'ptw-map';

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

  function planeIcon() {
    return L.divIcon({
      className: 'ptw-plane-icon',
      html: '<span class="ptw-plane" aria-hidden="true">✈</span>',
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

  function fitFullWorld({ animate = false } = {}) {
    if (!map) return;
    map.invalidateSize({ animate: false, pan: false });
    map.fitBounds(WORLD_BOUNDS, {
      animate,
      padding: [8, 8],
      maxZoom: 4,
    });
    // Keep the world centered; lock pan at this framing.
    const z = map.getZoom();
    if (z <= 1.35) {
      map.setView(WORLD_CENTER, z, { animate: false });
      map.dragging.disable();
    }
  }

  function syncInteraction() {
    if (!map) return;
    if (map.getZoom() <= 1.4) {
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
      center: WORLD_CENTER,
      zoom: 1,
      minZoom: 0.75,
      maxZoom: 8,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      fadeAnimation: false,
      zoomAnimation: true,
    });

    // Same basemap stack as Map tab (no city light pins here).
    if (typeof WorldChoirMapTiles !== 'undefined') {
      WorldChoirMapTiles.addBasemapLayers(map);
    }

    historyLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    inviteLayer = L.layerGroup().addTo(map);
    cityMarkers = L.layerGroup().addTo(map);

    map.on('zoomend', syncInteraction);

    requestAnimationFrame(() => {
      fitFullWorld({ animate: false });
      setTimeout(() => fitFullWorld({ animate: false }), 80);
      setTimeout(() => fitFullWorld({ animate: false }), 220);
    });

    return map;
  }

  function resetWorldView() {
    fitFullWorld({ animate: true });
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
      const pos = interpolateAlong(segs, progress) || from;
      if (planeMarker) {
        try { routeLayer.removeLayer(planeMarker); } catch { /* */ }
        try { cityMarkers.removeLayer(planeMarker); } catch { /* */ }
        planeMarker = null;
      }
      planeMarker = L.marker(pos, {
        icon: planeIcon(),
        interactive: false,
        keyboard: false,
      }).addTo(routeLayer);
    } else if (current?.latitude != null) {
      if (planeMarker) {
        try { routeLayer.removeLayer(planeMarker); } catch { /* */ }
        try { cityMarkers.removeLayer(planeMarker); } catch { /* */ }
        planeMarker = null;
      }
      planeMarker = L.marker([current.latitude, current.longitude], {
        icon: planeIcon(),
        interactive: false,
        keyboard: false,
      }).addTo(cityMarkers);
    }

    renderInvites(journey.invitedCities || []);
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
  }

  return {
    mount,
    destroy,
    renderJourney,
    renderInvites,
    resetWorldView,
    fitFullWorld,
    invalidateSize,
  };
})();
