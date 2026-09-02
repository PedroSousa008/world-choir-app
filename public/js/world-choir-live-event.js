/**
 * LiveEventMode — post-song promise flow + compatibility shim for GlobalLiveEvent.
 *
 * The synchronized pre-event video and live song are owned by GlobalLiveEvent.
 * This module keeps the promise / final-moment flow and legacy API surface.
 */
const LiveEventMode = (() => {
  let active = false;

  function storageKey() {
    return `wc_live_flow_complete_${WorldChoirDB.getCurrentUser().id}`;
  }

  function hasCompletedFlow() {
    return localStorage.getItem(storageKey()) === 'true';
  }

  function markFlowComplete() {
    localStorage.setItem(storageKey(), 'true');
  }

  function usesGlobalLive() {
    return typeof GlobalLiveEvent !== 'undefined';
  }

  function isDuringLiveSong() {
    if (usesGlobalLive()) return GlobalLiveEvent.isDuringLiveSong();
    const now = Date.now();
    return now >= WorldChoirConfig.getEventStart().getTime() && now < WorldChoirConfig.getEventEnd().getTime();
  }

  function isPostEvent() {
    if (usesGlobalLive() && GlobalLiveEvent.getState() === 'LIVE_FINISHED') return true;
    return Date.now() >= WorldChoirConfig.getEventEnd().getTime();
  }

  function getContainer() {
    return document.getElementById('live-event-mode');
  }

  function getContentEl() {
    return document.getElementById('live-event-content');
  }

  function showOverlay() {
    const container = getContainer();
    if (!container) return;
    container.classList.add('active');
    container.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    active = true;
  }

  function hideOverlay() {
    const container = getContainer();
    if (container) {
      container.classList.remove('active');
      container.setAttribute('aria-hidden', 'true');
    }
    if (!usesGlobalLive() || !GlobalLiveEvent.isActive()) {
      document.body.style.overflow = '';
    }
    active = false;
  }

  function showPostSongFlow() {
    if (hasCompletedFlow()) {
      hideOverlay();
      return;
    }
    showOverlay();
    if (WorldChoirDB.hasPledged() && !WorldChoirDB.hasSubmittedPromise()) {
      showPromiseForm();
    } else {
      showFinalMessage();
    }
  }

  function showPromiseForm() {
    const contentEl = getContentEl();
    if (!contentEl) return;

    contentEl.innerHTML = `
      <div class="live-promise">
        <p class="live-promise__label">My Promise to the World</p>
        <h2 class="live-promise__title">What do you promise the world?</h2>
        <p class="live-promise__copy">You sang with millions. Now leave your promise — one honest intention for the world ahead.</p>
        <div class="form-group live-promise__form">
          <label class="sr-only" for="live-promise-text">Your promise</label>
          <textarea class="form-textarea" id="live-promise-text" placeholder="I promise to…" maxlength="500"></textarea>
        </div>
        <div class="actions-row">
          <button class="btn btn-primary" id="live-promise-submit" type="button">Share My Promise</button>
        </div>
      </div>
    `;

    const textarea = document.getElementById('live-promise-text');
    const btn = document.getElementById('live-promise-submit');

    btn?.addEventListener('click', () => {
      const text = textarea?.value.trim();
      if (!text) {
        alert('Please write your promise before continuing.');
        textarea?.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      WorldChoirDB.createPromise({ promiseText: text });
      showFinalMessage();
    });

    textarea?.focus();
  }

  function showFinalMessage() {
    const contentEl = getContentEl();
    if (!contentEl) return;

    contentEl.innerHTML = `
      <div class="live-final">
        <p class="live-final__line">You didn't just sing a song.</p>
        <p class="live-final__line live-final__line--emphasis">You became part of something greater.</p>
        <p class="live-final__line live-final__line--calm">Put your phone down and simply feel this moment.</p>
        <div class="actions-row live-final__actions">
          <button class="btn btn-primary" id="live-final-continue" type="button">Continue</button>
        </div>
      </div>
    `;

    document.getElementById('live-final-continue')?.addEventListener('click', finishFlow);
  }

  function finishFlow() {
    markFlowComplete();
    hideOverlay();
    if (typeof WorldChoirHome !== 'undefined') {
      WorldChoirHome.render();
    }
  }

  function launch() {
    if (hasCompletedFlow() || active) return;
    if (usesGlobalLive() && GlobalLiveEvent.isActive()) return;

    if (isPostEvent()) {
      if (WorldChoirDB.hasPledged() && !WorldChoirDB.hasSubmittedPromise()) {
        showOverlay();
        showPromiseForm();
        return;
      }
      if (WorldChoirDB.hasSubmittedPromise()) {
        showOverlay();
        showFinalMessage();
      }
    }
  }

  function init() {
    const container = getContainer();
    if (container && !container.querySelector('.practice-mode__ambient')) {
      const ambient = document.createElement('div');
      ambient.className = 'practice-mode__ambient';
      ambient.setAttribute('aria-hidden', 'true');
      container.insertBefore(ambient, container.firstChild);
    }
  }

  return {
    init,
    launch,
    isDuringLiveSong,
    isPostEvent,
    hasCompletedFlow,
    isActive: () => active || (usesGlobalLive() && GlobalLiveEvent.isActive()),
    finishFlow,
    showPostSongFlow,
    showPromiseForm,
    showFinalMessage,
  };
})();
