/**
 * Practice the Song — contextual 4-step walkthrough.
 * Launches ONLY when Practice is opened from the Home lightbulb guide.
 * Ephemeral / replayable — no permanent "seen" storage. No arrows.
 */
const PracticeWalkthrough = (() => {
  const TRIGGER_KEY = 'wc_practice_from_guide';
  const PAD = 6;
  const TRANSITION_MS = 260;

  const STEPS = [
    {
      title: 'Follow the Lyrics',
      copy: 'Lyrics move with the song so you always know what to sing.',
      button: 'Next',
    },
    {
      title: 'Play the Song',
      copy: 'Tap play to start the music and sing along.',
      button: 'Next',
    },
    {
      title: 'Replay Anytime',
      copy: 'Start the song again whenever you want to practice once more.',
      button: 'Next',
    },
    {
      title: 'Share the Song',
      copy: 'Invite others to practice and be part of the movement.',
      button: 'Got it',
    },
  ];

  let active = false;
  let step = 0;
  let rootEl = null;
  let transitioning = false;
  let resizeTimer = null;
  let startPlaybackOnComplete = false;

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

  function armGuideTrigger() {
    try {
      sessionStorage.setItem(TRIGGER_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function getTarget(stepIndex) {
    const root = document.getElementById('practice-mode') || document;
    if (stepIndex === 0) {
      return (
        root.querySelector('.pm-lyrics')
        || root.querySelector('#lyric-current')
        || document.querySelector('.pm-lyrics')
        || document.getElementById('lyric-current')
      );
    }
    if (stepIndex === 1) {
      return root.querySelector('#practice-pause-btn') || document.getElementById('practice-pause-btn');
    }
    if (stepIndex === 2) {
      return root.querySelector('#practice-restart-btn') || document.getElementById('practice-restart-btn');
    }
    return root.querySelector('#practice-share-btn') || document.getElementById('practice-share-btn');
  }

  function ensureDom() {
    if (rootEl && document.body.contains(rootEl)) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'pm-walkthrough';
    rootEl.className = 'pm-wt';
    rootEl.setAttribute('hidden', '');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.innerHTML = `
      <div class="pm-wt__spotlight" id="pm-wt-spotlight" aria-hidden="true"></div>
      <div
        class="pm-wt__callout"
        id="pm-wt-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-wt-title"
        aria-describedby="pm-wt-copy"
      >
        <p class="pm-wt__sr" id="pm-wt-step-sr" aria-live="polite"></p>
        <h2 class="pm-wt__callout-title" id="pm-wt-title"></h2>
        <p class="pm-wt__callout-copy" id="pm-wt-copy"></p>
      </div>
      <div class="pm-wt__footer">
        <div class="pm-wt__dots" id="pm-wt-dots" aria-hidden="true"></div>
        <button type="button" class="pm-wt__next" id="pm-wt-next">Next</button>
      </div>
    `;
    const host = document.getElementById('practice-mode') || document.body;
    host.appendChild(rootEl);

    document.getElementById('pm-wt-next')?.addEventListener('click', (e) => {
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
      complete({ startPlayback: false });
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
      complete({ startPlayback: true });
      return;
    }
    goToStep(step + 1);
  }

  function renderDots() {
    const el = document.getElementById('pm-wt-dots');
    if (!el) return;
    el.innerHTML = STEPS.map((_, i) => (
      `<span class="pm-wt__dot${i === step ? ' is-active' : ''}"></span>`
    )).join('');
  }

  function updateCopy() {
    const meta = STEPS[step];
    const title = document.getElementById('pm-wt-title');
    const copy = document.getElementById('pm-wt-copy');
    const next = document.getElementById('pm-wt-next');
    const sr = document.getElementById('pm-wt-step-sr');
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
    const callout = document.getElementById('pm-wt-callout');
    if (!callout) return null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    const footerTop = vh - 140 - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0);
    const cw = Math.min(252, vw - 40);
    callout.style.width = `${cw}px`;

    const ch = callout.offsetHeight || 110;
    let left;
    let top;

    if (stepIndex === 0) {
      left = clamp(targetRect.left + targetRect.width / 2 - cw / 2, margin, vw - cw - margin);
      top = targetRect.bottom + 14;
      if (top + ch > footerTop) {
        top = clamp(targetRect.top - ch - 14, margin + 48, footerTop - ch);
      }
    } else if (stepIndex === 1) {
      left = clamp(targetRect.left + targetRect.width / 2 - cw / 2, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 18, margin + 48, footerTop - ch);
    } else if (stepIndex === 2) {
      left = clamp(targetRect.left - 8, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 18, margin + 48, footerTop - ch);
    } else {
      left = clamp(targetRect.right - cw + 8, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 18, margin + 48, footerTop - ch);
    }

    top = clamp(top, margin + 48, Math.max(margin + 48, footerTop - ch));
    left = clamp(left, margin, vw - cw - margin);

    callout.style.left = `${Math.round(left)}px`;
    callout.style.top = `${Math.round(top)}px`;
    return callout.getBoundingClientRect();
  }

  function applySpotlight(target, stepIndex) {
    const spot = document.getElementById('pm-wt-spotlight');
    if (!spot || !target) return null;

    const rect = target.getBoundingClientRect();
    const pad = stepIndex === 0 ? PAD : 5;
    const left = rect.left - pad;
    const top = rect.top - pad;
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;

    spot.classList.toggle('pm-wt__spotlight--round', stepIndex >= 1);
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

    const callout = document.getElementById('pm-wt-callout');
    if (callout) callout.style.opacity = '0';

    const delay = prefersReducedMotion() ? 0 : TRANSITION_MS;
    setTimeout(() => {
      layout();
      if (callout) callout.style.opacity = '';
      document.getElementById('pm-wt-next')?.focus?.();
      transitioning = false;
    }, delay);
  }

  function start() {
    if (active) return;
    const target = getTarget(0);
    if (!target) return false;

    ensureDom();
    active = true;
    step = 0;
    transitioning = false;
    startPlaybackOnComplete = false;

    document.body.classList.add('pm-wt-active');
    rootEl.hidden = false;
    rootEl.removeAttribute('hidden');
    rootEl.setAttribute('aria-hidden', 'false');
    rootEl.classList.add('is-visible');

    updateCopy();
    layout();
    requestAnimationFrame(() => {
      layout();
      document.getElementById('pm-wt-next')?.focus?.();
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
    document.body.classList.remove('pm-wt-active');
  }

  function complete({ startPlayback = false } = {}) {
    if (!active && !rootEl) return;

    active = false;
    transitioning = false;
    startPlaybackOnComplete = !!startPlayback;

    const finish = () => {
      teardownOverlay();
      if (typeof PracticeMode !== 'undefined') {
        if (startPlaybackOnComplete && typeof PracticeMode.beginGuidedPlayback === 'function') {
          PracticeMode.beginGuidedPlayback();
        } else if (typeof PracticeMode.unlockGuideControls === 'function') {
          PracticeMode.unlockGuideControls();
        }
      }
    };

    if (rootEl && !prefersReducedMotion()) {
      rootEl.classList.remove('is-visible');
      setTimeout(finish, TRANSITION_MS);
    } else {
      finish();
    }
  }

  /** Called after Practice mounts the paused playing shell for guide entry. */
  function onPracticeReady() {
    if (active) {
      layout();
      return true;
    }
    return start();
  }

  /** Hard cleanup when Practice exits mid-guide. */
  function dismiss() {
    if (!active && !rootEl) return;
    active = false;
    transitioning = false;
    teardownOverlay();
  }

  return {
    TRIGGER_KEY,
    hasGuideTrigger,
    consumeGuideTrigger,
    armGuideTrigger,
    onPracticeReady,
    complete,
    dismiss,
    isActive: () => active,
  };
})();

window.PracticeWalkthrough = PracticeWalkthrough;
