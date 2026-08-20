/**
 * WorldChoirPassport — reusable Passport card + data + image export
 */
const WorldChoirPassport = (() => {
  let exportBusy = false;

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatVoiceNumber(n) {
    if (n == null || n === '') return '—';
    const num = Number(n);
    if (!Number.isFinite(num)) return `#${esc(String(n))}`;
    return `#${num.toLocaleString('en-US')}`;
  }

  function formatMemberSince(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function portraitInitial(passport) {
    const name = passport.voiceName || '';
    const match = name.match(/(\d+)/);
    if (match) return match[1].slice(-2);
    if (passport.voiceNumber != null) {
      return String(passport.voiceNumber).slice(-2);
    }
    return 'WC';
  }

  function worldMapSvg() {
    // Fine gold dotted engraving — decorative only
    return `
      <svg class="wc-passport__map-svg" viewBox="0 0 180 110" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="wcPassportDots" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.55" fill="#c9a962"/>
          </pattern>
          <mask id="wcPassportLand">
            <rect width="180" height="110" fill="black"/>
            <!-- Simplified continent silhouettes -->
            <path fill="white" d="M28 28c6-8 16-10 24-7 7 3 10 9 8 16-3 8-12 12-20 11-9-1-15-10-12-20z"/>
            <path fill="white" d="M58 42c8-2 14 4 13 12-1 7-8 12-15 11-6-1-10-7-8-13 2-5 6-8 10-10z"/>
            <path fill="white" d="M78 30c11-5 22-2 28 6 5 7 4 16-2 22-7 7-18 8-26 3-9-5-12-16-8-25 2-2 4-4 8-6z"/>
            <path fill="white" d="M112 36c9-6 20-4 27 3 6 7 6 17 0 24-7 8-19 9-28 3-8-5-11-15-7-23 2-3 4-5 8-7z"/>
            <path fill="white" d="M146 48c7-4 14-1 16 6 2 6-1 12-7 14-6 2-12-1-14-7-2-5 1-10 5-13z"/>
            <path fill="white" d="M92 68c5-2 10 1 11 6 1 5-2 9-7 10-5 1-9-2-10-7-1-4 2-8 6-9z"/>
            <path fill="white" d="M118 74c8-3 15 2 16 9 1 6-4 11-10 12-7 1-13-4-14-10-1-5 3-9 8-11z"/>
            <path fill="white" d="M42 62c6-3 12 1 13 7 1 5-3 10-8 11-6 1-11-3-12-8-1-5 3-8 7-10z"/>
          </mask>
        </defs>
        <rect width="180" height="110" fill="url(#wcPassportDots)" mask="url(#wcPassportLand)" opacity="0.9"/>
      </svg>
    `;
  }

  function renderCard(passport, { loading = false } = {}) {
    const voice = loading ? '—' : formatVoiceNumber(passport.voiceNumber);
    const country = loading ? '—' : (passport.country || '—');
    const city = loading ? '—' : (passport.city || '—');
    const since = loading ? '—' : formatMemberSince(passport.memberSince);
    const initial = portraitInitial(passport);
    const photo = passport.profileImage
      ? `<img src="${esc(passport.profileImage)}" alt="" decoding="async">`
      : `<span class="wc-passport__portrait-fallback">${esc(initial)}</span>`;

    return `
      <article class="wc-passport${loading ? ' wc-passport--loading' : ''}" id="wc-passport-card" aria-label="World Choir Passport">
        <div class="wc-passport__texture" aria-hidden="true"></div>
        <div class="wc-passport__inner">
          <header class="wc-passport__top">
            <div>
              <p class="wc-passport__brand-label">World Choir</p>
              <p class="wc-passport__brand-sub">Passport</p>
            </div>
            <img
              class="wc-passport__logo"
              src="images/world-choir-logo.png?v=20270706"
              alt="World Choir"
              width="1024"
              height="1024"
              decoding="async"
            >
          </header>

          <div class="wc-passport__identity">
            <div class="wc-passport__portrait">${photo}</div>
            <div class="wc-passport__fields">
              <div class="wc-passport__field">
                <span class="wc-passport__label">Voice Number</span>
                <span class="wc-passport__value wc-passport__value--voice">${voice}</span>
                <span class="wc-passport__rule" aria-hidden="true"></span>
              </div>
              <div class="wc-passport__field">
                <span class="wc-passport__label">Country</span>
                <span class="wc-passport__value">${esc(country)}</span>
                <span class="wc-passport__rule" aria-hidden="true"></span>
              </div>
              <div class="wc-passport__field">
                <span class="wc-passport__label">City</span>
                <span class="wc-passport__value">${esc(city)}</span>
                <span class="wc-passport__rule" aria-hidden="true"></span>
              </div>
            </div>
          </div>

          <footer class="wc-passport__footer">
            <div class="wc-passport__field wc-passport__member">
              <span class="wc-passport__label">Member Since</span>
              <span class="wc-passport__value">${esc(since)}</span>
            </div>
            <div class="wc-passport__map">${worldMapSvg()}</div>
          </footer>
        </div>
      </article>
    `;
  }

  async function loadPassportData() {
    await WorldChoirDB.ready();
    const user = WorldChoirDB.getCurrentUser();
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    const history = WorldChoirDB.getParticipationHistory();
    let eventsJoined = history.length;
    if (eventsJoined === 0 && WorldChoirDB.hasPledged()) eventsJoined = 1;

    let dailyActsCompleted = 0;
    try {
      const date = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })();
      const res = await fetch(
        `/api/daily-peace?deviceId=${encodeURIComponent(WorldChoirDB.getDeviceId())}&view=impact&date=${encodeURIComponent(date)}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        dailyActsCompleted = data?.summary?.totalCompleted ?? 0;
      }
    } catch (err) {
      console.warn('Passport daily acts unavailable:', err);
    }

    return {
      voiceNumber: pledge?.voiceNumber ?? null,
      voiceName: pledge?.voiceName || pledge?.display_name || user?.display_name || null,
      profileImage: null,
      country: pledge?.country || user?.country || null,
      city: pledge?.city || user?.city || null,
      memberSince: pledge?.pledged_at || user?.created_at || null,
      eventsJoined,
      dailyActsCompleted,
    };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing && window.html2canvas) {
        resolve(window.html2canvas);
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(window.html2canvas);
      s.onerror = () => reject(new Error('Failed to load export library'));
      document.head.appendChild(s);
    });
  }

  async function ensureHtml2Canvas() {
    if (typeof window.html2canvas === 'function') return window.html2canvas;
    return loadScript('https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js');
  }

  async function capturePassportBlob(cardEl) {
    const el = cardEl || document.getElementById('wc-passport-card');
    if (!el) throw new Error('Passport card not found');

    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale: Math.max(2, Math.min(3, window.devicePixelRatio || 2)),
      useCORS: true,
      allowTaint: false,
      logging: false,
    });

    // Upscale to at least 1080px wide if needed
    const minWidth = 1080;
    let out = canvas;
    if (canvas.width < minWidth) {
      const ratio = minWidth / canvas.width;
      const up = document.createElement('canvas');
      up.width = Math.round(canvas.width * ratio);
      up.height = Math.round(canvas.height * ratio);
      const ctx = up.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, up.width, up.height);
      out = up;
    }

    return new Promise((resolve, reject) => {
      out.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not create image'))),
        'image/png'
      );
    });
  }

  function isExportBusy() {
    return exportBusy;
  }

  async function withExportLock(fn) {
    if (exportBusy) return null;
    exportBusy = true;
    try {
      return await fn();
    } finally {
      exportBusy = false;
    }
  }

  async function downloadPassport(cardEl) {
    return withExportLock(async () => {
      const blob = await capturePassportBlob(cardEl);
      const fileName = 'world-choir-passport.png';
      const file = new File([blob], fileName, { type: 'image/png' });

      // Prefer native share-to-save on mobile when download is unreliable
      if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        try {
          await navigator.share({ files: [file], title: 'World Choir Passport' });
          return { method: 'share' };
        } catch (err) {
          if (err?.name === 'AbortError') return { method: 'cancelled' };
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { method: 'download' };
    });
  }

  async function sharePassport(cardEl) {
    return withExportLock(async () => {
      const blob = await capturePassportBlob(cardEl);
      const file = new File([blob], 'world-choir-passport.png', { type: 'image/png' });
      const origin = window.location.origin || 'https://world-choir-app.vercel.app';
      const text = `My voice is part of World Choir.\n${origin}`;

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'World Choir Passport', text });
          return { method: 'share' };
        } catch (err) {
          if (err?.name === 'AbortError') return { method: 'cancelled' };
        }
      }

      if (navigator.share) {
        try {
          await navigator.share({ title: 'World Choir Passport', text });
          return { method: 'share-text' };
        } catch (err) {
          if (err?.name === 'AbortError') return { method: 'cancelled' };
        }
      }

      // Fallback: download the image
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'world-choir-passport.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { method: 'download-fallback' };
    });
  }

  return {
    renderCard,
    loadPassportData,
    formatVoiceNumber,
    formatMemberSince,
    downloadPassport,
    sharePassport,
    capturePassportBlob,
    isExportBusy,
  };
})();
