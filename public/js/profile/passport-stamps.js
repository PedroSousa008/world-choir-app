/**
 * PassportStamps — reusable Passport stamp registry, unlock logic, and rendering.
 *
 * Unlock dates are derived from each event's configured eventDateUTC plus
 * unlockOffsetDays (calendar-day math in UTC; isolated for future timezone support).
 *
 * Every stamp in PASSPORT_STAMPS automatically gets the one-time center-to-corner
 * reveal on first Stamps page visit after unlock (tracked per user in localStorage).
 */
const PassportStamps = (() => {
  const UnlockType = {
    EVENT_PARTICIPATION_COMPLETED: 'EVENT_PARTICIPATION_COMPLETED',
    GLOBAL_COUNTRY_MILESTONE: 'GLOBAL_COUNTRY_MILESTONE',
  };

  /**
   * Stamp registry — add future stamps here.
   * Each entry automatically inherits unlock rules + one-time reveal animation.
   * Artwork lives in public/images/passport/stamps/ (see WorldChoirConfig.PASSPORT_STAMP_*).
   */
  const PASSPORT_STAMPS = [
    {
      id: 'world-choir-2027-i-sang',
      title: 'I Sang — World Choir 2027',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG',
      lockedImageKey: 'PASSPORT_STAMP_WORLD_CHOIR_2027_I_SANG_LOCKED',
      unlockType: UnlockType.EVENT_PARTICIPATION_COMPLETED,
      unlockOffsetDays: 1,
      placement: 'bottom-right',
      lockedMessage: 'Complete the World Choir gathering to reveal this stamp.',
    },
    {
      id: 'world-choir-100-countries',
      title: '100 Countries — World Choir',
      eventId: 'world-choir-2027',
      imageKey: 'PASSPORT_STAMP_100_COUNTRIES',
      lockedImageKey: 'PASSPORT_STAMP_100_COUNTRIES_LOCKED',
      unlockType: UnlockType.GLOBAL_COUNTRY_MILESTONE,
      milestoneId: '100-countries',
      requiredCountryCount: 100,
      requiresPledge: true,
      requiresLocation: true,
      placement: 'top-left',
      lockedMessage: 'A global milestone is waiting to be reached.',
    },
  ];

  function resolveStampImage(stamp, { unlocked = false } = {}) {
    const key = unlocked ? stamp.imageKey : (stamp.lockedImageKey || stamp.imageKey);
    if (key && typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig[key]) {
      return WorldChoirConfig[key];
    }
    if (stamp.imageKey && typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig[stamp.imageKey]) {
      return WorldChoirConfig[stamp.imageKey];
    }
    return stamp.image || null;
  }

  function getUtcCalendarDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate(),
    };
  }

  function calendarDateToTimestamp({ year, month, day }) {
    return Date.UTC(year, month, day);
  }

  function addCalendarDays(calendarDate, offsetDays) {
    const d = new Date(calendarDateToTimestamp(calendarDate));
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return getUtcCalendarDate(d);
  }

  function compareCalendarDates(a, b) {
    return calendarDateToTimestamp(a) - calendarDateToTimestamp(b);
  }

  function getEventById(eventId) {
    if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.ACTIVE_EVENT?.id === eventId) {
      return WorldChoirConfig.ACTIVE_EVENT;
    }
    return null;
  }

  /** First calendar day the stamp may unlock (UTC), derived from event date + offset. */
  function getStampUnlockCalendarDate(stamp, event = null) {
    const ev = event || getEventById(stamp.eventId);
    if (!ev?.eventDateUTC) return null;
    const eventDay = getUtcCalendarDate(new Date(ev.eventDateUTC));
    const offset = Number(stamp.unlockOffsetDays) || 0;
    return addCalendarDays(eventDay, offset);
  }

  function getStampUnlockDate(stamp, event = null) {
    const calendarDate = getStampUnlockCalendarDate(stamp, event);
    if (!calendarDate) return null;
    return new Date(calendarDateToTimestamp(calendarDate));
  }

  function hasPledgedForEvent(eventId, context = {}) {
    if (typeof context.hasPledgedForEvent === 'function') {
      return context.hasPledgedForEvent(eventId);
    }
    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.hasPledged) {
      return WorldChoirDB.hasPledged(eventId);
    }
    return false;
  }

  function isPreviewMode() {
    return typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.isPassportStampsPreviewMode?.() === true;
  }

  function isDevReplay() {
    return typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.isPassportStampsDevReplay?.() === true;
  }

  function isTestForce100CountriesMilestone(stamp) {
    if (stamp?.milestoneId !== '100-countries' && stamp?.id !== 'world-choir-100-countries') {
      return false;
    }
    return typeof WorldChoirConfig !== 'undefined'
      && WorldChoirConfig.isTestForce100CountriesMilestone?.() === true;
  }

  function userHasValidLocation(context = {}) {
    if (typeof context.userHasValidLocation === 'function') {
      return context.userHasValidLocation() === true;
    }
    const country = String(context.userCountry || '').trim();
    const city = String(context.userCity || '').trim();
    return !!(country && city);
  }

  function resolveUserEligibility(stamp, context = {}) {
    const requiresPledge = stamp.requiresPledge !== false;
    const requiresLocation = stamp.requiresLocation === true;
    const eventId = stamp.eventId;
    const pledged = !requiresPledge || hasPledgedForEvent(eventId, context);
    const hasLocation = !requiresLocation || userHasValidLocation(context);
    return { pledged, hasLocation, requiresPledge, requiresLocation };
  }

  function isGlobalCountryMilestoneReached(stamp, context = {}) {
    if (isTestForce100CountriesMilestone(stamp) || context.force100CountriesMilestone === true) {
      return true;
    }

    const milestoneId = stamp.milestoneId || `${Number(stamp.requiredCountryCount) || 100}-countries`;
    const milestone = context.milestones?.[milestoneId];
    if (milestone?.reached === true) return true;

    const required = Number(stamp.requiredCountryCount) || 100;
    return (Number(context.representedCountryCount) || 0) >= required;
  }

  function evaluateStampUnlock(stamp, context = {}) {
    const event = getEventById(stamp.eventId);
    const eligibility = resolveUserEligibility(stamp, context);

    if (isPreviewMode()) {
      return {
        unlocked: true,
        pledged: eligibility.pledged,
        hasLocation: eligibility.hasLocation,
        unlockDate: getStampUnlockDate(stamp, event),
        reason: 'preview_mode',
      };
    }

    const currentDate = context.currentDate instanceof Date ? context.currentDate : new Date();

    if (stamp.unlockType === UnlockType.EVENT_PARTICIPATION_COMPLETED) {
      const pledged = eligibility.pledged;

      if (!event) {
        return { unlocked: false, pledged, hasLocation: eligibility.hasLocation, unlockDate: null, reason: 'event_not_found' };
      }
      if (!pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: getStampUnlockDate(stamp, event),
          reason: 'not_pledged',
        };
      }

      const unlockCalendarDate = getStampUnlockCalendarDate(stamp, event);
      const today = getUtcCalendarDate(currentDate);
      const unlocked = compareCalendarDates(today, unlockCalendarDate) >= 0;

      return {
        unlocked,
        pledged: true,
        hasLocation: eligibility.hasLocation,
        unlockDate: getStampUnlockDate(stamp, event),
        reason: unlocked ? 'unlocked' : 'before_unlock_date',
      };
    }

    if (stamp.unlockType === UnlockType.GLOBAL_COUNTRY_MILESTONE) {
      const milestoneReached = isGlobalCountryMilestoneReached(stamp, context);

      if (!milestoneReached) {
        return {
          unlocked: false,
          pledged: eligibility.pledged,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'milestone_not_reached',
        };
      }
      if (!eligibility.pledged) {
        return {
          unlocked: false,
          pledged: false,
          hasLocation: eligibility.hasLocation,
          unlockDate: null,
          reason: 'not_pledged',
        };
      }
      if (!eligibility.hasLocation) {
        return {
          unlocked: false,
          pledged: true,
          hasLocation: false,
          unlockDate: null,
          reason: 'no_valid_location',
        };
      }

      return {
        unlocked: true,
        pledged: true,
        hasLocation: true,
        unlockDate: null,
        reason: 'unlocked',
      };
    }

    return {
      unlocked: false,
      pledged: eligibility.pledged,
      hasLocation: eligibility.hasLocation,
      unlockDate: null,
      reason: 'unsupported_unlock_type',
    };
  }

  function isPassportStampUnlocked(stamp, context = {}) {
    return evaluateStampUnlock(stamp, context).unlocked;
  }

  function resolveAllStatuses(context = {}) {
    return PASSPORT_STAMPS.map((stamp) => {
      const status = evaluateStampUnlock(stamp, context);
      const shouldReveal = status.unlocked
        && shouldAnimateReveal(stamp.id, context.userId);
      return {
        stamp,
        ...status,
        shouldReveal,
      };
    });
  }

  function revealStorageKey(stampId, userId) {
    return `wc_stamp_revealed_${stampId}_${userId || 'anonymous'}`;
  }

  function shouldAnimateReveal(stampId, userId) {
    if (isDevReplay()) return true;
    try {
      return localStorage.getItem(revealStorageKey(stampId, userId)) !== '1';
    } catch {
      return false;
    }
  }

  function markRevealSeen(stampId, userId) {
    if (isDevReplay()) return;
    try {
      localStorage.setItem(revealStorageKey(stampId, userId), '1');
    } catch {
      /* ignore */
    }
  }

  function usesBlurLockedPresentation(stamp, slotUnlocked) {
    if (slotUnlocked || stamp.lockedImageKey) return false;
    return stamp.lockedPresentation === 'blur' || !stamp.lockedImageKey;
  }

  function resolveStampDisplaySize(imgW, imgH, maxPx = 85) {
    if (!imgW || !imgH) return { width: maxPx, height: maxPx };
    const aspect = imgW / imgH;
    if (aspect >= 0.85 && aspect <= 1.15) {
      return { width: maxPx, height: maxPx };
    }
    if (aspect >= 1) {
      return { width: maxPx, height: Math.max(1, Math.round(maxPx / aspect)) };
    }
    return { width: Math.max(1, Math.round(maxPx * aspect)), height: maxPx };
  }

  function renderStamp(stampStatus, esc) {
    const { stamp, unlocked, shouldReveal } = stampStatus;
    const slotUnlocked = unlocked && !shouldReveal;
    const image = resolveStampImage(stamp, { unlocked: slotUnlocked });
    const imgUrl = image?.url || image?.src || '';
    const imgAlt = unlocked ? (image?.alt || stamp.title) : (image?.alt || 'Locked passport stamp');
    const imgW = Number(image?.width) || 512;
    const imgH = Number(image?.height) || 512;
    const displaySize = resolveStampDisplaySize(imgW, imgH);
    const stateClass = unlocked
      ? (shouldReveal ? 'passport-stamp--locked passport-stamp--reveal-slot' : 'passport-stamp--unlocked')
      : 'passport-stamp--locked';
    const blurClass = usesBlurLockedPresentation(stamp, slotUnlocked) ? ' passport-stamp--locked-blur' : '';
    const revealClass = unlocked && shouldReveal ? ' passport-stamp--revealing' : '';
    const lockedMsg = stamp.lockedMessage || 'Locked until your World Choir moment is complete.';
    const ariaLabel = unlocked
      ? stamp.title
      : `${stamp.title} — locked`;
    const placement = stamp.placement || 'bottom-right';

    return `
      <article
        class="passport-stamp ${stateClass}${blurClass}${revealClass}"
        data-stamp-id="${esc(stamp.id)}"
        data-stamp-unlocked="${unlocked ? '1' : '0'}"
        data-should-reveal="${shouldReveal ? '1' : '0'}"
        data-placement="${esc(placement)}"
        style="width:${displaySize.width}px"
        aria-label="${esc(ariaLabel)}"
        role="listitem"
      >
        <div class="passport-stamp__frame" style="width:${displaySize.width}px;height:${displaySize.height}px">
          <img
            class="passport-stamp__img"
            src="${esc(imgUrl)}"
            alt="${esc(imgAlt)}"
            width="${imgW}"
            height="${imgH}"
            decoding="async"
            loading="lazy"
            draggable="false"
          >
        </div>
        ${unlocked ? '' : `<p class="passport-stamp__locked-msg">${esc(lockedMsg)}</p>`}
      </article>
    `;
  }

  function renderGrid(stampStatuses = [], { esc = (s) => String(s) } = {}) {
    if (!stampStatuses.length) {
      return '<div class="passport-stamps passport-stamps--empty" aria-hidden="true"></div>';
    }

    const items = stampStatuses.map((status) => renderStamp(status, esc)).join('');
    return `<div class="passport-stamps" role="list">${items}</div>`;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  }

  function getRevealUserId() {
    return typeof WorldChoirDB !== 'undefined'
      ? (WorldChoirDB.getCurrentUser?.()?.id || WorldChoirDB.getDeviceId?.())
      : 'anonymous';
  }

  function finishReveal(stampEl, card, stampId, userId, overlay) {
    const stampDef = PASSPORT_STAMPS.find((entry) => entry.id === stampId);
    const img = stampEl?.querySelector('.passport-stamp__img');
    if (stampDef && img) {
      const unlockedImage = resolveStampImage(stampDef, { unlocked: true });
      const unlockedSrc = unlockedImage?.url || unlockedImage?.src;
      if (unlockedSrc) img.src = unlockedSrc;
    }

    stampEl?.classList.remove(
      'passport-stamp--revealing',
      'passport-stamp--reveal-pending',
      'passport-stamp--reveal-slot',
      'passport-stamp--locked'
    );
    stampEl?.classList.add('passport-stamp--unlocked');
    card?.classList.remove('passport-card--stamp-reveal-active');
    overlay?.remove();
    if (stampId) markRevealSeen(stampId, userId);
  }

  function runStampReveal(stampEl, card, userId) {
    const stampId = stampEl.dataset.stampId;
    const frame = stampEl.querySelector('.passport-stamp__frame');
    const img = stampEl.querySelector('.passport-stamp__img');
    if (!frame || !img) {
      finishReveal(stampEl, card, stampId, userId, null);
      return Promise.resolve();
    }

    if (prefersReducedMotion()) {
      finishReveal(stampEl, card, stampId, userId, null);
      return Promise.resolve();
    }

    const stampDef = PASSPORT_STAMPS.find((entry) => entry.id === stampId);
    const lockedImage = stampDef ? resolveStampImage(stampDef, { unlocked: false }) : null;
    const unlockedImage = stampDef ? resolveStampImage(stampDef, { unlocked: true }) : null;
    const lockedSrc = lockedImage?.url || lockedImage?.src || img.src;
    const unlockedSrc = unlockedImage?.url || unlockedImage?.src || img.src;

    stampEl.classList.add('passport-stamp--reveal-pending');
    card.classList.add('passport-card--stamp-reveal-active');

    const overlay = document.createElement('div');
    overlay.className = 'passport-stamp-reveal-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const floater = document.createElement('div');
    floater.className = 'passport-stamp-reveal-floater';

    const floaterImg = document.createElement('img');
    floaterImg.className = 'passport-stamp-reveal-floater__img';
    floaterImg.src = lockedSrc;
    floaterImg.alt = img.alt || '';
    floaterImg.width = img.width || 512;
    floaterImg.height = img.height || 512;
    floaterImg.decoding = 'async';
    floaterImg.draggable = false;

    floater.appendChild(floaterImg);
    overlay.appendChild(floater);
    card.appendChild(overlay);

    const cardRect = card.getBoundingClientRect();
    const targetRect = frame.getBoundingClientRect();
    const startSize = Math.min(cardRect.width * 0.58, 240);

    const startLeft = cardRect.left + (cardRect.width - startSize) / 2;
    const startTop = cardRect.top + (cardRect.height - startSize) / 2;
    const endLeft = targetRect.left;
    const endTop = targetRect.top;
    const endWidth = targetRect.width;
    const endHeight = targetRect.height;

    Object.assign(floater.style, {
      left: `${startLeft}px`,
      top: `${startTop}px`,
      width: `${startSize}px`,
      height: `${startSize}px`,
    });

    floaterImg.style.filter = 'blur(14px)';
    floaterImg.style.opacity = '0.75';
    floater.style.opacity = '0';

    const preloadUnlocked = () => new Promise((resolve) => {
      if (unlockedSrc === lockedSrc) {
        resolve();
        return;
      }
      const preload = new Image();
      preload.onload = resolve;
      preload.onerror = resolve;
      preload.src = unlockedSrc;
    });

    return new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        finishReveal(stampEl, card, stampId, userId, overlay);
        resolve();
      };

      window.setTimeout(done, 5200);

      const CENTER_TOTAL_MS = 3000;
      const CENTER_INTRO_MS = 540;
      const CENTER_UNLOCK_MS = 520;
      const CENTER_HOLD_MS = CENTER_TOTAL_MS - CENTER_INTRO_MS - CENTER_UNLOCK_MS;

      const runFlight = () => {
        floater.style.opacity = '1';

        const fadeIn = floater.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 280, easing: 'ease-out', fill: 'forwards' }
        );

        const lockedPulse = floaterImg.animate(
          [
            { filter: 'blur(14px)', opacity: 0.75, transform: 'scale(0.98)' },
            { filter: 'blur(8px)', opacity: 0.92, transform: 'scale(1)' },
          ],
          { duration: 420, easing: 'ease-out', fill: 'forwards', delay: 120 }
        );

        Promise.all([fadeIn.finished, lockedPulse.finished, preloadUnlocked()]).then(() => {
          floaterImg.src = unlockedSrc;
          floaterImg.style.transform = 'scale(1)';

          const reveal = floaterImg.animate(
            [
              { filter: 'blur(8px)', opacity: 0.88, transform: 'scale(0.98)' },
              { filter: 'blur(0px)', opacity: 1, transform: 'scale(1)' },
            ],
            { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
          );

          reveal.finished.then(() => {
            window.setTimeout(() => {
              const flight = floater.animate(
                [
                  {
                    left: `${startLeft}px`,
                    top: `${startTop}px`,
                    width: `${startSize}px`,
                    height: `${startSize}px`,
                  },
                  {
                    left: `${endLeft}px`,
                    top: `${endTop}px`,
                    width: `${endWidth}px`,
                    height: `${endHeight}px`,
                  },
                ],
                {
                  duration: 980,
                  easing: 'cubic-bezier(0.34, 1.08, 0.42, 1)',
                  fill: 'forwards',
                }
              );

              const settle = floaterImg.animate(
                [
                  { transform: 'scale(1)' },
                  { transform: 'scale(1.06)', offset: 0.72 },
                  { transform: 'scale(1)' },
                ],
                {
                  duration: 980,
                  easing: 'cubic-bezier(0.34, 1.08, 0.42, 1)',
                  fill: 'forwards',
                }
              );

              Promise.all([flight.finished, settle.finished]).then(done).catch(done);
            }, CENTER_HOLD_MS);
          }).catch(done);
        }).catch(done);
      };

      if (floaterImg.complete && floaterImg.naturalWidth > 0) {
        requestAnimationFrame(() => requestAnimationFrame(runFlight));
        return;
      }

      floaterImg.addEventListener('load', () => {
        requestAnimationFrame(() => requestAnimationFrame(runFlight));
      }, { once: true });
      floaterImg.addEventListener('error', done, { once: true });
    });
  }

  async function bindRevealAnimations(root = document) {
    const scope = root.querySelector?.('.passport-card') || root.closest?.('.passport-card') || root;
    if (!scope) return;

    const userId = getRevealUserId();
    const queue = [...scope.querySelectorAll('.passport-stamp--revealing')];

    for (const el of queue) {
      if (el.dataset.revealBound === '1') continue;
      el.dataset.revealBound = '1';
      await runStampReveal(el, scope, userId);
    }
  }

  return {
    UnlockType,
    PASSPORT_STAMPS,
    getEventById,
    getStampUnlockCalendarDate,
    getStampUnlockDate,
    isPassportStampUnlocked,
    evaluateStampUnlock,
    resolveAllStatuses,
    renderGrid,
    bindRevealAnimations,
    shouldAnimateReveal,
    markRevealSeen,
  };
})();
