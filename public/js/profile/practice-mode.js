/**
 * PracticeMode — full-screen practice flow with countdown, audio, lyrics
 *
 * Functional logic is unchanged for normal entry.
 * Guide entry (Home lightbulb) skips countdown, mounts paused, then starts
 * the real player when PracticeWalkthrough finishes with Got it.
 */
const PracticeMode = (() => {
  const GUIDE_TRIGGER_KEY = 'wc_practice_from_guide';

  let audio = null;
  let container = null;
  let contentEl = null;
  let controlsEl = null;
  let state = 'idle';
  let onExitCallback = null;
  let guideLocked = false;

  const STATES = {
    IDLE: 'idle',
    COUNTDOWN: 'countdown',
    PLAYING: 'playing',
    COMPLETE: 'complete',
    ERROR: 'error',
  };

  function getContainer() {
    return document.getElementById('practice-mode');
  }

  function getContentEl() {
    return document.getElementById('practice-mode-content');
  }

  function getControlsEl() {
    return document.getElementById('practice-controls');
  }

  function hasGuideTrigger() {
    try {
      return sessionStorage.getItem(GUIDE_TRIGGER_KEY) === '1';
    } catch {
      return false;
    }
  }

  function consumeGuideTrigger() {
    try {
      sessionStorage.removeItem(GUIDE_TRIGGER_KEY);
    } catch {
      /* ignore */
    }
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
    if (typeof PracticeWalkthrough !== 'undefined') {
      PracticeWalkthrough.dismiss?.();
    }
    guideLocked = false;
    document.body.classList.remove('pm-wt-active');
    PracticeCountdown.clear();
    LyricsDisplay.stopSync();
    cleanupAudio();
    state = STATES.IDLE;
    if (controlsEl) controlsEl.innerHTML = '';
    const closeX = document.getElementById('practice-close-x');
    if (closeX) closeX.remove();
  }

  function mountCloseX() {
    const existing = document.getElementById('practice-close-x');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.id = 'practice-close-x';
    btn.className = 'pm-close-x';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Close practice');
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    btn.addEventListener('click', exit);
    container = getContainer();
    if (container) container.appendChild(btn);
  }

  function syncPauseButton() {
    const btn = document.getElementById('practice-pause-btn');
    if (!btn || !audio) return;
    const playIcon = btn.querySelector('.pm-icon-play');
    const pauseIcon = btn.querySelector('.pm-icon-pause');
    if (audio.paused) {
      btn.setAttribute('aria-label', 'Play song');
      if (playIcon) playIcon.style.display = '';
      if (pauseIcon) pauseIcon.style.display = 'none';
    } else {
      btn.setAttribute('aria-label', 'Pause song');
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = '';
    }
  }

  function togglePause() {
    if (guideLocked || !audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    syncPauseButton();
  }

  async function shareLyrics() {
    if (guideLocked) return;
    const { title, artist } = WorldChoirPracticeConfig.PRACTICE_SONG;
    const lyricsText = WorldChoirPracticeConfig.PRACTICE_LYRICS.map((l) => l.text).join('\n');
    const shareText = `🎵 ${title} — ${artist}\n\n${lyricsText}\n\nJoin World Choir 2027 — September 21 at 16:00 UTC`;

    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      alert('Lyrics copied to clipboard.');
    } catch {
      prompt('Copy the lyrics:', shareText);
    }
  }

  function restartSong() {
    if (guideLocked || !audio) return;
    audio.currentTime = 0;
    if (audio.paused) {
      audio.play().catch(() => {});
      syncPauseButton();
    }
  }

  function wirePlayingControls() {
    document.getElementById('practice-pause-btn')?.addEventListener('click', togglePause);
    document.getElementById('practice-restart-btn')?.addEventListener('click', restartSong);
    document.getElementById('practice-share-btn')?.addEventListener('click', shareLyrics);

    if (audio) {
      audio.addEventListener('pause', syncPauseButton);
      audio.addEventListener('play', syncPauseButton);
    }
  }

  function handleSongEnd() {
    state = STATES.COMPLETE;
    LyricsDisplay.stopSync();
    if (contentEl) contentEl.innerHTML = '';
    const closeX = document.getElementById('practice-close-x');
    if (closeX) closeX.remove();
    if (controlsEl) controlsEl.innerHTML = '';
    PracticeCompleteScreen.mount(contentEl, {
      onReplay: startSession,
      onReturn: exit,
    });
  }

  function handleAudioError() {
    state = STATES.ERROR;
    LyricsDisplay.stopSync();
    cleanupAudio();
    const closeX = document.getElementById('practice-close-x');
    if (closeX) closeX.remove();
    if (controlsEl) controlsEl.innerHTML = '';
    contentEl.innerHTML = `
      <div class="practice-error">
        <h2 class="practice-error__title">Audio unavailable</h2>
        <p class="practice-error__copy">
          We couldn't load the practice song right now. Please check that the audio file is available and try again.
        </p>
        <div class="actions-row">
          <button class="btn btn-primary" id="practice-error-return" type="button">Return to Profile</button>
        </div>
      </div>
    `;
    document.getElementById('practice-error-return')?.addEventListener('click', exit);
  }

  function mountPlayingShell() {
    state = STATES.PLAYING;
    LyricsDisplay.mount(contentEl);
    if (controlsEl) controlsEl.innerHTML = '';
    mountCloseX();

    audio = new Audio(WorldChoirPracticeConfig.PRACTICE_SONG.audioUrl);
    audio.preload = 'auto';
    audio.addEventListener('ended', handleSongEnd);
    audio.addEventListener('error', handleAudioError);

    wirePlayingControls();
    syncPauseButton();
  }

  async function startPlayback() {
    mountPlayingShell();
    guideLocked = false;

    try {
      await audio.play();
      LyricsDisplay.startSync(audio);
      syncPauseButton();
    } catch (err) {
      console.warn('Autoplay blocked or audio failed:', err);
      handleAudioError();
    }
  }

  /** Guide entry: mount real Practice UI paused at t=0, then start walkthrough. */
  function startPlaybackPausedForGuide() {
    mountPlayingShell();
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    guideLocked = true;
    syncPauseButton();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof PracticeWalkthrough !== 'undefined') {
          PracticeWalkthrough.onPracticeReady();
        } else {
          guideLocked = false;
        }
      });
    });
  }

  /** Called by PracticeWalkthrough after Got it — starts the real synced player from 0. */
  async function beginGuidedPlayback() {
    guideLocked = false;
    document.body.classList.remove('pm-wt-active');
    if (!audio) return;
    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    try {
      await audio.play();
      LyricsDisplay.startSync(audio);
      syncPauseButton();
    } catch (err) {
      console.warn('Guided playback failed:', err);
      handleAudioError();
    }
  }

  /** Early guide dismiss — unlock controls, keep audio paused. */
  function unlockGuideControls() {
    guideLocked = false;
    document.body.classList.remove('pm-wt-active');
    syncPauseButton();
  }

  function startCountdown() {
    state = STATES.COUNTDOWN;
    contentEl.innerHTML = '';
    if (controlsEl) controlsEl.innerHTML = '';
    mountCloseX();
    PracticeCountdown.mount(contentEl, { onComplete: startPlayback });
  }

  function startSession() {
    cleanup();
    container = getContainer();
    contentEl = getContentEl();
    controlsEl = getControlsEl();
    if (!container || !contentEl) return;

    container.classList.add('active');
    container.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (hasGuideTrigger()) {
      consumeGuideTrigger();
      startPlaybackPausedForGuide();
    } else {
      startCountdown();
    }
  }

  function exit() {
    cleanup();
    container = getContainer();
    if (container) {
      container.classList.remove('active');
      container.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    onExitCallback?.();
  }

  function open(options = {}) {
    document.getElementById('wc-live-song-audio')?.pause();
    onExitCallback = options.onExit || null;
    startSession();
  }

  function init() {
    container = getContainer();
    if (!container) return;

    window.addEventListener('pagehide', cleanup);

    if (!container.querySelector('.practice-mode__ambient')) {
      const ambient = document.createElement('div');
      ambient.className = 'practice-mode__ambient';
      ambient.setAttribute('aria-hidden', 'true');
      container.insertBefore(ambient, container.firstChild);
    }
  }

  return {
    init,
    open,
    exit,
    cleanup,
    beginGuidedPlayback,
    unlockGuideControls,
    isGuideLocked: () => guideLocked,
  };
})();
