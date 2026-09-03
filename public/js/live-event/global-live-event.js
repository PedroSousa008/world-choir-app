/**
 * GlobalLiveEvent — authoritative synchronized World Choir live experience.
 *
 * One global timeline: NORMAL → PRE_EVENT (video) → LIVE_SONG → LIVE_FINISHED
 * Video completion (not countdown zero) triggers the live song transition.
 */
const GlobalLiveEvent = (() => {
  const SYNC = {
    TICK_MS: 750,
    POLL_MS: 4000,
    // Only hard-seek when clearly behind/ahead — small drift must not stutter playback.
    SEEK_THRESHOLD_S: 4.0,
    HARD_SEEK_S: 10.0,
    RATE_THRESHOLD_S: 1.0,
    MAX_RATE: 1.02,
    MIN_RATE: 0.98,
    SEEK_COOLDOWN_MS: 5000,
    VIDEO_SEEK_THRESHOLD_S: 4.0,
    VIDEO_HARD_SEEK_S: 10.0,
    VIDEO_RATE_THRESHOLD_S: 1.0,
    VIDEO_MAX_RATE: 1.02,
    VIDEO_MIN_RATE: 0.98,
    PRELOAD_LEAD_MS: 30 * 60 * 1000,
  };

  /** @type {'NORMAL'|'PRE_EVENT'|'TRANSITIONING_TO_LIVE'|'LIVE_SONG'|'LIVE_FINISHED'} */
  let state = 'NORMAL';
  let active = false;
  let tickTimer = null;
  let pollTimer = null;
  let actualLiveSongStartUtc = null;
  let audioUnlocked = false;
  let transitioning = false;
  let lastAudioSeekAt = 0;
  let lastVideoSeekAt = 0;

  let videoEl = null;
  let audioEl = null;
  let videoFailed = false;
  let videoEndedLocally = false;
  let preloaded = false;
  let initPromise = null;

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = String(str ?? '');
    return el.innerHTML;
  }

  function getShell() {
    return document.getElementById('wc-global-live');
  }

  function getPageName() {
    return (window.location.pathname.split('/').pop() || '').toLowerCase();
  }

  function isHomePage() {
    const page = getPageName();
    return page === '' || page === 'index.html';
  }

  function shouldRunLivePlayback() {
    const page = getPageName();
    if (page.includes('owner') || page === 'admin-upload.html' || page === 'setup-ai.html') {
      return false;
    }
    return true;
  }

  function pauseLiveMedia() {
    if (audioEl && !audioEl.paused) {
      audioEl.pause();
    }
    LyricsDisplay.stopSync();
    if (videoEl && !videoEl.paused) {
      videoEl.pause();
    }
  }

  function hidePageUnderlays() {
    document.getElementById('earth-canvas')?.setAttribute('hidden', '');
    document.getElementById('ambient-bg')?.setAttribute('hidden', '');
    document.getElementById('nav-root')?.setAttribute('hidden', '');
    document.getElementById('home-page')?.setAttribute('hidden', '');
    document.getElementById('map-shell')?.setAttribute('hidden', '');
    document.querySelector('.df-donate-earth')?.setAttribute('hidden', '');
    document.querySelectorAll('canvas').forEach((canvas) => {
      if (canvas.id === 'wc-global-live-video') return;
      if (canvas.closest?.('#wc-global-live, #live-event-mode')) return;
      canvas.setAttribute('hidden', '');
    });
  }

  function dismissLiveUiIfOffHome() {
    if (shouldRunLivePlayback()) return;
    pauseLiveMedia();
    hideTakeover();
    hideLiveSongShell();
    active = false;
  }

  function isPostEventPlaybackBlocked() {
    if (typeof LiveEventMode !== 'undefined' && LiveEventMode.isPostEvent()) return true;
    const nowMs = WorldChoirServerTime.nowMs?.() ?? Date.now();
    return computeState(nowMs) === 'LIVE_FINISHED';
  }

  function isPracticeModeActive() {
    return document.getElementById('practice-mode')?.classList.contains('active') === true;
  }

  function isLiveSongUiActive() {
    return document.getElementById('live-event-mode')?.classList.contains('active') === true;
  }

  function canPlayLiveSongAudio() {
    if (!shouldRunLivePlayback()) return false;
    if (isPostEventPlaybackBlocked()) return false;
    if (isPracticeModeActive()) return false;
    if (state !== 'LIVE_SONG' && state !== 'TRANSITIONING_TO_LIVE') return false;
    const nowMs = WorldChoirServerTime.nowMs?.() ?? Date.now();
    if (computeState(nowMs) !== 'LIVE_SONG') return false;
    return isLiveSongUiActive();
  }

  function canPrimeLiveAudio() {
    // Only warm audio during pre-event. Never prime during LIVE_SONG —
    // priming used to seek to 0 and restart the global timeline for that user.
    if (!shouldRunLivePlayback()) return false;
    if (isPostEventPlaybackBlocked()) return false;
    if (isPracticeModeActive()) return false;
    if (state === 'LIVE_SONG' || state === 'TRANSITIONING_TO_LIVE') return false;
    const nowMs = WorldChoirServerTime.nowMs?.() ?? Date.now();
    return computeState(nowMs) === 'PRE_EVENT';
  }

  function stopLiveSongElement() {
    const el = document.getElementById('wc-live-song-audio');
    if (el && !el.paused) el.pause();
    if (audioEl && !audioEl.paused) audioEl.pause();
    // NEVER reset currentTime here — that restarts the song for rejoining users.
    LyricsDisplay.stopSync();
  }

  function resetLiveSongToStart() {
    const el = document.getElementById('wc-live-song-audio');
    if (el) {
      el.pause();
      el.muted = true;
      try { el.currentTime = 0; } catch { /* ignore */ }
    }
    if (audioEl) {
      audioEl.pause();
      try { audioEl.currentTime = 0; } catch { /* ignore */ }
    }
    LyricsDisplay.stopSync();
  }

  function finalizeLiveEventPlayback() {
    resetLiveSongToStart();
    cleanupMedia();
    hideTakeover();
    hideLiveSongShell();
    hideAllUnlockUi();
    active = false;
    state = 'LIVE_FINISHED';
  }

  function hideAllUnlockUi() {
    document.getElementById('wc-global-live-unlock')?.setAttribute('hidden', '');
    const songUnlock = document.getElementById('wc-live-song-unlock');
    if (songUnlock) {
      songUnlock.setAttribute('hidden', '');
      songUnlock.remove();
    }
  }

  function ensureLiveSongMode() {
    if (document.getElementById('live-event-mode') && document.getElementById('live-event-content')) {
      return;
    }
    document.getElementById('live-event-mode')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="practice-mode" id="live-event-mode" aria-hidden="true">
        <div id="live-event-content"></div>
      </div>
    `);
  }

  function ensureShell() {
    ensureLiveSongMode();
    if (document.getElementById('wc-global-live')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="wc-global-live" id="wc-global-live" aria-hidden="true">
        <div class="wc-global-live__ambient" aria-hidden="true"></div>

        <section class="wc-global-live__pre" id="wc-global-live-pre" hidden>
          <div class="wc-global-live__pre-inner">
            <div class="wc-global-live__video-wrap" id="wc-global-live-video-wrap">
              <video
                class="wc-global-live__video"
                id="wc-global-live-video"
                playsinline
                webkit-playsinline
                preload="auto"
                muted
                autoplay
                disablepictureinpicture
                disableremoteplayback
              ></video>
            </div>
            <div class="wc-global-live__pre-fallback" id="wc-global-live-pre-fallback" hidden>
              <p class="wc-global-live__brand">World Choir 2027</p>
              <p class="wc-global-live__tagline">The world is about to sing</p>
              <p class="wc-global-live__countdown" id="wc-global-live-countdown" aria-live="polite">—</p>
              <p class="wc-global-live__fallback-note" id="wc-global-live-fallback-note">
                Preparing the live experience…
              </p>
            </div>
            <div class="wc-global-live__countdown-bar" id="wc-global-live-countdown-bar" aria-live="polite">
              <span class="wc-global-live__countdown-label">Singing in</span>
              <span class="wc-global-live__countdown-value" id="wc-global-live-countdown-value">—</span>
              <button type="button" class="wc-live-sound-toggle" id="wc-pre-sound-toggle" aria-label="Sound off" aria-pressed="false" title="Sound">
                <svg class="wc-live-sound-toggle__icon wc-live-sound-toggle__icon--off" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="M11 5 6 9H3v6h3l5 4V5z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
                  <path d="m16 9 5 5M21 9l-5 5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
                <svg class="wc-live-sound-toggle__icon wc-live-sound-toggle__icon--on" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" hidden>
                  <path d="M11 5 6 9H3v6h3l5 4V5z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <button type="button" class="wc-global-live__unlock" id="wc-global-live-unlock" hidden>
              Tap to enable sound for the live event
            </button>
          </div>
          <p class="wc-global-live__rotate-hint" id="wc-global-live-rotate-hint" aria-live="polite">
            Rotate your device for the full cinematic view
          </p>
        </section>

        <section class="wc-global-live__song" id="wc-global-live-song" hidden>
          <div id="wc-global-live-song-content"></div>
        </section>
      </div>
    `);
  }

  function clearLiveGate() {
    document.documentElement.classList.remove('wc-live-gate');
    getShell()?.classList.remove('wc-global-live--boot');
  }

  function getLiveSongAudio() {
    let el = document.getElementById('wc-live-song-audio');
    if (!el) {
      el = document.createElement('audio');
      el.id = 'wc-live-song-audio';
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      document.body.appendChild(el);
    }
    const url = WorldChoirLiveConfig.EVENT.liveSong.audioUrl;
    if (el.getAttribute('data-src') !== url) {
      el.setAttribute('data-src', url);
      el.src = url;
    }
    return el;
  }

  async function primeLiveSongAudio() {
    if (!canPrimeLiveAudio()) return false;
    const el = getLiveSongAudio();
    try {
      if (el.readyState < 1) await waitForAudioReady(el);
      // Warm the element only — do NOT leave the song playing during the video.
      // A playing underlay can hit `ended` mid-video and kill the whole live flow.
      el.muted = true;
      el.volume = 0;
      await el.play();
      el.pause();
      // Stay parked near the start only while still in pre-event.
      if (state === 'PRE_EVENT') {
        try { el.currentTime = 0; } catch { /* ignore */ }
      }
      el.volume = 1;
      return true;
    } catch {
      return false;
    }
  }

  function soundToggleSvgState(on) {
    document.querySelectorAll('.wc-live-sound-toggle').forEach((btn) => {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Sound on — tap to mute' : 'Sound off — tap to unmute');
      btn.classList.toggle('is-on', !!on);
      btn.classList.toggle('is-off', !on);
      const onIcon = btn.querySelector('.wc-live-sound-toggle__icon--on');
      const offIcon = btn.querySelector('.wc-live-sound-toggle__icon--off');
      // Exactly one icon visible at a time.
      if (onIcon) {
        onIcon.hidden = !on;
        onIcon.style.display = on ? 'block' : 'none';
      }
      if (offIcon) {
        offIcon.hidden = !!on;
        offIcon.style.display = on ? 'none' : 'block';
      }
    });
  }

  function updateSoundToggleUi() {
    let audible = false;
    if (state === 'LIVE_SONG' && audioEl && !audioEl.paused && !audioEl.muted && audioUnlocked) {
      audible = true;
    } else if (state === 'PRE_EVENT' && videoEl && !videoEl.paused && !videoEl.muted && audioUnlocked) {
      audible = true;
    }
    soundToggleSvgState(audible);
  }

  function getGlobalLyricTimeSec() {
    return getTargetSongPositionSec(WorldChoirServerTime.nowMs());
  }

  function clampSongTime(sec, el) {
    const duration = WorldChoirLiveConfig.EVENT.liveSong.durationSeconds;
    const mediaDur = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    return Math.min(Math.max(0, sec), mediaDur - 0.05, duration - 0.05);
  }

  function startLyricClock(audio) {
    if (typeof LyricsDisplay === 'undefined') return;
    LyricsDisplay.startSync(audio, getGlobalLyricTimeSec);
    LyricsDisplay.update(getGlobalLyricTimeSec(), audio);
  }

  async function toggleLiveSound(ev) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();

    try {
      if (!window.__wcAudioCtx) {
        window.__wcAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (window.__wcAudioCtx.state === 'suspended') {
        await window.__wcAudioCtx.resume();
      }
    } catch {
      /* ignore */
    }

    const currentlyOn = !!(
      audioUnlocked
      && (
        (state === 'LIVE_SONG' && audioEl && !audioEl.muted && !audioEl.paused)
        || (state === 'PRE_EVENT' && videoEl && !videoEl.muted && !videoEl.paused)
      )
    );

    if (currentlyOn) {
      audioUnlocked = false;
      if (audioEl) audioEl.muted = true;
      if (videoEl) videoEl.muted = true;
      updateSoundToggleUi();
      return;
    }

    audioUnlocked = true;

    if (state === 'LIVE_SONG') {
      await lockAudioToGlobalPosition({ audible: true });
      updateSoundToggleUi();
      return;
    }

    if (state === 'PRE_EVENT') {
      const preVideo = document.getElementById('wc-global-live-video') || videoEl;
      if (preVideo) {
        try {
          preVideo.muted = false;
          if (preVideo.paused) await preVideo.play();
        } catch {
          try {
            preVideo.muted = true;
            await preVideo.play();
            preVideo.muted = false;
          } catch {
            audioUnlocked = false;
          }
        }
      }
      await primeLiveSongAudio();
      updateSoundToggleUi();
    }
  }

  function bindSoundToggleHandlers() {
    if (document.documentElement.dataset.wcSoundToggleBound === '1') return;
    document.documentElement.dataset.wcSoundToggleBound = '1';
    document.addEventListener('click', (ev) => {
      const btn = ev.target?.closest?.('.wc-live-sound-toggle');
      if (!btn) return;
      toggleLiveSound(ev).catch(() => {});
    }, true);
  }

  // Kept name for call sites — sound is only toggled via the icon, never by tapping the screen.
  function bindUnlockHandlers() {
    bindSoundToggleHandlers();
    updateSoundToggleUi();
  }

  function showTakeover() {
    const shell = getShell();
    if (!shell) return;
    clearLiveGate();
    hidePageUnderlays();
    shell.classList.add('is-active');
    shell.setAttribute('aria-hidden', 'false');
    document.body.classList.add('wc-global-live-active');
    document.body.style.overflow = 'hidden';
    active = true;
  }

  function hideTakeover() {
    const shell = getShell();
    if (!shell) return;
    shell.classList.remove('is-active');
    shell.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('wc-global-live-active');
    document.getElementById('nav-root')?.removeAttribute('hidden');
    document.body.style.overflow = '';
    active = false;
  }

  function formatCountdown(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatEventCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function getPreEventWindowSec() {
    return WorldChoirLiveConfig.EVENT.preEvent.videoDurationSeconds;
  }

  function getActualVideoDurationSec() {
    if (videoEl && videoEl.duration && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
      return videoEl.duration;
    }
    return getPreEventWindowSec();
  }

  function isSongStartValidForCurrentEvent(songStartIso) {
    if (!songStartIso) return false;
    const songStart = Date.parse(songStartIso);
    if (Number.isNaN(songStart)) return false;
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    const eventEnd = WorldChoirLiveConfig.getEventStartMs() + WorldChoirLiveConfig.getSongDurationMs();
    return songStart >= preStart - 60_000 && songStart <= eventEnd + 120_000;
  }

  function getAuthoritativeSongStartUtc() {
    return actualLiveSongStartUtc && isSongStartValidForCurrentEvent(actualLiveSongStartUtc)
      ? actualLiveSongStartUtc
      : null;
  }

  function shouldSkipPreEventVideo(nowMs) {
    const songStartUtc = getAuthoritativeSongStartUtc();
    if (songStartUtc && nowMs >= Date.parse(songStartUtc)) return true;
    return hasPreEventVideoTimelineElapsed(nowMs);
  }

  function hasPreEventVideoTimelineElapsed(nowMs) {
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    const endMs = preStart + getActualVideoDurationSec() * 1000;
    return nowMs >= endMs - 200;
  }

  function shouldLoopPreEventVideo() {
    const gap = getPreEventWindowSec() - getActualVideoDurationSec();
    return gap > 60;
  }

  function getTargetVideoPositionSec(nowMs) {
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    const windowSec = getPreEventWindowSec();
    const elapsed = (nowMs - preStart) / 1000;
    const clamped = Math.max(0, Math.min(windowSec, elapsed));
    const actualDur = getActualVideoDurationSec();
    if (shouldLoopPreEventVideo()) {
      return clamped % actualDur;
    }
    return clamped;
  }

  function getTargetSongPositionSec(nowMs) {
    const duration = WorldChoirLiveConfig.EVENT.liveSong.durationSeconds;
    const songStartUtc = getAuthoritativeSongStartUtc();
    if (songStartUtc) {
      const songStart = new Date(songStartUtc).getTime();
      const elapsed = (nowMs - songStart) / 1000;
      return Math.max(0, Math.min(duration, elapsed));
    }
    const eventStart = WorldChoirLiveConfig.getEventStartMs();
    const elapsed = (nowMs - eventStart) / 1000;
    return Math.max(0, Math.min(duration, elapsed));
  }

  function computeState(nowMs) {
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    const eventStart = WorldChoirLiveConfig.getEventStartMs();
    const songDurationMs = WorldChoirLiveConfig.getSongDurationMs();
    const videoEndMs = preStart + getActualVideoDurationSec() * 1000;
    const songStartUtc = getAuthoritativeSongStartUtc();

    if (songStartUtc) {
      const songStart = new Date(songStartUtc).getTime();
      const songEnd = songStart + songDurationMs;
      if (nowMs >= songEnd) return 'LIVE_FINISHED';
      if (nowMs >= songStart) return 'LIVE_SONG';
    }

    if (nowMs >= videoEndMs - 200) {
      const songEnd = eventStart + songDurationMs;
      if (nowMs >= songEnd) return 'LIVE_FINISHED';
      if (nowMs >= eventStart) return 'LIVE_SONG';
    }

    if (nowMs >= preStart) return 'PRE_EVENT';
    return 'NORMAL';
  }

  async function fetchAuthoritativeState() {
    try {
      const res = await fetch('/api/live-event?eventId=world-choir-2027', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.actualLiveSongStartUtc) {
        if (isSongStartValidForCurrentEvent(data.actualLiveSongStartUtc)) {
          actualLiveSongStartUtc = data.actualLiveSongStartUtc;
        }
        // Keep a previously valid local start if the server briefly returns null/stale.
      }
      return data;
    } catch {
      return null;
    }
  }

  async function reportVideoEnded() {
    try {
      const res = await fetch('/api/live-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'video-ended', eventId: WorldChoirLiveConfig.EVENT.eventId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.actualLiveSongStartUtc && isSongStartValidForCurrentEvent(data.actualLiveSongStartUtc)) {
        actualLiveSongStartUtc = data.actualLiveSongStartUtc;
      }
      return data;
    } catch {
      return null;
    }
  }

  function cleanupVideo() {
    if (!videoEl) return;
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl = null;
  }

  function cleanupAudio() {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.removeEventListener('ended', onSongEnded);
    audioEl.removeEventListener('error', onSongError);
    audioEl._wcBound = false;
    audioEl = null;
    LyricsDisplay.stopSync();
  }

  function cleanupMedia() {
    cleanupVideo();
    cleanupAudio();
  }

  function updateCountdownUI(nowMs) {
    const eventStart = WorldChoirLiveConfig.getEventStartMs();
    const remaining = eventStart - nowMs;
    const text = formatEventCountdown(remaining);

    const valueEl = document.getElementById('wc-global-live-countdown-value');
    const fallbackEl = document.getElementById('wc-global-live-countdown');
    if (valueEl) valueEl.textContent = text;
    if (fallbackEl) fallbackEl.textContent = text;
  }

  function showPreEventUI() {
    document.getElementById('wc-global-live-pre')?.removeAttribute('hidden');
    document.getElementById('wc-global-live-song')?.setAttribute('hidden', '');
    document.getElementById('wc-global-live-video-wrap')?.removeAttribute('hidden');
    document.getElementById('wc-global-live-pre-fallback')?.removeAttribute('hidden');
    showTakeover();
  }

  function hideLiveSongShell() {
    const mode = document.getElementById('live-event-mode');
    if (mode) {
      mode.classList.remove('active');
      mode.setAttribute('aria-hidden', 'true');
    }
    document.getElementById('wc-live-song-unlock')?.setAttribute('hidden', '');
    document.getElementById('home-page')?.removeAttribute('hidden');
    document.getElementById('nav-root')?.removeAttribute('hidden');
    if (state !== 'PRE_EVENT') {
      document.body.style.overflow = '';
      document.body.classList.remove('wc-global-live-active');
    }
  }

  function showLiveSongShell(atSec = 0) {
    ensureLiveSongMode();
    const shell = getShell();
    const mode = document.getElementById('live-event-mode');
    const content = document.getElementById('live-event-content');
    if (!mode || !content) return false;

    clearLiveGate();
    hidePageUnderlays();
    document.getElementById('wc-global-live-pre')?.setAttribute('hidden', '');
    shell?.classList.remove('is-active');
    shell?.setAttribute('aria-hidden', 'true');
    hideAllUnlockUi();

    mode.classList.add('active');
    mode.setAttribute('aria-hidden', 'false');
    document.body.classList.add('wc-global-live-active');
    document.body.style.overflow = 'hidden';
    active = true;

    if (typeof LyricsDisplay !== 'undefined' && LyricsDisplay.mountLive) {
      LyricsDisplay.mountLive(content, atSec);
    }
    updateSoundToggleUi();
    return true;
  }

  async function prepareVideo() {
    videoEl = document.getElementById('wc-global-live-video');
    if (!videoEl) return;

    const url = WorldChoirLiveConfig.EVENT.preEvent.videoUrl;
    if (videoEl.getAttribute('data-src') !== url) {
      videoEl.setAttribute('data-src', url);
      videoEl.src = url;
    }

    return new Promise((resolve) => {
      const applyLoopSetting = () => {
        if (shouldLoopPreEventVideo()) {
          videoEl.loop = true;
        } else {
          videoEl.loop = false;
        }
      };
      const done = () => {
        videoEl.removeEventListener('loadedmetadata', done);
        videoEl.removeEventListener('error', onErr);
        applyLoopSetting();
        resolve();
      };
      const onErr = () => {
        videoFailed = true;
        document.getElementById('wc-global-live-pre-fallback')?.removeAttribute('hidden');
        document.getElementById('wc-global-live-video-wrap')?.setAttribute('hidden', '');
        document.getElementById('wc-global-live-fallback-note').textContent =
          'Video is loading for others — you will join the live song in sync when the world transitions.';
        done();
      };
      if (videoEl.readyState >= 1) {
        applyLoopSetting();
        resolve();
        return;
      }
      videoEl.addEventListener('loadedmetadata', done, { once: true });
      videoEl.addEventListener('error', onErr, { once: true });
    });
  }

  async function seekVideoTo(targetSec, { autoplay = true } = {}) {
    if (!videoEl || videoFailed) return;
    const actualDur = getActualVideoDurationSec();
    const clamped = Math.max(0, Math.min(targetSec, actualDur - 0.05));
    const drift = Math.abs(videoEl.currentTime - clamped);

    // Only seek when meaningfully off — tiny corrections cause stutter / rebuffer.
    if (drift > SYNC.VIDEO_SEEK_THRESHOLD_S) {
      const now = Date.now();
      if (drift > SYNC.VIDEO_HARD_SEEK_S || now - lastVideoSeekAt > SYNC.SEEK_COOLDOWN_MS) {
        lastVideoSeekAt = now;
        try {
          videoEl.currentTime = clamped;
        } catch {
          /* ignore */
        }
      }
    }

    videoEl.muted = !audioUnlocked;
    videoEl.playsInline = true;

    if (autoplay) {
      try {
        if (videoEl.paused) await videoEl.play();
        if (audioUnlocked) videoEl.muted = false;
      } catch {
        try {
          videoEl.muted = true;
          await videoEl.play();
        } catch {
          /* keep trying on next tick — never block with an overlay */
        }
      }
    }
  }

  function syncVideoToGlobal(nowMs) {
    if (!videoEl || videoFailed || videoEndedLocally) return;
    if (videoEl.seeking) return;
    if (videoEl.readyState < 2) {
      if (videoEl.paused) videoEl.play().catch(() => {});
      return;
    }

    const expected = getTargetVideoPositionSec(nowMs);
    const actual = videoEl.currentTime;
    const diff = expected - actual;
    const abs = Math.abs(diff);

    if (abs > SYNC.VIDEO_SEEK_THRESHOLD_S) {
      const now = Date.now();
      const allowSeek = abs > SYNC.VIDEO_HARD_SEEK_S || now - lastVideoSeekAt > SYNC.SEEK_COOLDOWN_MS;
      if (allowSeek) {
        lastVideoSeekAt = now;
        videoEl.playbackRate = 1;
        try { videoEl.currentTime = expected; } catch { /* ignore */ }
      }
      if (videoEl.paused) videoEl.play().catch(() => {});
      return;
    }

    if (abs > SYNC.VIDEO_RATE_THRESHOLD_S) {
      videoEl.playbackRate = Math.max(
        SYNC.VIDEO_MIN_RATE,
        Math.min(SYNC.VIDEO_MAX_RATE, 1 + diff * 0.04),
      );
    } else if (videoEl.playbackRate !== 1) {
      videoEl.playbackRate = 1;
    }

    if (videoEl.paused) videoEl.play().catch(() => {});
  }

  async function onVideoEnded() {
    if (videoEndedLocally || transitioning) return;
    if (!shouldRunLivePlayback() || isPostEventPlaybackBlocked()) {
      stopLiveSongElement();
      return;
    }
    videoEndedLocally = true;
    transitioning = true;
    state = 'TRANSITIONING_TO_LIVE';

    const nowMs = WorldChoirServerTime.nowMs();
    const target = getTargetSongPositionSec(nowMs);
    const duration = WorldChoirLiveConfig.EVENT.liveSong.durationSeconds;

    if (target >= duration - 0.5) {
      state = 'LIVE_FINISHED';
      onSongEnded();
      transitioning = false;
      return;
    }

    state = 'LIVE_SONG';
    cleanupVideo();
    if (!mountLiveLyrics(target)) {
      onSongError();
      transitioning = false;
      return;
    }

    audioEl = getLiveSongAudio();
    if (!audioEl._wcBound) {
      audioEl._wcBound = true;
      audioEl.addEventListener('ended', onSongEnded);
      audioEl.addEventListener('error', onSongError);
    }

    reportVideoEnded().then(() => {
      if (!actualLiveSongStartUtc) {
        actualLiveSongStartUtc = new Date(WorldChoirServerTime.nowMs()).toISOString();
      }
    }).catch(() => {});

    await startLiveAudio(target);
    transitioning = false;
  }

  async function enterPreEvent() {
    if (!shouldRunLivePlayback()) {
      dismissLiveUiIfOffHome();
      return;
    }
    const videoPlaying = videoEl && !videoEl.paused && videoEl.readyState >= 2 && !videoFailed;
    if (state === 'PRE_EVENT' && active && videoPlaying) return;

    state = 'PRE_EVENT';
    showPreEventUI();
    getLiveSongAudio();
    await prepareVideo();

    const nowMs = WorldChoirServerTime.nowMs();
    const target = getTargetVideoPositionSec(nowMs);

    if (shouldSkipPreEventVideo(nowMs)) {
      await onVideoEnded();
      return;
    }

    if (videoEl && !videoEl._wcBound) {
      videoEl._wcBound = true;
      videoEl.addEventListener('ended', () => {
        if (shouldLoopPreEventVideo() && !hasPreEventVideoTimelineElapsed(WorldChoirServerTime.nowMs())) {
          videoEl.currentTime = 0;
          videoEl.play().catch(() => {});
          return;
        }
        onVideoEnded();
      });
      videoEl.addEventListener('playing', () => {
        document.getElementById('wc-global-live-pre-fallback')?.setAttribute('hidden', '');
      });
    }

    await seekVideoTo(target, { autoplay: true });
    for (let attempt = 0; attempt < 8 && videoEl && videoEl.paused && !videoFailed; attempt++) {
      try {
        // Prefer sound from the start; fall back to muted autoplay if the browser blocks it.
        videoEl.muted = attempt > 2;
        await videoEl.play();
        if (!videoEl.muted) audioUnlocked = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
    if (videoEl && !videoEl.paused && !videoEl.muted) {
      audioUnlocked = true;
    }
    updateSoundToggleUi();
    if (!videoEl || videoEl.paused || videoFailed) {
      document.getElementById('wc-global-live-pre-fallback')?.removeAttribute('hidden');
    }
    primeLiveSongAudio().catch(() => {});
    updateCountdownUI(nowMs);
  }

  function mountLiveLyrics(atSec = 0) {
    return showLiveSongShell(atSec);
  }

  async function waitForAudioReady(el) {
    if (el.readyState >= 1) return;
    await new Promise((resolve, reject) => {
      el.addEventListener('loadedmetadata', resolve, { once: true });
      el.addEventListener('error', () => reject(new Error('audio load failed')), { once: true });
    });
  }

  async function seekAudioAndWait(el, seekTo) {
    const target = clampSongTime(seekTo, el);
    const drift = Math.abs((el.currentTime || 0) - target);
    if (drift < 0.3) return true;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        el.removeEventListener('seeked', onSeeked);
        resolve(ok);
      };
      const onSeeked = () => {
        lastAudioSeekAt = Date.now();
        finish(Math.abs((el.currentTime || 0) - target) < 1.25);
      };
      el.addEventListener('seeked', onSeeked, { once: true });
      try {
        el.currentTime = target;
        lastAudioSeekAt = Date.now();
      } catch {
        finish(false);
        return;
      }
      setTimeout(() => {
        if (settled) return;
        if (Math.abs((el.currentTime || 0) - target) > 1.25) {
          try { el.currentTime = target; } catch { /* ignore */ }
        }
        finish(Math.abs((el.currentTime || 0) - target) < 1.75);
      }, 550);
    });
  }

  /**
   * iOS-safe lock: play (usually muted) first, THEN seek while the pipeline is active.
   * Seeking before the first play() often snaps back to 0 on mobile Safari.
   */
  async function lockAudioToGlobalPosition({ audible = false } = {}) {
    const el = audioEl || getLiveSongAudio();
    audioEl = el;
    if (!el) return false;

    if (!el._wcBound) {
      el._wcBound = true;
      el.addEventListener('ended', onSongEnded);
      el.addEventListener('error', onSongError);
    }

    try {
      await waitForAudioReady(el);
    } catch {
      startLyricClock(el);
      return false;
    }

    // Wait briefly for duration if needed — seeking without duration is unreliable.
    if (!Number.isFinite(el.duration) || el.duration <= 0) {
      await new Promise((resolve) => {
        const done = () => resolve();
        el.addEventListener('durationchange', done, { once: true });
        setTimeout(done, 800);
      });
    }

    el.volume = 1;
    // Start muted so autoplay is allowed; unmute only after we are on the global time.
    el.muted = true;

    try {
      if (el.paused || el.ended) {
        await el.play();
      }
    } catch {
      startLyricClock(el);
      updateSoundToggleUi();
      return false;
    }

    // Seek AFTER play is running — this is what stops the "restart from 0" bug.
    for (let attempt = 0; attempt < 4; attempt++) {
      const expected = clampSongTime(getGlobalLyricTimeSec(), el);
      await seekAudioAndWait(el, expected);
      await new Promise((r) => setTimeout(r, 80));
      if (Math.abs((el.currentTime || 0) - clampSongTime(getGlobalLyricTimeSec(), el)) <= 1.25) {
        break;
      }
    }

    const wantAudible = audible || audioUnlocked;
    if (wantAudible) {
      try {
        el.muted = false;
        audioUnlocked = true;
      } catch {
        el.muted = true;
      }
    } else {
      el.muted = true;
    }

    startLyricClock(el);
    updateSoundToggleUi();
    return true;
  }

  async function ensureAudibleAtGlobalPosition() {
    audioUnlocked = true;
    return lockAudioToGlobalPosition({ audible: true });
  }

  async function resumeAudibleLiveSong() {
    return ensureAudibleAtGlobalPosition();
  }

  async function startLiveAudio(target) {
    if (!shouldRunLivePlayback() || isPostEventPlaybackBlocked()) {
      return;
    }
    if (!isLiveSongUiActive()) showLiveSongShell(target);
    hideAllUnlockUi();

    if (!audioEl) {
      audioEl = getLiveSongAudio();
    }

    // Prefer audible when the browser allows it; fall back to muted tracking.
    const ok = await lockAudioToGlobalPosition({ audible: true });
    if (!ok) {
      await lockAudioToGlobalPosition({ audible: false });
    }
  }

  function showLiveSongUnlock() {
    // Hard rule: never cover the lyrics with a tap overlay.
    hideAllUnlockUi();
  }

  async function enterLiveSong({ fromVideoEnd = false, forceRejoin = false } = {}) {
    if (!shouldRunLivePlayback() || isPostEventPlaybackBlocked()) {
      dismissLiveUiIfOffHome();
      return;
    }
    const nowMs = WorldChoirServerTime.nowMs();
    const target = getTargetSongPositionSec(nowMs);
    const duration = WorldChoirLiveConfig.EVENT.liveSong.durationSeconds;

    if (target >= duration - 0.5) {
      state = 'LIVE_FINISHED';
      onSongEnded();
      return;
    }

    hideAllUnlockUi();

    if (state === 'LIVE_SONG' && audioEl && !forceRejoin) {
      if (!isLiveSongUiActive()) showLiveSongShell(target);
      await startLiveAudio(target);
      if (audioEl && !audioEl.paused) syncSongToGlobal(nowMs);
      return;
    }

    state = 'LIVE_SONG';
    cleanupVideo();
    if (!mountLiveLyrics(target)) {
      onSongError();
      return;
    }

    // Reuse existing audio element on rejoin — never wipe position back to 0.
    audioEl = getLiveSongAudio();
    if (!audioEl._wcBound) {
      audioEl._wcBound = true;
      audioEl.addEventListener('ended', onSongEnded);
      audioEl.addEventListener('error', onSongError);
    }
    await startLiveAudio(target);
  }

  function syncSongToGlobal(nowMs) {
    if (!audioEl) return;
    if (!isLiveSongUiActive()) showLiveSongShell(getTargetSongPositionSec(nowMs));
    if (audioEl.seeking) return;

    if (audioEl.paused || audioEl.ended) {
      startLiveAudio(getTargetSongPositionSec(nowMs)).catch(() => {});
      return;
    }

    const expected = getTargetSongPositionSec(nowMs);
    const actual = audioEl.currentTime;
    const diff = expected - actual;
    const abs = Math.abs(diff);

    // Hard rejoin fix: if audio is stuck near the start while the world is mid-song,
    // force the play→seek lock again instead of tiny rate tweaks.
    if (actual < 2.5 && expected > 5) {
      lockAudioToGlobalPosition({ audible: audioUnlocked }).catch(() => {});
      LyricsDisplay.update(expected, audioEl);
      return;
    }

    if (abs > SYNC.SEEK_THRESHOLD_S) {
      const now = Date.now();
      const allowSeek = abs > SYNC.HARD_SEEK_S || now - lastAudioSeekAt > SYNC.SEEK_COOLDOWN_MS;
      if (allowSeek) {
        lastAudioSeekAt = now;
        audioEl.playbackRate = 1;
        seekAudioAndWait(audioEl, expected).then(() => {
          LyricsDisplay.update(getTargetSongPositionSec(WorldChoirServerTime.nowMs()), audioEl);
        }).catch(() => {});
      }
      LyricsDisplay.update(expected, audioEl);
      return;
    }

    if (abs > SYNC.RATE_THRESHOLD_S) {
      audioEl.playbackRate = Math.max(SYNC.MIN_RATE, Math.min(SYNC.MAX_RATE, 1 + diff * 0.03));
    } else if (audioEl.playbackRate !== 1) {
      audioEl.playbackRate = 1;
    }

    if (!audioUnlocked && !audioEl.muted) {
      audioEl.muted = true;
    }

    LyricsDisplay.update(expected, audioEl);
  }

  function teardownLiveOverlays() {
    clearLiveGate();
    hideAllUnlockUi();
    const mode = document.getElementById('live-event-mode');
    if (mode) {
      mode.classList.remove('active');
      mode.setAttribute('aria-hidden', 'true');
    }
    const shell = getShell();
    shell?.classList.remove('is-active');
    shell?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('wc-global-live-active');
    document.body.style.overflow = '';
    document.getElementById('home-page')?.removeAttribute('hidden');
    document.getElementById('nav-root')?.removeAttribute('hidden');
    document.getElementById('earth-canvas')?.removeAttribute('hidden');
    document.querySelectorAll('canvas[hidden]').forEach((canvas) => {
      if (canvas.id === 'wc-global-live-video') return;
      canvas.removeAttribute('hidden');
    });
    active = false;
  }

  function onSongEnded() {
    cleanupAudio();
    finalizeLiveEventPlayback();
    teardownLiveOverlays();
    if (!isHomePage()) {
      window.location.replace('index.html');
      return;
    }
    if (typeof WorldChoirHome !== 'undefined') {
      WorldChoirHome.render();
    }
  }

  function onSongError() {
    cleanupAudio();
    const content = document.getElementById('live-event-content');
    if (content) {
      content.innerHTML = `
        <div class="practice-error">
          <h2 class="practice-error__title">Audio unavailable</h2>
          <p class="practice-error__copy">The world is still singing — join in wherever you are.</p>
        </div>
      `;
    }
  }

  async function preloadAssets() {
    if (preloaded) return;
    preloaded = true;
    const { videoUrl } = WorldChoirLiveConfig.EVENT.preEvent;
    const { audioUrl } = WorldChoirLiveConfig.EVENT.liveSong;

    if (shouldRunLivePlayback() && !isPostEventPlaybackBlocked()) {
      getLiveSongAudio();
    }

    const linkV = document.createElement('link');
    linkV.rel = 'preload';
    linkV.as = 'video';
    linkV.href = videoUrl;
    document.head.appendChild(linkV);

    if (shouldRunLivePlayback() && !isPostEventPlaybackBlocked()) {
      const linkA = document.createElement('link');
      linkA.rel = 'preload';
      linkA.as = 'audio';
      linkA.href = audioUrl;
      document.head.appendChild(linkA);
    }
  }

  async function tick() {
    // Use cached server offset — do not block every tick on network sync.
    const nowMs = WorldChoirServerTime.nowMs();
    const next = computeState(nowMs);

    if (isPostEventPlaybackBlocked()) {
      if (state !== 'LIVE_FINISHED') {
        onSongEnded();
      }
      return;
    }

    if (next === 'NORMAL') {
      if (active) {
        cleanupMedia();
        hideTakeover();
      }
      state = 'NORMAL';
      return;
    }

    if (next === 'LIVE_FINISHED') {
      if (state !== 'LIVE_FINISHED') {
        onSongEnded();
      }
      return;
    }

    if (!shouldRunLivePlayback()) {
      dismissLiveUiIfOffHome();
      state = next;
      return;
    }

    updateCountdownUI(nowMs);

    if (next === 'PRE_EVENT' && state !== 'PRE_EVENT' && state !== 'TRANSITIONING_TO_LIVE') {
      await enterPreEvent();
      return;
    }

    if (state === 'PRE_EVENT') {
      const songStartUtc = getAuthoritativeSongStartUtc();
      if (songStartUtc && nowMs >= Date.parse(songStartUtc)) {
        await enterLiveSong();
        return;
      }
      if (next === 'LIVE_SONG' || hasPreEventVideoTimelineElapsed(nowMs)) {
        if (!videoEndedLocally && !transitioning) {
          await onVideoEnded();
        } else if (next === 'LIVE_SONG' && state !== 'LIVE_SONG') {
          await enterLiveSong();
        }
        return;
      }
      if (!videoFailed) {
        syncVideoToGlobal(nowMs);
      } else {
        document.getElementById('wc-global-live-pre-fallback')?.removeAttribute('hidden');
        document.getElementById('wc-global-live-video-wrap')?.setAttribute('hidden', '');
        hideAllUnlockUi();
      }
      return;
    }

    if (next === 'LIVE_SONG' && state !== 'LIVE_SONG' && state !== 'TRANSITIONING_TO_LIVE') {
      await enterLiveSong();
      return;
    }

    if (state === 'LIVE_SONG') {
      if (!isLiveSongUiActive()) showLiveSongShell(getTargetSongPositionSec(nowMs));
      hideAllUnlockUi();
      const target = getTargetSongPositionSec(nowMs);
      if (!audioEl || audioEl.paused || audioEl.ended) {
        await startLiveAudio(target);
      } else {
        syncSongToGlobal(nowMs);
      }
      return;
    }

    if (next === 'LIVE_FINISHED' && state !== 'LIVE_FINISHED') {
      onSongEnded();
    }
  }

  async function pollAuthoritative() {
    if (isPostEventPlaybackBlocked()) return;
    if (!shouldRunLivePlayback()) return;
    if (state !== 'PRE_EVENT' && state !== 'LIVE_SONG' && state !== 'NORMAL') return;
    await fetchAuthoritativeState();
    const songStartUtc = getAuthoritativeSongStartUtc();
    if (songStartUtc && state === 'PRE_EVENT' && !videoEndedLocally) {
      const nowMs = WorldChoirServerTime.nowMs();
      if (nowMs >= Date.parse(songStartUtc)) {
        await enterLiveSong();
      }
    }
  }

  function onVisibility() {
    // Do not pause/stop on hide — that caused rejoins to restart or die.
    if (document.hidden) return;

    if (isPostEventPlaybackBlocked()) return;
    if (!shouldRunLivePlayback()) {
      dismissLiveUiIfOffHome();
      return;
    }

    WorldChoirServerTime.sync(true).then(async () => {
      await fetchAuthoritativeState();
      const nowMs = WorldChoirServerTime.nowMs();
      const next = computeState(nowMs);

      if (next === 'LIVE_SONG') {
        state = 'LIVE_SONG';
        hideAllUnlockUi();
        if (!isLiveSongUiActive()) showLiveSongShell(getTargetSongPositionSec(nowMs));
        await enterLiveSong({ forceRejoin: false });
        return;
      }

      if (next === 'PRE_EVENT') {
        if (state !== 'PRE_EVENT') {
          await enterPreEvent();
        } else if (videoEl && !videoFailed && !videoEndedLocally) {
          await seekVideoTo(getTargetVideoPositionSec(nowMs), { autoplay: true });
        }
        return;
      }

      await tick();
    }).catch(() => {});
  }

  function onPageHide() {
    // Intentionally do nothing destructive — leaving the tab must not reset playback.
  }

  function startLoops() {
    if (tickTimer) return;
    tickTimer = setInterval(() => { tick().catch(() => {}); }, SYNC.TICK_MS);
    pollTimer = setInterval(() => { pollAuthoritative().catch(() => {}); }, SYNC.POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    WorldChoirServerTime.startAutoResync();
  }

  function stopLoops() {
    if (tickTimer) clearInterval(tickTimer);
    if (pollTimer) clearInterval(pollTimer);
    tickTimer = null;
    pollTimer = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    WorldChoirServerTime.stopAutoResync();
  }

  async function reconcileStaleAuthoritativeState() {
    if (typeof WorldChoirEventSchedule === 'undefined' || !WorldChoirEventSchedule.isTestOverrideActive()) {
      return;
    }

    const hadStaleStart = actualLiveSongStartUtc && !isSongStartValidForCurrentEvent(actualLiveSongStartUtc);
    if (!hadStaleStart) return;

    actualLiveSongStartUtc = null;
    videoEndedLocally = false;
    transitioning = false;
    try {
      await fetch('/api/live-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'reset-test-state',
          eventId: WorldChoirLiveConfig.EVENT.eventId,
        }),
      });
    } catch {
      /* best effort */
    }
  }

  async function resetTestEventStateIfNeeded() {
    if (typeof WorldChoirEventSchedule === 'undefined' || !WorldChoirEventSchedule.isTestOverrideActive()) {
      return;
    }

    // During test overrides, allow the promise flow to appear again each run.
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('wc_live_flow_complete_')) localStorage.removeItem(key);
    });

    const nowMs = Date.now();
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    const params = new URLSearchParams(window.location.search);
    const forceReset = params.has('wcEventTestReset');

    // Only wipe server song-start before the pre-event window (or when forced).
    // Never reset mid-live — that desyncs everyone already in the song.
    if (!forceReset && nowMs >= preStart) {
      return;
    }

    try {
      await fetch('/api/live-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'reset-test-state',
          eventId: WorldChoirLiveConfig.EVENT.eventId,
        }),
      });
    } catch {
      /* best effort */
    }
    actualLiveSongStartUtc = null;
    videoEndedLocally = false;
    transitioning = false;
  }

  function applyImmediateLiveGate() {
    if (!shouldRunLivePlayback() || isPostEventPlaybackBlocked()) return false;
    ensureShell();
    const nowMs = Date.now();
    const next = computeState(nowMs);
    if (next === 'NORMAL' || next === 'LIVE_FINISHED') return false;

    hidePageUnderlays();
    document.body.classList.add('wc-global-live-active');
    document.body.style.overflow = 'hidden';

    if (next === 'PRE_EVENT') {
      document.getElementById('wc-global-live-pre')?.removeAttribute('hidden');
      document.getElementById('wc-global-live-pre-fallback')?.removeAttribute('hidden');
      const shell = getShell();
      shell?.classList.add('is-active');
      shell?.setAttribute('aria-hidden', 'false');
      return true;
    }

    if (next === 'LIVE_SONG') {
      state = 'LIVE_SONG';
      const atSec = getTargetSongPositionSec(nowMs);
      showLiveSongShell(atSec);
      return true;
    }

    return false;
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
    ensureShell();
    applyImmediateLiveGate();
    if (typeof LiveEventMode !== 'undefined') {
      ensureLiveSongMode();
      LiveEventMode.init();
    }
    bindUnlockHandlers();

    await resetTestEventStateIfNeeded();
    await WorldChoirServerTime.sync(true);
    await fetchAuthoritativeState();
    await reconcileStaleAuthoritativeState();

    if (isPostEventPlaybackBlocked()) {
      stopLiveSongElement();
      state = 'LIVE_FINISHED';
      teardownLiveOverlays();
      if (typeof LiveEventMode !== 'undefined') {
        LiveEventMode.finishFlow?.();
      }
      if (typeof WorldChoirHome !== 'undefined') {
        WorldChoirHome.render();
      }
      return;
    }

    const nowMs = WorldChoirServerTime.nowMs();
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    if (preStart - nowMs <= SYNC.PRELOAD_LEAD_MS) {
      preloadAssets().catch(() => {});
    }

    startLoops();
    await tick();
    })();

    return initPromise;
  }

  function isActive() {
    if (state === 'LIVE_FINISHED' || state === 'NORMAL') return false;
    return active
      || document.getElementById('wc-global-live')?.classList.contains('is-active')
      || document.getElementById('live-event-mode')?.classList.contains('active');
  }

  function getState() {
    return state;
  }

  function isDuringLiveSong() {
    return state === 'LIVE_SONG';
  }

  function isPostEvent() {
    return state === 'LIVE_FINISHED';
  }

  return {
    init,
    isActive,
    getState,
    isDuringLiveSong,
    isPostEvent,
    tick,
    stopLoops,
  };
})();
