/**
 * WorldChoirDonate — editorial Creator Foundations experience
 * Views: home → foundation profile → donate modal → confirmation
 * Data integrity: never invent raised / supporters / projects.
 */
const WorldChoirDonate = (() => {
  const AMOUNTS = () => CreatorFoundationsStore.getSuggestedAmounts();
  const PAYMENT_METHODS = [
    { id: 'apple_pay', label: 'Apple Pay', ready: true },
    { id: 'google_pay', label: 'Google Pay', ready: true },
    { id: 'card', label: 'Credit Card', ready: true },
    { id: 'paypal', label: 'PayPal', ready: true },
  ];

  let selectedFoundation = null;
  let selectedProject = null;
  let selectedAmount = 25;
  let customAmount = '';
  let selectedPayment = 'card';
  let isSubmitting = false;
  let searchOpen = false;
  let searchQuery = '';
  let selectedCause = 'all';
  let lastFocusEl = null;

  const CAUSE_FILTERS = [
    { id: 'all', label: 'All Causes', icon: 'all' },
    { id: 'Food & Hunger', label: 'Food & Hunger', icon: 'food' },
    { id: 'Health', label: 'Health', icon: 'health' },
    { id: 'Education', label: 'Education', icon: 'education' },
    { id: 'Humanitarian Aid', label: 'Humanitarian Aid', icon: 'aid' },
    { id: 'Environment', label: 'Environment', icon: 'env' },
  ];

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function formatMoney(amount, currency = 'EUR') {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      }).format(n);
    } catch {
      return `€${n % 1 === 0 ? n : n.toFixed(2)}`;
    }
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function initials(name) {
    return (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  function identityGlyph(foundation) {
    const words = String(foundation.foundationName || foundation.creatorName || '')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return initials(foundation.foundationName || foundation.creatorName).slice(0, 2);
  }

  function getFilteredFoundations() {
    const category = selectedCause === 'all' ? null : selectedCause;
    const query = searchOpen ? searchQuery : '';
    const result = CreatorFoundationsStore.listActive({
      page: 1,
      pageSize: 500,
      sort: 'trending',
      category,
      query,
    });
    return result.items || [];
  }

  function getAllFoundations() {
    const result = CreatorFoundationsStore.listActive({
      page: 1,
      pageSize: 500,
      sort: 'featured',
    });
    return result.items || [];
  }

  function shortMission(foundation, maxLen = 140) {
    const text = String(foundation.mission || '').trim();
    if (!text) return '';
    const match = text.match(/^[\s\S]{1,200}?[.!?](?=\s|$)/);
    const sentence = (match && match[0]) || text;
    if (sentence.length <= maxLen) return sentence.trim();
    return `${sentence.slice(0, maxLen - 1).trim()}…`;
  }

  function isNewFoundation(foundation) {
    return !(foundation.activeProjectCount > 0)
      && !(foundation.totalRaised > 0)
      && !(foundation.uniqueSupporters > 0);
  }

  function causeTags(foundation) {
    const tags = [];
    const primary = foundation.primaryCategory;
    if (primary) tags.push(primary);
    (foundation.categories || []).forEach((c) => {
      const n = CreatorFoundationsStore.normalizeCause(c) || c;
      if (n && !tags.includes(n) && CreatorFoundationsStore.FOUNDATION_CAUSES.includes(n)) {
        tags.push(n);
      }
    });
    return tags.slice(0, 3);
  }

  function visualUrl(foundation) {
    return foundation.coverImage || foundation.profileImage || '';
  }

  function searchIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5"></circle>
        <path d="M16.2 16.2L21 21" stroke-linecap="round"></path>
      </svg>
    `;
  }

  function arrowSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }

  function causeIconSvg(kind) {
    const common = 'viewBox="0 0 24 24" aria-hidden="true"';
    const icons = {
      all: `<svg ${common}><circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15M4.5 12h15" stroke-linecap="round"/></svg>`,
      food: `<svg ${common}><path d="M8 3v8a4 4 0 008 0V3"/><path d="M12 11v10" stroke-linecap="round"/></svg>`,
      health: `<svg ${common}><path d="M12 21s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 11c0 5.5-7 10-7 10z"/></svg>`,
      education: `<svg ${common}><path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 12v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5"/></svg>`,
      aid: `<svg ${common}><path d="M12 3v18M3 12h18" stroke-linecap="round"/><circle cx="12" cy="12" r="8"/></svg>`,
      env: `<svg ${common}><path d="M12 21c4-4 6-7.5 6-11a6 6 0 10-12 0c0 3.5 2 7 6 11z"/><path d="M12 10v4" stroke-linecap="round"/></svg>`,
      projects: `<svg ${common}><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M8 9h8M8 13h5" stroke-linecap="round"/></svg>`,
    };
    return icons[kind] || icons.all;
  }

  function verifiedMark(status) {
    if (status !== 'verified') return '';
    return `<span class="df-verified">Verified</span>`;
  }

  function normalizeExternalUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('//')) return `https:${value}`;
    return `https://${value.replace(/^\/+/, '')}`;
  }

  function socialIconSvg(kind) {
    const common = 'viewBox="0 0 24 24" aria-hidden="true"';
    const icons = {
      website: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" stroke-linecap="round"/></svg>`,
      instagram: `<svg ${common}><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none"/></svg>`,
      youtube: `<svg ${common}><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10 9.5l5 2.5-5 2.5V9.5z" fill="currentColor" stroke="none"/></svg>`,
      x: `<svg ${common}><path d="M5 5l14 14M19 5L5 19" stroke-linecap="round"/></svg>`,
      tiktok: `<svg ${common}><path d="M14 4v10.2a3.8 3.8 0 11-2.6-3.6V8.2A6 6 0 0014 8V4h2.2A4.8 4.8 0 0019.5 7V9A6.8 6.8 0 0116.2 8v6.2A5.8 5.8 0 118 8.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    };
    return icons[kind] || icons.website;
  }

  function renderSocialLinks(foundation) {
    const links = foundation.socialLinks && typeof foundation.socialLinks === 'object'
      ? foundation.socialLinks
      : {};
    const entries = [
      { id: 'website', label: 'Website', url: foundation.website },
      { id: 'instagram', label: 'Instagram', url: links.instagram },
      { id: 'youtube', label: 'YouTube', url: links.youtube },
      { id: 'x', label: 'X', url: links.x || links.twitter },
      { id: 'tiktok', label: 'TikTok', url: links.tiktok },
    ]
      .map((item) => ({ ...item, href: normalizeExternalUrl(item.url) }))
      .filter((item) => item.href);

    if (!entries.length) return '';

    return `
      <section class="df-section df-social">
        <h2>Connect</h2>
        <div class="df-social__row">
          ${entries.map((item) => `
            <a
              class="df-social__link"
              href="${esc(item.href)}"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="${esc(item.label)}"
              title="${esc(item.label)}"
            >
              ${socialIconSvg(item.id)}
            </a>
          `).join('')}
        </div>
      </section>
    `;
  }

  function metricsRow(foundation) {
    const currency = CreatorFoundationsStore.getCurrency();
    return `
      <div class="df-metrics" aria-label="Foundation metrics">
        <div>
          <span class="df-metric__label">Raised</span>
          <span class="df-metric__value">${esc(formatMoney(foundation.totalRaised || 0, currency))}</span>
        </div>
        <div>
          <span class="df-metric__label">Supporters</span>
          <span class="df-metric__value">${esc(formatCount(foundation.uniqueSupporters || 0))}</span>
        </div>
        <div>
          <span class="df-metric__label">Active projects</span>
          <span class="df-metric__value">${esc(formatCount(foundation.activeProjectCount || 0))}</span>
        </div>
      </div>
    `;
  }

  function renderTopbar() {
    if (searchOpen) {
      return `
        <div class="df-search-inline" role="search">
          <input
            class="df-search-inline__input"
            id="df-search-input"
            type="search"
            placeholder="Search by foundation or creator"
            value="${esc(searchQuery)}"
            autocomplete="off"
            enterkeyhint="search"
            aria-label="Search by foundation or creator"
          >
          <button type="button" class="df-search-inline__close" id="df-search-close">Close</button>
        </div>
      `;
    }

    return `
      <div class="df-topbar df-rise">
        <a class="df-topbar__logo" href="index.html" aria-label="World Choir home">
          <img
            src="images/world-choir-logo-donate.png?v=20260813v"
            alt="World Choir"
            width="105"
            height="35"
            decoding="async"
          >
        </a>
        <button type="button" class="df-search-trigger" id="df-search-open" aria-label="Search foundations">
          ${searchIconSvg()}
        </button>
      </div>
    `;
  }

  function renderIntro() {
    return `
      <header class="df-intro df-intro--globe df-rise df-rise-delay-1">
        <div class="df-intro__globe" aria-hidden="true">
          <div id="df-donate-earth-container" class="df-donate-earth" aria-hidden="true"></div>
        </div>

        <div class="df-intro__text">
          <h1 class="df-intro__title">Discover Impact</h1>
          <p class="df-intro__lead">Support people you trust.<br>Causes you can change.</p>
          <p class="df-intro__copy">Verified creators turning their influence into real, meaningful and measurable action.</p>
        </div>
      </header>
    `;
  }

  // ─── Donate hero globe (canvas) ───
  // Lightweight, no extra dependencies: 2D canvas draws a textured sphere and a subtle network.
  let donateGlobe = {
    canvas: null,
    ctx: null,
    rafId: 0,
    running: false,
    reducedMotion: false,
    startedAt: 0,
    lastDrawAt: 0,
    frameEveryMs: 70,

    bufSize: 220,
    bufCanvas: null,
    bufCtx: null,
    bufImageData: null,
    bufData: null,

    texW: 256,
    texH: 128,
    texData: null,

    points: [],
    connections: [],
  };

  function donatePrefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function donateHash2(x, y) {
    // Deterministic pseudo-random in [0,1).
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function donateSmoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function donateValueNoise2(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const xf = x - x0;
    const yf = y - y0;

    const a = donateHash2(x0, y0);
    const b = donateHash2(x0 + 1, y0);
    const c = donateHash2(x0, y0 + 1);
    const d = donateHash2(x0 + 1, y0 + 1);

    const u = donateSmoothstep(xf);
    const v = donateSmoothstep(yf);

    const ab = a * (1 - u) + b * u;
    const cd = c * (1 - u) + d * u;
    return ab * (1 - v) + cd * v;
  }

  function donateFbm2(x, y) {
    // Fractal value noise for a “continents” texture.
    let value = 0;
    let amp = 0.55;
    let freq = 1;
    for (let i = 0; i < 4; i += 1) {
      value += amp * donateValueNoise2(x * freq, y * freq);
      freq *= 2;
      amp *= 0.5;
    }
    return value;
  }

  function donateMakeTexture() {
    const tw = donateGlobe.texW;
    const th = donateGlobe.texH;
    const texCanvas = document.createElement('canvas');
    texCanvas.width = tw;
    texCanvas.height = th;
    const tctx = texCanvas.getContext('2d', { willReadFrequently: true });
    const img = tctx.createImageData(tw, th);
    const data = img.data;

    for (let j = 0; j < th; j += 1) {
      for (let i = 0; i < tw; i += 1) {
        const u = i / (tw - 1);
        const v = j / (th - 1);

        // “Spherical-ish” noise: vary more around longitude, slightly less across latitude.
        const nx = u * 5.2 + 0.13;
        const ny = v * 2.6 + 0.07;
        const n = donateFbm2(nx, ny); // 0..~1

        // Continent mask.
        const land = n - 0.44; // center threshold
        const alt = Math.max(0, land) * 1.8;

        // Color palette (ocean + vegetation + subtle snow bands).
        const oceanR = 4, oceanG = 28, oceanB = 56;
        const landR1 = 18, landG1 = 68, landB1 = 44;   // deep green
        const landR2 = 120, landG2 = 165, landB2 = 120; // lighter land

        const lat = (v - 0.5) * Math.PI; // -pi/2..pi/2
        const snow = Math.max(0, (Math.abs(lat) - 0.95)) * 3.0; // thin polar snow

        const oceanMix = Math.max(0, Math.min(1, 1 - alt * 1.2));
        const landMix = 1 - oceanMix;

        // Blend land from two greens based on altitude.
        const gMix2 = Math.max(0, Math.min(1, alt * 0.9));

        let r = oceanR * oceanMix + (landR1 * (1 - gMix2) + landR2 * gMix2) * landMix;
        let g = oceanG * oceanMix + (landG1 * (1 - gMix2) + landG2 * gMix2) * landMix;
        let b = oceanB * oceanMix + (landB1 * (1 - gMix2) + landB2 * gMix2) * landMix;

        if (snow > 0) {
          const s = Math.min(1, snow);
          r = r * (1 - s) + 220 * s;
          g = g * (1 - s) + 220 * s;
          b = b * (1 - s) + 230 * s;
        }

        // Very subtle “clouds” layer (static) to add realism.
        const clouds = donateFbm2(nx * 1.9 + 2.2, ny * 1.9 + 1.1);
        const cloudMask = Math.max(0, clouds - 0.6) * 0.35;
        if (cloudMask > 0.001) {
          r = r * (1 - cloudMask) + 190 * cloudMask;
          g = g * (1 - cloudMask) + 200 * cloudMask;
          b = b * (1 - cloudMask) + 210 * cloudMask;
        }

        const idx = (j * tw + i) * 4;
        data[idx] = Math.round(r);
        data[idx + 1] = Math.round(g);
        data[idx + 2] = Math.round(b);
        data[idx + 3] = 255;
      }
    }

    donateGlobe.texData = data;
  }

  function donateTexSample(u, v) {
    const tw = donateGlobe.texW;
    const th = donateGlobe.texH;
    // Wrap U, clamp V.
    const uu = ((u % 1) + 1) % 1;
    const vv = Math.max(0, Math.min(1, v));
    const x = Math.floor(uu * (tw - 1));
    const y = Math.floor(vv * (th - 1));
    const idx = (y * tw + x) * 4;
    const d = donateGlobe.texData;
    return { r: d[idx], g: d[idx + 1], b: d[idx + 2] };
  }

  function donateRotateY(vec, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = vec.x * cos + vec.z * sin;
    const z = -vec.x * sin + vec.z * cos;
    return { x, y: vec.y, z };
  }

  function donateProject(vec, r, cx, cy) {
    // Camera at origin looking toward +Z.
    const z = vec.z;
    if (z <= 0) return null;
    const sx = cx + (vec.x / z) * r;
    const sy = cy - (vec.y / z) * r;
    return { sx, sy, z };
  }

  function donateSlerp(a, b, t) {
    // Spherical linear interpolation between unit vectors.
    let dot = a.x * b.x + a.y * b.y + a.z * b.z;
    dot = Math.max(-1, Math.min(1, dot));
    const omega = Math.acos(dot);
    if (omega < 1e-5) return { x: a.x, y: a.y, z: a.z };
    const so = Math.sin(omega);
    const s1 = Math.sin((1 - t) * omega) / so;
    const s2 = Math.sin(t * omega) / so;
    return {
      x: a.x * s1 + b.x * s2,
      y: a.y * s1 + b.y * s2,
      z: a.z * s1 + b.z * s2,
    };
  }

  function donateInitNetwork() {
    if (donateGlobe.points.length) return;
    // Fixed points (lat/lon) so it always feels calm and consistent.
    const seeded = (n) => donateHash2(n * 1.31, n * 2.17);
    const count = 14;
    for (let i = 0; i < count; i += 1) {
      const lat = (seeded(i + 1) * 2 - 1) * (Math.PI / 2) * 0.78;
      const lon = (seeded(i + 11) * 2 - 1) * Math.PI;
      const cl = Math.cos(lat);
      donateGlobe.points.push({
        x: cl * Math.sin(lon),
        y: Math.sin(lat),
        z: cl * Math.cos(lon),
      });
    }
    // Subtle connections: short links, mostly local.
    donateGlobe.connections = [];
    for (let i = 0; i < donateGlobe.points.length - 1; i += 1) {
      if (i % 2 === 0) {
        donateGlobe.connections.push([i, i + 1]);
      }
    }
    // A few extra links for “network” feel.
    donateGlobe.connections.push([2, 7], [3, 10], [5, 12]);
  }

  function donateDrawGlobe(rotY) {
    const canvas = donateGlobe.canvas;
    const ctx = donateGlobe.ctx;
    const size = donateGlobe.bufSize;

    // Draw into buffer at fixed resolution; then scale to the real canvas.
    const r = size / 2;
    const cx = r;
    const cy = r;

    const data = donateGlobe.bufData;
    // Clear to transparent.
    data.fill(0);

    const light = { x: -0.22, y: 0.18, z: 1.0 };
    const lightLen = Math.hypot(light.x, light.y, light.z) || 1;
    light.x /= lightLen;
    light.y /= lightLen;
    light.z /= lightLen;

    const sin = Math.sin(rotY);
    const cos = Math.cos(rotY);

    // Camera-space sphere: normal derived from screen pixel.
    for (let py = 0; py < size; py += 1) {
      const ny = (py + 0.5 - cy) / r;
      const ny2 = ny * ny;
      for (let px = 0; px < size; px += 1) {
        const nx = (px + 0.5 - cx) / r;
        const rr = nx * nx + ny2;
        if (rr > 1) continue;
        const z = Math.sqrt(1 - rr);

        // Inverse-rotate the camera normal to body coords to sample the texture.
        const xB = nx * cos - z * sin;
        const zB = nx * sin + z * cos;
        const yB = ny;

        const lon = Math.atan2(xB, zB); // -pi..pi
        const lat = Math.asin(Math.max(-1, Math.min(1, yB)));

        const u = lon / (2 * Math.PI) + 0.5;
        const v = 0.5 - lat / Math.PI;

        const tex = donateTexSample(u, v);

        // Lighting in camera coords (normal doesn't change with rotation).
        const diff = Math.max(0, (nx * light.x + ny * light.y + z * light.z));
        const ambient = 0.22;
        let rC = tex.r * (ambient + 0.78 * diff);
        let gC = tex.g * (ambient + 0.78 * diff);
        let bC = tex.b * (ambient + 0.78 * diff);

        // Rim / atmospheric glow at the limb.
        const rim = Math.pow(Math.max(0, 1 - z), 1.65);
        rC += 26 * rim;
        gC += 76 * rim;
        bC += 120 * rim;

        const idx = (py * size + px) * 4;
        data[idx] = Math.round(Math.max(0, Math.min(255, rC)));
        data[idx + 1] = Math.round(Math.max(0, Math.min(255, gC)));
        data[idx + 2] = Math.round(Math.max(0, Math.min(255, bC)));
        data[idx + 3] = 255;
      }
    }

    donateGlobe.bufCtx.putImageData(donateGlobe.bufImageData, 0, 0);

    // Network layer (draw on top, not inside pixels loop).
    donateGlobe.bufCtx.save();
    donateGlobe.bufCtx.globalCompositeOperation = 'screen';
    donateGlobe.bufCtx.globalAlpha = 0.9;

    const projR = r * 0.98;
    const pointsRot = donateGlobe.points.map((p) => donateRotateY(p, rotY));
    const projected = pointsRot.map((p) => donateProject(p, projR, cx, cy));

    // Connections: thin, soft, mostly blue.
    donateGlobe.connections.forEach(([a, b]) => {
      const pa = projected[a];
      const pb = projected[b];
      if (!pa || !pb) return;
      const alpha = Math.min(0.22, 0.08 + 0.16 * Math.min(pa.z, pb.z));
      donateGlobe.bufCtx.strokeStyle = `rgba(78, 197, 232, ${alpha})`;
      donateGlobe.bufCtx.lineWidth = 1;
      donateGlobe.bufCtx.beginPath();
      const va = donateGlobe.points[a];
      const vb = donateGlobe.points[b];
      for (let t = 0; t <= 1; t += 0.12) {
        const v = donateSlerp(va, vb, t);
        const vc = donateRotateY(v, rotY);
        const pr = donateProject(vc, projR, cx, cy);
        if (!pr) continue;
        if (t === 0) donateGlobe.bufCtx.moveTo(pr.sx, pr.sy);
        else donateGlobe.bufCtx.lineTo(pr.sx, pr.sy);
      }
      donateGlobe.bufCtx.stroke();
    });

    // Points: small, soft glows.
    projected.forEach((p, idx) => {
      if (!p) return;
      const alpha = Math.min(0.35, 0.10 + 0.25 * p.z);
      donateGlobe.bufCtx.fillStyle = `rgba(78, 197, 232, ${alpha})`;
      donateGlobe.bufCtx.beginPath();
      donateGlobe.bufCtx.arc(p.sx, p.sy, 1.4, 0, Math.PI * 2);
      donateGlobe.bufCtx.fill();
      // Outer glow
      donateGlobe.bufCtx.globalAlpha = 1;
      donateGlobe.bufCtx.fillStyle = `rgba(78, 197, 232, ${alpha * 0.25})`;
      donateGlobe.bufCtx.beginPath();
      donateGlobe.bufCtx.arc(p.sx, p.sy, 2.6, 0, Math.PI * 2);
      donateGlobe.bufCtx.fill();
      donateGlobe.bufCtx.globalAlpha = 0.9;
    });

    donateGlobe.bufCtx.restore();

    // Render scaled result onto the actual canvas.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(donateGlobe.bufCanvas, 0, 0, canvas.width, canvas.height);
  }

  function stopDonateGlobe() {
    if (donateGlobe.rafId) {
      cancelAnimationFrame(donateGlobe.rafId);
    }
    donateGlobe.rafId = 0;
    donateGlobe.running = false;
  }

  function mountDonateGlobe() {
    const canvas = document.getElementById('df-donate-globe-canvas');
    if (!canvas) {
      stopDonateGlobe();
      return;
    }

    // If the canvas changed due to a re-render, restart.
    if (donateGlobe.canvas !== canvas) {
      stopDonateGlobe();
      donateGlobe.canvas = canvas;
      donateGlobe.ctx = canvas.getContext('2d', { alpha: true });
    }

    donateGlobe.reducedMotion = donatePrefersReducedMotion();
    if (!donateGlobe.bufCanvas) {
      donateGlobe.bufCanvas = document.createElement('canvas');
      donateGlobe.bufCanvas.width = donateGlobe.bufSize;
      donateGlobe.bufCanvas.height = donateGlobe.bufSize;
      donateGlobe.bufCtx = donateGlobe.bufCanvas.getContext('2d', { alpha: true });
      donateGlobe.bufImageData = donateGlobe.bufCtx.createImageData(donateGlobe.bufSize, donateGlobe.bufSize);
      donateGlobe.bufData = donateGlobe.bufImageData.data;
    }
    if (!donateGlobe.texData) {
      donateMakeTexture();
    }
    donateInitNetwork();

    // Fit canvas to CSS size (retina aware).
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    if (donateGlobe.reducedMotion) {
      const rotY = 0;
      donateDrawGlobe(rotY);
      stopDonateGlobe();
      return;
    }

    if (donateGlobe.running) return;
    donateGlobe.running = true;
    donateGlobe.startedAt = performance.now();
    donateGlobe.lastDrawAt = 0;

    const step = () => {
      if (!donateGlobe.running) return;
      const now = performance.now();
      if (now - donateGlobe.lastDrawAt < donateGlobe.frameEveryMs) {
        donateGlobe.rafId = requestAnimationFrame(step);
        return;
      }
      donateGlobe.lastDrawAt = now;

      // One full rotation ~45s (quiet and non-distracting).
      const t = (now - donateGlobe.startedAt) / 45000;
      const rotY = t * Math.PI * 2;
      donateDrawGlobe(rotY);

      donateGlobe.rafId = requestAnimationFrame(step);
    };

    donateGlobe.rafId = requestAnimationFrame(step);
  }

  function renderCauseFilters() {
    return `
      <div class="df-causes" role="toolbar" aria-label="Filter by cause">
        <div class="df-causes__scroller">
          ${CAUSE_FILTERS.map((f) => `
            <button
              type="button"
              class="df-cause ${selectedCause === f.id ? 'is-active' : ''}"
              data-cause="${esc(f.id)}"
              aria-pressed="${selectedCause === f.id ? 'true' : 'false'}"
            >
              <span class="df-cause__icon">${causeIconSvg(f.icon)}</span>
              <span>${esc(f.label)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderFoundationCard(foundation) {
    const img = visualUrl(foundation);
    const tags = causeTags(foundation);
    const mission = shortMission(foundation, 160);
    let statusLine = '';
    if (foundation.activeProjectCount > 0) {
      statusLine = `${formatCount(foundation.activeProjectCount)} active project${foundation.activeProjectCount === 1 ? '' : 's'}`;
      if (foundation.raisedKnown && foundation.totalRaised > 0) {
        statusLine += ` · ${formatMoney(foundation.totalRaised, CreatorFoundationsStore.getCurrency())} raised`;
      }
    } else if (isNewFoundation(foundation)) {
      statusLine = 'First project coming soon.';
    } else {
      statusLine = 'Be among the first to support this foundation.';
    }

    return `
      <li>
        <button type="button" class="df-fcard" data-open-foundation="${esc(foundation.id)}">
          <span class="df-fcard__media ${img ? 'has-image' : ''}" aria-hidden="true">
            ${img
              ? `<img src="${esc(img)}" alt="">`
              : `<span class="df-fcard__glyph">${esc(identityGlyph(foundation))}</span>`}
          </span>
          <span class="df-fcard__body">
            ${isNewFoundation(foundation)
              ? `<span class="df-fcard__badge">New to World Choir</span>`
              : ''}
            <h3 class="df-fcard__name">${esc(foundation.foundationName)}</h3>
            <p class="df-fcard__meta">
              ${esc(foundation.creatorName)}${foundation.country ? ` · ${esc(foundation.country)}` : ''}
            </p>
            ${mission ? `<p class="df-fcard__mission">${esc(mission)}</p>` : ''}
            ${tags.length ? `
              <span class="df-fcard__tags">
                ${tags.map((t) => `<span class="df-fcard__tag">${esc(t)}</span>`).join('')}
              </span>
            ` : ''}
            <span class="df-fcard__foot">
              <span class="df-fcard__status">${esc(statusLine)}</span>
              <span class="df-fcard__arrow" aria-hidden="true">${arrowSvg()}</span>
            </span>
          </span>
        </button>
      </li>
    `;
  }

  function renderEmptyResults() {
    const searching = searchOpen && searchQuery.trim();
    const copy = searching
      ? 'No Creator Foundations match this search in the selected cause.'
      : selectedCause === 'all'
        ? 'Verified Creator Foundations will appear here as the circle grows.'
        : 'There are currently no Creator Foundations in this cause.';

    return `
      <div class="df-empty">
        <p class="df-empty__title">No foundations found</p>
        <p class="df-empty__copy">${esc(copy)}</p>
        ${selectedCause !== 'all' || searching ? `
          <button type="button" class="df-empty__action" id="df-view-all">View all foundations</button>
        ` : ''}
      </div>
    `;
  }

  function renderSearchResultRow(foundation) {
    const avatar = foundation.profileImage || '';
    return `
      <li>
        <button type="button" class="df-srow" data-open-foundation="${esc(foundation.id)}">
          <span class="df-srow__avatar ${avatar ? 'has-image' : ''}" aria-hidden="true">
            ${avatar
              ? `<img src="${esc(avatar)}" alt="">`
              : `<span>${esc(identityGlyph(foundation))}</span>`}
          </span>
          <span class="df-srow__text">
            <span class="df-srow__creator">${esc(foundation.creatorName || '—')}</span>
            <span class="df-srow__foundation">${esc(foundation.foundationName || '—')}</span>
          </span>
          <span class="df-srow__arrow" aria-hidden="true">${arrowSvg()}</span>
        </button>
      </li>
    `;
  }

  function renderSearchResultsSection(items) {
    const q = searchQuery.trim();
    if (!q) {
      return `
        <section class="df-search-results" aria-live="polite">
          <p class="df-search-results__hint">Type a creator or foundation name.</p>
        </section>
      `;
    }

    if (!items.length) {
      return `
        <section class="df-search-results" aria-live="polite">
          <div class="df-empty">
            <p class="df-empty__title">No foundations found</p>
            <p class="df-empty__copy">No Creator Foundations match “${esc(q)}”.</p>
            <button type="button" class="df-empty__action" id="df-view-all">View all foundations</button>
          </div>
        </section>
      `;
    }

    return `
      <section class="df-search-results" aria-live="polite" aria-label="Search results">
        <ul class="df-srows">
          ${items.map(renderSearchResultRow).join('')}
        </ul>
      </section>
    `;
  }

  function renderFoundationsSection(items) {
    return `
      <section class="df-foundations" aria-labelledby="df-foundations-label">
        <p class="df-section-label" id="df-foundations-label">Foundations</p>
        ${items.length
          ? `<ul class="df-fcards">${items.map(renderFoundationCard).join('')}</ul>`
          : renderEmptyResults()}
      </section>
    `;
  }

  function renderFoundationsMountHtml() {
    if (searchOpen) {
      return renderSearchResultsSection(getFilteredFoundations());
    }

    const items = getFilteredFoundations();
    const all = getAllFoundations();
    if (!all.length && selectedCause === 'all' && !searchQuery.trim()) {
      return `
        <section class="df-foundations">
          <div class="df-empty">
            <p class="df-empty__title">A carefully curated beginning</p>
            <p class="df-empty__copy">
              Verified Creator Foundations will appear here as the circle grows.
              We only show real people and real missions.
            </p>
          </div>
        </section>
      `;
    }
    return renderFoundationsSection(items);
  }

  function bindFoundationCardEvents(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-open-foundation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const foundation = CreatorFoundationsStore.getById(btn.getAttribute('data-open-foundation'));
        if (foundation) openProfile(foundation);
      });
    });
    root.querySelector('#df-view-all')?.addEventListener('click', resetExplore);
  }

  /** Update results only — never remount the search input while typing. */
  function updateFoundationsList() {
    const mount = document.getElementById('df-foundations-mount');
    if (!mount) {
      renderHome({ focusSearch: searchOpen });
      return;
    }
    mount.innerHTML = renderFoundationsMountHtml();
    bindFoundationCardEvents(mount);
  }

  function renderHappeningNow() {
    const projects = CreatorFoundationsStore.listActiveProjects(12);
    if (!projects.length) return '';

    return `
      <section class="df-now df-rise df-rise-delay-3" aria-labelledby="df-now-label">
        <div class="df-now__head">
          <div>
            <p class="df-section-label" id="df-now-label">Happening now</p>
            <p class="df-now__copy">Discover the projects currently creating change.</p>
          </div>
          <button type="button" class="df-now__link" id="df-see-projects">See all projects <span aria-hidden="true">→</span></button>
        </div>
        <div class="df-now__rail">
          ${projects.map((p) => {
            const img = p.coverImage || p.foundationCover || '';
            const cat = CreatorFoundationsStore.normalizeCause(p.category)
              || p.foundationCategory
              || '';
            return `
              <button type="button" class="df-pcard" data-open-foundation="${esc(p.foundationId)}" data-project-id="${esc(p.id)}">
                <span class="df-pcard__media ${img ? 'has-image' : ''}" aria-hidden="true">
                  ${img
                    ? `<img src="${esc(img)}" alt="">`
                    : `<span class="df-pcard__glyph">${esc(initials(p.foundationName))}</span>`}
                </span>
                <span class="df-pcard__body">
                  <span class="df-pcard__foundation">${esc(p.foundationName)}</span>
                  <span class="df-pcard__title">${esc(p.title)}</span>
                  ${cat ? `<span class="df-pcard__cat">${esc(cat)}</span>` : ''}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderDiscoveryChrome() {
    return `
      <section class="df-explore df-rise df-rise-delay-2" aria-labelledby="df-explore-label">
        <p class="df-section-label" id="df-explore-label">Explore by cause</p>
        ${renderCauseFilters()}
      </section>
    `;
  }

  function openSearch() {
    lastFocusEl = document.activeElement;
    searchOpen = true;
    searchQuery = '';
    renderHome({ focusSearch: true });
  }

  function closeSearch() {
    searchOpen = false;
    searchQuery = '';
    renderHome();
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
      lastFocusEl.focus();
    }
  }

  function resetExplore() {
    selectedCause = 'all';
    searchOpen = false;
    searchQuery = '';
    renderHome();
  }

  function bindHomeEvents(opts = {}) {
    document.getElementById('df-search-open')?.addEventListener('click', openSearch);
    document.getElementById('df-search-close')?.addEventListener('click', closeSearch);
    document.getElementById('df-see-projects')?.addEventListener('click', () => {
      const el = document.getElementById('df-now-label');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const searchInput = document.getElementById('df-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value || '';
        updateFoundationsList();
      });
      if (opts.focusSearch) {
        requestAnimationFrame(() => {
          searchInput.focus();
          const len = searchInput.value.length;
          try {
            searchInput.setSelectionRange(len, len);
          } catch {
            /* ignore */
          }
        });
      }
    }

    document.querySelectorAll('[data-cause]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCause = btn.getAttribute('data-cause') || 'all';
        // Keep the search field mounted; only refresh results + active styles.
        document.querySelectorAll('[data-cause]').forEach((b) => {
          const active = b.getAttribute('data-cause') === selectedCause;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        updateFoundationsList();
      });
    });

    bindFoundationCardEvents(document.getElementById('df-foundations-mount') || document);
  }

  function renderHome(opts = {}) {
    const root = document.getElementById('donate-content');
    const demoBanner = CreatorFoundationsStore.usingDemoCatalog()
      ? `<p class="df-demo-banner" role="status">Development demo catalog — not production data.</p>`
      : '';

    // Search mode: keep the field + compact people results only.
    if (searchOpen) {
      stopDonateEarth3D();
      root.innerHTML = `
        ${renderTopbar()}
        ${demoBanner}
        <div id="df-foundations-mount">${renderFoundationsMountHtml()}</div>
      `;
      bindHomeEvents(opts);
      return;
    }

    root.innerHTML = `
      ${renderTopbar()}
      ${demoBanner}
      ${renderIntro()}
      ${renderDiscoveryChrome()}
      <div id="df-foundations-mount">${renderFoundationsMountHtml()}</div>
      ${renderHappeningNow()}
    `;
    mountDonateEarth3D();
    bindHomeEvents(opts);
  }

  function peopleIconSvg() {
    return `
      <svg class="df-fp-supporters__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2"/>
        <circle cx="16.5" cy="9" r="2.6"/>
        <path d="M3.5 18.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" stroke-linecap="round"/>
        <path d="M13.2 16.2c.9-1.6 2.4-2.5 4.3-2.5 1.7 0 3.1.7 3.9 2.1" stroke-linecap="round"/>
      </svg>
    `;
  }

  function shareIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="18" cy="5" r="2.4"/>
        <circle cx="6" cy="12" r="2.4"/>
        <circle cx="18" cy="19" r="2.4"/>
        <path d="M8.2 10.8l7.6-4.2M8.2 13.2l7.6 4.2" stroke-linecap="round"/>
      </svg>
    `;
  }

  function chevronSvg() {
    return `
      <svg class="df-fp-story__chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function supportCtaLabel(foundation) {
    return foundation.donationsEnabled ? 'Support this foundation' : 'Temporarily unavailable';
  }

  function renderSupportCta(foundation, { id, secondary = false } = {}) {
    const cls = secondary ? 'df-fp-cta df-fp-cta--secondary' : 'df-fp-cta';
    return `
      <button
        class="${cls}"
        type="button"
        ${id ? `id="${esc(id)}"` : ''}
        data-action="support-mission"
        ${!foundation.donationsEnabled ? 'disabled' : ''}
      >
        ${esc(supportCtaLabel(foundation))}
      </button>
    `;
  }

  function projectImage(project) {
    return String(project.coverImage || '').trim();
  }

  function renderProjectCard(project, foundation) {
    const currency = project.currency || CreatorFoundationsStore.getCurrency();
    const showProgress = project.raisedKnown
      && project.goalAmount != null
      && project.raisedAmount != null
      && project.goalAmount > 0;
    const pct = showProgress
      ? Math.min(100, Math.round((project.raisedAmount / project.goalAmount) * 1000) / 10)
      : null;
    const image = projectImage(project);
    const metaBits = [];
    if (project.category) metaBits.push(esc(project.category));
    if (project.location) metaBits.push(esc(project.location));
    if (project.status === 'active') metaBits.push('Active');

    const fundingBits = [];
    if (project.raisedKnown && project.raisedAmount != null) {
      fundingBits.push(`${formatMoney(project.raisedAmount, currency)} raised`);
    }
    if (project.goalAmount != null) {
      fundingBits.push(`Goal ${formatMoney(project.goalAmount, currency)}`);
    }

    return `
      <article class="df-fp-project">
        <div class="df-fp-project__media ${image ? 'has-image' : ''}" aria-hidden="true">
          ${image
            ? `<img src="${esc(image)}" alt="" loading="lazy">`
            : `<span class="df-fp-project__glyph">${esc(initials(project.title).slice(0, 2) || 'P')}</span>`}
        </div>
        <div class="df-fp-project__body">
          <h3 class="df-fp-project__title">${esc(project.title)}</h3>
          ${metaBits.length ? `<p class="df-fp-project__meta">${metaBits.join(' · ')}</p>` : ''}
          ${project.description
            ? `<p class="df-fp-project__desc">${esc(project.description)}</p>`
            : ''}
          ${showProgress ? `
            <div class="df-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="df-progress__bar" style="width:${pct}%"></div>
            </div>
          ` : ''}
          ${fundingBits.length ? `
            <div class="df-fp-project__funding">${fundingBits.map((b) => `<span>${b}</span>`).join('')}</div>
          ` : ''}
          ${project.impactSummary ? `<p class="df-fp-project__desc">${esc(project.impactSummary)}</p>` : ''}
          <button
            class="df-fp-project__donate"
            type="button"
            data-action="donate-project"
            data-foundation="${esc(foundation.id)}"
            data-project="${esc(project.id)}"
            ${!foundation.donationsEnabled ? 'disabled' : ''}
          >
            Donate to project
          </button>
        </div>
      </article>
    `;
  }

  function renderStorySection({ num, title, bodyHtml, open = false }) {
    if (!bodyHtml) return '';
    return `
      <div class="df-fp-story ${open ? 'is-open' : ''}">
        <button class="df-fp-story__trigger" type="button" aria-expanded="${open ? 'true' : 'false'}">
          <span class="df-fp-story__index">${esc(num)}</span>
          <span class="df-fp-story__heading">${esc(title)}</span>
          ${chevronSvg()}
        </button>
        <div class="df-fp-story__panel" ${open ? '' : 'hidden'}>
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  function renderProfileHero(foundation) {
    const cover = foundation.coverImage || '';
    const profile = foundation.profileImage || '';
    const heroSrc = cover || profile;
    const showAvatar = Boolean(cover && profile);
    const avatarInner = profile
      ? `<img src="${esc(profile)}" alt="">`
      : `<span>${esc(identityGlyph(foundation))}</span>`;

    return `
      <header class="df-fp-hero">
        <div class="df-fp-hero__visual ${heroSrc ? 'has-image' : ''}">
          ${heroSrc
            ? `<img class="df-fp-hero__img" src="${esc(heroSrc)}" alt="">`
            : `<div class="df-fp-hero__fallback" aria-hidden="true"><span>${esc(identityGlyph(foundation))}</span></div>`}
          <div class="df-fp-hero__fade" aria-hidden="true"></div>
        </div>

        <div class="df-fp-hero__content">
          ${showAvatar ? `
            <div class="df-fp-hero__avatar" aria-hidden="true">${avatarInner}</div>
          ` : ''}

          <div class="df-fp-hero__identity">
            <h1 class="df-fp-hero__title">
              ${esc(foundation.foundationName)}
              ${verifiedMark(foundation.verificationStatus)}
            </h1>
            ${foundation.creatorName
              ? `<p class="df-fp-hero__byline">Founded by ${esc(foundation.creatorName)}</p>`
              : ''}
            ${foundation.country
              ? `<p class="df-fp-hero__place">${esc(foundation.country)}</p>`
              : ''}
          </div>

          ${foundation.mission
            ? `<p class="df-fp-hero__mission">${esc(foundation.mission)}</p>`
            : ''}

          <p class="df-fp-supporters">
            ${peopleIconSvg()}
            <span
              class="df-fp-supporters__count"
              data-count="${Number(foundation.uniqueSupporters || 0)}"
            >${esc(formatCount(foundation.uniqueSupporters || 0))}</span>
            <span class="df-fp-supporters__label">supporters</span>
          </p>

          <p class="df-fp-raised">
            <span data-money="${Number(foundation.totalRaised || 0)}">${esc(formatMoney(foundation.totalRaised || 0, CreatorFoundationsStore.getCurrency()))}</span>
            raised
          </p>

          ${renderSupportCta(foundation, { id: 'cf-profile-donate' })}
        </div>
      </header>
    `;
  }

  function renderTransparency(foundation) {
    const allocation = Array.isArray(foundation.financialAllocation)
      ? foundation.financialAllocation.filter((row) => row && row.label && row.percent != null)
      : [];
    const hasPolicy = Boolean(String(foundation.howDonationsAreUsed || '').trim());
    const hasAllocation = allocation.length > 0;

    if (!hasPolicy && !hasAllocation) {
      return `
        <section class="df-fp-block df-fp-transparency">
          <p class="df-fp-kicker">Transparency</p>
          <p class="df-fp-muted">Transparency information coming soon.</p>
        </section>
      `;
    }

    const allocHtml = hasAllocation
      ? `
        <div class="df-fp-alloc" aria-label="Financial allocation">
          ${allocation.map((row) => `
            <div class="df-fp-alloc__row">
              <span class="df-fp-alloc__pct">${esc(String(row.percent))}%</span>
              <span class="df-fp-alloc__label">${esc(row.label)}</span>
              <span class="df-fp-alloc__track" aria-hidden="true">
                <span class="df-fp-alloc__fill" style="width:${Math.min(100, Math.max(0, Number(row.percent) || 0))}%"></span>
              </span>
            </div>
          `).join('')}
        </div>
      `
      : '';

    return `
      <section class="df-fp-block df-fp-transparency">
        <p class="df-fp-kicker">Transparency</p>
        <h2 class="df-fp-block__title">How donations are used</h2>
        ${allocHtml}
        ${hasAllocation ? `
          <p class="df-fp-transparency__note">
            Every donation is allocated according to the Foundation's published funding policy.
          </p>
        ` : ''}
        ${hasPolicy ? `
          <button class="df-fp-transparency__more" type="button" aria-expanded="false" id="df-fp-transparency-toggle">
            See how donations are used
            <span aria-hidden="true">→</span>
          </button>
          <div class="df-fp-transparency__detail" id="df-fp-transparency-detail" hidden>
            ${String(foundation.howDonationsAreUsed || '')
              .split(/\n+/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => `<p>${esc(line)}</p>`)
              .join('')}
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderProfile(foundation) {
    const activeProjects = (foundation.projects || []).filter((p) => p.status === 'active');
    const values = (foundation.coreValues || []).filter(Boolean);
    const valuesHtml = values.length
      ? `<div class="df-chips">${values.map((v) => `<span class="df-chip">${esc(v)}</span>`).join('')}</div>`
      : '';

    const storySections = [];
    if (foundation.whyStarted) {
      storySections.push({
        num: String(storySections.length + 1).padStart(2, '0'),
        title: 'Why this began',
        bodyHtml: `<p>${esc(foundation.whyStarted)}</p>`,
      });
    }
    if (foundation.howItWorks) {
      storySections.push({
        num: String(storySections.length + 1).padStart(2, '0'),
        title: 'How the Foundation works',
        bodyHtml: `<p>${esc(foundation.howItWorks)}</p>`,
      });
    }
    if (valuesHtml) {
      storySections.push({
        num: String(storySections.length + 1).padStart(2, '0'),
        title: 'Our approach',
        bodyHtml: valuesHtml,
      });
    }

    return `
      <article class="df-fp df-rise">
        <nav class="df-fp-nav" aria-label="Foundation">
          <button class="df-fp-nav__back" type="button" id="donate-back">← Back</button>
          <button class="df-fp-nav__share" type="button" id="df-fp-share" aria-label="Share foundation">
            ${shareIconSvg()}
          </button>
        </nav>

        ${renderProfileHero(foundation)}

        ${foundation.biography ? `
          <section class="df-fp-block df-fp-about">
            <p class="df-fp-kicker">About</p>
            <p class="df-fp-about__text">${esc(foundation.biography)}</p>
          </section>
        ` : ''}

        ${storySections.length ? `
          <section class="df-fp-block df-fp-stories" aria-label="Foundation story">
            ${storySections.map((s, i) => renderStorySection({ ...s, open: i === 0 })).join('')}
          </section>
        ` : ''}

        ${activeProjects.length ? `
          <section class="df-fp-block df-fp-projects">
            <p class="df-fp-kicker">Active Projects</p>
            <div class="df-fp-projects__scroller" role="list">
              ${activeProjects.map((p) => `
                <div class="df-fp-projects__item" role="listitem">
                  ${renderProjectCard(p, foundation)}
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${renderTransparency(foundation)}

        <section class="df-fp-block df-fp-support-end">
          ${renderSupportCta(foundation, { id: 'cf-profile-donate-secondary', secondary: true })}
        </section>

        ${renderSocialLinks(foundation)}
      </article>
    `;
  }

  async function shareFoundation(foundation) {
    const url = new URL(window.location.href);
    url.searchParams.set('foundation', foundation.slug || foundation.id);
    const shareData = {
      title: foundation.foundationName || 'Creator Foundation',
      text: foundation.mission
        ? `${foundation.foundationName} — ${foundation.mission}`
        : `Support ${foundation.foundationName || 'this Creator Foundation'} on World Choir.`,
      url: url.toString(),
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      const btn = document.getElementById('df-fp-share');
      if (btn) {
        btn.classList.add('is-copied');
        window.setTimeout(() => btn.classList.remove('is-copied'), 1600);
      }
    } catch {
      /* ignore */
    }
  }

  function bindProfileInteractions(root, foundation) {
    root.querySelectorAll('.df-fp-story__trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const story = btn.closest('.df-fp-story');
        if (!story) return;
        const open = !story.classList.contains('is-open');
        story.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        const panel = story.querySelector('.df-fp-story__panel');
        if (panel) panel.hidden = !open;
      });
    });

    document.getElementById('df-fp-transparency-toggle')?.addEventListener('click', () => {
      const detail = document.getElementById('df-fp-transparency-detail');
      const toggle = document.getElementById('df-fp-transparency-toggle');
      if (!detail || !toggle) return;
      const open = detail.hasAttribute('hidden');
      if (open) {
        detail.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.classList.add('is-open');
        toggle.innerHTML = 'Hide how donations are used <span aria-hidden="true">↑</span>';
      } else {
        detail.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('is-open');
        toggle.innerHTML = 'See how donations are used <span aria-hidden="true">→</span>';
      }
    });

    document.getElementById('df-fp-share')?.addEventListener('click', () => {
      shareFoundation(foundation);
    });

    const animateCount = (el) => {
      const target = Number(el.getAttribute('data-count') || 0);
      if (!Number.isFinite(target) || target <= 0) {
        el.textContent = formatCount(target || 0);
        return;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = formatCount(target);
        return;
      }
      const duration = 900;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = formatCount(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const countEl = root.querySelector('[data-count]');
    if (countEl && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCount(countEl);
          io.disconnect();
        });
      }, { threshold: 0.4 });
      io.observe(countEl);
    } else if (countEl) {
      animateCount(countEl);
    }
  }

  function openProfile(foundation) {
    selectedFoundation = foundation;
    selectedProject = null;
    const root = document.getElementById('donate-content');
    root.innerHTML = renderProfile(foundation);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById('donate-back')?.addEventListener('click', () => {
      selectedFoundation = null;
      selectedProject = null;
      renderHome();
    });

    const openSupport = () => {
      if (foundation.donationsEnabled) openDonateModal(foundation, null);
    };
    document.getElementById('cf-profile-donate')?.addEventListener('click', openSupport);
    document.getElementById('cf-profile-donate-secondary')?.addEventListener('click', openSupport);
    root.querySelectorAll('[data-action="support-mission"]').forEach((btn) => {
      if (btn.id === 'cf-profile-donate' || btn.id === 'cf-profile-donate-secondary') return;
      btn.addEventListener('click', openSupport);
    });

    root.querySelectorAll('[data-action="donate-project"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const project = CreatorFoundationsStore.getProject(
          btn.getAttribute('data-foundation'),
          btn.getAttribute('data-project')
        );
        if (foundation.donationsEnabled) openDonateModal(foundation, project);
      });
    });

    bindProfileInteractions(root, foundation);
  }

  function ensureModal() {
    if (document.getElementById('donate-modal-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" id="donate-modal-overlay" aria-hidden="true">
        <div class="modal donate-modal" role="dialog" aria-modal="true" aria-labelledby="donate-modal-title">
          <div id="donate-modal-body"></div>
        </div>
      </div>
    `);
    document.getElementById('donate-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'donate-modal-overlay') closeModal();
    });
  }

  function getChosenAmount() {
    if (selectedAmount === 'custom') {
      const n = parseFloat(String(customAmount).replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return selectedAmount;
  }

  function renderModalBody(foundation, project) {
    const amounts = AMOUNTS();
    const title = project
      ? `Support ${foundation.creatorName}'s project`
      : `Support ${foundation.creatorName}'s mission`;
    const subtitle = project
      ? `Donate to “${project.title}”.`
      : `Donate to ${foundation.foundationName}.`;

    return `
      <h2 class="modal-title" id="donate-modal-title">${esc(title)}</h2>
      <p class="modal-copy">${esc(subtitle)}</p>

      <p class="donate-modal__label">One-time donation</p>
      <div class="donate-amounts" role="group" aria-label="Donation amount">
        ${amounts.map((a) => `
          <button type="button" class="donate-amount${selectedAmount === a ? ' is-selected' : ''}" data-amount="${a}">
            ${formatMoney(a)}
          </button>
        `).join('')}
        <button type="button" class="donate-amount${selectedAmount === 'custom' ? ' is-selected' : ''}" data-amount="custom">
          Custom
        </button>
      </div>

      <div class="donate-custom" id="donate-custom" ${selectedAmount === 'custom' ? '' : 'hidden'}>
        <label class="form-label" for="donate-custom-input">Custom amount (${esc(CreatorFoundationsStore.getCurrency())})</label>
        <input class="form-input" id="donate-custom-input" type="number" min="1" step="0.01" inputmode="decimal" placeholder="Enter amount" value="${esc(customAmount)}">
      </div>

      <p class="donate-modal__label">Payment method</p>
      <div class="donate-payments" role="radiogroup" aria-label="Payment method">
        ${PAYMENT_METHODS.map((m) => `
          <label class="donate-payment${selectedPayment === m.id ? ' is-selected' : ''}">
            <input type="radio" name="donate-payment" value="${m.id}" ${selectedPayment === m.id ? 'checked' : ''}>
            <span>${esc(m.label)}</span>
          </label>
        `).join('')}
      </div>

      <p class="donate-modal__note">
        A ${CreatorFoundationsStore.getPlatform().feePercent || 10}% platform fee helps keep World Choir and Creator Foundations working.
        Payments are not live yet — this flow is a preview only. Simulated gifts never appear as real supporter totals or funding progress.
      </p>

      <div class="actions-row donate-modal__actions">
        <button class="btn btn-primary" type="button" id="donate-confirm-btn">Continue</button>
        <button class="btn btn-secondary" type="button" id="donate-cancel-btn">Cancel</button>
      </div>
    `;
  }

  function openDonateModal(foundation, project) {
    if (!foundation.donationsEnabled) {
      alert('Donations for this foundation are temporarily unavailable.');
      return;
    }
    if (typeof WorldChoirDonationFlow !== 'undefined' && WorldChoirDonationFlow.start) {
      WorldChoirDonationFlow.start(foundation, project || null);
      return;
    }
    alert('Donation flow is temporarily unavailable. Please refresh and try again.');
  }

  function bindModalEvents() {
    document.getElementById('donate-cancel-btn')?.addEventListener('click', closeModal);

    document.querySelectorAll('.donate-amount').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-amount');
        selectedAmount = raw === 'custom' ? 'custom' : Number(raw);
        document.getElementById('donate-modal-body').innerHTML = renderModalBody(selectedFoundation, selectedProject);
        bindModalEvents();
        if (selectedAmount === 'custom') document.getElementById('donate-custom-input')?.focus();
      });
    });

    document.getElementById('donate-custom-input')?.addEventListener('input', (e) => {
      customAmount = e.target.value;
    });

    document.querySelectorAll('input[name="donate-payment"]').forEach((input) => {
      input.addEventListener('change', () => {
        selectedPayment = input.value;
        document.querySelectorAll('.donate-payment').forEach((el) => {
          el.classList.toggle('is-selected', el.querySelector('input')?.value === selectedPayment);
        });
      });
    });

    document.getElementById('donate-confirm-btn')?.addEventListener('click', submitDonation);
  }

  function closeModal() {
    const overlay = document.getElementById('donate-modal-overlay');
    overlay?.classList.remove('active');
    overlay?.setAttribute('aria-hidden', 'true');
  }

  async function submitDonation() {
    if (isSubmitting || !selectedFoundation) return;
    const amount = getChosenAmount();
    if (!amount) {
      alert('Please enter a valid donation amount.');
      return;
    }

    isSubmitting = true;
    const btn = document.getElementById('donate-confirm-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processing…';
    }

    try {
      await mockProcessPayment({
        foundationId: selectedFoundation.id,
        projectId: selectedProject?.id || null,
        amount,
        currency: CreatorFoundationsStore.getCurrency(),
        method: selectedPayment,
      });

      CreatorFoundationsStore.UserSupport.recordDonation({
        foundationId: selectedFoundation.id,
        projectId: selectedProject?.id || null,
        amount,
        currency: CreatorFoundationsStore.getCurrency(),
      });

      closeModal();
      showConfirmation(selectedFoundation, amount);
    } catch (err) {
      alert(err.message || 'Payment could not be completed. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Continue';
      }
    } finally {
      isSubmitting = false;
    }
  }

  function mockProcessPayment(payload) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!navigator.onLine) {
          reject(new Error('You appear to be offline. Please check your connection and try again.'));
          return;
        }
        if (!payload.amount || payload.amount <= 0) {
          reject(new Error('Invalid donation amount.'));
          return;
        }
        resolve({ ok: true, mock: true, ...payload });
      }, 700);
    });
  }

  function showConfirmation(foundation, amount) {
    const firstName = (foundation.creatorName || 'this creator').split(' ')[0];
    const root = document.getElementById('donate-content');
    root.innerHTML = `
      <div class="df-confirm df-rise">
        <h1 class="df-confirm__title">Thank you for supporting ${esc(firstName)}'s mission.</h1>
        <p class="df-confirm__copy">
          Your generosity helps transform compassion into action.
          You'll be able to follow the progress of the projects you helped make possible.
        </p>
        <p class="df-confirm__meta">${formatMoney(amount)} · ${esc(foundation.foundationName)}</p>
        <p class="df-confirm__note">
          Preview only — this gift was not charged and is not counted in public totals until real payments are connected.
        </p>
        <button class="df-btn-primary" type="button" id="donate-confirm-return">
          Return to Foundation
        </button>
      </div>
    `;

    document.getElementById('donate-confirm-return')?.addEventListener('click', () => {
      openProfile(foundation);
    });
  }

  function renderPendingFoundations() {
    return `
      <section class="df-foundations" aria-hidden="true">
        <p class="df-section-label">Foundations</p>
        <ul class="df-fcards">
          ${[0, 1, 2].map(() => `
            <li>
              <div class="df-fcard df-fcard--pending">
                <span class="df-fcard__media df-fcard__media--pending" aria-hidden="true"></span>
                <span class="df-fcard__body">
                  <span class="df-pending-line df-pending-line--title"></span>
                  <span class="df-pending-line df-pending-line--meta"></span>
                  <span class="df-pending-line df-pending-line--copy"></span>
                </span>
              </div>
            </li>
          `).join('')}
        </ul>
      </section>
    `;
  }

  // ─── Donate header realistic Earth (Three.js) ───
  // Must be slow, subtle, and respect reduced motion. We render only inside the header container.
  let donateEarth3D = {
    threeLoaded: false,
    loadingPromise: null,
    running: false,
    rafId: 0,
    resizeHandler: null,
    renderer: null,
    scene: null,
    camera: null,
    earth: null,
    clouds: null,
    atmosphere: null,
    network: null,
    container: null,
    reducedMotion: false,
    startedAt: 0,
    light: null,
    disposeFns: [],
  };

  function donateEnsureThree() {
    if (donateEarth3D.threeLoaded && window.THREE) return Promise.resolve(window.THREE);
    if (donateEarth3D.loadingPromise) return donateEarth3D.loadingPromise;

    donateEarth3D.loadingPromise = new Promise((resolve, reject) => {
      try {
        if (window.THREE) {
          donateEarth3D.threeLoaded = true;
          resolve(window.THREE);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/three@0.164.1/build/three.min.js';
        script.async = true;
        script.onload = () => {
          donateEarth3D.threeLoaded = true;
          resolve(window.THREE);
        };
        script.onerror = () => reject(new Error('Failed to load Three.js'));
        document.head.appendChild(script);
      } catch (e) {
        reject(e);
      }
    });

    return donateEarth3D.loadingPromise;
  }

  function donateDisposeEarth3D() {
    donateEarth3D.running = false;
    if (donateEarth3D.rafId) cancelAnimationFrame(donateEarth3D.rafId);
    donateEarth3D.rafId = 0;

    if (donateEarth3D.resizeHandler) {
      window.removeEventListener('resize', donateEarth3D.resizeHandler);
      donateEarth3D.resizeHandler = null;
    }

    // Dispose textures / geometry / materials when possible.
    try {
      if (donateEarth3D.scene) {
        donateEarth3D.scene.traverse((obj) => {
          if (!obj) return;
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose?.());
            } else {
              obj.material.dispose?.();
            }
          }
        });
      }
    } catch {
      /* ignore */
    }

    donateEarth3D.disposeFns.forEach((fn) => {
      try { fn?.(); } catch { /* ignore */ }
    });
    donateEarth3D.disposeFns = [];

    if (donateEarth3D.renderer) {
      try { donateEarth3D.renderer.dispose?.(); } catch { /* ignore */ }
    }

    if (donateEarth3D.container) {
      try {
        while (donateEarth3D.container.firstChild) donateEarth3D.container.removeChild(donateEarth3D.container.firstChild);
      } catch {
        /* ignore */
      }
    }

    donateEarth3D.renderer = null;
    donateEarth3D.scene = null;
    donateEarth3D.camera = null;
    donateEarth3D.earth = null;
    donateEarth3D.clouds = null;
    donateEarth3D.atmosphere = null;
    donateEarth3D.network = null;
    donateEarth3D.light = null;
    donateEarth3D.startedAt = 0;
  }

  function donatePrefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  async function mountDonateEarth3D() {
    const container = document.getElementById('df-donate-earth-container');
    if (!container) return;

    // Restart if we re-render the header.
    if (donateEarth3D.running) donateDisposeEarth3D();

    donateEarth3D.container = container;
    donateEarth3D.reducedMotion = donatePrefersReducedMotion();

    const THREE = await donateEnsureThree();
    if (!container || !THREE) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    camera.position.z = 3.35;

    const light = new THREE.DirectionalLight(0xffffff, 1.15);
    light.position.set(-2.2, 1.35, 2.3);
    scene.add(light);
    donateEarth3D.light = light;

    // Earth textures — use the same texture set from Three.js examples.
    // Note: We keep blend logic in shader to get a realistic day/night split.
    const texBase = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/';
    const loader = new THREE.TextureLoader();

    const dayMap = await new Promise((resolve) => loader.load(texBase + 'earth_day_4096.jpg', resolve));
    const nightMap = await new Promise((resolve) => loader.load(texBase + 'earth_night_4096.jpg', resolve));
    const normalMap = await new Promise((resolve) => loader.load(texBase + 'earth_normal_2048.jpg', resolve));
    const cloudMap = await new Promise((resolve) => loader.load(texBase + 'earth_clouds_2048.png', resolve));
    const atmosMap = await new Promise((resolve) => loader.load(texBase + 'earth_atmos_2048.jpg', resolve));

    dayMap.colorSpace = THREE.SRGBColorSpace;
    nightMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    atmosMap.colorSpace = THREE.SRGBColorSpace;

    const sphere = new THREE.SphereGeometry(1, 72, 72);

    const uniforms = {
      uDayMap: { value: dayMap },
      uNightMap: { value: nightMap },
      uNormalMap: { value: normalMap },
      uLightDir: { value: light.position.clone().normalize() },
    };

    const earthMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
          vViewDir = viewDir;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying vec3 vNormal;

        uniform sampler2D uDayMap;
        uniform sampler2D uNightMap;
        uniform vec3 uLightDir;

        void main() {
          vec3 n = normalize(vNormal);
          float ndl = max(dot(n, normalize(uLightDir)), 0.0);
          // Blend around terminator: keep night visible but realistic.
          float mixAmt = smoothstep(0.0, 0.30, ndl);

          vec3 day = texture2D(uDayMap, vUv).rgb;
          vec3 night = texture2D(uNightMap, vUv).rgb;

          vec3 color = mix(night, day, mixAmt);

          // Subtle atmospheric haze at edges.
          float rim = pow(1.0 - ndl, 2.2);
          color += vec3(0.02, 0.08, 0.18) * rim;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const earth = new THREE.Mesh(sphere, earthMat);
    scene.add(earth);

    // Clouds (very low opacity, rotates slightly slower).
    const cloudGeo = new THREE.SphereGeometry(1.01, 72, 72);
    const cloudsMat = new THREE.MeshLambertMaterial({
      map: cloudMap,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudsMat);
    scene.add(clouds);

    // Atmosphere rim — additive & back side.
    const atmosGeo = new THREE.SphereGeometry(1.08, 72, 72);
    const atmosMat = new THREE.MeshBasicMaterial({
      map: atmosMap,
      transparent: true,
      opacity: 0.14,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);

    // Subtle network points (few, low opacity).
    const network = new THREE.Group();
    scene.add(network);
    const pointCount = 10;
    for (let i = 0; i < pointCount; i += 1) {
      const a = (i / pointCount) * Math.PI * 2;
      const b = ((i * 9301) % 100) / 100 * Math.PI - Math.PI / 2;
      const cl = Math.cos(b);
      const pos = new THREE.Vector3(cl * Math.sin(a), Math.sin(b), cl * Math.cos(a)).multiplyScalar(1.01);
      const g = new THREE.SphereGeometry(0.012, 8, 8);
      const m = new THREE.MeshBasicMaterial({ color: 0x4ec5e8, transparent: true, opacity: 0.22 });
      const s = new THREE.Mesh(g, m);
      s.position.copy(pos);
      network.add(s);
    }

    donateEarth3D.renderer = renderer;
    donateEarth3D.scene = scene;
    donateEarth3D.camera = camera;
    donateEarth3D.earth = earth;
    donateEarth3D.clouds = clouds;
    donateEarth3D.atmosphere = atmosphere;
    donateEarth3D.network = network;
    donateEarth3D.running = true;

    let disposed = false;
    const resize = () => {
      if (disposed) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    donateEarth3D.resizeHandler = resize;
    window.addEventListener('resize', resize, { passive: true });

    const animate = () => {
      if (disposed || !donateEarth3D.running) return;
      const now = performance.now();
      const t = (now - donateEarth3D.startedAt) / 60000; // ~60s per rotation feels calm
      const rot = t * Math.PI * 2;

      // Rotate planet.
      earth.rotation.y = rot;
      clouds.rotation.y = rot * 0.98;

      uniforms.uLightDir.value.copy(light.position).normalize();

      renderer.render(scene, camera);
      donateEarth3D.rafId = requestAnimationFrame(animate);
    };

    donateEarth3D.startedAt = performance.now();
    if (donateEarth3D.reducedMotion) {
      earth.rotation.y = 0;
      clouds.rotation.y = 0;
      uniforms.uLightDir.value.copy(light.position).normalize();
      renderer.render(scene, camera);
      donateEarth3D.running = false;
      cancelAnimationFrame(donateEarth3D.rafId);
    } else {
      donateEarth3D.rafId = requestAnimationFrame(animate);
    }

    donateEarth3D.disposeFns.push(() => {
      disposed = true;
      donateEarth3D.running = false;
    });
  }

  function stopDonateEarth3D() {
    donateDisposeEarth3D();
  }

  /** Paint the Donate chrome instantly — never show a loading message. */
  function renderHomeShell() {
    const root = document.getElementById('donate-content');
    if (!root) return;
    root.innerHTML = `
      ${renderTopbar()}
      ${renderIntro()}
      ${renderDiscoveryChrome()}
      <div id="df-foundations-mount">${renderPendingFoundations()}</div>
    `;
    bindHomeEvents();
    mountDonateEarth3D();
  }

  function renderError(message) {
    document.getElementById('donate-content').innerHTML = `
      <div class="df-state">
        <p class="df-state__title">Something went quiet</p>
        <p class="df-state__copy">${esc(message || 'Could not load Creator Foundations. Please try again.')}</p>
        <div style="margin-top:22px">
          <button class="df-featured__cta" type="button" id="donate-retry">Try again</button>
        </div>
      </div>
    `;
    document.getElementById('donate-retry')?.addEventListener('click', init);
  }

  function applyDeepLinkCause() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const raw = String(params.get('cause') || '').trim();
      if (!raw) return;
      const match = CAUSE_FILTERS.find((f) => f.id.toLowerCase() === raw.toLowerCase());
      if (match && match.id !== 'all') {
        selectedCause = match.id;
      }
    } catch {
      /* ignore malformed query */
    }
  }

  function applyDeepLinkFoundation() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const raw = String(params.get('foundation') || '').trim().toLowerCase();
      if (!raw) return false;
      const list = getAllFoundations();
      const found = list.find((f) =>
        String(f.slug || '').toLowerCase() === raw
        || String(f.id || '').toLowerCase() === raw
      );
      if (found) {
        openProfile(found);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function init() {
    WorldChoirNav.startWatcher('donate');
    ensureModal();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchOpen) closeSearch();
    });
    applyDeepLinkCause();
    renderHomeShell();

    try {
      await CreatorFoundationsStore.ready();
      applyDeepLinkCause();
      const resumed = typeof WorldChoirDonationFlow !== 'undefined'
        && await WorldChoirDonationFlow.resumeFromQuery?.();
      if (!resumed && !applyDeepLinkFoundation()) {
        renderHome();
      }
    } catch (err) {
      console.error('Creator Foundations init failed:', err);
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      renderError(offline
        ? 'You appear to be offline. Please reconnect and try again.'
        : (err.message || 'Could not load Creator Foundations.'));
    }
  }

  return { init };
})();
