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

      <p class="home-meta">${esc(WorldChoirConfig.formatEventDate())} · ${esc(WorldChoirConfig.formatEventTime())}</p>
      <p class="home-song">${esc(e.songName)} — ${esc(e.artistName)}</p>

      ${renderPledgeButton()}

      <div class="secondary-actions">
        <button class="btn-icon" type="button" id="daily-peace-btn" aria-label="Daily Acts of Peace">${actionIcon('peace')}</button>
        <button class="btn-icon" type="button" id="calendar-btn" aria-label="Add to Calendar">${actionIcon('calendar')}</button>
        <button class="btn-icon" type="button" id="share-btn" aria-label="Share Countdown">${actionIcon('share')}</button>
      </div>
    `;
  }

  let postEventStats = null;
  let postEventStatsPromise = null;
  let confettiStarted = false;

  const POST_EVENT_CONFETTI_MS = 60 * 60 * 1000;

  function isPostEventConfettiActive(nowMs = Date.now()) {
    const eventEndMs = WorldChoirConfig.getEventEnd().getTime();
    return nowMs >= eventEndMs && nowMs < eventEndMs + POST_EVENT_CONFETTI_MS;
  }

  function initPostEventConfetti(container) {
    if (!container || confettiStarted || !isPostEventConfettiActive()) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) return;

    const fallDistance = Math.max(container.offsetHeight, 120);
    container.style.setProperty('--fall-distance', `${fallDistance}px`);
    confettiStarted = true;

    const colors = [
      'rgba(255, 255, 255, 0.42)',
      'rgba(201, 169, 98, 0.34)',
      'rgba(78, 197, 232, 0.28)',
      'rgba(138, 180, 255, 0.24)',
    ];
    const pieces = 18;
    let html = '';
    for (let i = 0; i < pieces; i++) {
      const left = Math.random() * 100;
      const delay = Math.random() * 6;
      const duration = 9 + Math.random() * 5;
      const width = 2 + Math.random() * 2;
      const height = 10 + Math.random() * 8;
      const color = colors[i % colors.length];
      const rotate = Math.random() * 360;
      html += `<span class="home-after-hero__confetti__piece" style="left:${left}%;animation-delay:${delay}s;animation-duration:${duration}s;width:${width}px;height:${height}px;background:${color};--rot:${rotate}deg"></span>`;
    }
    container.innerHTML = html;
  }

  const POST_EVENT_IMAGES = {
    hero: 'images/after-event.png?v=20260903p',
    song: 'images/imagine-after.png',
    memory: 'images/memory-after.png',
  };

  function getPostEventVoicesLabel(voices) {
    const count = voices ?? 0;
    if (!WorldChoirDB.isPledgesLoaded()) return 'LOADING VOICES';
    const formatted = formatStat(count);
    return count === 1 ? '1 VOICE' : `${formatted} VOICES`;
  }

  function getSongQuote() {
    const lines = WorldChoirPracticeConfig?.PRACTICE_LYRICS || [];
    const dreamer = lines.find((l) => l.text.includes("I'm a dreamer"));
    const onlyOne = lines.find((l) => l.text.includes('not the only one'));
    if (dreamer && onlyOne) {
      return `"${dreamer.text}, ${onlyOne.text.replace(/^But /, 'but ')}."`;
    }
    return '"You may say I\'m a dreamer, but I\'m not the only one."';
  }

  function truncatePromise(text, max = 120) {
    if (!text) return '';
    const t = String(text).trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1).trim()}…`;
  }
  function formatStat(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function fetchPostEventStats() {
    if (postEventStats) return Promise.resolve(postEventStats);
    if (postEventStatsPromise) return postEventStatsPromise;
    postEventStatsPromise = fetch(`/api/stats?eventId=${encodeURIComponent(WorldChoirConfig.CURRENT_EVENT.id)}`, {
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        postEventStats = data || {};
        return postEventStats;
      })
      .catch(() => {
        postEventStats = {};
        return postEventStats;
      });
    return postEventStatsPromise;
  }

  function getPostEventStatsFallback() {
    const map = WorldChoirDB.getMapStats(WorldChoirConfig.CURRENT_EVENT.id);
    return {
      voices: map?.voices ?? 0,
      cities: map?.cities ?? 0,
      songs: 1,
      dailyActsCompleted: null,
    };
  }

  function statIcon(type) {
    const navSvg = (key) => {
      const svg = typeof WorldChoirNav !== 'undefined' ? WorldChoirNav.getNavIconSvg(key) : '';
      return svg ? `<span class="home-after-stat__icon" aria-hidden="true">${svg}</span>` : '';
    };
    const navGlyph = (pageId) => {
      const glyph = typeof WorldChoirNav !== 'undefined' ? WorldChoirNav.getNavGlyph(pageId) : '';
      return glyph ? `<span class="home-after-stat__icon home-after-stat__icon--glyph" aria-hidden="true">${glyph}</span>` : '';
    };
    const icons = {
      voices: navSvg('profile'),
      cities: navSvg('map'),
      acts: navGlyph('donate'),
      songNote:
        '<span class="home-after-stat__icon" aria-hidden="true"><svg class="nav-icon__svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="19" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.75"/></svg></span>',
      promise: navGlyph('memory'),
    };
    return icons[type] || '';
  }

  function renderPostEventHome(stats = {}) {
    const merged = { ...getPostEventStatsFallback(), ...stats };
    const promise = WorldChoirDB.getPromiseForCurrentUser();
    const hasPromise = !!promise?.promise_text;
    const e = WorldChoirConfig.ACTIVE_EVENT;
    const song = WorldChoirPracticeConfig?.PRACTICE_SONG || { title: e.songName, artist: e.artistName };
    const voicesLabel = getPostEventVoicesLabel(merged.voices);
    const showConfetti = isPostEventConfettiActive();

    return `
      <div class="home-after">
        <header class="home-after-hero">
          <div class="home-after-hero__stage">
            <img class="home-after-hero__planet" src="${POST_EVENT_IMAGES.hero}" alt="" decoding="async" width="800" height="400">
            ${showConfetti ? '<div class="home-after-hero__confetti" id="home-after-confetti" aria-hidden="true"></div>' : ''}
            <div class="home-after-hero__content">
              <p class="home-after-hero__voices" id="home-after-voices" aria-live="polite">${esc(voicesLabel)}</p>
              <img class="home-after-hero__logo" src="images/world-choir-logo.png?v=20270706" alt="World Choir" width="1024" height="1024" decoding="async">
              <h1 class="home-after-hero__title">We did it.</h1>
              <p class="home-after-hero__subtitle">The world sang together.</p>
              <p class="home-after-hero__message">Thank you for being part of this moment of unity, hope, and connection. Together, our voices created something the world will never forget.</p>
            </div>
          </div>
        </header>

        <div class="home-after-body">
          <section class="home-after-card home-after-card--stats" aria-label="World Choir event statistics">
            <p class="home-after-card__eyebrow">The world sang</p>
            <div class="home-after-stats">
              <div class="home-after-stat">
                ${statIcon('voices')}
                <span class="home-after-stat__value" id="home-stat-voices">${formatStat(merged.voices)}</span>
                <span class="home-after-stat__label">People sang</span>
              </div>
              <div class="home-after-stat home-after-stat--divider" aria-hidden="true"></div>
              <div class="home-after-stat">
                ${statIcon('cities')}
                <span class="home-after-stat__value" id="home-stat-cities">${formatStat(merged.cities)}</span>
                <span class="home-after-stat__label">Cities</span>
              </div>
              <div class="home-after-stat home-after-stat--divider" aria-hidden="true"></div>
              <div class="home-after-stat">
                ${statIcon('acts')}
                <span class="home-after-stat__value" id="home-stat-acts">${formatStat(merged.dailyActsCompleted)}</span>
                <span class="home-after-stat__label">Daily Acts of Peace</span>
              </div>
            </div>
          </section>

          <section class="home-after-card home-after-card--song" aria-label="The song we sang">
            <p class="home-after-card__eyebrow">The song we sang</p>
            <div class="home-after-song">
              <img class="home-after-song__art" src="${POST_EVENT_IMAGES.song}" alt="" decoding="async" width="120" height="120">
              <div class="home-after-song__meta">
                <p class="home-after-song__title">${esc(song.title)}</p>
                <p class="home-after-song__artist">${esc(song.artist)}</p>
                <p class="home-after-song__quote">${esc(getSongQuote())}</p>
              </div>
              <span class="home-after-song__note" aria-hidden="true">${statIcon('songNote')}</span>
            </div>
          </section>

          <section class="home-after-card home-after-card--promise" aria-label="Your promise to the world">
            <div class="home-after-promise">
              <span class="home-after-promise__icon" aria-hidden="true">${statIcon('promise')}</span>
              <div class="home-after-promise__body">
                <p class="home-after-card__eyebrow home-after-card__eyebrow--left">Your promise to the world</p>
                ${hasPromise ? `
                  <p class="home-after-promise__text">"${esc(truncatePromise(promise.promise_text))}"</p>
                ` : `
                  <p class="home-after-promise__text home-after-promise__text--muted">Your promise will appear here once shared.</p>
                `}
              </div>
              ${hasPromise ? `<button type="button" class="home-after-promise__btn" id="home-view-promise">View my promise ›</button>` : ''}
            </div>
          </section>

          <section class="home-after-memory" aria-label="The world's memory">
            <img class="home-after-memory__bg" src="${POST_EVENT_IMAGES.memory}" alt="" decoding="async" width="800" height="360">
            <div class="home-after-memory__overlay" aria-hidden="true"></div>
            <div class="home-after-memory__content">
              <p class="home-after-card__eyebrow">The world's memory is ready</p>
              <p class="home-after-memory__tagline">Relive the moment. Remember forever.</p>
              <button type="button" class="home-after-memory__btn" id="home-open-memory">Explore the memory ›</button>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function updatePostEventStatsUI(stats) {
    const voices = document.getElementById('home-stat-voices');
    const cities = document.getElementById('home-stat-cities');
    const acts = document.getElementById('home-stat-acts');
    const voicesLabel = document.getElementById('home-after-voices');
    if (voices && stats.voices != null) voices.textContent = formatStat(stats.voices);
    if (cities && stats.cities != null) cities.textContent = formatStat(stats.cities);
    if (acts && stats.dailyActsCompleted != null) acts.textContent = formatStat(stats.dailyActsCompleted);
    if (voicesLabel && stats.voices != null) {
      voicesLabel.textContent = getPostEventVoicesLabel(stats.voices);
    }
  }

  function bindPostEventActions() {
    document.getElementById('home-open-memory')?.addEventListener('click', () => {
      window.location.href = 'memory.html';
    });

    const openPromise = () => {
      const promise = WorldChoirDB.getPromiseForCurrentUser();
      if (!promise?.promise_text) return;
      const sheet = document.getElementById('home-promise-sheet');
      const text = document.getElementById('home-promise-text');
      if (text) text.textContent = `"${promise.promise_text}"`;
      sheet?.removeAttribute('hidden');
      sheet?.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    };

    const closePromise = () => {
      const sheet = document.getElementById('home-promise-sheet');
      sheet?.setAttribute('hidden', '');
      sheet?.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };

    document.getElementById('home-view-promise')?.addEventListener('click', openPromise);
    document.getElementById('home-promise-close')?.addEventListener('click', closePromise);
    document.getElementById('home-promise-close-x')?.addEventListener('click', closePromise);
  }

  function mountPostEventHome() {
    const root = document.getElementById('home-content');
    const page = document.getElementById('home-page');
    if (!root) return;

    page?.classList.remove('home-page--centered');
    page?.classList.add('home-page--post-event');
    document.getElementById('earth-canvas')?.setAttribute('hidden', '');
    document.getElementById('ambient-bg')?.setAttribute('hidden', '');

    const fallback = getPostEventStatsFallback();
    root.innerHTML = renderPostEventHome(fallback);
    bindPostEventActions();

    const confettiEl = document.getElementById('home-after-confetti');
    const planetImg = document.querySelector('.home-after-hero__planet');
    const startConfetti = () => initPostEventConfetti(confettiEl);
    if (confettiEl) {
      if (planetImg?.complete) startConfetti();
      else planetImg?.addEventListener('load', startConfetti, { once: true });
    }

    fetchPostEventStats().then((stats) => {
      if (homeView === 'post-event' || homeView === 'post-event-complete') {
        updatePostEventStatsUI(stats);
      }
    });
  }

  function revealHome() {
    if (homeReady) return;
    if (!isHomeDataReady()) return;
    homeReady = true;
    render();
  }

  let homeView = 'unknown';

  function render() {
    const root = document.getElementById('home-content');
    if (!root) return;
    if (document.documentElement.classList.contains('wc-live-gate')) return;
    if (LiveEventMode.isActive()) return;
    if (typeof GlobalLiveEvent !== 'undefined' && GlobalLiveEvent.isActive()) return;

    if (isPostEvent() && LiveEventMode.hasCompletedFlow()) {
      homeReady = true;
      if (homeView !== 'post-event-complete') {
        mountPostEventHome();
        homeView = 'post-event-complete';
      }
      return;
    }

    if (isPreEvent()) {
      if (!homeReady && !isHomeDataReady()) {
        root.innerHTML = renderHomeSkeleton();
        homeView = 'skeleton';
        return;
      }
      homeReady = true;
      if (homeView !== 'countdown') {
        document.getElementById('home-page')?.classList.add('home-page--centered');
        document.getElementById('home-page')?.classList.remove('home-page--post-event');
        document.getElementById('earth-canvas')?.removeAttribute('hidden');
        document.getElementById('ambient-bg')?.removeAttribute('hidden');
        root.innerHTML = renderCountdownHome();
        bindActions();
        homeView = 'countdown';
      }
      return;
    }

    if (LiveEventMode.isDuringLiveSong()) {
      homeReady = true;
      if (homeView !== 'live') {
        root.innerHTML = `
        <p class="home-brand home-brand--live"><span class="live-dot"></span> LIVE</p>
        <h1 class="home-headline">The world is singing now.</h1>
        <p class="home-song">${esc(WorldChoirConfig.ACTIVE_EVENT.songName)} — ${esc(WorldChoirConfig.ACTIVE_EVENT.artistName)}</p>
      `;
        homeView = 'live';
      }
      return;
    }

    homeReady = true;
    if (homeView !== 'post-event') {
      mountPostEventHome();
      homeView = 'post-event';
    }
  }

  function updateCountdown() {
    if (typeof GlobalLiveEvent !== 'undefined' && GlobalLiveEvent.isActive()) return;

    if (!isPreEvent()) {
      if (isPostEvent() && !LiveEventMode.isActive()) {
        LiveEventMode.launch();
      }
      if (!LiveEventMode.isActive() && homeView !== 'post-event-complete' && homeView !== 'post-event') {
        render();
      }
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
    const eventDate = WorldChoirConfig.formatEventDate();
    const eventTime = WorldChoirConfig.formatEventTime();
    const text = `I'm joining World Choir 2027. On ${eventDate} at ${eventTime}, the world sings together. Add your voice: ${url}`;
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
