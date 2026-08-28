/**
 * PassportStamps — reusable Passport stamp registry, unlock logic, and rendering.
 *
 * Unlock dates are derived from each event's configured eventDateUTC plus
 * unlockOffsetDays (calendar-day math in UTC; isolated for future timezone support).
 */
const PassportStamps = (() => {
  const UnlockType = {
    EVENT_PARTICIPATION_COMPLETED: 'EVENT_PARTICIPATION_COMPLETED',
  };

  /**
   * Stamp registry — add future stamps here.
   * Drop artwork at each stamp's image.src and bump image.version.
   */
  const PASSPORT_STAMPS = [
    {
      id: 'world-choir-2027-i-sang',
      title: 'I Sang — World Choir 2027',
      eventId: 'world-choir-2027',
      image: {
        src: 'images/passport/stamps/world-choir-2027-i-sang.png',
        version: '20260828a',
        width: 512,
        height: 512,
        alt: 'I Sang — World Choir 2027 stamp',
        get url() {
          return `${this.src}?v=${this.version}`;
        },
      },
      unlockType: UnlockType.EVENT_PARTICIPATION_COMPLETED,
      unlockOffsetDays: 1,
      lockedMessage: 'Complete the World Choir gathering to reveal this stamp.',
    },
  ];

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

  function evaluateStampUnlock(stamp, context = {}) {
    const event = getEventById(stamp.eventId);
    const currentDate = context.currentDate instanceof Date ? context.currentDate : new Date();
    const pledged = hasPledgedForEvent(stamp.eventId, context);

    if (stamp.unlockType === UnlockType.EVENT_PARTICIPATION_COMPLETED) {
      if (!event) {
        return { unlocked: false, pledged, unlockDate: null, reason: 'event_not_found' };
      }
      if (!pledged) {
        return {
          unlocked: false,
          pledged: false,
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
        unlockDate: getStampUnlockDate(stamp, event),
        reason: unlocked ? 'unlocked' : 'before_unlock_date',
      };
    }

    return { unlocked: false, pledged, unlockDate: null, reason: 'unsupported_unlock_type' };
  }

  function isPassportStampUnlocked(stamp, context = {}) {
    return evaluateStampUnlock(stamp, context).unlocked;
  }

  function resolveAllStatuses(context = {}) {
    return PASSPORT_STAMPS.map((stamp) => {
      const status = evaluateStampUnlock(stamp, context);
      const shouldReveal = status.unlocked && shouldAnimateReveal(stamp.id, context.userId);
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
    try {
      return localStorage.getItem(revealStorageKey(stampId, userId)) !== '1';
    } catch {
      return false;
    }
  }

  function markRevealSeen(stampId, userId) {
    try {
      localStorage.setItem(revealStorageKey(stampId, userId), '1');
    } catch {
      /* ignore */
    }
  }

  function renderStamp(stampStatus, esc) {
    const { stamp, unlocked, shouldReveal } = stampStatus;
    const imgUrl = stamp.image?.url || stamp.image?.src || '';
    const imgAlt = unlocked ? (stamp.image?.alt || stamp.title) : 'Locked passport stamp';
    const stateClass = unlocked ? 'passport-stamp--unlocked' : 'passport-stamp--locked';
    const revealClass = unlocked && shouldReveal ? ' passport-stamp--revealing' : '';
    const lockedMsg = stamp.lockedMessage || 'Locked until your World Choir moment is complete.';
    const ariaLabel = unlocked
      ? stamp.title
      : `${stamp.title} — locked`;

    return `
      <article
        class="passport-stamp ${stateClass}${revealClass}"
        data-stamp-id="${esc(stamp.id)}"
        data-stamp-unlocked="${unlocked ? '1' : '0'}"
        aria-label="${esc(ariaLabel)}"
        role="listitem"
      >
        <div class="passport-stamp__frame">
          <img
            class="passport-stamp__img"
            src="${esc(imgUrl)}"
            alt="${esc(imgAlt)}"
            width="${Number(stamp.image?.width) || 512}"
            height="${Number(stamp.image?.height) || 512}"
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

  function bindRevealAnimations(root = document) {
    const scope = root.querySelector?.('.passport-card') || root.closest?.('.passport-card') || root;
    if (!scope) return;

    const userId = typeof WorldChoirDB !== 'undefined'
      ? (WorldChoirDB.getCurrentUser?.()?.id || WorldChoirDB.getDeviceId?.())
      : 'anonymous';

    scope.querySelectorAll('.passport-stamp--revealing').forEach((el) => {
      if (el.dataset.revealBound === '1') return;
      el.dataset.revealBound = '1';

      const stampId = el.dataset.stampId;
      const img = el.querySelector('.passport-stamp__img');
      const finish = () => {
        el.classList.remove('passport-stamp--revealing');
        if (stampId) markRevealSeen(stampId, userId);
      };

      if (!img) {
        finish();
        return;
      }

      const onDone = () => {
        img.removeEventListener('animationend', onDone);
        finish();
      };

      img.addEventListener('animationend', onDone, { once: true });

      window.setTimeout(() => {
        if (el.classList.contains('passport-stamp--revealing')) finish();
      }, 900);
    });
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
