/**
 * GlobalLiveEvent — authoritative synchronized World Choir live experience.
 *
 * One global timeline: NORMAL → PRE_EVENT (video) → LIVE_SONG → LIVE_FINISHED
 * Video completion (not countdown zero) triggers the live song transition.
 */
const GlobalLiveEvent = (() => {
  const SYNC = {
    TICK_MS: 400,
    POLL_MS: 2500,
    SEEK_THRESHOLD_S: 1.25,
    RATE_THRESHOLD_S: 0.2,
    MAX_RATE: 1.04,
    MIN_RATE: 0.96,
    VIDEO_SEEK_THRESHOLD_S: 0.45,
    VIDEO_RATE_THRESHOLD_S: 0.08,
    VIDEO_MAX_RATE: 1.06,
    VIDEO_MIN_RATE: 0.94,
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

  function isLiveExperiencePage() {
    const page = window.location.pathname.split('/').pop() || '';
    return page === '' || page === 'index.html';
  }

  function shouldRunLivePlayback() {
    return isLiveExperiencePage();
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
    if (!shouldRunLivePlayback()) return false;
    if (isPostEventPlaybackBlocked()) return false;
    if (isPracticeModeActive()) return false;
    const nowMs = WorldChoirServerTime.nowMs?.() ?? Date.now();
    const next = computeState(nowMs);
    return next === 'PRE_EVENT' || next === 'LIVE_SONG';
  }

  function stopLiveSongElement() {
    const el = document.getElementById('wc-live-song-audio');
    if (el) {
      el.pause();
      el.muted = true;
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (audioEl) {
      audioEl.pause();
      try {
        audioEl.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    LyricsDisplay.stopSync();
  }

  function finalizeLiveEventPlayback() {
    stopLiveSongElement();
    cleanupMedia();
    hideTakeover();
    hideLiveSongShell();
    active = false;
    state = 'LIVE_FINISHED';
  }

  function ensureShell() {
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
      const wasMuted = el.muted;
      const prevVolume = el.volume;
      el.muted = true;
      el.volume = 0;
      await el.play();
      el.pause();
      el.currentTime = 0;
      el.muted = wasMuted;
      el.volume = prevVolume || 1;
      return true;
    } catch {
      return false;
    }
  }

  function bindUnlockHandlers() {
    const unlock = async () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      document.getElementById('wc-global-live-unlock')?.setAttribute('hidden', '');
      document.getElementById('wc-live-song-unlock')?.setAttribute('hidden', '');
      const preVideo = document.getElementById('wc-global-live-video');
      if (preVideo && state === 'PRE_EVENT') {
        preVideo.muted = false;
      }
      await primeLiveSongAudio();
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') await ctx.resume();
      } catch {
        /* ignore */
      }
      if (canPlayLiveSongAudio() && audioEl?.paused) {
        audioEl.play().then(() => {
          LyricsDisplay.startSync(audioEl);
        }).catch(() => {});
      }
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, unlock, { capture: true, passive: true });
    });
  }

  function showTakeover() {
    const shell = getShell();
    if (!shell) return;
    clearLiveGate();
    shell.classList.add('is-active');
    shell.setAttribute('aria-hidden', 'false');
    document.body.classList.add('wc-global-live-active');
    document.getElementById('nav-root')?.setAttribute('hidden', '');
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
        } else {
          actualLiveSongStartUtc = null;
        }
      } else {
        actualLiveSongStartUtc = null;
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

  function showLiveSongShell() {
    const shell = getShell();
    const mode = document.getElementById('live-event-mode');
    const content = document.getElementById('live-event-content');
    if (!mode || !content) return false;

    clearLiveGate();
    document.getElementById('wc-global-live-pre')?.setAttribute('hidden', '');
    shell?.classList.remove('is-active');
    shell?.setAttribute('aria-hidden', 'true');

    mode.classList.add('active');
    mode.setAttribute('aria-hidden', 'false');
    document.body.classList.add('wc-global-live-active');
    document.body.style.overflow = 'hidden';
    document.getElementById('nav-root')?.setAttribute('hidden', '');
    document.getElementById('home-page')?.setAttribute('hidden', '');
    active = true;

    LyricsDisplay.mountLive(content);
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

    if (Math.abs(videoEl.currentTime - clamped) > 0.08) {
      videoEl.pause();
      await new Promise((resolve) => {
        const finish = () => {
          videoEl.removeEventListener('seeked', finish);
          resolve();
        };
        videoEl.addEventListener('seeked', finish, { once: true });
        videoEl.currentTime = clamped;
        setTimeout(resolve, 150);
      });
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
          document.getElementById('wc-global-live-unlock')?.removeAttribute('hidden');
        }
      }
    }
  }

  function syncVideoToGlobal(nowMs) {
    if (!videoEl || videoFailed || videoEndedLocally) return;
    const expected = getTargetVideoPositionSec(nowMs);
    const actual = videoEl.currentTime;
    const diff = expected - actual;

    if (Math.abs(diff) > SYNC.VIDEO_SEEK_THRESHOLD_S) {
      videoEl.playbackRate = 1;
      videoEl.currentTime = expected;
      if (videoEl.paused) videoEl.play().catch(() => {});
      return;
    }

    if (Math.abs(diff) > SYNC.VIDEO_RATE_THRESHOLD_S) {
      videoEl.playbackRate = Math.max(
        SYNC.VIDEO_MIN_RATE,
        Math.min(SYNC.VIDEO_MAX_RATE, 1 + diff * 0.4),
      );
    } else {
      videoEl.playbackRate = 1;
    }
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
    if (!mountLiveLyrics()) {
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

    const seekTo = Math.min(target, audioEl.duration || target, duration - 0.05);
    if (audioEl.readyState >= 1) {
      audioEl.currentTime = seekTo;
    }
    audioEl.muted = false;
    audioEl.volume = 1;

    // Start play synchronously in the video-ended chain before any await (iOS handoff).
    const playPromise = audioEl.play();

    reportVideoEnded().then(() => {
      if (!actualLiveSongStartUtc) {
        actualLiveSongStartUtc = new Date(WorldChoirServerTime.nowMs()).toISOString();
      }
    }).catch(() => {});

    try {
      await playPromise;
      LyricsDisplay.startSync(audioEl);
      LyricsDisplay.update(audioEl.currentTime, audioEl);
      document.getElementById('wc-global-live-unlock')?.setAttribute('hidden', '');
      document.getElementById('wc-live-song-unlock')?.setAttribute('hidden', '');
    } catch {
      await startLiveAudio(target);
    }

    transitioning = false;
  }

  async function enterPreEvent() {
    if (!shouldRunLivePlayback()) {
      dismissLiveUiIfOffHome();
      return;
    }
    if (state === 'PRE_EVENT' && active) return;
    state = 'PRE_EVENT';
    showPreEventUI();
    getLiveSongAudio();
    await prepareVideo();

    const nowMs = WorldChoirServerTime.nowMs();
    const target = getTargetVideoPositionSec(nowMs);
    const windowSec = getPreEventWindowSec();

    if (shouldSkipPreEventVideo(nowMs)) {
      await onVideoEnded();
      return;
    }

    if (!videoEl._wcBound) {
      videoEl._wcBound = true;
      videoEl.addEventListener('ended', () => {
        if (shouldLoopPreEventVideo() && !hasPreEventVideoTimelineElapsed(WorldChoirServerTime.nowMs())) {
          videoEl.currentTime = 0;
          videoEl.play().catch(() => {});
          return;
        }
        onVideoEnded();
      });
    }

    await seekVideoTo(target, { autoplay: true });
    for (let attempt = 0; attempt < 5 && videoEl && videoEl.paused && !videoFailed; attempt++) {
      try {
        videoEl.muted = !audioUnlocked;
        await videoEl.play();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    updateCountdownUI(nowMs);
  }

  function mountLiveLyrics() {
    return showLiveSongShell();
  }

  async function waitForAudioReady(el) {
    if (el.readyState >= 1) return;
    await new Promise((resolve, reject) => {
      el.addEventListener('loadedmetadata', resolve, { once: true });
      el.addEventListener('error', () => reject(new Error('audio load failed')), { once: true });
    });
  }

  async function startLiveAudio(target) {
    if (!canPlayLiveSongAudio()) {
      stopLiveSongElement();
      return;
    }
    if (!audioEl) {
      audioEl = getLiveSongAudio();
      audioEl.addEventListener('ended', onSongEnded);
      audioEl.addEventListener('error', onSongError);
      await waitForAudioReady(audioEl);
    }

    const duration = WorldChoirLiveConfig.EVENT.liveSong.durationSeconds;
    const seekTo = Math.min(target, audioEl.duration || target, duration - 0.05);
    if (Math.abs(audioEl.currentTime - seekTo) > 0.2) {
      audioEl.currentTime = seekTo;
    }

    audioEl.muted = false;
    audioEl.volume = 1;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await audioEl.play();
        LyricsDisplay.startSync(audioEl);
        LyricsDisplay.update(audioEl.currentTime, audioEl);
        document.getElementById('wc-global-live-unlock')?.setAttribute('hidden', '');
        document.getElementById('wc-live-song-unlock')?.setAttribute('hidden', '');
        return;
      } catch (err) {
        if (attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }
    }

    console.warn('Live song autoplay blocked');
    showLiveSongUnlock();
  }

  function showLiveSongUnlock() {
    let btn = document.getElementById('wc-live-song-unlock');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'wc-live-song-unlock';
      btn.className = 'wc-global-live__unlock wc-global-live__unlock--song';
      btn.innerHTML = '<span class="wc-global-live__unlock-title">Tap to join the live song</span><span class="wc-global-live__unlock-sub">The world is singing now</span>';
      document.body.appendChild(btn);
    }
    btn.removeAttribute('hidden');
    btn.onclick = async () => {
      audioUnlocked = true;
      try {
        if (!audioEl) {
          await startLiveAudio(getTargetSongPositionSec(WorldChoirServerTime.nowMs()));
        } else {
          await audioEl.play();
          LyricsDisplay.startSync(audioEl);
        }
        btn.setAttribute('hidden', '');
      } catch { /* still blocked */ }
    };
  }

  async function enterLiveSong({ fromVideoEnd = false, forceRejoin = false } = {}) {
    if (!shouldRunLivePlayback() || isPostEventPlaybackBlocked()) {
      dismissLiveUiIfOffHome();
      stopLiveSongElement();
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

    if (state === 'LIVE_SONG' && audioEl && !forceRejoin) {
      if (!canPlayLiveSongAudio()) {
        stopLiveSongElement();
        return;
      }
      syncSongToGlobal(nowMs);
      if (audioEl.paused) await audioEl.play().catch(() => {});
      return;
    }

    state = 'LIVE_SONG';
    if (forceRejoin) cleanupAudio();
    cleanupVideo();
    if (!mountLiveLyrics()) {
      onSongError();
      return;
    }

    await startLiveAudio(target);
  }

  function syncSongToGlobal(nowMs) {
    if (!canPlayLiveSongAudio()) {
      stopLiveSongElement();
      return;
    }
    if (!audioEl) return;
    const expected = getTargetSongPositionSec(nowMs);
    const actual = audioEl.currentTime;
    const diff = expected - actual;

    if (Math.abs(diff) > SYNC.SEEK_THRESHOLD_S) {
      audioEl.playbackRate = 1;
      audioEl.currentTime = expected;
      LyricsDisplay.update(expected, audioEl);
      return;
    }

    if (Math.abs(diff) > SYNC.RATE_THRESHOLD_S) {
      audioEl.playbackRate = Math.max(SYNC.MIN_RATE, Math.min(SYNC.MAX_RATE, 1 + diff * 0.12));
    } else {
      audioEl.playbackRate = 1;
    }
    LyricsDisplay.update(audioEl.currentTime, audioEl);
  }

  function onSongEnded() {
    cleanupAudio();
    finalizeLiveEventPlayback();
    if (typeof LiveEventMode !== 'undefined' && LiveEventMode.showPostSongFlow) {
      LiveEventMode.showPostSongFlow();
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
    await WorldChoirServerTime.sync();
    const nowMs = WorldChoirServerTime.nowMs();
    const next = computeState(nowMs);

    if (isPostEventPlaybackBlocked()) {
      if (state !== 'LIVE_FINISHED') {
        onSongEnded();
      } else {
        stopLiveSongElement();
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
      } else {
        stopLiveSongElement();
      }
      return;
    }

    if (!shouldRunLivePlayback()) {
      dismissLiveUiIfOffHome();
      stopLiveSongElement();
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
      // Even if the video failed/404'd, we must still join the live song on time.
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
        // Keep a clear fallback + unlock so the screen is never empty black.
        document.getElementById('wc-global-live-pre-fallback')?.removeAttribute('hidden');
        document.getElementById('wc-global-live-video-wrap')?.setAttribute('hidden', '');
        document.getElementById('wc-global-live-unlock')?.removeAttribute('hidden');
      }
      return;
    }

    if (next === 'LIVE_SONG' && state !== 'LIVE_SONG' && state !== 'TRANSITIONING_TO_LIVE') {
      await enterLiveSong();
      return;
    }

    if (state === 'LIVE_SONG') {
      // Never tear down audio during the live song just because a transient
      // gate check failed — remount UI and keep trying to play.
      if (!isLiveSongUiActive()) {
        showLiveSongShell();
      }
      if (!audioEl || audioEl.paused || audioEl.ended) {
        showLiveSongUnlock();
        startLiveAudio(getTargetSongPositionSec(nowMs)).catch(() => {
          showLiveSongUnlock();
        });
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
    if (isPostEventPlaybackBlocked()) {
      stopLiveSongElement();
      return;
    }
    if (!shouldRunLivePlayback()) {
      dismissLiveUiIfOffHome();
      stopLiveSongElement();
      return;
    }
    if (state !== 'PRE_EVENT' && state !== 'LIVE_SONG') return;
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
    if (document.hidden) {
      pauseLiveMedia();
      return;
    }
    if (isPostEventPlaybackBlocked()) {
      stopLiveSongElement();
      return;
    }
    if (!shouldRunLivePlayback()) {
      dismissLiveUiIfOffHome();
      stopLiveSongElement();
      return;
    }
    WorldChoirServerTime.sync(true).then(async () => {
      await fetchAuthoritativeState();
      if (state === 'LIVE_SONG') {
        if (!canPlayLiveSongAudio()) {
          stopLiveSongElement();
          return;
        }
        const nowMs = WorldChoirServerTime.nowMs();
        const needsRejoin = !audioEl || audioEl.ended || audioEl.readyState < 1;
        if (needsRejoin) {
          await enterLiveSong({ forceRejoin: true });
        } else {
          syncSongToGlobal(nowMs);
          if (canPlayLiveSongAudio()) {
            await audioEl.play().catch(() => {});
          }
        }
        return;
      }
      if (state === 'PRE_EVENT' && videoEl && !videoFailed && !videoEndedLocally) {
        const target = getTargetVideoPositionSec(WorldChoirServerTime.nowMs());
        await seekVideoTo(target, { autoplay: true });
      }
      await tick();
    }).catch(() => {});
  }

  function onPageHide() {
    pauseLiveMedia();
    stopLiveSongElement();
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

    const params = new URLSearchParams(window.location.search);
    if (params.has('wcEventTestReset')) {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('wc_live_flow_complete_')) localStorage.removeItem(key);
      });
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
  }

  function applyImmediateLiveGate() {
    if (!shouldRunLivePlayback() || isPostEventPlaybackBlocked()) return false;
    ensureShell();
    const nowMs = Date.now();
    const next = computeState(nowMs);
    if (next === 'NORMAL' || next === 'LIVE_FINISHED') return false;

    clearLiveGate();
    document.getElementById('home-page')?.setAttribute('hidden', '');
    document.getElementById('earth-canvas')?.setAttribute('hidden', '');
    document.getElementById('ambient-bg')?.setAttribute('hidden', '');
    document.getElementById('nav-root')?.setAttribute('hidden', '');
    document.body.classList.add('wc-global-live-active');
    document.body.style.overflow = 'hidden';

    if (next === 'PRE_EVENT') {
      state = 'PRE_EVENT';
      document.getElementById('wc-global-live-pre')?.removeAttribute('hidden');
      const shell = getShell();
      shell?.classList.add('is-active');
      shell?.setAttribute('aria-hidden', 'false');
      active = true;
      return true;
    }

    if (next === 'LIVE_SONG') {
      state = 'LIVE_SONG';
      showLiveSongShell();
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
      if (!document.getElementById('live-event-mode')) {
        document.body.insertAdjacentHTML('beforeend', `
          <div class="practice-mode" id="live-event-mode" aria-hidden="true">
            <div id="live-event-content"></div>
          </div>
        `);
      }
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
