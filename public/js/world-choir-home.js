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
    const pledgeState = typeof WorldChoirPledgeState !== 'undefined'
      ? WorldChoirPledgeState.getState()
      : 'loading';

    // Never show "I'll Sing" until we know the user is not pledged.
    if (pledgeState === 'loading') {
      return '<div class="btn-hero-skeleton" id="home-pledge-slot" aria-hidden="true"></div>';
    }

    if (pledgeState === 'pledged') {
      return `
        <button class="btn-hero btn-hero--pledged" id="pledge-btn" type="button" disabled aria-disabled="true">
          <span class="btn-hero__text">You're Singing</span>
        </button>
      `;
    }

    return `
      <button class="btn-hero" id="pledge-btn" type="button">
        <span class="btn-hero__glow"></span>
        <span class="btn-hero__text">I'll Sing</span>
      </button>
    `;
  }

  /** Swap the Home CTA in place — countdown view otherwise skips full re-renders. */
  function updatePledgeButton() {
    if (!isPreEvent() || LiveEventMode.isActive()) return;
    const html = renderPledgeButton().trim();
    if (!html) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const next = wrap.firstElementChild;
    if (!next) return;

    const current = document.getElementById('pledge-btn')
      || document.getElementById('home-pledge-slot')
      || document.querySelector('.btn-hero-skeleton');

    if (current) {
      if (
        current.id === next.id
        && current.className === next.className
        && current.textContent.trim() === next.textContent.trim()
      ) {
        return;
      }
      current.replaceWith(next);
    } else {
      const actions = document.querySelector('.secondary-actions');
      const song = document.querySelector('.home-song');
      if (actions?.parentNode) actions.parentNode.insertBefore(next, actions);
      else if (song?.parentNode) song.insertAdjacentElement('afterend', next);
      else return;
    }

    if (next.id === 'pledge-btn' && !next.disabled) {
      next.addEventListener('click', () => WorldChoirParticipation.open());
    }
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
  let confettiRaf = 0;
  let confettiPaint = null;
  let confettiBound = false;
  const POST_EVENT_STATS_CACHE_KEY = 'wc_post_event_stats_v1';

  function readCachedPostEventStats() {
    try {
      const raw = sessionStorage.getItem(POST_EVENT_STATS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed.data || parsed;
    } catch {
      return null;
    }
  }

  function writeCachedPostEventStats(data) {
    try {
      sessionStorage.setItem(POST_EVENT_STATS_CACHE_KEY, JSON.stringify({
        at: Date.now(),
        data,
      }));
    } catch {
      /* ignore quota */
    }
  }

  function getPostEventStatsFallback() {
    const cached = readCachedPostEventStats();
    const map = typeof WorldChoirDB !== 'undefined'
      ? WorldChoirDB.getMapStats(WorldChoirConfig.CURRENT_EVENT.id)
      : null;
    return {
      voices: cached?.voices ?? map?.voices ?? 0,
      cities: cached?.cities ?? map?.cities ?? 0,
      songs: 1,
      dailyActsCompleted: cached?.dailyActsCompleted ?? null,
    };
  }

  function fetchPostEventStats() {
    if (postEventStatsPromise) return postEventStatsPromise;
    const cached = readCachedPostEventStats();

    postEventStatsPromise = fetch(`/api/stats?eventId=${encodeURIComponent(WorldChoirConfig.CURRENT_EVENT.id)}`, {
      credentials: 'same-origin',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        postEventStats = data || cached || {};
        if (data) writeCachedPostEventStats(postEventStats);
        return postEventStats;
      })
      .catch(() => {
        postEventStats = cached || {};
        return postEventStats;
      });

    if (cached) {
      postEventStatsPromise.then((fresh) => {
        if (fresh && (homeView === 'post-event' || homeView === 'post-event-complete')) {
          updatePostEventStatsUI(fresh);
        }
      });
      return Promise.resolve(cached);
    }
    return postEventStatsPromise;
  }

  const POST_EVENT_CONFETTI_MS = 48 * 60 * 60 * 1000;

  function isPostEventConfettiActive(nowMs = Date.now()) {
    const eventEndMs = WorldChoirConfig.getEventEnd().getTime();
    return nowMs >= eventEndMs && nowMs < eventEndMs + POST_EVENT_CONFETTI_MS;
  }

  function initPostEventConfetti(container) {
    if (!container || !isPostEventConfettiActive()) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) return;

    cancelAnimationFrame(confettiRaf);

    const eventEndMs = WorldChoirConfig.getEventEnd().getTime();
    const mulberry = (seed) => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    const colors = [
      'rgba(255, 255, 255, 0.72)',
      'rgba(232, 244, 255, 0.62)',
      'rgba(78, 197, 232, 0.55)',
      'rgba(138, 180, 255, 0.5)',
      'rgba(201, 169, 98, 0.58)',
    ];
    const count = 28;
    const rand = mulberry(Math.floor(eventEndMs / 1000) ^ 20260904);
    const specs = [];
    let html = '';
    for (let i = 0; i < count; i++) {
      const left = rand() * 100;
      const duration = 7.5 + rand() * 5;
      const width = 1.5 + rand() * 1.2;
      const height = 11 + rand() * 8;
      const color = colors[i % colors.length];
      const rotate = rand() * 360;
      const phase = rand() * duration;
      specs.push({ duration, phase, rotate });
      html += `<span class="home-after-hero__confetti__piece" style="left:${left}%;width:${width}px;height:${height}px;background:${color}"></span>`;
    }
    container.innerHTML = html;
    const els = container.children;

    const paint = () => {
      if (!container.isConnected || !isPostEventConfettiActive()) {
        container.innerHTML = '';
        confettiPaint = null;
        return;
      }
      if (document.hidden) return;
      const fall = Math.max(container.offsetHeight, 160);
      const elapsedSec = Math.max(0, (Date.now() - eventEndMs) / 1000);
      for (let i = 0; i < specs.length; i++) {
        const s = specs[i];
        const u = ((elapsedSec + s.phase) % s.duration) / s.duration;
        const y = u * fall - 18;
        const rot = s.rotate + u * 120;
        const opacity = u < 0.08 ? 0.12 + (u / 0.08) * 0.48
          : u > 0.88 ? 0.6 - ((u - 0.88) / 0.12) * 0.48
          : 0.6;
        els[i].style.transform = `translate3d(0, ${y}px, 0) rotate(${rot}deg)`;
        els[i].style.opacity = String(opacity);
      }
      confettiRaf = requestAnimationFrame(paint);
    };

    const resume = () => {
      if (document.hidden || confettiPaint !== paint) return;
      cancelAnimationFrame(confettiRaf);
      confettiRaf = requestAnimationFrame(paint);
    };

    confettiPaint = paint;
    if (!confettiBound) {
      confettiBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && confettiPaint) {
          cancelAnimationFrame(confettiRaf);
          confettiRaf = requestAnimationFrame(confettiPaint);
        }
      });
      window.addEventListener('pageshow', () => {
        if (confettiPaint) {
          cancelAnimationFrame(confettiRaf);
          confettiRaf = requestAnimationFrame(confettiPaint);
        }
      });
    }

    resume();
  }

  const POST_EVENT_IMAGES = {
    hero: 'images/after-event.png?v=20260903p',
    song: 'images/imagine-after.png',
    memory: 'images/memory-after-card.png',
  };

  function getSongQuote() {
    const lines = WorldChoirPracticeConfig?.PRACTICE_LYRICS || [];
    const dreamer = lines.find((l) => l.text.includes("I'm a dreamer"));
    const onlyOne = lines.find((l) => l.text.includes('not the only one'));
    if (dreamer && onlyOne) {
      return `"${dreamer.text}, ${onlyOne.text.replace(/^But /, 'but ')}."`;
    }
    return '"You may say I\'m a dreamer, but I\'m not the only one."';
  }

  function formatStat(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function renderStatNumber(id, value) {
    if (value == null) {
      return `<span class="wc-skel home-after-stat-skel" id="${id}"></span>`;
    }
    return `<span class="home-after-voices-stat__num" id="${id}">${formatStat(value)}</span>`;
  }

  function renderPostEventSkeleton() {
    return `
      <div class="home-after home-after--skeleton" aria-busy="true">
        <span class="sr-only">Loading World Choir…</span>
        <header class="home-after-hero">
          <div class="home-after-hero__stage">
            <div class="home-skel home-skel--planet"></div>
            <div class="home-after-hero__content">
              <div class="home-skel home-skel--after-logo"></div>
              <div class="home-skel home-skel--after-title"></div>
              <div class="home-skel home-skel--after-msg"></div>
            </div>
          </div>
        </header>
        <div class="home-after-body">
          <div class="home-skel home-skel--after-stats"></div>
          <div class="wc-skel-card">
            <div class="wc-skel wc-skel--line wc-skel--line-short"></div>
            <div class="wc-skel wc-skel--line wc-skel--line-mid"></div>
          </div>
          <div class="wc-skel-card">
            <div class="wc-skel wc-skel--line wc-skel--line-short"></div>
            <div class="wc-skel wc-skel--line"></div>
          </div>
          <div class="home-skel home-skel--after-memory"></div>
        </div>
      </div>
    `;
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

  const POST_EVENT_HERO_MESSAGE = 'You were part of a moment that will go down in history. Together, we sang for peace, unity and a better world.';

  function getPostEventHeroCopy() {
    const thankYou = typeof WorldChoirThankYou !== 'undefined'
      ? WorldChoirThankYou.getThankYou()
      : 'Thank You';
    return { thankYou, message: POST_EVENT_HERO_MESSAGE };
  }

  function updatePostEventHeroCopy() {
    if (homeView !== 'post-event' && homeView !== 'post-event-complete') return;
    const title = document.getElementById('home-after-thank-you');
    if (!title || typeof WorldChoirThankYou === 'undefined') return;
    title.textContent = WorldChoirThankYou.getThankYou();
  }

  function renderPostEventHome(stats = {}) {
    const merged = { ...getPostEventStatsFallback(), ...stats };
    const e = WorldChoirConfig.ACTIVE_EVENT;
    const song = WorldChoirPracticeConfig?.PRACTICE_SONG || { title: e.songName, artist: e.artistName };
    const showConfetti = isPostEventConfettiActive();
    const heroCopy = getPostEventHeroCopy();
    const songQuote = getSongQuote();
    const SHIMMER_QUOTE = '"You may say I\'m a dreamer, but I\'m not the only one."';
    const shouldShimmerSongQuote = songQuote === SHIMMER_QUOTE;

    return `
      <div class="home-after">
        <header class="home-after-hero">
          <div class="home-after-hero__stage">
            <img class="home-after-hero__planet" src="${POST_EVENT_IMAGES.hero}" alt="" decoding="async" fetchpriority="high" width="800" height="400">
            ${showConfetti ? '<div class="home-after-hero__confetti" id="home-after-confetti" aria-hidden="true"></div>' : ''}
            <div class="home-after-hero__content">
              <img class="home-after-hero__logo" src="images/world-choir-logo.png?v=20270706" alt="World Choir" width="1024" height="1024" decoding="async">
              <h1 class="home-after-hero__title" id="home-after-thank-you">${esc(heroCopy.thankYou)}</h1>
              <p class="home-after-hero__message" id="home-after-thank-you-message">${esc(heroCopy.message)}</p>
            </div>
            <section class="home-after-card home-after-card--stats home-after-stats-float" aria-label="World Choir event statistics" style="position:absolute;left:20px;right:20px;top:85%;z-index:6;margin:0">
              <div class="home-after-stats-row">
                <a class="home-after-voices-stat" href="map.html" id="home-stat-voices-link">
                  <div class="home-after-voices-stat__num-wrap">
                    ${renderStatNumber('home-stat-voices', merged.voices)}
                  </div>
                  <span class="home-after-stat__label">People sang</span>
                </a>
                <div class="home-after-stats-row__divider" aria-hidden="true"></div>
                <a class="home-after-voices-stat" href="daily-acts.html" id="home-stat-acts-link">
                  <div class="home-after-voices-stat__num-wrap">
                    ${renderStatNumber('home-stat-acts', merged.dailyActsCompleted)}
                  </div>
                  <span class="home-after-stat__label">Daily Acts Completed</span>
                </a>
              </div>
            </section>
          </div>
        </header>

        <div class="home-after-body">
          <a class="home-after-card home-after-card--song" href="song-we-sang.html" aria-label="The song we sang — open the letter">
            <div class="home-after-song">
              <img class="home-after-song__art" src="${POST_EVENT_IMAGES.song}" alt="" decoding="async" width="120" height="120">
              <div class="home-after-song__meta">
                <p class="home-after-song__byline">
                  <span class="home-after-song__title">${esc(song.title)}</span>
                  <span class="home-after-song__dot" aria-hidden="true">·</span>
                  <span class="home-after-song__artist">${esc(song.artist)}</span>
                </p>
                <div class="home-after-song__quote-wrap">
                  <p class="home-after-song__quote${shouldShimmerSongQuote ? ' sws-quote-shimmer' : ''}">${esc(songQuote)}</p>
                  <span class="home-after-song__tap-indicator" aria-hidden="true">TAP IT</span>
                </div>
              </div>
            </div>
          </a>

          <section class="home-after-memory" aria-label="The world's memory">
            <div
              class="home-after-memory__media"
              aria-hidden="true"
              style="background-image: url('${POST_EVENT_IMAGES.memory}')"
            ></div>
            <div class="home-after-memory__overlay" aria-hidden="true"></div>
            <div class="home-after-memory__content">
              <button type="button" class="home-after-memory__btn" id="home-open-memory">Explore the Memory ›</button>
              <p class="home-after-memory__tagline">Relive the moment. Remember forever.</p>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function updatePostEventStatsUI(stats) {
    const voices = document.getElementById('home-stat-voices');
    const acts = document.getElementById('home-stat-acts');
    if (voices && stats.voices != null) {
      voices.classList.remove('wc-skel', 'home-after-stat-skel');
      voices.classList.add('home-after-voices-stat__num');
      voices.textContent = formatStat(stats.voices);
    }
    if (acts && stats.dailyActsCompleted != null) {
      acts.classList.remove('wc-skel', 'home-after-stat-skel');
      acts.classList.add('home-after-voices-stat__num');
      acts.textContent = formatStat(stats.dailyActsCompleted);
    }
  }

  function bindPostEventActions() {
    const songCard = document.querySelector('a.home-after-card--song');
    songCard?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'song-we-sang.html';
    });

    document.getElementById('home-open-memory')?.addEventListener('click', () => {
      window.location.href = 'memory.html';
    });

    ['map.html', 'daily-acts.html', 'song-we-sang.html'].forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    });
  }

  const POST_EVENT_STATS_TOP_PX = 370;
  const POST_EVENT_STATS_REF_WIDTH = 430;

  function layoutPostEventStatsFloat() {
    const floatEl = document.querySelector('.home-after-stats-float');
    const stage = document.querySelector('.home-after-hero__stage');
    const hero = document.querySelector('.home-after-hero');
    const body = document.querySelector('.home-after-body');
    if (!floatEl || !body) return;

    const heroH = (stage || hero)?.offsetHeight || 0;
    const refHeroH = POST_EVENT_STATS_REF_WIDTH * (1030 / 1015);
    const topPx = heroH > 0
      ? Math.round(heroH * (POST_EVENT_STATS_TOP_PX / refHeroH))
      : POST_EVENT_STATS_TOP_PX;

    floatEl.style.setProperty('position', 'absolute', 'important');
    floatEl.style.setProperty('left', '20px', 'important');
    floatEl.style.setProperty('right', '20px', 'important');
    floatEl.style.setProperty('top', `${topPx}px`, 'important');
    floatEl.style.setProperty('z-index', '6', 'important');
    floatEl.style.setProperty('margin', '0', 'important');

    floatEl.style.setProperty('height', '60px', 'important');

    const cardH = floatEl.offsetHeight || 60;
    const overflow = Math.max(0, topPx + cardH - heroH);
    body.style.paddingTop = `${overflow + 14}px`;
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
    layoutPostEventStatsFloat();
    requestAnimationFrame(layoutPostEventStatsFloat);

    const confettiEl = document.getElementById('home-after-confetti');
    const planetImg = document.querySelector('.home-after-hero__planet');
    const startConfetti = () => initPostEventConfetti(confettiEl);
    if (confettiEl) {
      if (planetImg?.complete) startConfetti();
      else planetImg?.addEventListener('load', startConfetti, { once: true });
    }
    planetImg?.addEventListener('load', layoutPostEventStatsFloat);
    window.addEventListener('resize', layoutPostEventStatsFloat);
    window.visualViewport?.addEventListener('resize', layoutPostEventStatsFloat);

    fetchPostEventStats().then((stats) => {
      if (homeView === 'post-event' || homeView === 'post-event-complete') {
        updatePostEventStatsUI(stats);
        layoutPostEventStatsFloat();
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

  function paintPostEvent(viewId) {
    fetchPostEventStats();
    const root = document.getElementById('home-content');
    if (!root) return;
    closeHomeGuide();
    document.getElementById('home-guide-btn')?.setAttribute('hidden', '');
    if (homeView === viewId) return;

    if (!readCachedPostEventStats() && homeView !== 'skeleton') {
      document.getElementById('home-page')?.classList.remove('home-page--centered');
      document.getElementById('home-page')?.classList.add('home-page--post-event');
      document.getElementById('earth-canvas')?.setAttribute('hidden', '');
      document.getElementById('ambient-bg')?.setAttribute('hidden', '');
      root.innerHTML = renderPostEventSkeleton();
      homeView = 'skeleton';
      requestAnimationFrame(() => {
        if (homeView !== 'skeleton') return;
        homeReady = true;
        mountPostEventHome();
        homeView = viewId;
      });
      return;
    }

    homeReady = true;
    mountPostEventHome();
    homeView = viewId;
  }

  function clearStaleLiveUi() {
    document.documentElement.classList.remove('wc-live-gate');
    document.body.classList.remove('wc-global-live-active');
    document.body.style.overflow = '';
    document.getElementById('wc-global-live')?.classList.remove('is-active', 'wc-global-live--boot');
    document.getElementById('wc-global-live')?.setAttribute('aria-hidden', 'true');
    const liveMode = document.getElementById('live-event-mode');
    if (liveMode) {
      liveMode.classList.remove('active');
      liveMode.setAttribute('aria-hidden', 'true');
    }
    document.getElementById('home-page')?.removeAttribute('hidden');
    document.getElementById('nav-root')?.removeAttribute('hidden');
  }

  function render() {
    const root = document.getElementById('home-content');
    if (!root) return;
    if (isPostEvent()) {
      clearStaleLiveUi();
    }
    // After the event, never keep the live black gate. Before/during live, gate may hide Home.
    if (document.documentElement.classList.contains('wc-live-gate')) {
      if (isPostEvent()) clearStaleLiveUi();
      else return;
    }
    if (typeof GlobalLiveEvent !== 'undefined' && GlobalLiveEvent.isActive()) return;

    if (isPostEvent() && LiveEventMode.hasCompletedFlow()) {
      paintPostEvent('post-event-complete');
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
        syncHomeGuideVisibility();
      } else {
        // Countdown stays mounted for speed — still refresh pledge CTA when state resolves.
        updatePledgeButton();
        syncHomeGuideVisibility();
      }
      return;
    }

    if (LiveEventMode.isDuringLiveSong()) {
      homeReady = true;
      closeHomeGuide();
      document.getElementById('home-guide-btn')?.setAttribute('hidden', '');
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

    paintPostEvent('post-event');
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

  let homeGuideFocusBefore = null;
  let homeGuideCloseTimer = null;
  let homeGuideOpen = false;

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  }

  function closeHomeGuide() {
    const overlay = document.getElementById('home-guide-overlay');
    const btn = document.getElementById('home-guide-btn');
    if (!overlay || (overlay.hidden && !overlay.classList.contains('is-open'))) {
      document.body.classList.remove('home-guide-open');
      homeGuideOpen = false;
      return;
    }

    if (homeGuideCloseTimer) {
      clearTimeout(homeGuideCloseTimer);
      homeGuideCloseTimer = null;
    }

    homeGuideOpen = false;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('home-guide-open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    syncHomeGuideVisibility();

    const finish = () => {
      homeGuideCloseTimer = null;
      overlay.hidden = true;
      const restore = document.getElementById('home-guide-btn');
      if (restore && !restore.hidden && typeof restore.focus === 'function') {
        try { restore.focus(); } catch { /* ignore */ }
      } else if (homeGuideFocusBefore && typeof homeGuideFocusBefore.focus === 'function') {
        try { homeGuideFocusBefore.focus(); } catch { /* ignore */ }
      }
      homeGuideFocusBefore = null;
    };

    if (prefersReducedMotion()) finish();
    else homeGuideCloseTimer = setTimeout(finish, 260);
  }

  function openHomeGuide() {
    const overlay = document.getElementById('home-guide-overlay');
    const btn = document.getElementById('home-guide-btn');
    if (!overlay) return;

    if (homeGuideCloseTimer) {
      clearTimeout(homeGuideCloseTimer);
      homeGuideCloseTimer = null;
    }

    homeGuideFocusBefore = document.activeElement;
    homeGuideOpen = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('home-guide-open');
    if (btn) {
      btn.hidden = true;
      btn.setAttribute('aria-expanded', 'true');
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
        document.getElementById('home-guide-close')?.focus?.();
      });
    });
  }

  function toggleHomeGuide() {
    const overlay = document.getElementById('home-guide-overlay');
    if (!overlay) return;
    if (overlay.hidden || !overlay.classList.contains('is-open')) openHomeGuide();
    else closeHomeGuide();
  }

  function syncHomeGuideVisibility() {
    const btn = document.getElementById('home-guide-btn');
    if (!btn) return;
    const allowed = isPreEvent() && !LiveEventMode.isActive() && homeView === 'countdown';
    if (!allowed) {
      btn.hidden = true;
      if (homeGuideOpen) closeHomeGuide();
      return;
    }
    btn.hidden = homeGuideOpen;
  }

  function bindActions() {
    document.getElementById('pledge-btn')?.addEventListener('click', () => WorldChoirParticipation.open());
    document.getElementById('calendar-btn')?.addEventListener('click', addToCalendar);
    document.getElementById('daily-peace-btn')?.addEventListener('click', () => {
      if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.open({ tab: 'today' });
      else window.location.href = 'daily-acts.html';
    });
    document.getElementById('share-btn')?.addEventListener('click', shareCountdown);
    syncHomeGuideVisibility();
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
    if (isPostEvent()) {
      clearStaleLiveUi();
      fetchPostEventStats();
    }

    // If HTML already painted a first-paint skeleton, treat that as the skeleton view.
    const root = document.getElementById('home-content');
    if (root?.querySelector('.home-skeleton, .home-after--skeleton')) {
      homeView = 'skeleton';
    }

    // Warm navigations can skip the full-page skeleton — but only when the
    // cached data matches the current home mode. Post-event stats cache must
    // not mark pre-event Home as ready (that left the pledge CTA stuck).
    const warmFromPledge = isHomeDataReady();
    const warmFromPostEventCache = isPostEvent() && !!readCachedPostEventStats();
    if (warmFromPledge || warmFromPostEventCache) homeReady = true;

    startHome();

    // Always resolve pledge state so the CTA never stays a blank skeleton.
    const fallback = setTimeout(() => {
      if (!homeReady) {
        homeReady = true;
        render();
      }
    }, 200);

    WorldChoirPledgeState.init()
      .then(() => {
        clearTimeout(fallback);
        WorldChoirPledgeState.refresh();
        if (!homeReady) revealHome();
        else render();
        maybeLaunchHomeExtras();
      })
      .catch(async (err) => {
        clearTimeout(fallback);
        console.error('Failed to connect to World Choir database:', err);
        try {
          await WorldChoirPledgeState.resolveFromMyPledge?.();
        } catch {
          /* keep going */
        }
        homeReady = true;
        render();
        maybeLaunchHomeExtras();
      });

    // If pledge state is still loading after warm paint, force a my-pledge refresh.
    setTimeout(() => {
      if (typeof WorldChoirPledgeState === 'undefined') return;
      if (WorldChoirPledgeState.getState() !== 'loading') return;
      void WorldChoirPledgeState.resolveFromMyPledge?.().then(() => {
        if (isPreEvent() && !LiveEventMode.isActive()) render();
      });
    }, 1200);
  }

  function startHome() {
    initBackground();
    WorldChoirNav.startWatcher('home');

    document.getElementById('home-guide-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleHomeGuide();
    });
    document.getElementById('home-guide-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeHomeGuide();
    });
    document.getElementById('home-guide-gotit')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeHomeGuide();
    });
    document.getElementById('home-guide-backdrop')?.addEventListener('click', () => {
      closeHomeGuide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHomeGuide();
    });

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
        else if (homeView === 'countdown') updatePledgeButton();
        else render();
      }
    });

    window.addEventListener('wc-pledges-synced', () => {
      updateVoicesCounter();
      if (homeView === 'post-event' || homeView === 'post-event-complete') {
        const map = WorldChoirDB.getMapStats(WorldChoirConfig.CURRENT_EVENT.id);
        if (map?.voices != null) updatePostEventStatsUI({ voices: map.voices });
      }
    });
    window.addEventListener('wc-pledges-synced', updatePostEventHeroCopy);
    window.addEventListener('wc-pledge-updated', updatePostEventHeroCopy);
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
