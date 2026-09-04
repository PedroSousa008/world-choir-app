/**
 * Daily Acts of Peace — first-visit sequential walkthrough (3 steps).
 * Overlay only; does not redesign the underlying page.
 */
const DailyActsWalkthrough = (() => {
  const STORAGE_KEY = 'wc_daily_acts_walkthrough_completed';
  const PAD = 6;
  const TRANSITION_MS = 260;

  const STEPS = [
    {
      title: 'Tap to Discover',
      copy: 'Explore an act of peace and see how you can make a difference.',
      button: 'Next',
      spotlight: 'card',
    },
    {
      title: 'Your Journey',
      copy: 'Check your progress and see your completed acts here.',
      button: 'Next',
      spotlight: 'journey',
    },
    {
      title: 'Explore Categories',
      copy: 'Find acts that inspire you, from kindness to courage.',
      button: 'Got it',
      spotlight: 'categories',
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

  function isCompleted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return true;
    }
  }

  function markCompleted() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function getTarget(stepIndex) {
    if (stepIndex === 0) {
      return (
        document.querySelector('.dap-grid .dap-square.is-available')
        || document.querySelector('.dap-grid .dap-square.is-today')
        || document.querySelector('.dap-grid .dap-square')
      );
    }
    if (stepIndex === 1) {
      return document.getElementById('dap-open-calendar');
    }
    return document.querySelector('.dap-cats') || document.querySelector('.dap-cats__track');
  }

  function ensureDom() {
    if (rootEl) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'dap-walkthrough';
    rootEl.className = 'dap-wt';
    rootEl.setAttribute('hidden', '');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.innerHTML = `
      <div class="dap-wt__spotlight" id="dap-wt-spotlight" aria-hidden="true"></div>
      <svg class="dap-wt__arrow" id="dap-wt-arrow" aria-hidden="true"></svg>
      <div
        class="dap-wt__callout"
        id="dap-wt-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dap-wt-title"
        aria-describedby="dap-wt-copy"
      >
        <p class="dap-wt__sr" id="dap-wt-step-sr" aria-live="polite"></p>
        <h2 class="dap-wt__callout-title" id="dap-wt-title"></h2>
        <p class="dap-wt__callout-copy" id="dap-wt-copy"></p>
      </div>
      <button type="button" class="dap-wt__close" id="dap-wt-close" aria-label="Close Daily Acts guide">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="dap-wt__footer">
        <div class="dap-wt__dots" id="dap-wt-dots" aria-hidden="true"></div>
        <button type="button" class="dap-wt__next" id="dap-wt-next">Next</button>
        <p class="dap-wt__tagline">A kinder world starts with you.</p>
      </div>
    `;
    document.body.appendChild(rootEl);

    document.getElementById('dap-wt-next')?.addEventListener('click', (e) => {
      e.preventDefault();
      onPrimary();
    });
    document.getElementById('dap-wt-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      complete();
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
    const el = document.getElementById('dap-wt-dots');
    if (!el) return;
    el.innerHTML = STEPS.map((_, i) => (
      `<span class="dap-wt__dot${i === step ? ' is-active' : ''}"></span>`
    )).join('');
  }

  function updateCopy() {
    const meta = STEPS[step];
    const title = document.getElementById('dap-wt-title');
    const copy = document.getElementById('dap-wt-copy');
    const next = document.getElementById('dap-wt-next');
    const sr = document.getElementById('dap-wt-step-sr');
    if (title) title.textContent = meta.title;
    if (copy) copy.textContent = meta.copy;
    if (next) next.textContent = meta.button;
    if (sr) sr.textContent = `Step ${step + 1} of ${STEPS.length}: ${meta.title}`;
    renderDots();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function scrollTargetIntoView(target) {
    if (!target || typeof target.scrollIntoView !== 'function') return;
    const rect = target.getBoundingClientRect();
    const footerReserve = 160;
    const topReserve = 72;
    const visible = rect.top >= topReserve && rect.bottom <= window.innerHeight - footerReserve;
    if (visible) return;
    target.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  function placeCallout(targetRect, stepIndex) {
    const callout = document.getElementById('dap-wt-callout');
    if (!callout) return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    const footerTop = vh - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 84) - 120;
    const cw = Math.min(252, vw - 40);
    callout.style.width = `${cw}px`;

    // Measure after width set
    const ch = callout.offsetHeight || 110;
    let left;
    let top;

    if (stepIndex === 0) {
      // Prefer right of card; fall back below
      left = targetRect.right + 14;
      top = targetRect.top + targetRect.height / 2 - ch / 2;
      if (left + cw > vw - margin) {
        left = clamp(targetRect.left + targetRect.width / 2 - cw / 2, margin, vw - cw - margin);
        top = targetRect.bottom + 16;
      }
    } else if (stepIndex === 1) {
      // Below-left of journey button
      left = clamp(targetRect.right - cw - 8, margin, vw - cw - margin);
      top = targetRect.bottom + 18;
      if (top + ch > footerTop) {
        top = clamp(targetRect.top - ch - 16, margin + 48, footerTop - ch);
      }
    } else {
      // Below categories
      left = clamp(targetRect.left + 8, margin, vw - cw - margin);
      top = targetRect.bottom + 18;
      if (top + ch > footerTop) {
        top = clamp(targetRect.top - ch - 14, margin + 48, footerTop - ch);
      }
    }

    top = clamp(top, margin + 48, Math.max(margin + 48, footerTop - ch));
    left = clamp(left, margin, vw - cw - margin);

    callout.style.left = `${Math.round(left)}px`;
    callout.style.top = `${Math.round(top)}px`;

    return callout.getBoundingClientRect();
  }

  function drawArrow(fromRect, toRect, stepIndex) {
    const svg = document.getElementById('dap-wt-arrow');
    if (!svg || !fromRect || !toRect) return;

    const from = {
      x: fromRect.left + fromRect.width / 2,
      y: fromRect.top + fromRect.height / 2,
    };
    const to = {
      x: toRect.left + toRect.width / 2,
      y: toRect.top + toRect.height / 2,
    };

    // Start on callout edge facing the target
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    let sx;
    let sy;
    if (absX > absY) {
      sx = dx > 0 ? fromRect.right : fromRect.left;
      sy = from.y;
    } else {
      sx = from.x;
      sy = dy > 0 ? fromRect.bottom : fromRect.top;
    }

    // End just outside target edge
    let ex;
    let ey;
    if (Math.abs(to.x - sx) > Math.abs(to.y - sy)) {
      ex = to.x > sx ? toRect.left - 4 : toRect.right + 4;
      ey = to.y;
    } else {
      ex = to.x;
      ey = to.y > sy ? toRect.top - 4 : toRect.bottom + 4;
    }

    // Curved control points
    let c1x;
    let c1y;
    let c2x;
    let c2y;
    if (stepIndex === 0) {
      c1x = sx + (ex - sx) * 0.35;
      c1y = sy - 28;
      c2x = sx + (ex - sx) * 0.7;
      c2y = ey - 10;
    } else if (stepIndex === 1) {
      c1x = sx + 20;
      c1y = sy - 36;
      c2x = ex + 10;
      c2y = ey + 8;
    } else {
      c1x = sx + (ex - sx) * 0.4;
      c1y = sy + 24;
      c2x = ex - 12;
      c2y = ey + 8;
    }

    const angle = Math.atan2(ey - c2y, ex - c2x);
    const head = 7;
    const hx1 = ex - head * Math.cos(angle - Math.PI / 6);
    const hy1 = ey - head * Math.sin(angle - Math.PI / 6);
    const hx2 = ex - head * Math.cos(angle + Math.PI / 6);
    const hy2 = ey - head * Math.sin(angle + Math.PI / 6);

    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    svg.innerHTML = `
      <path class="dap-wt__arrow-path" d="M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}"/>
      <path class="dap-wt__arrow-head" d="M ${ex.toFixed(1)} ${ey.toFixed(1)} L ${hx1.toFixed(1)} ${hy1.toFixed(1)} L ${hx2.toFixed(1)} ${hy2.toFixed(1)} Z"/>
    `;
  }

  function applySpotlight(target, stepIndex) {
    const spot = document.getElementById('dap-wt-spotlight');
    if (!spot || !target) return null;

    const rect = target.getBoundingClientRect();
    const pad = stepIndex === 1 ? 4 : PAD;
    const left = rect.left - pad;
    const top = rect.top - pad;
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;

    spot.classList.toggle('dap-wt__spotlight--pill', stepIndex === 1);
    spot.classList.toggle('dap-wt__spotlight--cats', stepIndex === 2);
    spot.style.left = `${Math.round(left)}px`;
    spot.style.top = `${Math.round(top)}px`;
    spot.style.width = `${Math.round(width)}px`;
    spot.style.height = `${Math.round(height)}px`;

    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  }

  function layout() {
    if (!active || !rootEl) return;
    const target = getTarget(step);
    if (!target) return;

    scrollTargetIntoView(target);

    const doLayout = () => {
      const spotRect = applySpotlight(target, step);
      updateCopy();
      const calloutRect = placeCallout(target.getBoundingClientRect(), step);
      if (spotRect && calloutRect) drawArrow(calloutRect, spotRect, step);
    };

    // Allow smooth scroll to settle briefly
    if (prefersReducedMotion()) doLayout();
    else requestAnimationFrame(() => setTimeout(doLayout, 40));
  }

  function goToStep(nextStep) {
    if (transitioning) return;
    transitioning = true;
    step = nextStep;

    const fadeEls = [
      document.getElementById('dap-wt-callout'),
      document.getElementById('dap-wt-arrow'),
    ];
    fadeEls.forEach((el) => {
      if (el) el.style.opacity = '0';
    });

    const delay = prefersReducedMotion() ? 0 : TRANSITION_MS;
    setTimeout(() => {
      layout();
      fadeEls.forEach((el) => {
        if (el) el.style.opacity = '';
      });
      document.getElementById('dap-wt-next')?.focus?.();
      transitioning = false;
    }, delay);
  }

  function start() {
    if (active || isCompleted()) return;
    const target = getTarget(0);
    if (!target) return;

    ensureDom();
    active = true;
    step = 0;
    transitioning = false;

    document.body.classList.add('dap-wt-active');
    rootEl.hidden = false;
    rootEl.setAttribute('aria-hidden', 'false');

    updateCopy();
    requestAnimationFrame(() => {
      rootEl.classList.add('is-visible');
      layout();
      document.getElementById('dap-wt-next')?.focus?.();
    });
  }

  function complete() {
    if (!active && !rootEl) {
      markCompleted();
      return;
    }

    markCompleted();
    active = false;
    transitioning = false;

    const finish = () => {
      if (rootEl) {
        rootEl.classList.remove('is-visible');
        rootEl.hidden = true;
        rootEl.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('dap-wt-active');
      const svg = document.getElementById('dap-wt-arrow');
      if (svg) svg.innerHTML = '';
    };

    if (rootEl && !prefersReducedMotion()) {
      rootEl.classList.remove('is-visible');
      setTimeout(finish, TRANSITION_MS);
    } else {
      finish();
    }
  }

  /**
   * Called after Daily Acts grid paint. Starts once if needed, or re-layouts if active.
   */
  function onPageReady({ mode } = {}) {
    if (isCompleted()) return;
    if (mode && mode !== 'grid') return;
    // Only start/refresh when grid targets exist
    if (!document.querySelector('.dap-grid .dap-square')) return;

    if (active) {
      layout();
      return;
    }
    start();
  }

  return {
    onPageReady,
    isCompleted,
    /** Test helper / force reset — not used by production UI */
    reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
  };
})();

window.DailyActsWalkthrough = DailyActsWalkthrough;
