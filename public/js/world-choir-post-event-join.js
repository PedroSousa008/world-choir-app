/**
 * WorldChoirPostEventJoin — first-open invite after the live event.
 *
 * After cookies: unpledged visitors see “Be a part of the World Choir”.
 * Confirm → city/country → Map voice-joined animation.
 * Does not count toward Home “People Sang” (frozen at event start).
 */
const WorldChoirPostEventJoin = (() => {
  const SESSION_DISMISS_KEY = 'wc_post_event_join_dismissed_v1';
  const CTA_LABEL = 'Be a part of the World Choir';

  let overlayEl = null;
  let dialogEl = null;
  let isOpen = false;
  let scrollLockY = 0;
  let promptedThisPage = false;

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

  function isPostEventComplete() {
    if (typeof WorldChoirConfig === 'undefined') return false;
    const state = WorldChoirConfig.getGlobalEventState?.();
    return state === WorldChoirConfig.EventState?.COMPLETED;
  }

  /** Pre-event only — hide Profile / Map “I'll Sing” once the event has started. */
  function shouldShowIllSingCta() {
    if (typeof WorldChoirConfig === 'undefined') return true;
    const state = WorldChoirConfig.getGlobalEventState?.();
    const ES = WorldChoirConfig.EventState;
    if (!ES) return true;
    return state === ES.UPCOMING || state === ES.FINAL_HOUR;
  }

  function privacyIsOpen() {
    return !!document.querySelector('#wc-privacy-overlay.is-open');
  }

  function hasPrivacyDecision() {
    return typeof WorldChoirPrivacy !== 'undefined' && WorldChoirPrivacy.hasDecision?.() === true;
  }

  function isPledged() {
    if (typeof WorldChoirPledgeState !== 'undefined') {
      return WorldChoirPledgeState.getState() === 'pledged';
    }
    return typeof WorldChoirDB !== 'undefined' && WorldChoirDB.hasPledged?.() === true;
  }

  function pledgeStateReady() {
    if (typeof WorldChoirPledgeState !== 'undefined') {
      if (typeof WorldChoirPledgeState.isLoaded === 'function') {
        return WorldChoirPledgeState.isLoaded();
      }
      return WorldChoirPledgeState.getState() !== 'loading';
    }
    return typeof WorldChoirDB !== 'undefined' && WorldChoirDB.isPledgeLoaded?.() === true;
  }

  function wasDismissedThisSession() {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  function dismissThisSession() {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function isMapPage() {
    return /map\.html$/i.test(String(window.location.pathname || ''));
  }

  function logoUrl() {
    if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO?.url) {
      return WorldChoirConfig.LOGO.url;
    }
    return 'images/world-choir-logo.png?v=20270706';
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureStylesheet() {
    if (document.getElementById('wc-post-event-join-css')) return;
    const link = document.createElement('link');
    link.id = 'wc-post-event-join-css';
    link.rel = 'stylesheet';
    link.href = 'css/post-event-join.css?v=20260907a';
    document.head.appendChild(link);
  }

  function lockScroll() {
    scrollLockY = window.scrollY || 0;
    document.documentElement.classList.add('wc-post-join-open');
    document.body.classList.add('wc-post-join-open');
    document.body.style.top = `-${scrollLockY}px`;
  }

  function unlockScroll() {
    document.documentElement.classList.remove('wc-post-join-open');
    document.body.classList.remove('wc-post-join-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollLockY);
  }

  function ensureMarkup() {
    if (overlayEl && document.body.contains(overlayEl)) return;
    ensureStylesheet();

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="wc-post-join" id="wc-post-join-overlay" hidden aria-hidden="true">
        <div class="wc-post-join__backdrop" data-wc-post-join-later="1"></div>
        <div
          class="wc-post-join__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wc-post-join-title"
          aria-describedby="wc-post-join-lead"
          tabindex="-1"
          id="wc-post-join-dialog"
        >
          <img class="wc-post-join__logo" src="${esc(logoUrl())}" alt="World Choir" width="96" height="96" decoding="async">
          <h2 class="wc-post-join__title" id="wc-post-join-title">${esc(CTA_LABEL)}</h2>
          <p class="wc-post-join__lead" id="wc-post-join-lead">
            Add your voice to the map. New voices still light up cities — even after the song.
          </p>
          <button type="button" class="wc-post-join__btn" id="wc-post-join-cta">${esc(CTA_LABEL)}</button>
          <button type="button" class="wc-post-join__later" id="wc-post-join-later" data-wc-post-join-later="1">Not now</button>
        </div>
      </div>
    `;
    overlayEl = wrap.firstElementChild;
    document.body.appendChild(overlayEl);
    dialogEl = document.getElementById('wc-post-join-dialog');

    document.getElementById('wc-post-join-cta')?.addEventListener('click', startJoinFlow);
    overlayEl.addEventListener('click', (e) => {
      if (e.target?.closest?.('[data-wc-post-join-later]')) {
        dismissThisSession();
        closeInvite();
      }
    });
  }

  function openInvite() {
    if (isOpen) return;
    ensureMarkup();
    isOpen = true;
    overlayEl.hidden = false;
    overlayEl.setAttribute('aria-hidden', 'false');
    overlayEl.classList.remove('is-closing');
    lockScroll();
    requestAnimationFrame(() => {
      overlayEl?.classList.add('is-open');
      try {
        dialogEl?.focus();
      } catch {
        /* ignore */
      }
    });
  }

  function closeInvite() {
    if (!isOpen || !overlayEl) return;
    isOpen = false;
    overlayEl.classList.add('is-closing');
    overlayEl.classList.remove('is-open');
    const finish = () => {
      if (!overlayEl) return;
      overlayEl.hidden = true;
      overlayEl.setAttribute('aria-hidden', 'true');
      overlayEl.classList.remove('is-closing');
      unlockScroll();
    };
    window.setTimeout(finish, 220);
  }

  async function goToMapWithAnimation(pledge) {
    if (typeof WorldChoirParticipation !== 'undefined') {
      WorldChoirParticipation.triggerVoiceJoinedAnimation(pledge);
    }
    if (isMapPage() && typeof WorldChoirMap !== 'undefined' && typeof WorldChoirMap.runVoiceJoinedAnimation === 'function') {
      await WorldChoirMap.runVoiceJoinedAnimation({
        lat: pledge.latitude,
        lng: pledge.longitude,
        city: pledge.city,
        country: pledge.country,
      });
      return;
    }
    window.location.href = 'map.html';
  }

  function startJoinFlow() {
    closeInvite();
    if (typeof WorldChoirParticipation === 'undefined') {
      window.location.href = 'map.html';
      return;
    }

    WorldChoirParticipation.ensureMarkup?.();
    WorldChoirParticipation.init({});
    WorldChoirParticipation.open({
      postEvent: true,
      onSuccess: async (pledge) => {
        await goToMapWithAnimation(pledge);
      },
      onCancel: () => {
        promptedThisPage = false;
        openInvite();
      },
    });
  }

  function canPrompt() {
    if (!isPublicAppPage()) return false;
    if (!isPostEventComplete()) return false;
    if (!hasPrivacyDecision()) return false;
    if (privacyIsOpen()) return false;
    if (wasDismissedThisSession()) return false;
    if (!pledgeStateReady()) return false;
    if (isPledged()) return false;
    return true;
  }

  function maybePrompt() {
    if (promptedThisPage) return false;
    if (!canPrompt()) return false;
    promptedThisPage = true;
    openInvite();
    return true;
  }

  function schedulePrompt(delayMs = 280) {
    window.setTimeout(() => {
      try {
        maybePrompt();
      } catch (err) {
        console.warn('WorldChoirPostEventJoin prompt skipped:', err);
      }
    }, delayMs);
  }

  function boot() {
    if (!isPublicAppPage()) return;

    window.addEventListener('wc-privacy-consent', () => schedulePrompt(320));
    window.addEventListener('wc-pledge-state', () => {
      if (isPledged()) {
        closeInvite();
        return;
      }
      schedulePrompt(200);
    });
    window.addEventListener('wc-pledge-added', () => {
      closeInvite();
    });

    const afterPledgeReady = () => {
      if (hasPrivacyDecision()) schedulePrompt(400);
    };

    if (typeof WorldChoirPledgeState !== 'undefined' && typeof WorldChoirPledgeState.init === 'function') {
      WorldChoirPledgeState.init().then(afterPledgeReady).catch(afterPledgeReady);
    } else if (typeof WorldChoirDB !== 'undefined' && typeof WorldChoirDB.readyProfile === 'function') {
      WorldChoirDB.readyProfile().then(afterPledgeReady).catch(afterPledgeReady);
    } else if (hasPrivacyDecision()) {
      schedulePrompt(500);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }

  return {
    CTA_LABEL,
    maybePrompt,
    openInvite,
    closeInvite,
    shouldShowIllSingCta,
    isPostEventComplete,
    startJoinFlow,
  };
})();

window.WorldChoirPostEventJoin = WorldChoirPostEventJoin;
