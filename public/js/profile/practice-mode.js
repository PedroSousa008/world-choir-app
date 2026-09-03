/**
 * PracticeMode — full-screen practice flow with countdown, audio, lyrics
 *
 * Functional logic is unchanged. Only the control wiring has been updated
 * to match the new visual shell rendered by LyricsDisplay.
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
    // Legacy controls container (still used during countdown phase)
    if (controlsEl) controlsEl.innerHTML = '';
    // Remove the close X if it exists
    const closeX = document.getElementById('practice-close-x');
    if (closeX) closeX.remove();
  }

  // ─── Close X button (floats top-right, present during playing state) ───

  function mountCloseX() {
    // Remove any existing one first
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

  // ─── Play/Pause icon toggle ───

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
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    syncPauseButton();
  }

  // ─── Share lyrics ───

  async function shareLyrics() {
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

  // ─── Restart ───

  function restartSong() {
    if (!audio) return;
    audio.currentTime = 0;
    if (audio.paused) {
      audio.play().catch(() => {});
      syncPauseButton();
    }
  }

  // ─── Wire in-shell controls (called after LyricsDisplay.mount) ───

  function wirePlayingControls() {
    document.getElementById('practice-pause-btn')?.addEventListener('click', togglePause);
    document.getElementById('practice-restart-btn')?.addEventListener('click', restartSong);
    document.getElementById('practice-share-btn')?.addEventListener('click', shareLyrics);

    // Keep audio state in sync with browser-level pause events (e.g. phone call interruption)
    if (audio) {
      audio.addEventListener('pause', syncPauseButton);
      audio.addEventListener('play', syncPauseButton);
    }
  }

  function handleSongEnd() {
    state = STATES.COMPLETE;
    LyricsDisplay.stopSync();
    // Remove playing UI (which contains the controls)
    if (contentEl) contentEl.innerHTML = '';
    // Remove close X
    const closeX = document.getElementById('practice-close-x');
    if (closeX) closeX.remove();
    // Clear legacy controls container
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

  async function startPlayback() {
    state = STATES.PLAYING;
    // The new shell (logo + lyrics + progress + controls + community panel) is all in LyricsDisplay
    LyricsDisplay.mount(contentEl);
    // Legacy controls container no longer needed for playing state
    if (controlsEl) controlsEl.innerHTML = '';
    // Float the close X over the practice overlay
    mountCloseX();

    audio = new Audio(WorldChoirPracticeConfig.PRACTICE_SONG.audioUrl);
    audio.addEventListener('ended', handleSongEnd);
    audio.addEventListener('error', handleAudioError);

    wirePlayingControls();
    syncPauseButton();

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
    // Show a minimal exit during countdown (legacy exit button hidden; close X shown instead)
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

  return { init, open, exit, cleanup };
})();
