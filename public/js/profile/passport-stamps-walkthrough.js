/**
 * Passport Stamps — contextual 2-step walkthrough.
 * Launches ONLY from the Home lightbulb guide → Passport Stamps.
 * Spans Passport cover (fingerprint) → Passport Stamps (pledge variants).
 * Ephemeral / replayable — no permanent "seen" storage.
 * Never mutates pledge state or earned stamps.
 */
const PassportStampsWalkthrough = (() => {
  const TRIGGER_KEY = 'wc_passport_stamps_from_guide';
  const PLEDGED_KEY = 'wc_passport_stamps_guide_pledged';
  const TRANSITION_MS = 260;

  let active = false;
  let step = 0;
  let variant = 'unpledged'; // 'pledged' | 'unpledged'
  let rootEl = null;
  let transitioning = false;
  let resizeTimer = null;
  let guidePresentationApplied = false;

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

  function readStoredPledgeFlag() {
    try {
      return sessionStorage.getItem(PLEDGED_KEY) === '1';
    } catch {
      return false;
    }
  }

  function clearStoredPledgeFlag() {
    try {
      sessionStorage.removeItem(PLEDGED_KEY);
    } catch {
      /* ignore */
    }
  }

  function resolveIsPledged() {
    if (typeof WorldChoirPledgeState !== 'undefined' && WorldChoirPledgeState.isPledged?.()) {
      return true;
    }
    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.hasPledged?.()) {
      return true;
    }
    const pledge = typeof WorldChoirDB !== 'undefined'
      ? WorldChoirDB.getPledgeForCurrentUser?.()
      : null;
    const n = pledge?.voiceNumber ?? pledge?.voice_number;
    if (n != null && n !== '' && !Number.isNaN(Number(n))) return true;
    return readStoredPledgeFlag();
  }

  function getSteps() {
    const step2 = variant === 'pledged'
      ? {
        title: 'Your Voice Joined',
        copy: 'Your first stamp marks the moment your voice became part of World Choir.',
        button: 'Got it',
      }
      : {
        title: 'Your Stamps',
        copy: 'This is where the moments you create with World Choir become part of your story.',
        button: 'Got it',
      };

    return [
      {
        title: 'Your Passport',
        copy: 'Tap your fingerprint to discover the stamps you collect along your journey.',
        button: 'Next',
      },
      step2,
    ];
  }

  function getPassportCard() {
    return document.querySelector('#passport-main .passport-card')
      || document.querySelector('.passport-card:not(.passport-card--ptw)');
  }

  function getTarget(stepIndex) {
    const card = getPassportCard();
    if (stepIndex === 0) {
      return (
        document.getElementById('passport-open-inside')
        || document.querySelector('.passport-card__feature--btn')
        || document.querySelector('.passport-card__feature-img')
      );
    }
    if (variant === 'pledged') {
      return (
        card?.querySelector('[data-stamp-id="your-voice-joined"] .passport-stamp__frame')
        || card?.querySelector('[data-stamp-id="your-voice-joined"]')
        || document.querySelector('[data-stamp-id="your-voice-joined"] .passport-stamp__frame')
        || document.querySelector('[data-stamp-id="your-voice-joined"]')
      );
    }
    return card;
  }

  function ensureDom() {
    if (rootEl && document.body.contains(rootEl)) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'passport-stamps-walkthrough';
    rootEl.className = 'psw-wt';
    rootEl.setAttribute('hidden', '');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.innerHTML = `
      <div class="psw-wt__spotlight" id="psw-wt-spotlight" aria-hidden="true"></div>
      <div
        class="psw-wt__callout"
        id="psw-wt-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="psw-wt-title"
        aria-describedby="psw-wt-copy"
      >
        <p class="psw-wt__sr" id="psw-wt-step-sr" aria-live="polite"></p>
        <h2 class="psw-wt__callout-title" id="psw-wt-title"></h2>
        <p class="psw-wt__callout-copy" id="psw-wt-copy"></p>
      </div>
      <div class="psw-wt__footer">
        <div class="psw-wt__dots" id="psw-wt-dots" aria-hidden="true"></div>
        <button type="button" class="psw-wt__next" id="psw-wt-next">Next</button>
      </div>
    `;
    document.body.appendChild(rootEl);

    document.getElementById('psw-wt-next')?.addEventListener('click', (e) => {
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
      complete({ early: true });
    }
  }

  function onResize() {
    if (!active) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => layout(), 80);
  }

  function onPrimary() {
    if (!active || transitioning) return;
    const steps = getSteps();
    if (step >= steps.length - 1) {
      complete({ early: false });
      return;
    }
    if (step === 0) {
      goToStampsAndContinue();
      return;
    }
    goToStep(step + 1);
  }

  function renderDots() {
    const el = document.getElementById('psw-wt-dots');
    if (!el) return;
    const steps = getSteps();
    el.innerHTML = steps.map((_, i) => (
      `<span class="psw-wt__dot${i === step ? ' is-active' : ''}"></span>`
    )).join('');
  }

  function updateCopy() {
    const meta = getSteps()[step];
    const title = document.getElementById('psw-wt-title');
    const copy = document.getElementById('psw-wt-copy');
    const next = document.getElementById('psw-wt-next');
    const sr = document.getElementById('psw-wt-step-sr');
    if (title) title.textContent = meta.title;
    if (copy) copy.textContent = meta.copy;
    if (next) next.textContent = meta.button;
    if (sr) sr.textContent = `${meta.title}. ${meta.copy}`;
    renderDots();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function placeCallout(targetRect, stepIndex) {
    const callout = document.getElementById('psw-wt-callout');
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
      top = clamp(targetRect.bottom + 14, margin + 48, footerTop - ch);
      if (top + ch > footerTop) {
        top = clamp(targetRect.top - ch - 14, margin + 48, footerTop - ch);
      }
    } else if (stepIndex === 1 && variant === 'pledged') {
      // Sit clearly above the stamp so the callout never covers it.
      left = clamp(targetRect.left + targetRect.width / 2 - cw / 2, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 18, margin + 48, footerTop - ch);
      if (top + ch > targetRect.top - 8) {
        top = clamp(targetRect.top - ch - 28, margin + 40, footerTop - ch);
      }
    } else {
      left = clamp(targetRect.left + 10, margin, vw - cw - margin);
      top = clamp(targetRect.top - ch - 14, margin + 48, footerTop - ch);
      if (top < margin + 48) {
        top = clamp(Math.min(targetRect.bottom + 12, footerTop - ch - 8), margin + 48, footerTop - ch);
      }
    }

    top = clamp(top, margin + 48, Math.max(margin + 48, footerTop - ch));
    left = clamp(left, margin, vw - cw - margin);

    callout.style.left = `${Math.round(left)}px`;
    callout.style.top = `${Math.round(top)}px`;
    return callout.getBoundingClientRect();
  }

  function applySpotlight(target, stepIndex) {
    const spot = document.getElementById('psw-wt-spotlight');
    if (!spot || !target) return null;

    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    let left;
    let top;
    let width;
    let height;

    if (stepIndex === 0) {
      const pad = 8;
      const size = Math.max(rect.width, rect.height) + pad * 2;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      left = cx - size / 2;
      top = cy - size / 2;
      width = size;
      height = size;
    } else {
      const pad = variant === 'pledged' ? 6 : 8;
      left = rect.left - pad;
      top = rect.top - pad;
      width = rect.width + pad * 2;
      height = rect.height + pad * 2;
    }

    spot.classList.toggle('psw-wt__spotlight--circle', stepIndex === 0);
    spot.classList.toggle('psw-wt__spotlight--stamp', stepIndex === 1 && variant === 'pledged');
    spot.classList.toggle('psw-wt__spotlight--card', stepIndex === 1 && variant === 'unpledged');
    spot.classList.remove('psw-wt__spotlight--collection', 'psw-wt__spotlight--footer');

    spot.style.left = `${Math.round(left)}px`;
    spot.style.top = `${Math.round(top)}px`;
    spot.style.width = `${Math.round(width)}px`;
    spot.style.height = `${Math.round(height)}px`;

    return { left, top, width, height };
  }

  function getRealStampStatuses() {
    if (typeof PassportPage !== 'undefined' && typeof PassportPage.getPassportData === 'function') {
      const live = PassportPage.getPassportData();
      if (live?.stamps) return live.stamps;
    }
    const cached = typeof WorldChoirPassport !== 'undefined'
      ? WorldChoirPassport.getCachedPassportData?.()
      : null;
    return cached?.stamps || null;
  }

  function applyStampsGuidePresentation() {
    const card = getPassportCard();
    if (!card || typeof PassportStamps === 'undefined') return;
    PassportStamps.applyGuidePresentation(card, { pledged: variant === 'pledged' });
    guidePresentationApplied = true;
  }

  function restoreRealStamps() {
    const card = getPassportCard();
    if (!card || typeof PassportStamps === 'undefined') {
      guidePresentationApplied = false;
      return;
    }
    PassportStamps.clearGuidePresentation(card, getRealStampStatuses() || []);
    guidePresentationApplied = false;
  }

  function waitForStampsPage(attempt = 0) {
    return new Promise((resolve) => {
      const card = getPassportCard();
      const inside = card?.querySelector('[data-passport-page="inside"]');
      const ready = card?.classList.contains('is-inside')
        && inside
        && !inside.hidden
        && (inside.querySelector('.passport-stamps-wrap') || inside.querySelector('.passport-stamps'));

      if (ready) {
        resolve(true);
        return;
      }
      if (attempt >= 40) {
        resolve(false);
        return;
      }
      setTimeout(() => {
        waitForStampsPage(attempt + 1).then(resolve);
      }, 40);
    });
  }

  function goToStampsAndContinue() {
    if (transitioning) return;
    transitioning = true;

    const callout = document.getElementById('psw-wt-callout');
    const spot = document.getElementById('psw-wt-spotlight');
    if (callout) callout.style.opacity = '0';
    if (spot) spot.style.opacity = '0';

    const navigate = () => {
      if (typeof window.__passportShowChapter === 'function') {
        window.__passportShowChapter('stamps', { historyMode: 'push' });
      } else {
        const card = getPassportCard();
        if (card && typeof WorldChoirPassport !== 'undefined') {
          WorldChoirPassport.setCardPage(card, 'inside', { historyMode: 'push' });
        }
      }

      waitForStampsPage().then((ok) => {
        if (!active) {
          transitioning = false;
          return;
        }
        if (ok) applyStampsGuidePresentation();
        step = 1;
        requestAnimationFrame(() => {
          layout();
          if (callout) callout.style.opacity = '';
          if (spot) spot.style.opacity = '';
          document.getElementById('psw-wt-next')?.focus?.();
          transitioning = false;
        });
      });
    };

    const delay = prefersReducedMotion() ? 0 : TRANSITION_MS;
    setTimeout(navigate, delay);
  }

  function layout() {
    if (!active || !rootEl) return;
    const target = getTarget(step);
    if (!target) return;

    applySpotlight(target, step);
    updateCopy();
    placeCallout(target.getBoundingClientRect(), step);
  }

  function goToStep(nextStep) {
    if (transitioning) return;
    transitioning = true;
    step = nextStep;

    const callout = document.getElementById('psw-wt-callout');
    if (callout) callout.style.opacity = '0';

    const delay = prefersReducedMotion() ? 0 : TRANSITION_MS;
    setTimeout(() => {
      layout();
      if (callout) callout.style.opacity = '';
      document.getElementById('psw-wt-next')?.focus?.();
      transitioning = false;
    }, delay);
  }

  function startOverlay() {
    if (active) return false;
    const target = getTarget(0);
    if (!target) return false;

    // Guide always begins on Passport cover.
    if (typeof window.__passportShowChapter === 'function') {
      const card = getPassportCard();
      if (card?.classList.contains('is-inside')) {
        window.__passportShowChapter('cover', { historyMode: 'replace' });
      }
    }

    ensureDom();
    active = true;
    step = 0;
    transitioning = false;
    guidePresentationApplied = false;
    variant = resolveIsPledged() ? 'pledged' : 'unpledged';

    document.body.classList.add('psw-wt-active');
    document.body.classList.toggle('psw-wt-pledged', variant === 'pledged');
    document.body.classList.toggle('psw-wt-unpledged', variant === 'unpledged');

    rootEl.hidden = false;
    rootEl.removeAttribute('hidden');
    rootEl.setAttribute('aria-hidden', 'false');
    rootEl.classList.add('is-visible');

    updateCopy();
    layout();
    requestAnimationFrame(() => {
      layout();
      document.getElementById('psw-wt-next')?.focus?.();
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
    document.body.classList.remove('psw-wt-active', 'psw-wt-pledged', 'psw-wt-unpledged');
  }

  function complete({ early = false } = {}) {
    if (!active && !rootEl) {
      clearStoredPledgeFlag();
      return;
    }

    active = false;
    transitioning = false;

    const finish = () => {
      if (guidePresentationApplied || step >= 1) {
        restoreRealStamps();
      }
      teardownOverlay();
      clearStoredPledgeFlag();
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
      clearStoredPledgeFlag();
      return;
    }
    active = false;
    transitioning = false;
    if (guidePresentationApplied || step >= 1) {
      restoreRealStamps();
    }
    teardownOverlay();
    clearStoredPledgeFlag();
  }

  function onPageReady() {
    if (active) {
      layout();
      return true;
    }
    if (!hasGuideTrigger()) return false;

    const tryStart = (attempt = 0) => {
      // Ensure we are on cover for Step 1.
      const card = getPassportCard();
      if (!card) {
        if (attempt < 40) {
          setTimeout(() => tryStart(attempt + 1), 50);
          return false;
        }
        consumeGuideTrigger();
        clearStoredPledgeFlag();
        return false;
      }

      if (card.classList.contains('is-inside') || card.dataset.page === 'inside') {
        if (typeof window.__passportShowChapter === 'function') {
          window.__passportShowChapter('cover', { historyMode: 'replace' });
        } else if (typeof WorldChoirPassport !== 'undefined') {
          WorldChoirPassport.setCardPage(card, 'cover', { historyMode: 'replace' });
        }
      }

      if (startOverlay()) {
        consumeGuideTrigger();
        return true;
      }

      if (attempt < 40) {
        setTimeout(() => tryStart(attempt + 1), 50);
        return false;
      }

      consumeGuideTrigger();
      clearStoredPledgeFlag();
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
    getStep: () => step,
    getVariant: () => variant,
  };
})();

window.PassportStampsWalkthrough = PassportStampsWalkthrough;
