/**
 * World Choir — Simplified Home (countdown + participation only)
 */
const WorldChoirHome = (() => {
  let countdownTimer = null;
  let reminderChecker = null;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function isLive() {
    return WorldChoirConfig.getTimeRemaining().totalMs <= 0;
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

    let breath = 0;
    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      breath += 0.01;
      const pulse = 0.5 + 0.5 * Math.sin(breath);
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.38;
      const r = Math.min(w, h) * 0.22;

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
      glow.addColorStop(0, `rgba(61, 124, 255, ${0.05 + pulse * 0.03})`);
      glow.addColorStop(0.5, `rgba(107, 92, 231, ${0.02 + pulse * 0.02})`);
      glow.addColorStop(1, 'rgba(2, 2, 4, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(61, 124, 255, ${0.08 + pulse * 0.06})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      const t = Date.now() / 1000;
      stars.forEach((s) => {
        const a = 0.15 + 0.4 * Math.abs(Math.sin(t * 0.5 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${a})`;
        ctx.fill();
      });

      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    draw();
  }

  function countdownUnit(value, label) {
    return `
      <div class="countdown-hero__unit">
        <span class="countdown-hero__value">${String(value).padStart(2, '0')}</span>
        <span class="countdown-hero__label">${label}</span>
      </div>
    `;
  }

  function renderCountdownHome() {
    const t = WorldChoirConfig.getTimeRemaining();
    const pledged = WorldChoirDB.hasPledged();
    const e = WorldChoirConfig.ACTIVE_EVENT;

    return `
      <img class="home-logo" src="images/world-choir-logo.png" alt="World Choir App" width="220" height="220">
      <h1 class="home-headline">The world sings together in</h1>

      <div class="countdown-hero">
        <div class="countdown-hero__grid">
          ${countdownUnit(t.days, 'Days')}
          ${countdownUnit(t.hours, 'Hours')}
          ${countdownUnit(t.minutes, 'Minutes')}
          ${countdownUnit(t.seconds, 'Seconds')}
        </div>
      </div>

      <p class="home-meta">${esc(WorldChoirConfig.formatEventDate())} · 16:00 UTC</p>
      <p class="home-song">${esc(e.songName)} — ${esc(e.artistName)}</p>

      <button class="btn-hero ${pledged ? 'btn-hero--pledged' : ''}" id="pledge-btn" type="button" ${pledged ? 'disabled' : ''}>
        <span class="btn-hero__glow"></span>
        <span class="btn-hero__text">${pledged ? "You're Singing" : "I'll Sing"}</span>
      </button>

      <div class="secondary-actions">
        <button class="btn-glass" type="button" id="remind-btn">Remind Me</button>
        <button class="btn-glass" type="button" id="calendar-btn">Add to Calendar</button>
        <button class="btn-glass" type="button" id="share-btn">Share Countdown</button>
      </div>
    `;
  }

  function renderLiveMinimal() {
    const pledged = WorldChoirDB.hasPledged();
    const e = WorldChoirConfig.ACTIVE_EVENT;
    return `
      <p class="home-brand home-brand--live"><span class="live-dot"></span> LIVE</p>
      <h1 class="home-headline">The world is singing now.</h1>
      <p class="home-copy">Put your phone down. Join the choir.</p>
      <p class="home-song">${esc(e.songName)} — ${esc(e.artistName)}</p>
      ${pledged ? '<p class="home-meta home-meta--pledged">You\'re Singing</p>' : ''}
    `;
  }

  function render() {
    const root = document.getElementById('home-content');
    root.innerHTML = isLive() ? renderLiveMinimal() : renderCountdownHome();
    bindActions();
  }

  function bindActions() {
    document.getElementById('pledge-btn')?.addEventListener('click', () => WorldChoirParticipation.open());
    document.getElementById('calendar-btn')?.addEventListener('click', addToCalendar);
    document.getElementById('remind-btn')?.addEventListener('click', openRemindModal);
    document.getElementById('share-btn')?.addEventListener('click', shareCountdown);
  }

  /* ─── Reminders ─── */
  function openRemindModal() {
    document.getElementById('remind-overlay').classList.add('active');
  }

  function closeRemindModal() {
    document.getElementById('remind-overlay').classList.remove('active');
  }

  async function saveReminders() {
    if (!('Notification' in window)) {
      alert('Notifications are not supported on this device.');
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      alert('Enable notifications to receive reminders.');
      return;
    }

    const eventStart = WorldChoirConfig.getEventStart().getTime();
    const now = Date.now();
    const options = [
      { id: 'remind-1d', label: '1 day before', offsetMs: 24 * 60 * 60 * 1000 },
      { id: 'remind-1h', label: '1 hour before', offsetMs: 60 * 60 * 1000 },
      { id: 'remind-10m', label: '10 minutes before', offsetMs: 10 * 60 * 1000 },
    ];

    const scheduled = [];
    options.forEach((opt) => {
      const el = document.getElementById(opt.id);
      if (!el?.checked) return;
      const fireAt = eventStart - opt.offsetMs;
      if (fireAt > now) {
        scheduled.push({ label: opt.label, fireAt, fired: false });
      }
    });

    if (scheduled.length === 0) {
      alert('No reminders could be scheduled. The event may be too soon.');
      return;
    }

    localStorage.setItem('wc_reminders', JSON.stringify(scheduled));
    new Notification('World Choir', {
      body: `${scheduled.length} reminder${scheduled.length > 1 ? 's' : ''} set for World Choir 2027.`,
    });
    closeRemindModal();
  }

  function checkReminders() {
    const raw = localStorage.getItem('wc_reminders');
    if (!raw || Notification.permission !== 'granted') return;

    try {
      const reminders = JSON.parse(raw);
      let changed = false;
      const now = Date.now();

      reminders.forEach((r) => {
        if (!r.fired && now >= r.fireAt) {
          new Notification('World Choir 2027', {
            body: `${r.label}: The world sings together soon. Imagine — John Lennon`,
          });
          r.fired = true;
          changed = true;
        }
      });

      if (changed) localStorage.setItem('wc_reminders', JSON.stringify(reminders));
    } catch (_) { /* ignore */ }
  }

  /* ─── Calendar & Share ─── */
  function addToCalendar() {
    const start = WorldChoirConfig.getEventStart();
    const end = WorldChoirConfig.getEventEnd();
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const details = 'Once a year, the world sings the same song at the exact same time. Join World Choir 2027.\n\nSong: Imagine — John Lennon';
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('World Choir 2027')}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(details)}&location=Global`;
    window.open(url, '_blank');
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
    WorldChoirDB.getOrCreateUser();
    initBackground();
    document.getElementById('nav-root').appendChild(renderWorldChoirNav('home'));

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

    document.getElementById('remind-save').addEventListener('click', saveReminders);
    document.getElementById('remind-cancel').addEventListener('click', closeRemindModal);
    document.getElementById('remind-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'remind-overlay') closeRemindModal();
    });

    render();
    countdownTimer = setInterval(render, 1000);
    checkReminders();
    reminderChecker = setInterval(checkReminders, 30000);
  }

  return { init, render };
})();
