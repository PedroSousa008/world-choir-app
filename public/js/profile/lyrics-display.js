/**
 * LyricsDisplay — synced lyrics with prev/current/next
 *
 * The renderShell() method also builds the complete practice playing UI:
 * logo, lyrics hero, progress bar, song info, playback controls,
 * and the bottom community panel.
 *
 * No functional logic is changed — only the HTML structure / presentation.
 */
const LyricsDisplay = (() => {
  let rafId = null;

  /** Active line = last entry whose start time has been reached. */
  function getLyricIndex(currentTime, lyrics) {
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        return i;
      }
    }
    return -1;
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getVoiceCount() {
    if (
      typeof WorldChoirDB === 'undefined' ||
      typeof WorldChoirConfig === 'undefined' ||
      !WorldChoirDB.isPledgesLoaded()
    ) {
      return null;
    }
    const stats = WorldChoirDB.getMapStats(WorldChoirConfig.CURRENT_EVENT.id);
    return stats?.voices ?? null;
  }

  function formatVoiceCount(count) {
    if (count === null) return null;
    if (count >= 1_000_000) {
      return (count / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (count >= 1_000) {
      return (count / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return count.toLocaleString('en-US');
  }

  function renderShell() {
    const { title, artist } = WorldChoirPracticeConfig.PRACTICE_SONG;
    return `
      <div class="practice-playing" id="practice-playing">

        <!-- Background -->
        <div class="pm-bg" aria-hidden="true">
          <div class="pm-bg__overlay"></div>
        </div>

        <!-- Logo -->
        <header class="pm-header" aria-label="World Choir">
          <img
            class="pm-logo"
            src="images/world-choir-logo.png?v=20270706"
            alt="World Choir App"
            width="1024"
            height="1024"
            decoding="async"
          >
        </header>

        <!-- Lyrics hero: prev → CURRENT → next (always this vertical order) -->
        <section class="pm-lyrics" aria-label="Lyrics">
          <div class="pm-lyrics__radial" aria-hidden="true"></div>
          <p class="lyrics-display__prev" id="lyric-prev">&nbsp;</p>
          <div class="pm-lyrics__row">
            <span class="pm-waveform pm-waveform--left" aria-hidden="true">
              <span class="pm-waveform__bar"></span>
              <span class="pm-waveform__bar"></span>
              <span class="pm-waveform__bar"></span>
            </span>
            <p class="lyrics-display__current" id="lyric-current">&nbsp;</p>
            <span class="pm-waveform pm-waveform--right" aria-hidden="true">
              <span class="pm-waveform__bar"></span>
              <span class="pm-waveform__bar"></span>
              <span class="pm-waveform__bar"></span>
            </span>
          </div>
          <p class="lyrics-display__next" id="lyric-next">&nbsp;</p>
        </section>

        <!-- Progress -->
        <div class="pm-progress-wrap">
          <div class="pm-progress-bar" id="pm-progress-bar" role="progressbar" aria-label="Song progress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            <div class="pm-progress-bar__fill" id="pm-progress-fill"></div>
            <div class="pm-progress-bar__thumb" id="pm-progress-thumb"></div>
          </div>
          <div class="pm-progress-times">
            <span class="pm-time pm-time--current" id="pm-time-current">0:00</span>
            <span class="pm-time pm-time--total" id="pm-time-total">0:00</span>
          </div>
        </div>

        <!-- Song info -->
        <div class="pm-song-info">
          <p class="pm-song-info__title">${title}</p>
          <p class="pm-song-info__artist">${artist}</p>
        </div>

        <!-- Playback controls — wired by practice-mode.js after mount -->
        <div class="pm-controls" id="practice-controls-inner">
          <button
            class="pm-controls__btn pm-controls__btn--secondary"
            id="practice-restart-btn"
            type="button"
            aria-label="Restart song"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 .49-3.5"></path>
            </svg>
          </button>

          <button
            class="pm-controls__btn pm-controls__btn--primary"
            id="practice-pause-btn"
            type="button"
            aria-label="Pause song"
          >
            <!-- Pause icon (default when playing) -->
            <svg class="pm-icon-pause" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1"></rect>
              <rect x="14" y="4" width="4" height="16" rx="1"></rect>
            </svg>
            <!-- Play icon (shown when paused) -->
            <svg class="pm-icon-play" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>

          <button
            class="pm-controls__btn pm-controls__btn--secondary"
            id="practice-share-btn"
            type="button"
            aria-label="Share lyrics"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </button>
        </div>

        <!-- Bottom community panel -->
        <div class="pm-community">
          <div class="pm-community__left" aria-hidden="true">
            <svg class="pm-community__wave-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div class="pm-community__center">
            <p class="pm-community__title">Practice the Song</p>
            <p class="pm-community__primary">Focus on your part.</p>
            <p class="pm-community__secondary">The world will sing with you.</p>
          </div>
          <div class="pm-community__right">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span class="pm-community__count" id="pm-voice-count" aria-label="Voices joined">&mdash;</span>
          </div>
        </div>

      </div>
    `;
  }

  function mount(container) {
    container.innerHTML = renderShell();
    update(0);
  }

  function renderLiveShell() {
    const { title, artist } = WorldChoirLiveConfig?.EVENT?.liveSong
      || WorldChoirPracticeConfig.PRACTICE_SONG;
    return `
      <div class="practice-playing practice-playing--live" id="practice-playing">
        <div class="pm-bg" aria-hidden="true"><div class="pm-bg__overlay"></div></div>
        <header class="pm-header" aria-label="World Choir">
          <img class="pm-logo" src="images/world-choir-logo.png?v=20270706" alt="World Choir App" width="1024" height="1024" decoding="async">
        </header>
        <p class="wc-live-song__live-badge"><span class="live-dot"></span> LIVE</p>
        <section class="pm-lyrics" aria-label="Lyrics">
          <div class="pm-lyrics__radial" aria-hidden="true"></div>
          <p class="lyrics-display__prev" id="lyric-prev">&nbsp;</p>
          <div class="pm-lyrics__row">
            <span class="pm-waveform pm-waveform--left" aria-hidden="true">
              <span class="pm-waveform__bar"></span><span class="pm-waveform__bar"></span><span class="pm-waveform__bar"></span>
            </span>
            <p class="lyrics-display__current" id="lyric-current">&nbsp;</p>
            <span class="pm-waveform pm-waveform--right" aria-hidden="true">
              <span class="pm-waveform__bar"></span><span class="pm-waveform__bar"></span><span class="pm-waveform__bar"></span>
            </span>
          </div>
          <p class="lyrics-display__next" id="lyric-next">&nbsp;</p>
        </section>
        <div class="pm-progress-wrap">
          <div class="pm-progress-bar" id="pm-progress-bar" role="progressbar" aria-label="Song progress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            <div class="pm-progress-bar__fill" id="pm-progress-fill"></div>
            <div class="pm-progress-bar__thumb" id="pm-progress-thumb"></div>
          </div>
          <div class="pm-progress-times">
            <span class="pm-time pm-time--current" id="pm-time-current">0:00</span>
            <span class="pm-time pm-time--total" id="pm-time-total">0:00</span>
          </div>
        </div>
        <div class="pm-song-info">
          <p class="pm-song-info__title">${title}</p>
          <p class="pm-song-info__artist">${artist}</p>
        </div>
        <div class="pm-community pm-community--live">
          <div class="pm-community__center">
            <p class="pm-community__title">The world is singing</p>
            <p class="pm-community__primary">You are part of this moment.</p>
          </div>
          <div class="pm-community__right">
            <span class="pm-community__count" id="pm-voice-count" aria-label="Voices joined">&mdash;</span>
          </div>
        </div>
      </div>
    `;
  }

  function mountLive(container, atSec = 0) {
    container.innerHTML = renderLiveShell();
    update(Math.max(0, Number(atSec) || 0));
  }

  function updateVoiceCount() {
    const el = document.getElementById('pm-voice-count');
    if (!el) return;
    const count = getVoiceCount();
    if (count === null) {
      el.textContent = '—';
    } else {
      el.textContent = formatVoiceCount(count);
    }
  }

  function updateProgress(audio) {
    const fillEl = document.getElementById('pm-progress-fill');
    const thumbEl = document.getElementById('pm-progress-thumb');
    const barEl = document.getElementById('pm-progress-bar');
    const currentEl = document.getElementById('pm-time-current');
    const totalEl = document.getElementById('pm-time-total');
    if (!fillEl || !thumbEl || !currentEl || !totalEl) return;

    const current = audio?.currentTime ?? 0;
    const duration = audio?.duration ?? 0;
    const pct = duration > 0 ? Math.min((current / duration) * 100, 100) : 0;

    fillEl.style.width = `${pct}%`;
    thumbEl.style.left = `${pct}%`;
    if (barEl) {
      barEl.setAttribute('aria-valuenow', Math.round(pct));
    }
    currentEl.textContent = formatTime(current);
    totalEl.textContent = formatTime(duration);
  }

  function update(currentTime, audio) {
    const lyrics = WorldChoirPracticeConfig.PRACTICE_LYRICS;
    const index = getLyricIndex(currentTime, lyrics);

    const prevEl = document.getElementById('lyric-prev');
    const currentEl = document.getElementById('lyric-current');
    const nextEl = document.getElementById('lyric-next');
    if (!prevEl || !currentEl || !nextEl) return;

    const prev = index > 0 ? lyrics[index - 1].text : '';
    const current = index >= 0 ? lyrics[index].text : '';
    const next = index >= 0 && index < lyrics.length - 1 ? lyrics[index + 1].text : '';

    if (prevEl.textContent !== prev) prevEl.textContent = prev || '\u00a0';
    if (currentEl.textContent !== current) {
      currentEl.textContent = current || '\u00a0';
      currentEl.classList.toggle('is-active', !!current);
    }
    if (nextEl.textContent !== next) nextEl.textContent = next || '\u00a0';

    if (audio) updateProgress(audio);
    updateVoiceCount();
  }

  function startSync(audio) {
    stopSync();
    if (audio) update(audio.currentTime, audio);
    function tick() {
      if (audio) update(audio.currentTime, audio);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopSync() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return { mount, mountLive, update, startSync, stopSync };
})();
