/**
 * World Choir — Simplified Home (countdown + participation only)
 */
const WorldChoirHome = (() => {
  let countdownTimer = null;

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

  /* ─── Subtle cinematic background ─── */
  function initBackground() {
    const canvas = document.getElementById('earth-canvas');
    if (!canvas) return;
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

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const t = Date.now() / 1000;
      stars.forEach((s) => {
        const a = 0.12 + 0.35 * Math.abs(Math.sin(t * 0.5 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 220, 220, ${a})`;
        ctx.fill();
      });

      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    draw();
  }

  function actionIcon(type) {
    const icons = {
      remind:
        '<svg class="btn-icon__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
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

    const { text, loading } = getVoicesCounterContent();
    el.textContent = text;
    el.classList.toggle('home-voices-counter--loading', loading);
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
        <button class="btn-icon" type="button" id="remind-btn" aria-label="Remind Me">${actionIcon('remind')}</button>
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

  function render() {
    const root = document.getElementById('home-content');
    if (LiveEventMode.isActive()) return;

    if (isPostEvent() && LiveEventMode.hasCompletedFlow()) {
      root.innerHTML = renderPostEventHome();
    } else if (isPreEvent()) {
      root.innerHTML = renderCountdownHome();
      bindActions();
    } else if (LiveEventMode.isDuringLiveSong()) {
      root.innerHTML = `
        <p class="home-brand home-brand--live"><span class="live-dot"></span> LIVE</p>
        <h1 class="home-headline">The world is singing now.</h1>
        <p class="home-song">${esc(WorldChoirConfig.ACTIVE_EVENT.songName)} — ${esc(WorldChoirConfig.ACTIVE_EVENT.artistName)}</p>
      `;
    } else {
      root.innerHTML = renderPostEventHome();
    }
  }

  function updateCountdown() {
    if (!isPreEvent()) {
      LiveEventMode.launch();
      if (!LiveEventMode.isActive()) render();
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
    document.getElementById('remind-btn')?.addEventListener('click', () => WorldChoirReminders.open());
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
    const text = `I'm joining World Choir 2027. On July 1, 2027 at 16:00 UTC, the world sings together. Add your voice: ${url}`;
    if (navigator.share) {
      navigator.share({ title: 'World Choir 2027', text });
    } else {
      navigator.clipboard.writeText(text);
      alert('Link copied to clipboard.');
    }
  }

  function init() {
    WorldChoirPledgeState.init()
      .then(startHome)
      .catch((err) => {
        console.error('Failed to connect to World Choir database:', err);
        startHome();
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
      if (isPreEvent() && !LiveEventMode.isActive()) render();
    });

    window.addEventListener('wc-pledges-synced', updateVoicesCounter);
    window.addEventListener('wc-map-data-state', updateVoicesCounter);
    window.addEventListener('wc-pledge-added', updateVoicesCounter);

    LiveEventMode.init();
    render();
    LiveEventMode.launch();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  return { init, render };
})();
