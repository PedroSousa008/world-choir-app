/**
 * World Choir — Home Page components
 */
const WorldChoirHome = (() => {
  let selectedReason = null;
  let promiseShownForSession = false;

  function getStateOptions() {
    return {
      userParticipated: WorldChoirDB.hasPledged(),
      userSubmittedPromise: WorldChoirDB.hasSubmittedPromise(),
    };
  }

  function getState() {
    return WorldChoirConfig.getEventState(new Date(), getStateOptions());
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  /* ─── Earth Breathes Background ─── */
  function initEarthBackground() {
    const canvas = document.getElementById('earth-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stars = [];
    const cityLights = [];

    function resize() {
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      initStars();
    }

    function initStars() {
      stars.length = 0;
      const count = Math.min(80, Math.floor(window.innerWidth / 12));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          r: Math.random() * 1.2 + 0.3,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.7,
        });
      }
    }

    function refreshCityLights() {
      cityLights.length = 0;
      const pledges = WorldChoirDB.getPledgesForEvent();
      pledges.forEach((p, i) => {
        if (p.latitude && p.longitude) {
          cityLights.push({ lat: p.latitude, lng: p.longitude, phase: i * 0.7 });
        }
      });
      // Decorative seed lights when no pledges yet (visual only, not stats)
      if (cityLights.length < 8) {
        const seeds = [
          { lat: 40.71, lng: -74.01 }, { lat: 51.51, lng: -0.13 },
          { lat: 35.68, lng: 139.65 }, { lat: 48.86, lng: 2.35 },
          { lat: 41.15, lng: -8.61 }, { lat: -33.87, lng: 151.21 },
        ];
        seeds.forEach((s, i) => cityLights.push({ ...s, phase: i * 1.1, decorative: true }));
      }
    }

    function latLngToXY(lat, lng, cx, cy, r) {
      const x = cx + (lng / 180) * r * 0.9;
      const y = cy - (lat / 90) * r * 0.45;
      return { x, y };
    }

    let breath = 0;

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const state = getState();
      const intensity = state === WorldChoirConfig.EventState.LIVE ? 1.2
        : state === WorldChoirConfig.EventState.FINAL_HOUR ? 1.0 : 0.7;

      breath += 0.012 * intensity;
      const pulse = 0.5 + 0.5 * Math.sin(breath);

      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.42;
      const globeR = Math.min(w, h) * 0.28;

      // Aurora
      const aurora = ctx.createRadialGradient(cx, cy - globeR * 0.3, 0, cx, cy, globeR * 2.2);
      aurora.addColorStop(0, `rgba(61, 124, 255, ${0.06 + pulse * 0.04})`);
      aurora.addColorStop(0.5, `rgba(107, 92, 231, ${0.03 + pulse * 0.02})`);
      aurora.addColorStop(1, 'rgba(2, 2, 4, 0)');
      ctx.fillStyle = aurora;
      ctx.fillRect(0, 0, w, h);

      // Globe silhouette
      const globeGrad = ctx.createRadialGradient(cx - globeR * 0.2, cy - globeR * 0.2, globeR * 0.1, cx, cy, globeR);
      globeGrad.addColorStop(0, `rgba(30, 50, 90, ${0.35 + pulse * 0.1})`);
      globeGrad.addColorStop(0.6, `rgba(12, 18, 35, ${0.25 + pulse * 0.08})`);
      globeGrad.addColorStop(1, 'rgba(2, 2, 4, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, globeR * (1 + pulse * 0.02), 0, Math.PI * 2);
      ctx.fillStyle = globeGrad;
      ctx.fill();

      ctx.strokeStyle = `rgba(61, 124, 255, ${0.12 + pulse * 0.08})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, globeR, 0, Math.PI * 2);
      ctx.stroke();

      // Stars
      const t = Date.now() / 1000;
      stars.forEach((s) => {
        const a = 0.2 + 0.5 * Math.abs(Math.sin(t * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${a})`;
        ctx.fill();
      });

      // City lights on globe
      cityLights.forEach((light) => {
        const { x, y } = latLngToXY(light.lat, light.lng, cx, cy, globeR);
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > globeR * 0.95) return;
        const flicker = 0.5 + 0.5 * Math.sin(t * 2 + light.phase);
        const alpha = light.decorative ? 0.25 + flicker * 0.15 : 0.4 + flicker * 0.35;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 6);
        grd.addColorStop(0, `rgba(78, 197, 232, ${alpha})`);
        grd.addColorStop(1, 'rgba(78, 197, 232, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(draw);
    }

    resize();
    refreshCityLights();
    window.addEventListener('resize', resize);
    window.addEventListener('wc-pledge-added', refreshCityLights);
    draw();
  }

  /* ─── Countdown Hero ─── */
  function CountdownHero(t, state) {
    const isFinal = state === WorldChoirConfig.EventState.FINAL_HOUR;
    const isUpcoming = state === WorldChoirConfig.EventState.UPCOMING;

    if (isUpcoming) {
      return `
        <div class="countdown-hero">
          <div class="countdown-hero__grid">
            ${countdownUnit(t.days, 'Days')}
            ${countdownUnit(t.hours, 'Hours')}
            ${countdownUnit(t.minutes, 'Minutes')}
            ${countdownUnit(t.seconds, 'Seconds')}
          </div>
          <p class="countdown-hero__compact">${esc(WorldChoirConfig.formatCountdownLong(t))}</p>
        </div>
      `;
    }

    return `
      <div class="countdown-hero countdown-hero--final">
        <p class="countdown-hero__mega">${esc(WorldChoirConfig.formatCountdownFinalHour(t))}</p>
      </div>
    `;
  }

  function countdownUnit(value, label) {
    return `
      <div class="countdown-hero__unit">
        <span class="countdown-hero__value">${String(value).padStart(2, '0')}</span>
        <span class="countdown-hero__label">${label}</span>
      </div>
    `;
  }

  /* ─── Event Details Card ─── */
  function EventDetailsCard() {
    const e = WorldChoirConfig.ACTIVE_EVENT;
    return `
      <div class="event-card">
        <p class="event-card__title">${esc(e.title)}</p>
        <div class="event-card__row"><span>Song</span><span>${esc(e.songName)}</span></div>
        <div class="event-card__row"><span>Artist</span><span>${esc(e.artistName)}</span></div>
        <div class="event-card__row"><span>Date</span><span>${esc(WorldChoirConfig.formatEventDate())}</span></div>
        <div class="event-card__row"><span>Time</span><span>${esc(WorldChoirConfig.formatEventTime())}</span></div>
        <div class="event-card__row event-card__row--muted"><span>Your time</span><span>${esc(WorldChoirConfig.getLocalEventTime())}</span></div>
      </div>
    `;
  }

  /* ─── Movement Stats ─── */
  function MovementStats() {
    const stats = WorldChoirConfig.getMovementStats();
    if (!stats.hasData) {
      return `
        <div class="movement-stats movement-stats--empty">
          <p class="movement-stats__headline">The movement is growing</p>
          <p class="movement-stats__sub">Be among the first voices. Every pledge lights up the map.</p>
        </div>
      `;
    }
    return `
      <div class="movement-stats">
        <p class="movement-stats__headline">Live movement</p>
        <div class="movement-stats__grid">
          <div class="movement-stats__item">
            <span class="movement-stats__num">${formatNumber(stats.voices)}</span>
            <span class="movement-stats__lbl">Voices committed</span>
          </div>
          <div class="movement-stats__item">
            <span class="movement-stats__num">${stats.countries}</span>
            <span class="movement-stats__lbl">Countries</span>
          </div>
          <div class="movement-stats__item">
            <span class="movement-stats__num">${stats.cities}</span>
            <span class="movement-stats__lbl">Cities</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ─── Pledge Button ─── */
  function PledgeButton(pledged) {
    return `
      <button class="btn-hero ${pledged ? 'btn-hero--pledged' : ''}" id="pledge-btn" type="button" ${pledged ? 'disabled' : ''}>
        <span class="btn-hero__glow"></span>
        <span class="btn-hero__text">${pledged ? "You're Singing" : "I'll Sing"}</span>
      </button>
    `;
  }

  function SecondaryActions() {
    return `
      <div class="secondary-actions">
        <button class="btn-glass" type="button" id="calendar-btn">Add to Calendar</button>
        <button class="btn-glass" type="button" id="remind-btn">Remind Me</button>
        <button class="btn-glass" type="button" id="share-btn">Share Countdown</button>
      </div>
    `;
  }

  /* ─── Map Preview ─── */
  function MapPreview() {
    return `
      <a href="map.html" class="map-preview">
        <div class="map-preview__glow"></div>
        <p class="map-preview__label">The Earth Breathes</p>
        <p class="map-preview__copy">Watch the world prepare — every voice lights a city</p>
        <span class="map-preview__cta">Open Map →</span>
      </a>
    `;
  }

  /* ─── Promise Form (full-page state, never auto on open) ─── */
  function PromiseForm() {
    return `
      <section class="promise-page fade-in">
        <h2 class="home-headline">Make Your Promise to the World</h2>
        <p class="home-copy">Leave behind a promise, hope, dream, or thought inspired by the moment you just shared with millions of people.</p>
        <div class="promise-form">
          <textarea class="promise-form__input" id="promise-text" rows="4" placeholder="Write your promise..."></textarea>
          <p class="promise-form__hint">"I promise to spread more kindness." · "I choose hope over fear."</p>
          <button class="btn-hero" type="button" id="promise-submit">
            <span class="btn-hero__glow"></span>
            <span class="btn-hero__text">Submit Promise</span>
          </button>
        </div>
      </section>
    `;
  }

  /* ─── Completed Event Home ─── */
  function CompletedEventHome() {
    const promise = WorldChoirDB.getPromiseForCurrentUser();
    const pledged = WorldChoirDB.hasPledged();
    const e = WorldChoirConfig.ACTIVE_EVENT;

    return `
      <section class="completed-home fade-in">
        <h2 class="home-headline">${esc(e.title)} Lives On</h2>
        <p class="home-copy">The world sang together. Now the memory remains.</p>

        ${promise ? `
          <div class="promise-card">
            <p class="promise-card__label">Your promise</p>
            <p class="promise-card__text">"${esc(promise.promise_text)}"</p>
            <p class="promise-card__meta">${esc(promise.city)}, ${esc(promise.country)}</p>
          </div>
        ` : pledged ? '' : `
          <p class="home-copy home-copy--muted">You watched from the sidelines this time. Join us for the next World Choir.</p>
        `}

        <div class="event-card event-card--compact">
          <div class="event-card__row"><span>Event</span><span>${esc(e.title)}</span></div>
          <div class="event-card__row"><span>Song</span><span>${esc(e.songName)}</span></div>
          <div class="event-card__row"><span>Hashtag</span><span>${esc(e.hashtag)}</span></div>
        </div>

        <div class="secondary-actions secondary-actions--stack">
          <a href="map.html" class="btn-glass">Explore Map</a>
          <a href="memory.html" class="btn-glass">Memory Wall</a>
          <button class="btn-glass" type="button" id="share-btn">Share the App</button>
        </div>

        <p class="home-tagline">One song. One world. One moment.</p>
      </section>
    `;
  }

  /* ─── State renderers ─── */
  function renderUpcoming() {
    const t = WorldChoirConfig.getTimeRemaining();
    const pledged = WorldChoirDB.hasPledged();
    return `
      <p class="home-brand">WORLD CHOIR</p>
      <h1 class="home-headline">The world sings together in</h1>
      ${CountdownHero(t, WorldChoirConfig.EventState.UPCOMING)}
      ${EventDetailsCard()}
      ${PledgeButton(pledged)}
      ${SecondaryActions()}
      ${MovementStats()}
      ${MapPreview()}
      <p class="home-tagline">One song. One world. One moment.</p>
    `;
  }

  function renderFinalHour() {
    const t = WorldChoirConfig.getTimeRemaining();
    const pledged = WorldChoirDB.hasPledged();
    return `
      <p class="home-brand">WORLD CHOIR</p>
      <h1 class="home-headline">The World is Almost Ready</h1>
      ${CountdownHero(t, WorldChoirConfig.EventState.FINAL_HOUR)}
      <p class="home-copy">In less than one hour, millions of people will sing together.</p>
      ${MovementStats()}
      ${PledgeButton(pledged)}
      ${MapPreview()}
    `;
  }

  function renderLive() {
    const e = WorldChoirConfig.ACTIVE_EVENT;
    return `
      <p class="home-brand home-brand--live"><span class="live-dot"></span> LIVE</p>
      <h1 class="home-headline">The world is singing now.</h1>
      <p class="home-copy">Put your phone down. Join the choir.</p>
      <div class="live-card">
        <p class="live-card__song">${esc(e.songName)}</p>
        <p class="live-card__artist">${esc(e.artistName)}</p>
        <p class="live-card__tag">${esc(e.hashtag)}</p>
      </div>
      ${MapPreview()}
      <a href="imagine-lyric-player.html" class="btn-glass btn-glass--center">View Lyrics</a>
    `;
  }

  function render() {
    const state = getState();
    const root = document.getElementById('home-content');
    const ambient = document.getElementById('ambient-bg');

    ambient.className = 'ambient-bg';
    if (state === WorldChoirConfig.EventState.FINAL_HOUR) ambient.classList.add('breathing');
    if (state === WorldChoirConfig.EventState.LIVE) ambient.classList.add('intense');

    let html = '';
    switch (state) {
      case WorldChoirConfig.EventState.UPCOMING:
        html = renderUpcoming();
        break;
      case WorldChoirConfig.EventState.FINAL_HOUR:
        html = renderFinalHour();
        break;
      case WorldChoirConfig.EventState.LIVE:
        html = renderLive();
        break;
      case WorldChoirConfig.EventState.POST_EVENT_PROMISE:
        html = PromiseForm();
        break;
      case WorldChoirConfig.EventState.COMPLETED:
      default:
        html = CompletedEventHome();
        break;
    }

    root.innerHTML = html;
    bindActions();
  }

  function bindActions() {
    document.getElementById('pledge-btn')?.addEventListener('click', openPledgeModal);
    document.getElementById('calendar-btn')?.addEventListener('click', addToCalendar);
    document.getElementById('remind-btn')?.addEventListener('click', requestReminder);
    document.getElementById('share-btn')?.addEventListener('click', shareCountdown);
    document.getElementById('promise-submit')?.addEventListener('click', submitPromise);
  }

  /* ─── Pledge modal ─── */
  function openPledgeModal() {
    const user = WorldChoirDB.getCurrentUser();
    document.getElementById('pledge-name').value = user.display_name || '';
    document.getElementById('pledge-city').value = user.city || '';
    document.getElementById('pledge-country').value = user.country || '';
    selectedReason = null;
    document.querySelectorAll('.reason-chip').forEach((c) => c.classList.remove('selected'));
    document.getElementById('pledge-overlay').classList.add('active');
  }

  function closePledgeModal() {
    document.getElementById('pledge-overlay').classList.remove('active');
  }

  function submitPledge() {
    const name = document.getElementById('pledge-name').value.trim();
    const city = document.getElementById('pledge-city').value.trim();
    const country = document.getElementById('pledge-country').value.trim();
    if (!name || !city || !country) {
      alert('Please enter your name, city, and country.');
      return;
    }
    WorldChoirDB.createPledge({ displayName: name, city, country, reason: selectedReason });
    closePledgeModal();
    render();
  }

  function submitPromise() {
    const text = document.getElementById('promise-text')?.value.trim();
    if (!text) {
      alert('Please write your promise.');
      return;
    }
    WorldChoirDB.createPromise({ promiseText: text });
    render();
  }

  function addToCalendar() {
    const start = WorldChoirConfig.getEventStart();
    const end = WorldChoirConfig.getEventEnd();
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const e = WorldChoirConfig.ACTIVE_EVENT;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`World Choir — ${e.songName}`)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent('The world sings together. One song. One moment.')}&location=Global`;
    window.open(url, '_blank');
  }

  async function requestReminder() {
    if (!('Notification' in window)) {
      alert('Notifications are not supported on this device.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('World Choir', {
        body: "We'll remind you before the world sings together.",
      });
    }
  }

  function shareCountdown() {
    const e = WorldChoirConfig.ACTIVE_EVENT;
    const text = `The world sings together on ${WorldChoirConfig.formatEventDate()} at ${WorldChoirConfig.formatEventTime()}. Join me for World Choir. ${e.hashtag}`;
    if (navigator.share) {
      navigator.share({ title: 'World Choir', text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text + ' ' + window.location.href);
      alert('Link copied to clipboard.');
    }
  }

  async function detectLocation() {
    if (!navigator.geolocation) return;
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
      });
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
      );
      const data = await res.json();
      const city = data.address?.city || data.address?.town || data.address?.village || '';
      const country = data.address?.country || '';
      if (city) document.getElementById('pledge-city').value = city;
      if (country) document.getElementById('pledge-country').value = country;
    } catch (_) { /* manual entry */ }
  }

  function init() {
    WorldChoirDB.getOrCreateUser();
    initEarthBackground();
    document.getElementById('nav-root').appendChild(renderWorldChoirNav('home'));

    document.getElementById('pledge-submit').addEventListener('click', submitPledge);
    document.getElementById('pledge-cancel').addEventListener('click', closePledgeModal);
    document.querySelectorAll('.reason-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.reason-chip').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedReason = chip.dataset.reason;
      });
    });
    document.getElementById('pledge-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'pledge-overlay') closePledgeModal();
    });

    detectLocation();
    render();
    setInterval(render, 1000);
  }

  return { init, render, getState };
})();
