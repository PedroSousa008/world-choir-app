/**
 * Daily Acts of Peace — contextual 3-step walkthrough.
 * Launches ONLY when Daily Acts is opened from the Home lightbulb guide.
 * Ephemeral / replayable — no permanent "seen" storage.
 */
const DailyActsWalkthrough = (() => {
  const TRIGGER_KEY = 'wc_daily_acts_from_guide';
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
      copy: 'Find acts that inspire you, across different categories.',
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

  /** One-shot transient trigger set by the Home lightbulb guide card. */
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

  function armGuideTrigger() {
    try {
      sessionStorage.setItem(TRIGGER_KEY, '1');
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
      <div class="dap-wt__footer">
        <div class="dap-wt__dots" id="dap-wt-dots" aria-hidden="true"></div>
        <button type="button" class="dap-wt__next" id="dap-wt-next">Next</button>
      </div>
    `;
    document.body.appendChild(rootEl);

    document.getElementById('dap-wt-next')?.addEventListener('click', (e) => {
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
    if (sr) sr.textContent = `${meta.title}. ${meta.copy}`;
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

    const ch = callout.offsetHeight || 110;
    let left;
    let top;

    if (stepIndex === 0) {
      left = targetRect.right + 14;
      top = targetRect.top + targetRect.height / 2 - ch / 2;
      if (left + cw > vw - margin) {
        left = clamp(targetRect.left + targetRect.width / 2 - cw / 2, margin, vw - cw - margin);
        top = targetRect.bottom + 16;
      }
    } else if (stepIndex === 1) {
      left = clamp(targetRect.right - cw - 8, margin, vw - cw - margin);
      top = targetRect.bottom + 18;
      if (top + ch > footerTop) {
        top = clamp(targetRect.top - ch - 16, margin + 48, footerTop - ch);
      }
    } else {
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
      applySpotlight(target, step);
      updateCopy();
      placeCallout(target.getBoundingClientRect(), step);
    };

    if (prefersReducedMotion()) doLayout();
    else requestAnimationFrame(() => setTimeout(doLayout, 40));
  }

  function goToStep(nextStep) {
    if (transitioning) return;
    transitioning = true;
    step = nextStep;

    const fadeEls = [
      document.getElementById('dap-wt-callout'),
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
    if (active) return;
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
    if (!active && !rootEl) return;

    active = false;
    transitioning = false;

    const finish = () => {
      if (rootEl) {
        rootEl.classList.remove('is-visible');
        rootEl.hidden = true;
        rootEl.setAttribute('aria-hidden', 'true');
      }
      document.body.classList.remove('dap-wt-active');
    };

    if (rootEl && !prefersReducedMotion()) {
      rootEl.classList.remove('is-visible');
      setTimeout(finish, TRANSITION_MS);
    } else {
      finish();
    }
  }

  /**
   * Called after Daily Acts grid paint.
   * Starts only when a fresh lightbulb-guide navigation trigger was armed.
   */
  function onPageReady({ mode } = {}) {
    if (mode && mode !== 'grid') return;
    if (!document.querySelector('.dap-grid .dap-square')) return;

    if (active) {
      layout();
      return;
    }
    if (!hasGuideTrigger()) return;
    if (!getTarget(0)) return;
    consumeGuideTrigger();
    start();
  }

  return {
    onPageReady,
    armGuideTrigger,
    isActive: () => active,
  };
})();

window.DailyActsWalkthrough = DailyActsWalkthrough;
