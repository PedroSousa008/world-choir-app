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
    stopProgressUpdate();
    window.removeEventListener('wc-pledges-synced', updateVoicesPanel);
    cleanupAudio();
    state = STATES.IDLE;
    if (controlsEl) controlsEl.innerHTML = '';
  }

  // ---- SVG icon helpers ----
  function iconPause() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  }
  function iconPlay() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"/></svg>`;
  }
  function iconRestart() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>`;
  }
  function iconShare() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
  }
  function iconClose() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  }
  function iconVoices() {
    return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  }

  // ---- Time formatting ----
  function formatTime(secs) {
    if (!isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ---- Voice count ----
  function getVoiceCountText() {
    if (typeof WorldChoirDB === 'undefined' || !WorldChoirDB.isPledgesLoaded()) {
      return null; // loading
    }
    const stats = WorldChoirDB.getMapStats(
      (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.CURRENT_EVENT)
        ? WorldChoirConfig.CURRENT_EVENT.id
        : undefined
    );
    const count = stats?.voices ?? 0;
    return count.toLocaleString('en-US');
  }

  // ---- Share lyrics ----
  function shareLyrics() {
    const { title, artist } = WorldChoirPracticeConfig.PRACTICE_SONG;
    const lyrics = WorldChoirPracticeConfig.PRACTICE_LYRICS.map((l) => l.text).join('\n');
    const shareText = `${title} — ${artist}\n\n${lyrics}\n\nPracticing with World Choir App`;
    if (navigator.share) {
      navigator.share({ title: `${title} · ${artist}`, text: shareText }).catch(() => {});
    } else {
      try {
        navigator.clipboard.writeText(shareText).then(() => {
          const btn = document.getElementById('practice-share-btn');
          if (btn) {
            btn.setAttribute('aria-label', 'Lyrics copied!');
            setTimeout(() => btn.setAttribute('aria-label', 'Share lyrics'), 2000);
          }
        });
      } catch (_) {}
    }
  }

  // ---- Progress RAF ----
  let progressRafId = null;

  function stopProgressUpdate() {
    if (progressRafId) { cancelAnimationFrame(progressRafId); progressRafId = null; }
  }

  function startProgressUpdate() {
    stopProgressUpdate();
    function tick() {
      if (!audio) return;
      const current = audio.currentTime || 0;
      const duration = audio.duration || 0;
      const pct = duration > 0 ? (current / duration) : 0;

      const fill = document.getElementById('practice-progress-fill');
      const thumb = document.getElementById('practice-progress-thumb');
      const currentEl = document.getElementById('practice-time-current');
      const durationEl = document.getElementById('practice-time-duration');
      const playBtn = document.getElementById('practice-pause-btn');

      if (fill) fill.style.width = `${pct * 100}%`;
      if (thumb) thumb.style.left = `${pct * 100}%`;
      if (currentEl) currentEl.textContent = formatTime(current);
      if (durationEl) durationEl.textContent = formatTime(duration);

      if (playBtn) {
        const playing = !audio.paused;
        playBtn.innerHTML = playing ? iconPause() : iconPlay();
        playBtn.setAttribute('aria-label', playing ? 'Pause song' : 'Play song');
      }

      progressRafId = requestAnimationFrame(tick);
    }
    progressRafId = requestAnimationFrame(tick);
  }

  function renderVoiceCountHTML() {
    const text = getVoiceCountText();
    if (text === null) {
      return `<span class="practice-panel__voices-loading" aria-label="Loading voice count">— voices</span>`;
    }
    return `<span>${text} voices</span>`;
  }

  function showControls(showPause = true) {
    controlsEl = getControlsEl();
    if (!controlsEl) return;

    const { title, artist } = WorldChoirPracticeConfig.PRACTICE_SONG;

    controlsEl.innerHTML = `
      <div class="practice-ui">

        <!-- Close button (top-right) -->
        <button class="practice-close-btn" id="practice-exit-btn" type="button" aria-label="Close practice">
          ${iconClose()}
        </button>

        ${showPause ? `
        <!-- Progress + song info + playback controls -->
        <div class="practice-player-panel">
          <div class="practice-progress" id="practice-progress" role="group" aria-label="Song progress">
            <div class="practice-progress__track">
              <div class="practice-progress__fill" id="practice-progress-fill"></div>
              <div class="practice-progress__thumb" id="practice-progress-thumb"></div>
            </div>
            <div class="practice-progress__times">
              <span class="practice-progress__time" id="practice-time-current">0:00</span>
              <span class="practice-progress__time" id="practice-time-duration">0:00</span>
            </div>
          </div>

          <div class="practice-song-info">
            <p class="practice-song-info__title">${escHtml(title)}</p>
            <p class="practice-song-info__artist">${escHtml(artist)}</p>
          </div>

          <div class="practice-controls">
            <button class="practice-controls__btn practice-controls__btn--secondary" id="practice-restart-btn" type="button" aria-label="Restart song">
              ${iconRestart()}
            </button>
            <button class="practice-controls__btn practice-controls__btn--primary" id="practice-pause-btn" type="button" aria-label="Pause song">
              ${iconPause()}
            </button>
            <button class="practice-controls__btn practice-controls__btn--secondary" id="practice-share-btn" type="button" aria-label="Share lyrics">
              ${iconShare()}
            </button>
          </div>
        </div>
        ` : ''}

        <!-- Bottom community panel -->
        <div class="practice-panel">
          <div class="practice-panel__waveform" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2"  y="12" width="4" height="8"  rx="2" fill="currentColor"/>
              <rect x="8"  y="7"  width="4" height="18" rx="2" fill="currentColor"/>
              <rect x="14" y="3"  width="4" height="26" rx="2" fill="currentColor"/>
              <rect x="20" y="8"  width="4" height="16" rx="2" fill="currentColor"/>
              <rect x="26" y="13" width="4" height="6"  rx="2" fill="currentColor"/>
            </svg>
          </div>
          <div class="practice-panel__text">
            <p class="practice-panel__label">Practice the Song</p>
            <p class="practice-panel__sub">Focus on your part.</p>
            <p class="practice-panel__sub">The world will sing with you.</p>
          </div>
          <div class="practice-panel__voices" aria-live="polite" id="practice-voices-count">
            ${iconVoices()}
            <span class="practice-panel__voices-text" id="practice-voices-text">${renderVoiceCountHTML()}</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('practice-exit-btn')?.addEventListener('click', exit);

    if (showPause) {
      document.getElementById('practice-pause-btn')?.addEventListener('click', togglePause);
      document.getElementById('practice-restart-btn')?.addEventListener('click', restartSong);
      document.getElementById('practice-share-btn')?.addEventListener('click', shareLyrics);
      startProgressUpdate();

      // Update voice count when pledges sync
      window.addEventListener('wc-pledges-synced', updateVoicesPanel);
    }
  }

  function updateVoicesPanel() {
    const el = document.getElementById('practice-voices-text');
    if (el) el.innerHTML = renderVoiceCountHTML();
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function togglePause() {
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    // UI updates happen via progress RAF
  }

  function restartSong() {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function handleSongEnd() {
    state = STATES.COMPLETE;
    LyricsDisplay.stopSync();
    stopProgressUpdate();
    window.removeEventListener('wc-pledges-synced', updateVoicesPanel);
    if (controlsEl) controlsEl.innerHTML = '';
    PracticeCompleteScreen.mount(contentEl, {
      onReplay: startSession,
      onReturn: exit,
    });
  }

  function handleAudioError() {
    state = STATES.ERROR;
    LyricsDisplay.stopSync();
    stopProgressUpdate();
    window.removeEventListener('wc-pledges-synced', updateVoicesPanel);
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

    if (!container.querySelector('.practice-logo')) {
      const logo = document.createElement('div');
      logo.className = 'practice-logo';
      logo.setAttribute('aria-hidden', 'true');
      logo.innerHTML = `
        <img class="practice-logo__img" src="/images/world-choir-logo.png?v=20270706" alt="World Choir" width="56" height="56" decoding="async">
        <span class="practice-logo__wordmark">World Choir</span>
      `;
      container.insertBefore(logo, container.firstChild);
    }
  }

  return { init, open, exit, cleanup };
})();
