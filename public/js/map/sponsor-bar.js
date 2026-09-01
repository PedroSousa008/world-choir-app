/**
 * Map sponsor bar — public sponsor belt for the World Choir Map header.
 *
 * SponsorBar → SponsorTrack → SponsorLogo
 * Static and conveyor modes share the same slot/logo system.
 */
const MapSponsorBar = (() => {
  const {
    LOGO_HEIGHT_PX,
    LOGO_GAP_PX,
    TRAVERSAL_DURATION_SEC,
    MOBILE_MAX_VISIBLE,
    DESKTOP_MAX_VISIBLE,
    MOBILE_BREAKPOINT_PX,
    SLOT_MIN_WIDTH_PX,
    SLOT_PADDING_X_PX,
    CSS_VARS,
  } = MapSponsorConstants;

  let sponsors = [];
  let rootEl = null;
  let viewportEl = null;
  let trackEl = null;
  let resizeObserver = null;
  let resizeRaf = null;
  let mode = 'hidden'; // hidden | static | animated
  let prefersReducedMotion = false;

  function esc(value) {
    const el = document.createElement('span');
    el.textContent = String(value ?? '');
    return el.innerHTML;
  }

  function getVisibleCapacity() {
    return window.innerWidth <= MOBILE_BREAKPOINT_PX
      ? MOBILE_MAX_VISIBLE
      : DESKTOP_MAX_VISIBLE;
  }

  function shouldAnimate(count = sponsors.length) {
    if (prefersReducedMotion) return false;
    return count > getVisibleCapacity();
  }

  function getHeaderAriaLabel(minimized) {
    if (!sponsors.length) {
      return minimized
        ? 'The Earth Breathes — tap to expand'
        : 'The Earth Breathes — tap to minimize';
    }
    return 'World Choir supported by sponsors';
  }

  function applyHeaderMode(hasSponsors) {
    const defaultBlock = document.getElementById('map-header-default');
    const sponsorBlock = document.getElementById('map-header-sponsor');
    const header = document.getElementById('map-header');

    if (defaultBlock) {
      if (hasSponsors) defaultBlock.setAttribute('hidden', '');
      else defaultBlock.removeAttribute('hidden');
    }
    if (sponsorBlock) {
      if (hasSponsors) sponsorBlock.removeAttribute('hidden');
      else sponsorBlock.setAttribute('hidden', '');
    }

    if (header) {
      if (hasSponsors) {
        header.classList.remove('map-header--minimized');
        header.setAttribute('aria-expanded', 'true');
      } else if (typeof WorldChoirMap !== 'undefined' && WorldChoirMap.restoreMapHeaderFromStorage) {
        WorldChoirMap.restoreMapHeaderFromStorage();
      }
      header.setAttribute('aria-label', getHeaderAriaLabel(
        header.classList.contains('map-header--minimized')
      ));
    }
  }

  function syncHeaderAriaLabel() {
    const header = document.getElementById('map-header');
    if (!header) return;
    const minimized = header.classList.contains('map-header--minimized');
    header.setAttribute('aria-label', getHeaderAriaLabel(minimized));
  }

  function renderSponsorLogo(sponsor) {
    const name = sponsor.companyName;
    const website = sponsor.websiteUrl;
    const fallbackInitial = esc(name.charAt(0).toUpperCase() || '?');
    const logoMarkup = `
      <img
        class="map-sponsor__logo-image"
        src="${esc(sponsor.logo)}"
        alt="${esc(name)}"
        loading="lazy"
        decoding="async"
        draggable="false"
      >
      <span class="map-sponsor__logo-fallback" aria-hidden="true">${fallbackInitial}</span>
    `;

    if (website) {
      return `
        <a
          class="map-sponsor__logo map-sponsor__logo--linked"
          href="${esc(website)}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit ${esc(name)} website"
          data-sponsor-id="${esc(sponsor.id)}"
        >${logoMarkup}</a>
      `;
    }

    return `
      <span
        class="map-sponsor__logo"
        aria-label="${esc(name)}"
        data-sponsor-id="${esc(sponsor.id)}"
      >${logoMarkup}</span>
    `;
  }

  function renderSponsorSlot(sponsor) {
    return `
      <div class="map-sponsor__slot" data-sponsor-id="${esc(sponsor.id)}">
        ${renderSponsorLogo(sponsor)}
      </div>
    `;
  }

  function renderSequence(items) {
    return items.map(renderSponsorSlot).join('');
  }

  function renderTrackHtml(nextMode) {
    if (nextMode === 'animated') {
      const sequence = renderSequence(sponsors);
      return `
        <div class="map-sponsor__track map-sponsor__track--animated" role="list">
          <div class="map-sponsor__sequence" role="list">${sequence}</div>
          <div class="map-sponsor__sequence map-sponsor__sequence--clone" aria-hidden="true">${sequence}</div>
        </div>
      `;
    }

    return `
      <div
        class="map-sponsor__track map-sponsor__track--static"
        role="list"
        data-count="${sponsors.length}"
      >${renderSequence(sponsors)}</div>
    `;
  }

  function bindLogoInteractions(container) {
    container.querySelectorAll('.map-sponsor__logo--linked').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.stopPropagation();
        const sponsorId = link.getAttribute('data-sponsor-id');
        if (sponsorId) {
          trackSponsorEvent(sponsorId, 'click', {
            destinationUrl: link.getAttribute('href') || null,
          });
        }
      });
    });

    container.querySelectorAll('.map-sponsor__logo-image').forEach((img) => {
      img.addEventListener('error', () => {
        const logo = img.closest('.map-sponsor__logo');
        logo?.classList.add('map-sponsor__logo--broken');
      }, { once: true });
    });

    bindSponsorImpressions(container);
  }

  function getMapVisitorId() {
    const KEY = 'wc_map_visitor_id';
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return `session_${Date.now()}`;
    }
  }

  let impressionObserver = null;
  const impressionStates = new Map();

  function getAnalyticsContext() {
    const eventId = typeof WorldChoirConfig !== 'undefined'
      ? (WorldChoirConfig.ACTIVE_EVENT?.id || 'world-choir-2027')
      : 'world-choir-2027';
    let country = null;
    let city = null;
    let latitude = null;
    let longitude = null;
    try {
      const pledge = typeof WorldChoirDB !== 'undefined'
        ? WorldChoirDB.getPledgeForCurrentUser?.()
        : null;
      if (pledge) {
        country = pledge.country ? String(pledge.country).trim() : null;
        city = pledge.city ? String(pledge.city).trim() : null;
        latitude = Number.isFinite(Number(pledge.latitude)) ? Number(pledge.latitude) : null;
        longitude = Number.isFinite(Number(pledge.longitude)) ? Number(pledge.longitude) : null;
      }

      if ((latitude == null || longitude == null) && city && country
        && typeof WorldChoirDB.getAggregatedCities === 'function') {
        const match = WorldChoirDB.getAggregatedCities().find(
          (entry) => entry.city === city && entry.country === country
        );
        if (match && Number.isFinite(Number(match.latitude)) && Number.isFinite(Number(match.longitude))) {
          latitude = Number(match.latitude);
          longitude = Number(match.longitude);
        }
      }

      if (latitude == null || longitude == null) {
        const user = typeof WorldChoirDB.getCurrentUser === 'function'
          ? WorldChoirDB.getCurrentUser()
          : null;
        if (user) {
          city = city || (user.city ? String(user.city).trim() : null);
          country = country || (user.country ? String(user.country).trim() : null);
          if (Number.isFinite(Number(user.latitude)) && Number.isFinite(Number(user.longitude))) {
            latitude = Number(user.latitude);
            longitude = Number(user.longitude);
          }
        }
      }

      if (latitude == null || longitude == null) {
        try {
          const raw = localStorage.getItem('wc_map_user_home');
          const cached = raw ? JSON.parse(raw) : null;
          if (cached && Number.isFinite(Number(cached.lat)) && Number.isFinite(Number(cached.lng))) {
            latitude = Number(cached.lat);
            longitude = Number(cached.lng);
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    return { eventId, country, city, latitude, longitude };
  }

  function trackSponsorEvent(sponsorId, eventType, extra = {}) {
    if (!sponsorId) return;
    const context = getAnalyticsContext();

    const send = (coords = {}) => {
      const payload = {
        sponsorId,
        eventType,
        visitorId: getMapVisitorId(),
        country: context.country,
        eventId: context.eventId,
        destinationUrl: extra.destinationUrl || null,
      };
      if (eventType === 'click') {
        payload.city = coords.city ?? context.city;
        payload.latitude = coords.latitude ?? context.latitude;
        payload.longitude = coords.longitude ?? context.longitude;
      }
      fetch('/api/map-sponsor-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: eventType === 'click',
        body: JSON.stringify(payload),
      }).catch(() => {});
    };

    if (eventType !== 'click' || (context.latitude != null && context.longitude != null)) {
      send();
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation?.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition(
        (pos) => send({
          city: context.city,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
        () => send(),
        { enableHighAccuracy: false, timeout: 2500, maximumAge: 600000 }
      );
      return;
    }

    send();
  }

  function resetImpressionTracking() {
    impressionStates.forEach((state) => {
      if (state?.timer) clearTimeout(state.timer);
    });
    impressionStates.clear();
    impressionObserver?.disconnect();
    impressionObserver = null;
  }

  function bindSponsorImpressions(container) {
    resetImpressionTracking();
    const slots = container.querySelectorAll('.map-sponsor__slot[data-sponsor-id]');
    if (!slots.length) return;

    const getState = (sponsorId) => {
      if (!impressionStates.has(sponsorId)) {
        impressionStates.set(sponsorId, { timer: null, qualifiedInSession: false });
      }
      return impressionStates.get(sponsorId);
    };

    const clearTimer = (state) => {
      if (state?.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    };

    const startQualifyingTimer = (sponsorId) => {
      const state = getState(sponsorId);
      if (state.qualifiedInSession || state.timer) return;
      state.timer = setTimeout(() => {
        state.timer = null;
        if (state.qualifiedInSession) return;
        state.qualifiedInSession = true;
        trackSponsorEvent(sponsorId, 'impression');
      }, 1000);
    };

    const handleVisibility = (slot, ratio) => {
      const sponsorId = slot.getAttribute('data-sponsor-id');
      if (!sponsorId) return;
      const state = getState(sponsorId);

      if (ratio >= 0.5) {
        startQualifyingTimer(sponsorId);
        return;
      }

      clearTimer(state);
      state.qualifiedInSession = false;
    };

    if (typeof IntersectionObserver === 'undefined' || !viewportEl) {
      slots.forEach((slot) => handleVisibility(slot, 1));
      return;
    }

    impressionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        handleVisibility(entry.target, entry.intersectionRatio);
      });
    }, { root: viewportEl, threshold: [0, 0.5, 1] });

    slots.forEach((slot) => impressionObserver.observe(slot));
  }

  function applyDesignTokens() {
    if (!rootEl) return;
    rootEl.style.setProperty(CSS_VARS.logoHeight, `${LOGO_HEIGHT_PX}px`);
    rootEl.style.setProperty(CSS_VARS.gap, `${LOGO_GAP_PX}px`);
    rootEl.style.setProperty('--map-sponsor-slot-min-width', `${SLOT_MIN_WIDTH_PX}px`);
    rootEl.style.setProperty('--map-sponsor-slot-padding-x', `${SLOT_PADDING_X_PX}px`);
  }

  function measureSequenceWidth(sequenceEl) {
    if (!sequenceEl) return 0;
    return sequenceEl.getBoundingClientRect().width;
  }

  function getAnimatedBeltPhaseSec(sequenceWidth, viewportWidth) {
    if (!sequenceWidth || !viewportWidth) return 0;

    const pxPerSecond = viewportWidth / TRAVERSAL_DURATION_SEC;
    const cyclePx = sequenceWidth;
    const elapsedSec = Date.now() / 1000;
    let offsetPx = (elapsedSec * pxPerSecond) % cyclePx;
    if (offsetPx < 0) offsetPx += cyclePx;

    return offsetPx / pxPerSecond;
  }

  function applyAnimatedBeltTiming(sequenceWidth, viewportWidth) {
    if (!trackEl || !sequenceWidth || !viewportWidth) return;

    const pxPerSecond = viewportWidth / TRAVERSAL_DURATION_SEC;
    const durationSec = sequenceWidth / pxPerSecond;
    const phaseSec = getAnimatedBeltPhaseSec(sequenceWidth, viewportWidth);

    trackEl.style.setProperty(CSS_VARS.beltDuration, `${durationSec}s`);
    trackEl.style.animationDelay = `-${phaseSec}s`;
  }

  function layoutStaticTrack() {
    if (!trackEl || !viewportEl || mode !== 'static') return;

    const slots = [...trackEl.querySelectorAll('.map-sponsor__slot')];
    const count = slots.length;
    const viewportWidth = viewportEl.clientWidth;

    trackEl.style.gap = '';
    trackEl.style.justifyContent = '';

    if (count <= 1) {
      trackEl.style.justifyContent = 'center';
      return;
    }

    const totalItemWidth = slots.reduce((sum, slot) => sum + slot.getBoundingClientRect().width, 0);
    const availableGapSpace = Math.max(0, viewportWidth - totalItemWidth);
    const gap = Math.max(LOGO_GAP_PX, availableGapSpace / (count - 1));

    trackEl.style.gap = `${gap}px`;
    trackEl.style.justifyContent = 'flex-start';
  }

  function layoutAnimatedTrack() {
    if (!trackEl || !viewportEl || mode !== 'animated') return;

    const sequenceEl = trackEl.querySelector('.map-sponsor__sequence:not(.map-sponsor__sequence--clone)');
    const sequenceWidth = measureSequenceWidth(sequenceEl);
    const viewportWidth = viewportEl.clientWidth;

    if (!sequenceWidth || !viewportWidth) return;

    applyAnimatedBeltTiming(sequenceWidth, viewportWidth);
  }

  function layoutTrack() {
    if (!trackEl || !viewportEl) return;

    if (mode === 'static') {
      layoutStaticTrack();
      trackEl.style.removeProperty(CSS_VARS.beltDuration);
      return;
    }

    if (mode === 'animated') {
      layoutAnimatedTrack();
    }
  }

  function scheduleLayout() {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      layoutTrack();
    });
  }

  function mountTrack(nextMode) {
    if (!viewportEl) return;

    mode = nextMode;
    viewportEl.innerHTML = renderTrackHtml(nextMode);
    trackEl = viewportEl.querySelector('.map-sponsor__track');
    bindLogoInteractions(viewportEl);
    scheduleLayout();
  }

  function rebuild() {
    if (!sponsors.length || !viewportEl) {
      mode = 'hidden';
      if (viewportEl) viewportEl.innerHTML = '';
      applyHeaderMode(false);
      return;
    }

    applyHeaderMode(true);
    const nextMode = shouldAnimate() ? 'animated' : 'static';
    mountTrack(nextMode);
  }

  function bindResizeObserver() {
    if (!viewportEl || typeof ResizeObserver === 'undefined') return;

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      const nextMode = shouldAnimate() ? 'animated' : 'static';
      if (nextMode !== mode) {
        mountTrack(nextMode);
        return;
      }
      scheduleLayout();
    });

    resizeObserver.observe(viewportEl);
  }

  function bindMotionPreference() {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      prefersReducedMotion = media.matches;
      rebuild();
    };

    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
    } else if (typeof media.addListener === 'function') {
      media.addListener(update);
    }
  }

  function bindWindowResize() {
    window.addEventListener('resize', () => {
      const nextMode = shouldAnimate() ? 'animated' : 'static';
      if (nextMode !== mode) {
        mountTrack(nextMode);
        return;
      }
      scheduleLayout();
    }, { passive: true });

    window.addEventListener('orientationchange', () => {
      scheduleLayout();
    }, { passive: true });
  }

  function bindBeltContinuity() {
    const resyncAnimatedBelt = () => {
      if (mode !== 'animated') return;
      scheduleLayout();
    };

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resyncAnimatedBelt();
    });

    window.addEventListener('pageshow', resyncAnimatedBelt);
  }

  async function init() {
    applyHeaderMode(false);

    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sponsors = await MapSponsorData.load();

    rootEl = document.getElementById('map-sponsor-root');
    viewportEl = document.getElementById('map-sponsor-viewport');

    if (!rootEl || !viewportEl) return;

    applyDesignTokens();

    if (!sponsors.length) {
      applyHeaderMode(false);
      return;
    }

    rebuild();
    bindResizeObserver();
    bindMotionPreference();
    bindWindowResize();
    bindBeltContinuity();
  }

  function hasActiveSponsors() {
    return sponsors.length > 0;
  }

  return {
    init,
    rebuild,
    hasActiveSponsors,
    syncHeaderAriaLabel,
    getVisibleCapacity,
    shouldAnimate,
  };
})();
