/**
 * World Choir — Simplified Home (countdown + participation only)
 */
const WorldChoirHome = (() => {
  let countdownTimer = null;
  let homeReady = false;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function isPreEvent() {
    return Date.now() < WorldChoirConfig.getEventStart().getTime();
  }

  function isPostEvent() {
    return LiveEventMode.isPostEvent();
  }

  function isHomeDataReady() {
    // Only gate on pledge state — countdown/date/song are local; voices stream in after.
    return typeof WorldChoirPledgeState === 'undefined'
      || WorldChoirPledgeState.isLoaded();
  }

  /* ─── Subtle cinematic background ─── */
  function initBackground() {
    const canvas = document.getElementById('earth-canvas');
    if (!canvas) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const ctx = canvas.getContext('2d');
    const stars = [];

    function resize() {
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      stars.length = 0;
      const n = Math.min(60, Math.floor(window.innerWidth / 14));
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          r: Math.random() * 1 + 0.3,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function paintFrame(animate) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      const t = animate ? Date.now() / 1000 : 0;
      stars.forEach((s) => {
        const a = animate
          ? (0.12 + 0.35 * Math.abs(Math.sin(t * 0.5 + s.phase)))
          : 0.28;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 220, 220, ${a})`;
        ctx.fill();
      });
    }

    function draw() {
      paintFrame(true);
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    if (reducedMotion) paintFrame(false);
    else draw();
  }

  function actionIcon(type) {
    const icons = {
      peace:
        '<svg class="btn-icon__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 12l-5.5 7.5"/><path d="M12 12l5.5 7.5"/></svg>',
      calendar:
        '<svg class="btn-icon__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
      share:
        '<svg class="btn-icon__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.7 13.5l6.6 3.9M15.3 6.6L8.7 10.5"/></svg>',
    };
    return icons[type] || '';
  }

  function countdownUnit(value, label, id) {
    return `
      <div class="countdown-hero__unit">
        <span class="countdown-hero__value" id="${id}">${String(value).padStart(2, '0')}</span>
        <span class="countdown-hero__label">${label}</span>
      </div>
    `;
  }

  function getVoicesCounterContent() {
    if (!WorldChoirDB.isPledgesLoaded()) {
      return { text: 'LOADING VOICES', loading: true };
    }

    const stats = WorldChoirDB.getMapStats(WorldChoirConfig.CURRENT_EVENT.id);
    const count = stats?.voices ?? 0;
    const formatted = count.toLocaleString('en-US');
    const text = count === 1 ? '1 VOICE' : `${formatted} VOICES`;
    return { text, loading: false };
  }

  function renderVoicesCounter() {
    const { text, loading } = getVoicesCounterContent();
    return `<p class="home-voices-counter${loading ? ' home-voices-counter--loading' : ''}" id="home-voices-counter" aria-live="polite">${esc(text)}</p>`;
  }

  function updateVoicesCounter() {
    const el = document.getElementById('home-voices-counter');
    if (!el || !isPreEvent() || LiveEventMode.isActive()) return;

    // If still on the skeleton shell, swap to real UI as soon as data lands.
    if (!homeReady && isHomeDataReady()) {
      revealHome();
      return;
    }

    const { text, loading } = getVoicesCounterContent();
    const prev = el.textContent;
    el.textContent = text;
    el.classList.toggle('home-voices-counter--loading', loading);

    if (!loading && text !== prev && prev !== 'LOADING VOICES') {
      el.classList.remove('home-voices-counter--bump');
      void el.offsetWidth;
      el.classList.add('home-voices-counter--bump');
    }
  }

  function renderPledgeButton() {
    const pledgeState = WorldChoirPledgeState.getState();

    if (pledgeState === 'loading') {
      return '<div class="btn-hero-skeleton" aria-hidden="true"></div>';
    }

    const pledged = pledgeState === 'pledged';
    return `
      <button class="btn-hero ${pledged ? 'btn-hero--pledged' : ''}" id="pledge-btn" type="button" ${pledged ? 'disabled' : ''}>
        <span class="btn-hero__glow"></span>
        <span class="btn-hero__text">${pledged ? "You're Singing" : "I'll Sing"}</span>
      </button>
    `;
  }

  /** Full-page skeleton matching the Home layout (shown only until data is ready). */
  function renderHomeSkeleton() {
    return `
      <div class="home-skeleton" aria-busy="true" aria-live="polite">
        <span class="sr-only">Loading World Choir…</span>
        <div class="home-skel home-skel--voices"></div>
        <div class="home-skel home-skel--logo"></div>
        <div class="home-skel home-skel--headline"></div>
        <div class="home-skel-countdown" aria-hidden="true">
          <div class="home-skel home-skel--unit"></div>
          <div class="home-skel home-skel--unit"></div>
          <div class="home-skel home-skel--unit"></div>
          <div class="home-skel home-skel--unit"></div>
        </div>
        <div class="home-skel home-skel--meta"></div>
        <div class="home-skel home-skel--song"></div>
        <div class="home-skel home-skel--cta"></div>
        <div class="home-skel-actions" aria-hidden="true">
          <div class="home-skel home-skel--icon"></div>
          <div class="home-skel home-skel--icon"></div>
          <div class="home-skel home-skel--icon"></div>
        </div>
      </div>
    `;
  }

  function renderCountdownHome() {
    const t = WorldChoirConfig.getTimeRemaining();
    const pledgeState = WorldChoirPledgeState.getState();
    const pledged = pledgeState === 'pledged';
    const e = WorldChoirConfig.ACTIVE_EVENT;

    return `
      ${renderVoicesCounter()}
      <img class="home-logo" src="${WorldChoirConfig.LOGO.url}" alt="${WorldChoirConfig.LOGO.alt}" width="1024" height="1024" decoding="async">
      <h1 class="home-headline">The world sings together in</h1>

      <div class="countdown-hero">
        <div class="countdown-hero__grid">
          ${countdownUnit(t.days, 'Days', 'countdown-days')}
          ${countdownUnit(t.hours, 'Hours', 'countdown-hours')}
          ${countdownUnit(t.minutes, 'Minutes', 'countdown-minutes')}
          ${countdownUnit(t.seconds, 'Seconds', 'countdown-seconds')}
        </div>
      </div>

      <p class="home-meta">${esc(WorldChoirConfig.formatEventDate())} · 16:00 UTC</p>
      <p class="home-song">${esc(e.songName)} — ${esc(e.artistName)}</p>

      ${renderPledgeButton()}

      <div class="secondary-actions">
        <button class="btn-icon" type="button" id="daily-peace-btn" aria-label="Daily Acts of Peace">${actionIcon('peace')}</button>
        <button class="btn-icon" type="button" id="calendar-btn" aria-label="Add to Calendar">${actionIcon('calendar')}</button>
        <button class="btn-icon" type="button" id="share-btn" aria-label="Share Countdown">${actionIcon('share')}</button>
      </div>
    `;
  }

  function renderPostEventHome() {
    const pledgeState = WorldChoirPledgeState.getState();
    const pledged = pledgeState === 'pledged';
    const hasPromise = WorldChoirDB.hasSubmittedPromise();
    const e = WorldChoirConfig.ACTIVE_EVENT;

    return `
      <div class="home-post-event">
        <p class="home-brand">${esc(e.title)}</p>
        <h1 class="home-post-event__title">Thank you for singing with the world.</h1>
        <p class="home-post-event__copy">${esc(e.songName)} — ${esc(e.artistName)}</p>
        ${pledged && hasPromise ? '<p class="home-meta home-meta--pledged">Your promise lives on in your profile.</p>' : ''}
        ${pledged && !hasPromise ? '<p class="home-copy">Share your promise when you\'re ready.</p>' : ''}
      </div>
    `;
  }

  function revealHome() {
    if (homeReady) return;
    if (!isHomeDataReady()) return;
    homeReady = true;
    render();
  }

  function render() {
    const root = document.getElementById('home-content');
    if (!root) return;
    if (LiveEventMode.isActive()) return;
    if (typeof GlobalLiveEvent !== 'undefined' && GlobalLiveEvent.isActive()) return;

    if (isPostEvent() && LiveEventMode.hasCompletedFlow()) {
      homeReady = true;
      root.innerHTML = renderPostEventHome();
      return;
    }

    if (isPreEvent()) {
      if (!homeReady && !isHomeDataReady()) {
        root.innerHTML = renderHomeSkeleton();
        return;
      }
      homeReady = true;
      root.innerHTML = renderCountdownHome();
      bindActions();
      return;
    }

    if (LiveEventMode.isDuringLiveSong()) {
      homeReady = true;
      root.innerHTML = `
        <p class="home-brand home-brand--live"><span class="live-dot"></span> LIVE</p>
        <h1 class="home-headline">The world is singing now.</h1>
        <p class="home-song">${esc(WorldChoirConfig.ACTIVE_EVENT.songName)} — ${esc(WorldChoirConfig.ACTIVE_EVENT.artistName)}</p>
      `;
      return;
    }

    homeReady = true;
    root.innerHTML = renderPostEventHome();
  }

  function updateCountdown() {
    if (typeof GlobalLiveEvent !== 'undefined' && GlobalLiveEvent.isActive()) return;

    if (!isPreEvent()) {
      if (isPostEvent() && !LiveEventMode.isActive()) {
        LiveEventMode.launch();
      }
      if (!LiveEventMode.isActive()) render();
      return;
    }

    if (!homeReady) {
      revealHome();
      return;
    }

    const t = WorldChoirConfig.getTimeRemaining();
    const daysEl = document.getElementById('countdown-days');
    if (!daysEl) {
      render();
      return;
    }

    daysEl.textContent = String(t.days).padStart(2, '0');
    document.getElementById('countdown-hours').textContent = String(t.hours).padStart(2, '0');
    document.getElementById('countdown-minutes').textContent = String(t.minutes).padStart(2, '0');
    document.getElementById('countdown-seconds').textContent = String(t.seconds).padStart(2, '0');
  }

  function bindActions() {
    document.getElementById('pledge-btn')?.addEventListener('click', () => WorldChoirParticipation.open());
    document.getElementById('calendar-btn')?.addEventListener('click', addToCalendar);
    document.getElementById('daily-peace-btn')?.addEventListener('click', () => {
      if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.open({ tab: 'today' });
      else window.location.href = 'daily-acts.html';
    });
    document.getElementById('share-btn')?.addEventListener('click', shareCountdown);
  }

  /* ─── Calendar & Share ─── */
  async function addToCalendar() {
    const result = await WorldChoirCalendar.addToCalendar();
    if (result.iosWebGuidance) return;
    if (!result.ok) {
      alert(result.error || 'We could not open your calendar app. Please try again later.');
    }
  }

  function shareCountdown() {
    const url = window.location.origin + window.location.pathname.replace(/index\.html$/, '') || 'https://world-choir-app.vercel.app';
    const text = `I'm joining World Choir 2027. On September 21, 2027 at 16:00 UTC, the world sings together. Add your voice: ${url}`;
    if (navigator.share) {
      navigator.share({ title: 'World Choir 2027', text });
    } else {
      navigator.clipboard.writeText(text);
      alert('Link copied to clipboard.');
    }
  }

  function maybeLaunchHomeExtras() {
    if (isPostEvent()) {
      LiveEventMode.launch();
    }
  }

  function init() {
    homeReady = false;
    // Warm navigations (data already in memory) skip the skeleton entirely.
    if (isHomeDataReady()) homeReady = true;
    startHome();
    if (homeReady) {
      maybeLaunchHomeExtras();
      return;
    }
    // Keep skeleton extremely brief — reveal as soon as pledge resolves, else ≤200ms.
    const fallback = setTimeout(() => {
      if (!homeReady) {
        homeReady = true;
        render();
      }
    }, 200);
    WorldChoirPledgeState.init()
      .then(async () => {
        clearTimeout(fallback);
        revealHome();
        maybeLaunchHomeExtras();
      })
      .catch(async (err) => {
        clearTimeout(fallback);
        console.error('Failed to connect to World Choir database:', err);
        homeReady = true;
        render();
        maybeLaunchHomeExtras();
      });
  }

  function startHome() {
    initBackground();
    WorldChoirNav.startWatcher('home');

    WorldChoirParticipation.init({
      onSuccess: async (pledge) => {
        if (pledge?.latitude && pledge?.longitude) {
          WorldChoirParticipation.triggerVoiceJoinedAnimation(pledge);
          window.location.href = 'map.html';
        } else {
          render();
        }
      },
    });

    WorldChoirReminders.init();
    WorldChoirPledgeState.subscribe(() => {
      if (isPreEvent() && !LiveEventMode.isActive()) {
        if (!homeReady) revealHome();
        else render();
      }
    });

    window.addEventListener('wc-pledges-synced', updateVoicesCounter);
    window.addEventListener('wc-map-data-state', updateVoicesCounter);
    window.addEventListener('wc-pledge-added', updateVoicesCounter);
    window.addEventListener('wc-voices-live-update', updateVoicesCounter);

    WorldChoirDB.startLiveSync({ intervalMs: 2000 });

    LiveEventMode.init();
    render();

    countdownTimer = setInterval(updateCountdown, 1000);
  }

  return { init, render };
})();
