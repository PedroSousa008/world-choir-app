/**
 * World Choir — Privacy & optional analytics consent
 *
 * Essential app identity (`wc_anonymous_device_id`) is NEVER gated here.
 * Optional analytics (e.g. `wc_map_visitor_id` / map sponsor events) require
 * an explicit Accept analytics decision stored in `wc_privacy_consent_v1`.
 *
 * Safe default: analytics OFF until analytics === true is confirmed.
 */
const WorldChoirPrivacy = (() => {
  const STORAGE_KEY = 'wc_privacy_consent_v1';
  const MAP_VISITOR_KEY = 'wc_map_visitor_id';
  const VERSION = 1;
  const PRIVACY_POLICY_HREF = 'privacy-policy.html';

  const STATE = {
    UNDECIDED: 'UNDECIDED',
    ESSENTIAL_ONLY: 'ESSENTIAL_ONLY',
    ANALYTICS_ACCEPTED: 'ANALYTICS_ACCEPTED',
  };

  let overlayEl = null;
  let dialogEl = null;
  let previouslyFocused = null;
  let openMode = 'first-visit'; // first-visit | preferences
  let focusTrapHandler = null;
  let keyHandler = null;
  let scrollLockY = 0;
  let isOpen = false;

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function parseConsent(raw) {
    if (raw == null || raw === '') return null;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (typeof data.analytics !== 'boolean') return null;
      return {
        version: Number(data.version) === VERSION ? VERSION : (Number(data.version) || VERSION),
        analytics: data.analytics === true,
        decidedAt: typeof data.decidedAt === 'string' ? data.decidedAt : null,
      };
    } catch {
      return null;
    }
  }

  function readConsent() {
    return parseConsent(safeStorageGet(STORAGE_KEY));
  }

  function getState() {
    const consent = readConsent();
    if (!consent) return STATE.UNDECIDED;
    return consent.analytics ? STATE.ANALYTICS_ACCEPTED : STATE.ESSENTIAL_ONLY;
  }

  function hasDecision() {
    return getState() !== STATE.UNDECIDED;
  }

  /** Optional analytics only — never gates essential World Choir identity. */
  function analyticsAllowed() {
    const consent = readConsent();
    return !!(consent && consent.analytics === true);
  }

  function writeConsent(analytics) {
    const payload = {
      version: VERSION,
      analytics: analytics === true,
      decidedAt: new Date().toISOString(),
    };
    safeStorageSet(STORAGE_KEY, JSON.stringify(payload));
    if (!payload.analytics) {
      clearMapVisitorId();
    }
    try {
      window.dispatchEvent(new CustomEvent('wc-privacy-consent', {
        detail: { analytics: payload.analytics, state: getState() },
      }));
    } catch {
      /* ignore */
    }
    return payload;
  }

  function clearMapVisitorId() {
    safeStorageRemove(MAP_VISITOR_KEY);
  }

  function acceptAnalytics() {
    writeConsent(true);
    closeModal();
  }

  function useEssentialOnly() {
    writeConsent(false);
    closeModal();
  }

  function logoUrl() {
    if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO?.url) {
      return WorldChoirConfig.LOGO.url;
    }
    return 'images/world-choir-logo.png?v=20270706';
  }

  function logoAlt() {
    if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO?.alt) {
      return WorldChoirConfig.LOGO.alt;
    }
    return 'World Choir App';
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureStylesheet() {
    if (document.getElementById('wc-privacy-consent-css')) return;
    const link = document.createElement('link');
    link.id = 'wc-privacy-consent-css';
    link.rel = 'stylesheet';
    link.href = 'css/privacy-consent.css?v=20260911theme';
    document.head.appendChild(link);
  }

  function buildModalHtml() {
    return `
      <div class="wc-privacy" id="wc-privacy-overlay" hidden aria-hidden="true">
        <div class="wc-privacy__backdrop" data-wc-privacy-dismiss="1"></div>
        <div
          class="wc-privacy__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wc-privacy-title"
          aria-describedby="wc-privacy-desc"
          tabindex="-1"
          id="wc-privacy-dialog"
        >
          <button type="button" class="wc-privacy__close" id="wc-privacy-close" aria-label="Close and use essential technologies only">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>

          <img class="wc-privacy__logo" src="${esc(logoUrl())}" alt="${esc(logoAlt())}" width="96" height="96" decoding="async">

          <h2 class="wc-privacy__title" id="wc-privacy-title">
            Your privacy matters
            <span class="wc-privacy__heart" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20s-7-4.35-7-10a4 4 0 017-2.65A4 4 0 0119 10c0 5.65-7 10-7 10z"/>
              </svg>
            </span>
          </h2>

          <p class="wc-privacy__lead" id="wc-privacy-desc">
            We use essential technologies to make World Choir work. With your permission, we’d also like to measure anonymous engagement to understand our reach and support our partners who help make World Choir possible.
          </p>

          <ul class="wc-privacy__rows" role="list">
            <li class="wc-privacy__row">
              <span class="wc-privacy__row-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
                </svg>
              </span>
              <span class="wc-privacy__row-text">
                <strong>Essential only</strong>
                <span>Required for the app to work — including your Voice, preferences and security.</span>
              </span>
            </li>
            <li class="wc-privacy__row">
              <span class="wc-privacy__row-icon wc-privacy__row-icon--accent" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19V9M10 19V5M16 19v-7M22 19V8"/>
                </svg>
              </span>
              <span class="wc-privacy__row-text">
                <strong>Anonymous analytics (optional)</strong>
                <span>Helps us understand how features like the Map and sponsor content are used, so we can grow our impact. Analytics are used for aggregated World Choir reporting.</span>
              </span>
            </li>
          </ul>

          <div class="wc-privacy__actions">
            <button type="button" class="wc-privacy__btn wc-privacy__btn--essential" id="wc-privacy-essential">
              Essential only
            </button>
            <button type="button" class="wc-privacy__btn wc-privacy__btn--accept" id="wc-privacy-accept">
              Accept analytics
            </button>
          </div>

          <a class="wc-privacy__policy" href="${PRIVACY_POLICY_HREF}" id="wc-privacy-policy-link">
            Privacy &amp; Cookies <span aria-hidden="true">›</span>
          </a>
        </div>
      </div>
    `;
  }

  function ensureModal() {
    ensureStylesheet();
    overlayEl = document.getElementById('wc-privacy-overlay');
    if (!overlayEl) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildModalHtml().trim();
      document.body.appendChild(wrap.firstElementChild);
      overlayEl = document.getElementById('wc-privacy-overlay');
    }
    dialogEl = document.getElementById('wc-privacy-dialog');
    bindOnce();
  }

  let bound = false;
  function bindOnce() {
    if (bound || !overlayEl) return;
    bound = true;

    document.getElementById('wc-privacy-essential')?.addEventListener('click', (e) => {
      e.preventDefault();
      useEssentialOnly();
    });
    document.getElementById('wc-privacy-accept')?.addEventListener('click', (e) => {
      e.preventDefault();
      acceptAnalytics();
    });
    document.getElementById('wc-privacy-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      onDismiss();
    });
    overlayEl.querySelector('[data-wc-privacy-dismiss]')?.addEventListener('click', (e) => {
      e.preventDefault();
      onDismiss();
    });
    document.getElementById('wc-privacy-policy-link')?.addEventListener('click', () => {
      // Navigating away does NOT record consent. If they return undecided, prompt again.
    });
  }

  function onDismiss() {
    if (openMode === 'preferences' && hasDecision()) {
      closeModal();
      return;
    }
    useEssentialOnly();
  }

  function getFocusable() {
    if (!dialogEl) return [];
    const nodes = dialogEl.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter((el) => {
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function lockScroll() {
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add('wc-privacy-open');
    document.body.classList.add('wc-privacy-open');
    document.body.style.top = `-${scrollLockY}px`;
  }

  function unlockScroll() {
    document.documentElement.classList.remove('wc-privacy-open');
    document.body.classList.remove('wc-privacy-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollLockY);
  }

  function openModal(mode = 'first-visit') {
    ensureModal();
    if (!overlayEl || !dialogEl || isOpen) return;

    openMode = mode;
    previouslyFocused = document.activeElement;
    isOpen = true;
    lockScroll();

    overlayEl.hidden = false;
    overlayEl.setAttribute('aria-hidden', 'false');
    overlayEl.classList.remove('is-closing');
    // Force reflow then animate in
    void overlayEl.offsetWidth;
    overlayEl.classList.add('is-open');

    keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    focusTrapHandler = (e) => {
      if (e.key !== 'Tab' || !dialogEl) return;
      const focusable = getFocusable();
      if (!focusable.length) {
        e.preventDefault();
        dialogEl.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', focusTrapHandler, true);

    const preferAccept = mode === 'preferences' && analyticsAllowed();
    requestAnimationFrame(() => {
      const target = preferAccept
        ? document.getElementById('wc-privacy-accept')
        : document.getElementById('wc-privacy-essential');
      (target || dialogEl)?.focus();
    });
  }

  function closeModal() {
    if (!overlayEl || !isOpen) return;
    isOpen = false;

    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    if (focusTrapHandler) {
      document.removeEventListener('keydown', focusTrapHandler, true);
      focusTrapHandler = null;
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    overlayEl.classList.add('is-closing');
    overlayEl.classList.remove('is-open');

    const finish = () => {
      if (!overlayEl) return;
      overlayEl.hidden = true;
      overlayEl.setAttribute('aria-hidden', 'true');
      overlayEl.classList.remove('is-closing');
      unlockScroll();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
      previouslyFocused = null;
    };

    if (reduceMotion) {
      finish();
    } else {
      window.setTimeout(finish, 220);
    }
  }

  function openPreferences() {
    openModal('preferences');
  }

  /** First-visit auto prompt — only when no valid decision exists. */
  function maybeAutoPrompt() {
    if (hasDecision()) return false;
    openModal('first-visit');
    return true;
  }

  function isPublicAppPage() {
    try {
      const path = String(window.location.pathname || '').toLowerCase();
      if (/\/(owner|members|admin|owner-database|setup-ai|privacy-policy|terms-and-conditions|contact)(\.html)?$/.test(path)) {
        return false;
      }
      if (/\/(api)\//.test(path)) return false;
      return true;
    } catch {
      return true;
    }
  }

  function boot() {
    // Privacy-safe: if an old visitor id exists but consent was never recorded,
    // do not use it. Leave it in place until Essential only (then remove) or
    // Accept analytics (then it may be reused). Tracking code must check analyticsAllowed().
    if (!isPublicAppPage()) return;
    // Defer slightly so Home/shell can paint first (skeleton continuity).
    window.setTimeout(() => {
      try {
        maybeAutoPrompt();
      } catch (err) {
        console.warn('WorldChoirPrivacy prompt skipped:', err);
      }
    }, 0);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }

  return {
    STORAGE_KEY,
    MAP_VISITOR_KEY,
    STATE,
    getState,
    hasDecision,
    analyticsAllowed,
    acceptAnalytics,
    useEssentialOnly,
    openPreferences,
    maybeAutoPrompt,
    clearMapVisitorId,
    /** Test helper — does not clear wc_anonymous_device_id. */
    _resetForTesting() {
      safeStorageRemove(STORAGE_KEY);
      clearMapVisitorId();
    },
  };
})();

window.WorldChoirPrivacy = WorldChoirPrivacy;
