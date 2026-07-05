/**
 * PracticeMode — full-screen practice flow with countdown, audio, lyrics
 */
const PracticeMode = (() => {
  let audio = null;
  let container = null;
  let contentEl = null;
  let controlsEl = null;
  let state = 'idle';
  let onExitCallback = null;

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
    PracticeCountdown.clear();
    LyricsDisplay.stopSync();
    cleanupAudio();
    state = STATES.IDLE;
    if (controlsEl) controlsEl.innerHTML = '';
  }

  function showControls(showPause = true) {
    controlsEl = getControlsEl();
    if (!controlsEl) return;

    controlsEl.innerHTML = `
      <div class="practice-controls">
        ${showPause ? '<button class="practice-controls__btn" id="practice-pause-btn" type="button">Pause</button>' : ''}
        <button class="practice-controls__btn" id="practice-exit-btn" type="button">Exit</button>
      </div>
    `;

    document.getElementById('practice-exit-btn')?.addEventListener('click', exit);
    if (showPause) {
      document.getElementById('practice-pause-btn')?.addEventListener('click', togglePause);
    }
  }

  function togglePause() {
    if (!audio) return;
    const btn = document.getElementById('practice-pause-btn');
    if (audio.paused) {
      audio.play().catch(() => {});
      if (btn) btn.textContent = 'Pause';
    } else {
      audio.pause();
      if (btn) btn.textContent = 'Resume';
    }
  }

  function handleSongEnd() {
    state = STATES.COMPLETE;
    LyricsDisplay.stopSync();
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

  async function startPlayback() {
    state = STATES.PLAYING;
    LyricsDisplay.mount(contentEl);
    showControls(true);

    audio = new Audio(WorldChoirPracticeConfig.PRACTICE_SONG.audioUrl);
    audio.addEventListener('ended', handleSongEnd);
    audio.addEventListener('error', handleAudioError);

    try {
      await audio.play();
      LyricsDisplay.startSync(audio);
    } catch (err) {
      console.warn('Autoplay blocked or audio failed:', err);
      handleAudioError();
    }
  }

  function startCountdown() {
    state = STATES.COUNTDOWN;
    contentEl.innerHTML = '';
    if (controlsEl) controlsEl.innerHTML = '';
    showControls(false);
    PracticeCountdown.mount(contentEl, { onComplete: startPlayback });
  }

  function startSession() {
    cleanup();
    container = getContainer();
    contentEl = getContentEl();
    controlsEl = getControlsEl();
    if (!container || !contentEl) return;

    container.classList.add('active');
    document.body.style.overflow = 'hidden';
    startCountdown();
  }

  function exit() {
    cleanup();
    container = getContainer();
    if (container) container.classList.remove('active');
    document.body.style.overflow = '';
    onExitCallback?.();
  }

  function open(options = {}) {
    onExitCallback = options.onExit || null;
    startSession();
  }

  function init() {
    container = getContainer();
    if (!container) return;

    if (!container.querySelector('.practice-mode__ambient')) {
      const ambient = document.createElement('div');
      ambient.className = 'practice-mode__ambient';
      ambient.setAttribute('aria-hidden', 'true');
      container.insertBefore(ambient, container.firstChild);
    }
  }

  return { init, open, exit, cleanup };
})();
