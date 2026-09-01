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

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = String(str ?? '');
    return el.innerHTML;
  }

  function getShell() {
    return document.getElementById('wc-global-live');
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
                crossorigin="anonymous"
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

  function bindUnlockHandlers() {
    const unlock = () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      document.getElementById('wc-global-live-unlock')?.setAttribute('hidden', '');
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
      } catch {
        /* ignore */
      }
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, unlock, { capture: true, passive: true });
    });
  }

  function showTakeover() {
    const shell = getShell();
    if (!shell) return;
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

  function getTargetVideoPositionSec(nowMs) {
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    const duration = WorldChoirLiveConfig.EVENT.preEvent.videoDurationSeconds;
    const elapsed = (nowMs - preStart) / 1000;
    return Math.max(0, Math.min(duration, elapsed));
  }

  function getTargetSongPositionSec(nowMs) {
    if (!actualLiveSongStartUtc) return 0;
    const songStart = new Date(actualLiveSongStartUtc).getTime();
    const duration = WorldChoirLiveConfig.EVENT.liveSong.durationSeconds;
    const elapsed = (nowMs - songStart) / 1000;
    return Math.max(0, Math.min(duration, elapsed));
  }

  function computeState(nowMs) {
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    const songDurationMs = WorldChoirLiveConfig.getSongDurationMs();

    if (actualLiveSongStartUtc) {
      const songStart = new Date(actualLiveSongStartUtc).getTime();
      const songEnd = songStart + songDurationMs;
      if (nowMs >= songEnd) return 'LIVE_FINISHED';
      if (nowMs >= songStart) return 'LIVE_SONG';
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
      if (data.serverNow) {
        const serverMs = new Date(data.serverNow).getTime();
        const localMs = Date.now();
        /* gentle merge — server-time module owns offset; nudge if drift */
      }
      if (data.actualLiveSongStartUtc) {
        actualLiveSongStartUtc = data.actualLiveSongStartUtc;
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
      if (data.actualLiveSongStartUtc) {
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
    audioEl.src = '';
    audioEl.load();
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

  function showSongUI() {
    document.getElementById('wc-global-live-pre')?.setAttribute('hidden', '');
    document.getElementById('wc-global-live-song')?.removeAttribute('hidden');
    showTakeover();
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
      const done = () => {
        videoEl.removeEventListener('loadedmetadata', done);
        videoEl.removeEventListener('error', onErr);
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
        resolve();
        return;
      }
      videoEl.addEventListener('loadedmetadata', done, { once: true });
      videoEl.addEventListener('error', onErr, { once: true });
    });
  }

  async function seekVideoTo(targetSec, { autoplay = true } = {}) {
    if (!videoEl || videoFailed) return;
    const duration = videoEl.duration && Number.isFinite(videoEl.duration)
      ? videoEl.duration
      : WorldChoirLiveConfig.EVENT.preEvent.videoDurationSeconds;

    const clamped = Math.max(0, Math.min(targetSec, duration - 0.05));
    videoEl.style.opacity = '0';

    if (Math.abs(videoEl.currentTime - clamped) > 0.15) {
      videoEl.currentTime = clamped;
    }

    if (autoplay) {
      try {
        videoEl.muted = false;
        await videoEl.play();
      } catch {
        videoEl.muted = true;
        try { await videoEl.play(); } catch { /* fallback UI stays */ }
        if (!audioUnlocked) {
          document.getElementById('wc-global-live-unlock')?.removeAttribute('hidden');
        }
      }
    }

    videoEl.style.opacity = '1';
  }

  function syncVideoToGlobal(nowMs) {
    if (!videoEl || videoFailed || videoEndedLocally) return;
    const expected = getTargetVideoPositionSec(nowMs);
    const actual = videoEl.currentTime;
    const diff = expected - actual;

    if (Math.abs(diff) > SYNC.SEEK_THRESHOLD_S) {
      videoEl.playbackRate = 1;
      videoEl.currentTime = expected;
      return;
    }

    if (Math.abs(diff) > SYNC.RATE_THRESHOLD_S) {
      videoEl.playbackRate = Math.max(SYNC.MIN_RATE, Math.min(SYNC.MAX_RATE, 1 + diff * 0.15));
    } else {
      videoEl.playbackRate = 1;
    }
  }

  async function onVideoEnded() {
    if (videoEndedLocally || transitioning) return;
    videoEndedLocally = true;
    transitioning = true;
    state = 'TRANSITIONING_TO_LIVE';

    await reportVideoEnded();
    if (!actualLiveSongStartUtc) {
      actualLiveSongStartUtc = new Date(WorldChoirServerTime.nowMs()).toISOString();
    }

    await enterLiveSong({ fromVideoEnd: true });
    transitioning = false;
  }

  async function enterPreEvent() {
    if (state === 'PRE_EVENT' && active) return;
    state = 'PRE_EVENT';
    showPreEventUI();
    await prepareVideo();

    const nowMs = WorldChoirServerTime.nowMs();
    const target = getTargetVideoPositionSec(nowMs);
    const duration = WorldChoirLiveConfig.EVENT.preEvent.videoDurationSeconds;

    if (target >= duration - 0.5) {
      await onVideoEnded();
      return;
    }

    if (!videoEl._wcBound) {
      videoEl._wcBound = true;
      videoEl.addEventListener('ended', () => onVideoEnded());
    }

    await seekVideoTo(target, { autoplay: true });
    updateCountdownUI(nowMs);
  }

  function mountLiveLyrics() {
    const container = document.getElementById('wc-global-live-song-content');
    if (!container) return;
    if (typeof LyricsDisplay.mountLive === 'function') {
      LyricsDisplay.mountLive(container);
    } else {
      LyricsDisplay.mount(container);
      document.getElementById('practice-controls-inner')?.setAttribute('hidden', '');
      const community = document.querySelector('.pm-community__title');
      if (community) community.textContent = 'The world is singing';
    }
  }

  async function waitForAudioReady(el) {
    if (el.readyState >= 1) return;
    await new Promise((resolve, reject) => {
      el.addEventListener('loadedmetadata', resolve, { once: true });
      el.addEventListener('error', () => reject(new Error('audio load failed')), { once: true });
    });
  }

  async function enterLiveSong({ fromVideoEnd = false } = {}) {
    state = 'LIVE_SONG';
    cleanupVideo();
    showSongUI();
    mountLiveLyrics();

    const nowMs = WorldChoirServerTime.nowMs();
    const target = getTargetSongPositionSec(nowMs);
    const duration = WorldChoirLiveConfig.EVENT.liveSong.durationSeconds;

    if (target >= duration - 0.5) {
      state = 'LIVE_FINISHED';
      onSongEnded();
      return;
    }

    audioEl = new Audio(WorldChoirLiveConfig.EVENT.liveSong.audioUrl);
    audioEl.addEventListener('ended', onSongEnded);
    audioEl.addEventListener('error', onSongError);

    try {
      await waitForAudioReady(audioEl);
      audioEl.currentTime = Math.min(target, audioEl.duration || target);
      await audioEl.play();
      LyricsDisplay.startSync(audioEl);
      LyricsDisplay.update(audioEl.currentTime, audioEl);
    } catch (err) {
      console.warn('Live song autoplay blocked:', err);
      document.getElementById('wc-global-live-unlock')?.removeAttribute('hidden');
      const unlockBtn = document.getElementById('wc-global-live-unlock');
      unlockBtn?.removeAttribute('hidden');
      unlockBtn?.addEventListener('click', async () => {
        try {
          await audioEl.play();
          LyricsDisplay.startSync(audioEl);
        } catch { /* still blocked */ }
      }, { once: true });
    }
  }

  function syncSongToGlobal(nowMs) {
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
    state = 'LIVE_FINISHED';
    hideTakeover();
    if (typeof LiveEventMode !== 'undefined' && LiveEventMode.showPostSongFlow) {
      LiveEventMode.showPostSongFlow();
    }
  }

  function onSongError() {
    cleanupAudio();
    const container = document.getElementById('wc-global-live-song-content');
    if (container) {
      container.innerHTML = `
        <div class="live-event-error">
          <h2 class="live-event-error__title">Audio unavailable</h2>
          <p class="live-event-error__copy">The world is still singing — join in wherever you are.</p>
        </div>
      `;
    }
  }

  async function preloadAssets() {
    if (preloaded) return;
    preloaded = true;
    const { videoUrl } = WorldChoirLiveConfig.EVENT.preEvent;
    const { audioUrl } = WorldChoirLiveConfig.EVENT.liveSong;

    const linkV = document.createElement('link');
    linkV.rel = 'preload';
    linkV.as = 'video';
    linkV.href = videoUrl;
    document.head.appendChild(linkV);

    const linkA = document.createElement('link');
    linkA.rel = 'preload';
    linkA.as = 'audio';
    linkA.href = audioUrl;
    document.head.appendChild(linkA);
  }

  async function tick() {
    await WorldChoirServerTime.sync();
    const nowMs = WorldChoirServerTime.nowMs();
    const next = computeState(nowMs);

    if (next === 'NORMAL') {
      if (active) {
        cleanupMedia();
        hideTakeover();
      }
      state = 'NORMAL';
      return;
    }

    updateCountdownUI(nowMs);

    if (next === 'PRE_EVENT' && state !== 'PRE_EVENT' && state !== 'TRANSITIONING_TO_LIVE') {
      await enterPreEvent();
      return;
    }

    if (state === 'PRE_EVENT') {
      if (actualLiveSongStartUtc) {
        await enterLiveSong();
        return;
      }
      syncVideoToGlobal(nowMs);
      const target = getTargetVideoPositionSec(nowMs);
      const duration = WorldChoirLiveConfig.EVENT.preEvent.videoDurationSeconds;
      if (!videoEndedLocally && target >= duration - 0.25 && !videoFailed) {
        await onVideoEnded();
      }
      return;
    }

    if (next === 'LIVE_SONG' && state !== 'LIVE_SONG' && state !== 'TRANSITIONING_TO_LIVE') {
      await enterLiveSong();
      return;
    }

    if (state === 'LIVE_SONG') {
      syncSongToGlobal(nowMs);
      return;
    }

    if (next === 'LIVE_FINISHED' && state !== 'LIVE_FINISHED') {
      state = 'LIVE_FINISHED';
      onSongEnded();
    }
  }

  async function pollAuthoritative() {
    if (state !== 'PRE_EVENT' && state !== 'LIVE_SONG') return;
    await fetchAuthoritativeState();
    if (actualLiveSongStartUtc && state === 'PRE_EVENT' && !videoEndedLocally) {
      await enterLiveSong();
    }
  }

  function onVisibility() {
    if (document.hidden) return;
    WorldChoirServerTime.sync(true).then(() => tick()).catch(() => {});
  }

  function startLoops() {
    if (tickTimer) return;
    tickTimer = setInterval(() => { tick().catch(() => {}); }, SYNC.TICK_MS);
    pollTimer = setInterval(() => { pollAuthoritative().catch(() => {}); }, SYNC.POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    WorldChoirServerTime.startAutoResync();
  }

  function stopLoops() {
    if (tickTimer) clearInterval(tickTimer);
    if (pollTimer) clearInterval(pollTimer);
    tickTimer = null;
    pollTimer = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onVisibility);
    WorldChoirServerTime.stopAutoResync();
  }

  async function init() {
    ensureShell();
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

    await WorldChoirServerTime.sync(true);
    await fetchAuthoritativeState();

    const nowMs = WorldChoirServerTime.nowMs();
    const preStart = WorldChoirLiveConfig.getPreEventStartMs();
    if (preStart - nowMs <= SYNC.PRELOAD_LEAD_MS) {
      preloadAssets().catch(() => {});
    }

    startLoops();
    await tick();
  }

  function isActive() {
    return active;
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
