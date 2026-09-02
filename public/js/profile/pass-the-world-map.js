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
  let inviteOverlayLayer = null;
  let inviteDotEls = [];
  let revealAnim = null;
  let revealAnimKey = '';
  let inviteOpenKey = '';
  let planeEl = null;
  let destEl = null;
  let originEl = null;
  let routeSvg = null;
  let routeGlowEl = null;
  let routePathEl = null;
  let containerId = 'ptw-map';
  let focusLatLng = FALLBACK_CENTER.slice();
  let planeLatLng = null;
  let planeBearing = 0;
  let planeProgress = 0;
  let destLatLng = null;
  let originLatLng = null;
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
  let interactRaf = null;
  let interacting = false;
  let animFrame = null; // { center, zoom } during zoomanim

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

  function cityKey(city) {
    if (city?.inviteId) return `inv:${city.inviteId}`;
    if (city?.userId) return `user:${city.userId}`;
    const country = String(city?.country || '').trim().toLowerCase();
    const name = String(city?.city || '').trim().toLowerCase();
    return `${country}|${name}`;
  }

  /** Spread overlapping invite dots so every user light is visible. */
  function offsetInviteLatLng(ll, index, total) {
    if (!ll || total <= 1) return ll;
    const angle = (index / total) * Math.PI * 2;
    const radius = 0.045; // ~a few km — enough to separate stacked dots
    return [
      ll[0] + Math.sin(angle) * radius,
      ll[1] + Math.cos(angle) * radius,
    ];
  }

  function ensureInviteOverlayLayer() {
    const wrap = document.getElementById(containerId)?.parentElement;
    if (!wrap) return null;
    if (!inviteOverlayLayer || !inviteOverlayLayer.isConnected) {
      inviteOverlayLayer = document.createElement('div');
      inviteOverlayLayer.className = 'ptw-invite-overlay-layer';
      inviteOverlayLayer.setAttribute('aria-hidden', 'true');
      wrap.appendChild(inviteOverlayLayer);
    }
    return inviteOverlayLayer;
  }

  function stopRevealAnimation() {
    if (revealAnim?.raf) {
      cancelAnimationFrame(revealAnim.raf);
    }
    revealAnim = null;
    revealAnimKey = '';
  }

  function clearInviteDots() {
    stopRevealAnimation();
    inviteDotEls = [];
    if (inviteOverlayLayer) inviteOverlayLayer.innerHTML = '';
  }

  function syncInviteDots(frame) {
    if (!inviteDotEls.length) return;
    inviteDotEls.forEach(({ el, latlng }) => {
      const pt = project(latlng, frame);
      if (!pt) {
        el.style.opacity = '0';
        return;
      }
      const scale = el.dataset.scale || '1';
      el.style.opacity = el.dataset.visible === '0' ? '0' : '1';
      el.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px) scale(${scale})`;
    });
  }

  function renderInvitationDots(cities, { mode = 'open' } = {}) {
    clearInviteDots();
    if (inviteLayer) inviteLayer.clearLayers();
    const layer = ensureInviteOverlayLayer();
    if (!layer) return;
    const list = cities || [];
    list.forEach((city, index) => {
      const base = readLatLng(city);
      if (!base) return;
      const ll = offsetInviteLatLng(base, index, list.length);
      const el = document.createElement('span');
      el.className = mode === 'open'
        ? 'ptw-invite-dot ptw-invite-dot--open'
        : 'ptw-invite-dot ptw-invite-dot--reveal ptw-invite-dot--lit';
      el.dataset.cityKey = cityKey(city);
      el.dataset.visible = '1';
      el.dataset.scale = '1';
      layer.appendChild(el);
      inviteDotEls.push({ key: cityKey(city), el, latlng: ll });
    });
    syncInviteDots(animFrame);
  }

  /**
   * Reveal suspense — every invite light keeps blinking independently
   * on its own random rhythm (about once per second). No lights are removed.
   */
  function startRevealAnimation(cities, startMs, endMs) {
    const key = `${startMs}|${endMs}|${(cities || []).map(cityKey).join(';')}`;
    if (revealAnim && revealAnimKey === key) return;
    stopRevealAnimation();
    renderInvitationDots(cities, { mode: 'reveal' });
    const keys = inviteDotEls.map((d) => d.key);
    const n = keys.length;
    if (!n) return;

    revealAnimKey = key;
    const nextFlipByKey = {};
    const now0 = nowMs();
    keys.forEach((k, i) => {
      // Stagger first flips so dots don't blink in sync.
      nextFlipByKey[k] = now0 + 120 + i * 90 + Math.random() * 400;
    });
    revealAnim = {
      startMs,
      endMs,
      keys,
      lit: new Set(keys),
      nextFlipByKey,
      raf: null,
    };

    const applyVisibility = () => {
      inviteDotEls.forEach(({ key: k, el }) => {
        const lit = revealAnim.lit.has(k);
        el.dataset.visible = lit ? '1' : '0';
        el.classList.toggle('ptw-invite-dot--lit', lit);
        el.classList.toggle('ptw-invite-dot--dim', !lit);
      });
    };

    const tick = () => {
      if (!revealAnim || !map) return;
      const now = nowMs();

      if (now < revealAnim.endMs) {
        let changed = false;
        revealAnim.keys.forEach((k) => {
          if (now < revealAnim.nextFlipByKey[k]) return;
          // Blink every ~0.55–1.15s with independent random timing per light.
          revealAnim.nextFlipByKey[k] = now + 550 + Math.random() * 600;
          if (revealAnim.lit.has(k)) revealAnim.lit.delete(k);
          else revealAnim.lit.add(k);
          changed = true;
        });
        // Never leave every light off at once during reveal.
        if (revealAnim.lit.size === 0 && revealAnim.keys.length) {
          const pick = revealAnim.keys[Math.floor(Math.random() * revealAnim.keys.length)];
          revealAnim.lit.add(pick);
          changed = true;
        }
        if (changed) applyVisibility();
      }

      syncInviteDots(animFrame);
      if (now < revealAnim.endMs + 400) {
        revealAnim.raf = requestAnimationFrame(tick);
      } else {
        // End of reveal: show all invite lights briefly, then travel starts.
        revealAnim.lit = new Set(revealAnim.keys);
        applyVisibility();
        stopRevealAnimation();
      }
    };

    applyVisibility();
    revealAnim.raf = requestAnimationFrame(tick);
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

    if (!originEl || !originEl.isConnected) {
      originEl = document.createElement('div');
      originEl.className = 'ptw-stop-overlay ptw-stop-overlay--origin';
      originEl.setAttribute('aria-hidden', 'true');
      originEl.innerHTML = '<span class="ptw-stop-overlay__dot"></span>';
      wrap.appendChild(originEl);
    }

    if (!destEl || !destEl.isConnected) {
      destEl = document.createElement('button');
      destEl.type = 'button';
      destEl.className = 'ptw-stop-overlay ptw-stop-overlay--dest';
      destEl.setAttribute('aria-label', 'Destination');
      destEl.innerHTML = `
        <span class="ptw-stop-overlay__dot"></span>
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

  function project(ll, frame) {
    if (!map || !ll) return null;
    const latlng = L.latLng(ll[0], ll[1]);
    let pt;
    if (frame && frame.center != null && frame.zoom != null && typeof map.project === 'function') {
      // Match Leaflet's mid-zoom transform so overlays never slip during pinch/zoomanim.
      const layerPoint = map.project(latlng, frame.zoom)
        ._subtract(map._getNewPixelOrigin(frame.center, frame.zoom));
      const panePos = map._getMapPanePos ? map._getMapPanePos() : L.point(0, 0);
      pt = layerPoint.add(panePos);
    } else {
      pt = map.latLngToContainerPoint(latlng);
    }
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
    return pt;
  }

  /** Screen-space quadratic point — same math as the SVG route path. */
  function quadPoint(a, c, b, t) {
    const u = 1 - t;
    return {
      x: (u * u * a.x) + (2 * u * t * c.x) + (t * t * b.x),
      y: (u * u * a.y) + (2 * u * t * c.y) + (t * t * b.y),
    };
  }

  /** Bearing for an up-pointing plane icon following the screen curve. */
  function quadBearing(a, c, b, t) {
    const u = 1 - t;
    const dx = (2 * u * (c.x - a.x)) + (2 * t * (b.x - c.x));
    const dy = (2 * u * (c.y - a.y)) + (2 * t * (b.y - c.y));
    if (!dx && !dy) return planeBearing || 0;
    return ((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
  }

  /** Single SVG quadratic — perfectly smooth at every zoom. */
  function syncRouteOverlay(frame) {
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

    const a = project(routeCurve.from, frame);
    const c = project(routeCurve.control, frame);
    const b = project(routeCurve.to, frame);
    if (!a || !c || !b) {
      routeSvg.style.opacity = '0';
      return;
    }

    const d = `M${a.x.toFixed(2)} ${a.y.toFixed(2)} Q${c.x.toFixed(2)} ${c.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
    routeGlowEl.setAttribute('d', d);
    routePathEl.setAttribute('d', d);
    routeSvg.style.opacity = '1';
  }

  function syncPlaneOverlay(frame) {
    ensureOverlayEls();
    if (!planeEl || !map) {
      if (planeEl) planeEl.style.opacity = '0';
      return;
    }

    // While travelling, sit exactly on the visible SVG curve (screen-space Q).
    if (routeCurve) {
      const a = project(routeCurve.from, frame);
      const c = project(routeCurve.control, frame);
      const b = project(routeCurve.to, frame);
      if (!a || !c || !b) {
        planeEl.style.opacity = '0';
        return;
      }
      const t = Math.max(0, Math.min(1, planeProgress));
      const pt = quadPoint(a, c, b, t);
      planeBearing = quadBearing(a, c, b, t);
      planeEl.style.opacity = '1';
      planeEl.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px) rotate(${planeBearing}deg)`;
      return;
    }

    if (!planeLatLng) {
      planeEl.style.opacity = '0';
      return;
    }
    const pt = project(planeLatLng, frame);
    if (!pt) {
      planeEl.style.opacity = '0';
      return;
    }
    planeEl.style.opacity = '1';
    planeEl.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px) rotate(${planeBearing}deg)`;
  }

  function syncOriginOverlay(frame) {
    ensureOverlayEls();
    if (!originEl || !map || !originLatLng) {
      if (originEl) originEl.style.opacity = '0';
      return;
    }
    const pt = project(originLatLng, frame);
    if (!pt) {
      originEl.style.opacity = '0';
      return;
    }
    originEl.style.opacity = '1';
    originEl.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px)`;
  }

  function syncDestOverlay(frame) {
    ensureOverlayEls();
    if (!destEl || !map || !destLatLng) {
      if (destEl) destEl.style.opacity = '0';
      return;
    }
    const pt = project(destLatLng, frame);
    if (!pt) {
      destEl.style.opacity = '0';
      return;
    }
    destEl.style.opacity = '1';
    destEl.style.transform = `translate(-50%, -50%) translate(${pt.x}px, ${pt.y}px)`;
    refreshDestPopupContent();
  }

  function syncOverlays(frame) {
    const f = frame || animFrame;
    syncRouteOverlay(f);
    syncOriginOverlay(f);
    syncDestOverlay(f);
    syncPlaneOverlay(f);
    syncInviteDots(f);
  }

  function stopInteractLoop() {
    interacting = false;
    animFrame = null;
    if (interactRaf) {
      cancelAnimationFrame(interactRaf);
      interactRaf = null;
    }
  }

  function startInteractLoop() {
    if (interacting) return;
    interacting = true;
    const tick = () => {
      interactRaf = null;
      if (!map || !interacting) return;
      syncOverlays(animFrame);
      interactRaf = requestAnimationFrame(tick);
    };
    interactRaf = requestAnimationFrame(tick);
  }

  function onZoomAnim(e) {
    animFrame = { center: e.center, zoom: e.zoom };
    syncOverlays(animFrame);
  }

  function onInteractStart() {
    markUserZoom();
    startInteractLoop();
  }

  function onInteractEnd() {
    animFrame = null;
    stopInteractLoop();
    markUserZoom();
    syncInteraction();
  }

  function setPlane(latlng, bearing = 0) {
    if (!latlng || latlng[0] == null || latlng[1] == null) {
      planeLatLng = null;
      planeProgress = 0;
      syncPlaneOverlay();
      return;
    }
    planeLatLng = [Number(latlng[0]), Number(latlng[1])];
    if (!routeCurve) planeBearing = Number(bearing) || 0;
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

  function setOrigin(latlng) {
    originLatLng = latlng ? [Number(latlng[0]), Number(latlng[1])] : null;
    if (!originLatLng) {
      if (originEl) originEl.style.opacity = '0';
      return;
    }
    syncOriginOverlay();
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
    if (!map || !travelPts || !routeCurve) return;

    const progress = travelProgress();
    planeProgress = progress;
    // Geo sample only for map centering / focus — the plane itself rides the SVG curve.
    const pos = interpolateAlong(travelPts, progress);
    if (pos) {
      planeLatLng = [Number(pos[0]), Number(pos[1])];
      setFocus(planeLatLng[0], planeLatLng[1]);
      syncPlaneOverlay(animFrame);
      if (!userHasZoomed) {
        const t = performance.now();
        if (t - lastCenterSync > 800) {
          lastCenterSync = t;
          map.setView(pos, map.getZoom(), { animate: false });
          syncOverlays(animFrame);
        }
      }
    } else {
      syncPlaneOverlay(animFrame);
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
    planeProgress = travelProgress();
    stopTravelAnimation();
    lastCenterSync = 0;
    syncRouteOverlay();
    syncPlaneOverlay();
    animRaf = requestAnimationFrame(tickTravel);
  }

  function clearTravel() {
    stopTravelAnimation();
    routeCurve = null;
    travelPts = null;
    travelDepartMs = null;
    travelArriveMs = null;
    planeProgress = 0;
    setOrigin(null);
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
      zoomAnimation: false,
      markerZoomAnimation: false,
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
    map.on('move zoom viewreset', syncOverlays);
    map.on('zoomanim', onZoomAnim);
    map.on('zoomstart movestart', onInteractStart);
    map.on('zoomend moveend', onInteractEnd);
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
    if (inviteLayer) inviteLayer.clearLayers();

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
      clearInviteDots();
      const from = readLatLng(journey.origin);
      const to = readLatLng(journey.destination);
      if (!from || !to) return;

      const curve = buildCurve(from, to, ROUTE_STEPS);
      setOrigin(curve.from);
      setDestination(curve.to, journey.destination, journey.arrivalAt);
      startTravel(curve, journey.departureAt, journey.arrivalAt);

      const progress = travelProgress();
      planeProgress = progress;
      const planePos = interpolateAlong(curve.points, progress) || from;
      planeLatLng = planePos;
      setFocus(planePos[0], planePos[1]);
      syncPlaneOverlay();
    } else if (journey.status === 'INVITATION_OPEN') {
      clearTravel();
      const current = readLatLng(journey.current) || FALLBACK_CENTER;
      setPlane(current, 0);
      const openKey = (journey.invitedCities || []).map(cityKey).sort().join(';');
      if (openKey !== inviteOpenKey) {
        inviteOpenKey = openKey;
        renderInvitationDots(journey.invitedCities || [], { mode: 'open' });
      } else {
        syncInviteDots(animFrame);
      }
    } else if (journey.status === 'REVEAL_PENDING') {
      inviteOpenKey = '';
      clearTravel();
      const current = readLatLng(journey.current) || FALLBACK_CENTER;
      setPlane(current, 0);
      const startMs = new Date(journey.revealStartAt || journey.invitationCloseAt).getTime();
      const endMs = new Date(journey.revealEndAt).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
        startRevealAnimation(journey.invitedCities || [], startMs, endMs);
      } else {
        renderInvitationDots(journey.invitedCities || [], { mode: 'reveal' });
      }
    } else {
      clearInviteDots();
      inviteOpenKey = '';
      clearTravel();
      const current = readLatLng(journey.current) || FALLBACK_CENTER;
      setPlane(current, 0);
    }

    if (!userHasZoomed) {
      frameOnPlane({ animate: false });
    } else {
      syncOverlays();
      syncInteraction();
    }
  }

  function renderInvites(cities) {
    renderInvitationDots(cities, { mode: 'open' });
  }

  function invalidateSize() {
    if (!map) return;
    map.invalidateSize({ animate: false, pan: false });
    syncOverlays();
  }

  function destroy() {
    stopTravelAnimation();
    stopEtaTimer();
    stopInteractLoop();
    stopRevealAnimation();
    if (map) {
      map.off('move zoom viewreset', syncOverlays);
      map.off('zoomanim', onZoomAnim);
      map.off('zoomstart movestart', onInteractStart);
      map.off('zoomend moveend', onInteractEnd);
      map.remove();
      map = null;
    }
    if (planeEl) { planeEl.remove(); planeEl = null; }
    if (originEl) { originEl.remove(); originEl = null; }
    if (destEl) { destEl.remove(); destEl = null; }
    if (routeSvg) {
      routeSvg.remove();
      routeSvg = null;
      routePathEl = null;
      routeGlowEl = null;
    }
    if (inviteOverlayLayer) {
      inviteOverlayLayer.remove();
      inviteOverlayLayer = null;
    }
    inviteDotEls = [];
    historyLayer = null;
    inviteLayer = null;
    planeLatLng = null;
    originLatLng = null;
    destLatLng = null;
    planeBearing = 0;
    planeProgress = 0;
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
