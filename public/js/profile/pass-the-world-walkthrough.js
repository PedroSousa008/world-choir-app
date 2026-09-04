/**
 * Pass the World — contextual 4-step walkthrough.
 * Launches ONLY from the Home lightbulb guide.
 * Uses a temporary Braga / no-destination presentation; never writes backend state.
 * No arrows. Replayable forever (sessionStorage one-shot only).
 */
const PassTheWorldWalkthrough = (() => {
  const TRIGGER_KEY = 'wc_ptw_from_guide';
  const TRANSITION_MS = 260;

  const STEPS = [
    {
      title: 'Visit My City',
      copy: 'Invite the World to your city and become part of its journey around the globe.',
      button: 'Next',
    },
    {
      title: 'Your Itinerary',
      copy: 'See the full journey and upcoming stops here.',
      button: 'Next',
    },
    {
      title: 'Explore Your Journey',
      copy: 'See how far the world has travelled, how many countries it has reached, and how long the journey has been going.',
      button: 'Next',
    },
    {
      title: 'Tap the Map',
      copy: 'Explore the route and see where the plane is now.',
      button: 'Got it',
    },
  ];

  let active = false;
  let step = 0;
  let rootEl = null;
  let transitioning = false;
  let resizeTimer = null;

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  }

  function hasGuideTrigger() {
    try {
      return sessionStorage.getItem(TRIGGER_KEY) === '1';
    } catch {
      return false;
    }
  }

  function consumeGuideTrigger() {
    try {
      sessionStorage.removeItem(TRIGGER_KEY);
    } catch {
      /* ignore */
    }
  }

  function getTarget(stepIndex) {
    if (stepIndex === 0) {
      return document.querySelector('[data-ptw-invite]') || document.querySelector('.ptw-visit-btn');
    }
    if (stepIndex === 1) {
      return document.querySelector('[data-ptw-itinerary]');
    }
    if (stepIndex === 2) {
      return (
        document.querySelector('#passport-story-view .passport-stats')
        || document.querySelector('.passport-stats.passport-stats--triple')
        || document.querySelector('.passport-stats')
      );
    }
    return (
      document.querySelector('.ptw-map-wrap')
      || document.getElementById('ptw-map')
      || document.querySelector('.ptw-map')
    );
  }

  function ensureDom() {
    if (rootEl && document.body.contains(rootEl)) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'ptw-walkthrough';
    rootEl.className = 'ptw-wt';
    rootEl.setAttribute('hidden', '');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.innerHTML = `
      <div class="ptw-wt__spotlight" id="ptw-wt-spotlight" aria-hidden="true"></div>
      <div
        class="ptw-wt__callout"
        id="ptw-wt-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ptw-wt-title"
        aria-describedby="ptw-wt-copy"
      >
        <p class="ptw-wt__sr" id="ptw-wt-step-sr" aria-live="polite"></p>
        <h2 class="ptw-wt__callout-title" id="ptw-wt-title"></h2>
        <p class="ptw-wt__callout-copy" id="ptw-wt-copy"></p>
      </div>
      <div class="ptw-wt__footer">
        <div class="ptw-wt__dots" id="ptw-wt-dots" aria-hidden="true"></div>
        <button type="button" class="ptw-wt__next" id="ptw-wt-next">Next</button>
      </div>
    `;
    document.body.appendChild(rootEl);

    document.getElementById('ptw-wt-next')?.addEventListener('click', (e) => {
      e.preventDefault();
      onPrimary();
    });
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });

    return rootEl;
  }

  function onKeydown(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      complete();
    }
  }

  function onResize() {
    if (!active) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => layout(), 80);
  }

  function onPrimary() {
    if (!active || transitioning) return;
    if (step >= STEPS.length - 1) {
      complete();
      return;
    }
    goToStep(step + 1);
  }

  function renderDots() {
    const el = document.getElementById('ptw-wt-dots');
    if (!el) return;
    el.innerHTML = STEPS.map((_, i) => (
      `<span class="ptw-wt__dot${i === step ? ' is-active' : ''}"></span>`
    )).join('');
  }

  function updateCopy() {
    const meta = STEPS[step];
    const title = document.getElementById('ptw-wt-title');
    const copy = document.getElementById('ptw-wt-copy');
    const next = document.getElementById('ptw-wt-next');
    const sr = document.getElementById('ptw-wt-step-sr');
    if (title) title.textContent = meta.title;
    if (copy) copy.textContent = meta.copy;
    if (next) next.textContent = meta.button;
    if (sr) sr.textContent = `${meta.title}. ${meta.copy}`;
    renderDots();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function scrollTargetIntoView(target, { block = 'center' } = {}) {
    if (!target || typeof target.scrollIntoView !== 'function') return;
    const rect = target.getBoundingClientRect();
    const footerReserve = 160;
    const topReserve = 72;
    const visible = rect.top >= topReserve && rect.bottom <= window.innerHeight - footerReserve;
    if (visible && block === 'center') return;
    target.scrollIntoView({
      block,
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  /** Only Steps 3 and 4 change scroll position. Steps 1–2 stay put. */
  function scrollForStep(stepIndex, target) {
    if (stepIndex === 0 || stepIndex === 1) return;

    if (stepIndex === 2) {
      scrollTargetIntoView(target, { block: 'center' });
      return;
    }

    // Step 4 — return to the map at the top of Pass the World
    const mapWrap =
      document.querySelector('.ptw-map-wrap')
      || document.getElementById('ptw-map')
      || target;
    if (!mapWrap) return;

    const story = document.getElementById('passport-story-view');
    const scroller =
      (story && story.scrollHeight > story.clientHeight ? story : null)
      || document.scrollingElement
      || document.documentElement;

    if (prefersReducedMotion()) {
      mapWrap.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
      if (scroller && scroller !== mapWrap) {
        const top = mapWrap.getBoundingClientRect().top + (scroller.scrollTop || window.scrollY || 0) - 12;
        if (typeof scroller.scrollTo === 'function') scroller.scrollTo(0, Math.max(0, top));
        else window.scrollTo(0, Math.max(0, top));
      }
      return;
    }

    mapWrap.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
  }

  function placeCallout(targetRect, stepIndex) {
    const callout = document.getElementById('ptw-wt-callout');
    if (!callout) return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    const footerTop = vh - 140;
    const cw = Math.min(260, vw - 40);
    callout.style.width = `${cw}px`;

    const ch = callout.offsetHeight || 110;
    let left;
    let top;

    if (stepIndex === 0) {
      left = clamp(targetRect.left + targetRect.width / 2 - cw / 2, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 16, margin + 48, footerTop - ch);
      if (top + ch > targetRect.top - 8) {
        top = clamp(targetRect.bottom + 14, margin + 48, footerTop - ch);
      }
    } else if (stepIndex === 1) {
      left = clamp(targetRect.left + targetRect.width / 2 - cw / 2, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 16, margin + 48, footerTop - ch);
    } else if (stepIndex === 2) {
      left = clamp(targetRect.left + 8, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 14, margin + 48, footerTop - ch);
      if (top < margin + 48) {
        top = clamp(targetRect.bottom + 12, margin + 48, footerTop - ch);
      }
    } else {
      left = clamp(targetRect.left + 12, margin, vw - cw - margin);
      top = clamp(targetRect.bottom - Math.min(ch + 12, targetRect.height * 0.35), margin + 48, footerTop - ch);
    }

    top = clamp(top, margin + 48, Math.max(margin + 48, footerTop - ch));
    left = clamp(left, margin, vw - cw - margin);

    callout.style.left = `${Math.round(left)}px`;
    callout.style.top = `${Math.round(top)}px`;
    return callout.getBoundingClientRect();
  }

  function applySpotlight(target, stepIndex) {
    const spot = document.getElementById('ptw-wt-spotlight');
    if (!spot || !target) return null;

    const rect = target.getBoundingClientRect();
    const pad = stepIndex === 0 ? 6 : stepIndex === 3 ? 4 : 5;
    let left = rect.left - pad;
    let top = rect.top - pad;
    let width = rect.width + pad * 2;
    let height = rect.height + pad * 2;

    // Keep the map highlight tight to the visible map frame.
    if (stepIndex === 3) {
      const maxH = Math.min(height, Math.round(window.innerHeight * 0.42));
      if (height > maxH) {
        height = maxH;
      }
      // Clamp inside viewport so the ring sits on the map, not off-screen after scroll.
      left = clamp(left, 8, window.innerWidth - width - 8);
      top = clamp(top, 8, window.innerHeight - height - 120);
    }

    spot.classList.toggle('ptw-wt__spotlight--pill', stepIndex === 0 || stepIndex === 1);
    spot.classList.toggle('ptw-wt__spotlight--map', stepIndex === 3);
    spot.classList.toggle('ptw-wt__spotlight--stats', stepIndex === 2);
    spot.style.left = `${Math.round(left)}px`;
    spot.style.top = `${Math.round(top)}px`;
    spot.style.width = `${Math.round(width)}px`;
    spot.style.height = `${Math.round(height)}px`;

    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  function layout() {
    if (!active || !rootEl) return;
    const target = getTarget(step);
    if (!target) return;

    scrollForStep(step, target);

    const settleMs = prefersReducedMotion()
      ? 0
      : (step === 2 ? 180 : step === 3 ? 280 : 40);

    const doLayout = () => {
      const freshTarget = getTarget(step) || target;
      applySpotlight(freshTarget, step);
      updateCopy();
      placeCallout(freshTarget.getBoundingClientRect(), step);
      if (step === 3 && typeof PassTheWorldMap !== 'undefined') {
        PassTheWorldMap.invalidateSize?.();
        // Re-measure after Leaflet/map resize.
        requestAnimationFrame(() => {
          const mapTarget = getTarget(3) || freshTarget;
          applySpotlight(mapTarget, 3);
          placeCallout(mapTarget.getBoundingClientRect(), 3);
        });
      }
    };

    if (settleMs === 0) doLayout();
    else requestAnimationFrame(() => setTimeout(doLayout, settleMs));
  }

  function goToStep(nextStep) {
    if (transitioning) return;
    transitioning = true;
    step = nextStep;

    const callout = document.getElementById('ptw-wt-callout');
    if (callout) callout.style.opacity = '0';

    const delay = prefersReducedMotion() ? 0 : TRANSITION_MS;
    setTimeout(() => {
      layout();
      if (callout) callout.style.opacity = '';
      document.getElementById('ptw-wt-next')?.focus?.();
      transitioning = false;
    }, delay);
  }

  function startOverlay() {
    if (active) return false;
    const target = getTarget(0);
    if (!target) return false;

    ensureDom();
    active = true;
    step = 0;
    transitioning = false;

    document.body.classList.add('ptw-wt-active');
    rootEl.hidden = false;
    rootEl.removeAttribute('hidden');
    rootEl.setAttribute('aria-hidden', 'false');
    rootEl.classList.add('is-visible');

    updateCopy();
    layout();
    requestAnimationFrame(() => {
      layout();
      document.getElementById('ptw-wt-next')?.focus?.();
    });
    return true;
  }

  function teardownOverlay() {
    if (rootEl) {
      rootEl.classList.remove('is-visible');
      rootEl.hidden = true;
      rootEl.setAttribute('hidden', '');
      rootEl.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('ptw-wt-active');
  }

  function complete() {
    if (!active && !rootEl) {
      if (typeof PassTheWorld !== 'undefined') PassTheWorld.exitGuideDemo?.();
      return;
    }

    active = false;
    transitioning = false;

    const finish = () => {
      teardownOverlay();
      if (typeof PassTheWorld !== 'undefined') PassTheWorld.exitGuideDemo?.();
    };

    if (rootEl && !prefersReducedMotion()) {
      rootEl.classList.remove('is-visible');
      setTimeout(finish, TRANSITION_MS);
    } else {
      finish();
    }
  }

  function dismiss() {
    if (!active && !rootEl) {
      if (typeof PassTheWorld !== 'undefined') PassTheWorld.exitGuideDemo?.();
      return;
    }
    active = false;
    transitioning = false;
    teardownOverlay();
    if (typeof PassTheWorld !== 'undefined') PassTheWorld.exitGuideDemo?.();
  }

  function onPageReady() {
    if (active) {
      layout();
      return true;
    }
    if (!hasGuideTrigger()) return false;
    if (typeof PassTheWorld === 'undefined' || !PassTheWorld.isMounted?.()) return false;

    const tryStart = (attempt = 0) => {
      if (!PassTheWorld.isGuideDemo?.()) {
        if (!PassTheWorld.enterGuideDemo?.()) {
          if (attempt < 30) {
            setTimeout(() => tryStart(attempt + 1), 50);
            return false;
          }
          consumeGuideTrigger();
          return false;
        }
      }

      if (startOverlay()) {
        consumeGuideTrigger();
        return true;
      }

      if (attempt < 30) {
        setTimeout(() => tryStart(attempt + 1), 50);
        return false;
      }

      consumeGuideTrigger();
      PassTheWorld.exitGuideDemo?.();
      return false;
    };

    return tryStart(0);
  }

  return {
    TRIGGER_KEY,
    onPageReady,
    complete,
    dismiss,
    isActive: () => active,
  };
})();

window.PassTheWorldWalkthrough = PassTheWorldWalkthrough;
