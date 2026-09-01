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
    return minimized
      ? 'World Choir supported by sponsors — tap to expand'
      : 'World Choir supported by sponsors — tap to minimize';
  }

  function applyHeaderMode(hasSponsors) {
    const defaultBlock = document.getElementById('map-header-default');
    const sponsorBlock = document.getElementById('map-header-sponsor');
    const header = document.getElementById('map-header');

    defaultBlock?.toggleAttribute('hidden', hasSponsors);
    sponsorBlock?.toggleAttribute('hidden', !hasSponsors);
    header?.classList.toggle('map-header--sponsor', hasSponsors);

    if (header) {
      const minimized = header.classList.contains('map-header--minimized');
      header.setAttribute('aria-label', getHeaderAriaLabel(minimized));
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
      });
    });

    container.querySelectorAll('.map-sponsor__logo-image').forEach((img) => {
      img.addEventListener('error', () => {
        const logo = img.closest('.map-sponsor__logo');
        logo?.classList.add('map-sponsor__logo--broken');
      }, { once: true });
    });
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

    const pxPerSecond = viewportWidth / TRAVERSAL_DURATION_SEC;
    const durationSec = sequenceWidth / pxPerSecond;

    trackEl.style.setProperty(CSS_VARS.beltDuration, `${durationSec}s`);
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

  async function init() {
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
