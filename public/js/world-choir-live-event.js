/**
 * LiveEventMode — global countdown → synced lyrics + music → promise → final moment
 */
const LiveEventMode = (() => {
  let audio = null;
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

  function isDuringLiveSong() {
    const now = Date.now();
    return now >= WorldChoirConfig.getEventStart().getTime() && now < WorldChoirConfig.getEventEnd().getTime();
  }

  function isPostEvent() {
    return Date.now() >= WorldChoirConfig.getEventEnd().getTime();
  }

  function getLiveOffsetSeconds() {
    return Math.max(0, (Date.now() - WorldChoirConfig.getEventStart().getTime()) / 1000);
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
    document.body.style.overflow = '';
    active = false;
  }

  function cleanupAudio() {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.removeEventListener('ended', handleSongEnd);
    audio.removeEventListener('error', handleAudioError);
    audio.src = '';
    audio.load();
    audio = null;
  }

  function cleanup() {
    LyricsDisplay.stopSync();
    cleanupAudio();
  }

  function handleAudioError() {
    cleanup();
    const contentEl = getContentEl();
    if (!contentEl) return;
    contentEl.innerHTML = `
      <div class="live-event-error">
        <h2 class="live-event-error__title">Audio unavailable</h2>
        <p class="live-event-error__copy">We couldn't play the song right now. The world is still singing — join in wherever you are.</p>
        <div class="actions-row">
          <button class="btn btn-primary" id="live-error-continue" type="button">Continue</button>
        </div>
      </div>
    `;
    document.getElementById('live-error-continue')?.addEventListener('click', () => {
      showPostSongFlow();
    });
  }

  function handleSongEnd() {
    cleanup();
    showPostSongFlow();
  }

  function showPostSongFlow() {
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
      <div class="live-promise fade-in">
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
      <div class="live-final fade-in">
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
    cleanup();
    hideOverlay();
    if (typeof WorldChoirHome !== 'undefined') {
      WorldChoirHome.render();
    }
  }

  function waitForAudioReady(audioEl) {
    return new Promise((resolve, reject) => {
      if (audioEl.readyState >= 1) {
        resolve();
        return;
      }
      audioEl.addEventListener('loadedmetadata', () => resolve(), { once: true });
      audioEl.addEventListener('error', () => reject(new Error('Audio load failed')), { once: true });
    });
  }

  async function startPlayback() {
    if (active || hasCompletedFlow()) return;

    showOverlay();
    const contentEl = getContentEl();
    if (!contentEl) return;

    LyricsDisplay.mount(contentEl);

    const offset = getLiveOffsetSeconds();
    const duration = WorldChoirConfig.ACTIVE_EVENT.songDurationSeconds;

    if (offset >= duration) {
      showPostSongFlow();
      return;
    }

    audio = new Audio(WorldChoirPracticeConfig.PRACTICE_SONG.audioUrl);
    audio.addEventListener('ended', handleSongEnd);
    audio.addEventListener('error', handleAudioError);

    try {
      await waitForAudioReady(audio);
      audio.currentTime = Math.min(offset, audio.duration || offset);
      await audio.play();
      LyricsDisplay.startSync(audio);
      LyricsDisplay.update(audio.currentTime);
    } catch (err) {
      console.warn('Live playback failed:', err);
      handleAudioError();
    }
  }

  function launch() {
    if (hasCompletedFlow() || active) return;

    if (isDuringLiveSong()) {
      startPlayback();
      return;
    }

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
    if (!container) return;

    if (!container.querySelector('.practice-mode__ambient')) {
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
    isActive: () => active,
    finishFlow,
  };
})();
