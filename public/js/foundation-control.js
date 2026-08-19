/**
 * Foundation Control Center — Creator Foundation headquarters.
 * Data from /api/members?action=... only. Never invents metrics.
 */
const FoundationControl = (() => {
  const API = '/api/members';
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'foundation', label: 'Foundation' },
    { id: 'donations', label: 'Donations' },
    { id: 'community', label: 'Community' },
    { id: 'settings', label: 'Settings' },
  ];
  const RETIRED_SECTIONS = new Set(['projects', 'insights', 'updates']);
  const FOUNDATION_TABS = new Set(['page', 'card', 'information']);
  const FOUNDATION_CAUSES = ['Food & Hunger', 'Health', 'Education', 'Humanitarian Aid', 'Environment'];
  const COUNTRIES = [
    'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria', 'Belgium',
    'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Croatia', 'Czech Republic',
    'Denmark', 'Egypt', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
    'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Kenya',
    'Mexico', 'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway',
    'Philippines', 'Poland', 'Portugal', 'Romania', 'Russia', 'Saudi Arabia',
    'Singapore', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland',
    'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom',
    'United States', 'Vietnam',
  ];
  const CAUSE_DETAILS = {
    'Food & Hunger': {
      icon: 'food',
      description: 'Nourishing people and communities facing scarcity.',
    },
    Health: {
      icon: 'health',
      description: 'Supporting care, healing, and wellbeing.',
    },
    Education: {
      icon: 'education',
      description: 'Opening doors to learning and opportunity.',
    },
    'Humanitarian Aid': {
      icon: 'aid',
      description: 'Providing immediate relief and long-term support to communities in need.',
    },
    Environment: {
      icon: 'env',
      description: 'Protecting the living world we share.',
    },
  };
  const WORLD_CHOIR_LOGO = 'images/world-choir-logo.png?v=20270706';
  // This is the global Foundation Overview hero background used for every Foundation Control Center.
  // Replace public/images/foundation/foundation-overview-hero-background.png to update every Overview.
  const OVERVIEW_HERO_BACKGROUND = 'images/foundation/foundation-overview-hero-background.png?v=20260819b';

  const RANGES = [
    { id: 'all', label: 'All time' },
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: '90d', label: '90 days' },
    { id: '1y', label: '1 year' },
  ];

  let state = {
    authenticated: false,
    email: null,
    influencer: null,
    data: null,
    section: 'overview',
    range: 'all',
    flash: null,
    error: null,
    busy: false,
    searchOpen: false,
    searchQuery: '',
    searchResults: null,
    mapOpen: false,
    navOpen: false,
    activityFilter: 'all',
    growthMetric: 'amount',
    foundationTab: 'page',
    foundationDirty: false,
    foundationForm: null,
    uploadingField: null,
    drill: null,
    settingsTab: 'foundation',
  };

  const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

  function applyRoute() {
    const parts = String(window.location.hash || '').replace(/^#/, '').split('/').filter(Boolean);
    if (!parts.length) return;
    if (RETIRED_SECTIONS.has(parts[0])) {
      state.section = 'overview';
      return;
    }
    if (!SECTION_IDS.has(parts[0])) return;
    state.section = parts[0];
    if (parts[1] && parts[0] === 'settings') state.settingsTab = parts[1];
    if (parts[1] && parts[0] === 'foundation') {
      state.foundationTab = FOUNDATION_TABS.has(parts[1]) ? parts[1] : 'page';
    }
  }

  function syncRoute() {
    if (!state.authenticated) return;
    const parts = [state.section || 'overview'];
    if (state.section === 'settings' && state.settingsTab && state.settingsTab !== 'foundation') {
      parts.push(state.settingsTab);
    } else if (state.section === 'foundation' && state.foundationTab && state.foundationTab !== 'page') {
      parts.push(state.foundationTab);
    }
    const hash = parts[0] === 'overview' && parts.length === 1 ? '' : `#${parts.join('/')}`;
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (url === cur) return;
    window.history.replaceState(null, '', url);
  }

  const root = () => document.getElementById('members-root');

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(amount, currency = 'EUR') {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'EUR',
        maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      }).format(n);
    } catch {
      return `${n} ${currency || 'EUR'}`;
    }
  }

  function num(n) {
    if (n == null || !Number.isFinite(Number(n))) return '0';
    return Number(n).toLocaleString('en-US');
  }

  function when(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  }

  function emptyNote(msg) {
    return `<p class="fcc-empty">${esc(msg || 'Not enough data yet')}</p>`;
  }

  async function api(action, { method = 'GET', body, query = '' } = {}) {
    const res = await fetch(`${API}?action=${encodeURIComponent(action)}${query}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function setFlash(message, type = 'ok') {
    state.flash = message ? { message, type } : null;
  }

  function flashHtml() {
    if (!state.flash) return '';
    return `<div class="fcc-flash is-${esc(state.flash.type)}" role="status">${esc(state.flash.message)}</div>`;
  }

  function currency() {
    return state.data?.currency || 'EUR';
  }

  function can(perm) {
    return !!(state.data?.permissions && state.data.permissions[perm]);
  }

  function pickFilled(...values) {
    for (const value of values) {
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return '';
  }

  function syncFoundationForm(from) {
    const f = from || state.data?.foundation || {};
    const drafts = state.data?.drafts || {};
    const page = drafts.page || {};
    const card = drafts.card || {};
    const liveSocial = f.socialLinks && typeof f.socialLinks === 'object' ? f.socialLinks : {};
    const draftSocial = page.socialLinks && typeof page.socialLinks === 'object' ? page.socialLinks : {};
    state.foundationForm = {
      foundationName: pickFilled(page.foundationName, f.name, f.foundationName),
      creatorName: pickFilled(page.creatorName, f.creatorName),
      country: pickFilled(page.country, f.country),
      category: (() => {
        const raw = pickFilled(page.category, f.category, f.primaryCategory);
        const aliases = {
          'humanity help': 'Humanitarian Aid',
          humanitarian: 'Humanitarian Aid',
          food: 'Food & Hunger',
          hunger: 'Food & Hunger',
          climate: 'Environment',
          nature: 'Environment',
        };
        const lower = String(raw).trim().toLowerCase();
        if (aliases[lower]) return aliases[lower];
        const causes = ['Food & Hunger', 'Health', 'Education', 'Humanitarian Aid', 'Environment'];
        return causes.find((c) => c.toLowerCase() === lower) || raw;
      })(),
      mission: pickFilled(page.mission, f.mission),
      biography: pickFilled(page.biography, f.biography),
      whyStarted: pickFilled(page.whyStarted, f.whyStarted),
      howItWorks: pickFilled(page.howItWorks, f.howItWorks),
      shortDescription: pickFilled(page.shortDescription, f.shortDescription),
      story: pickFilled(page.story, f.story),
      website: pickFilled(page.website, f.website),
      profileImage: pickFilled(page.profileImage, f.profileImage),
      coverImage: pickFilled(page.coverImage, f.coverImage),
      cardShortMission: pickFilled(card.cardShortMission, f.cardShortMission, f.mission),
      socialLinks: {
        instagram: pickFilled(draftSocial.instagram, liveSocial.instagram),
        youtube: pickFilled(draftSocial.youtube, liveSocial.youtube),
        x: pickFilled(draftSocial.x, liveSocial.x, liveSocial.twitter),
        tiktok: pickFilled(draftSocial.tiktok, liveSocial.tiktok),
      },
    };
    state.foundationDirty = false;
  }

  function exportCsv(filename, rows, columns) {
    if (!rows || !rows.length) {
      setFlash('No data to export yet', 'err');
      render();
      return;
    }
    const header = columns.map((c) => c.label).join(',');
    const lines = rows.map((row) => columns.map((c) => {
      const raw = c.value(row);
      const s = String(raw ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── Login ─── */

  function renderLogin() {
    destroyMap();
    root().innerHTML = `
      <div class="fcc-login">
        <img class="fcc-login__logo" src="${WORLD_CHOIR_LOGO}" alt="World Choir">
        <p class="fcc-kicker">Creator Foundations</p>
        <h1>Influencer login</h1>
        <p class="fcc-login__sub">
          Sign in with the email and password your Owner set when creating your Creator Foundation.
        </p>
        ${state.error ? `<div class="fcc-flash is-err">${esc(state.error)}</div>` : ''}
        ${flashHtml()}
        <form class="fcc-form" id="fcc-login-form" autocomplete="on">
          <div class="fcc-field">
            <label for="fcc-email">Email</label>
            <input id="fcc-email" name="email" type="email" required autocomplete="username">
          </div>
          <div class="fcc-field">
            <label for="fcc-password">Password</label>
            <input id="fcc-password" name="password" type="password" required autocomplete="current-password">
          </div>
          <div class="fcc-form-actions">
            <button class="fcc-btn" type="submit" ${state.busy ? 'disabled' : ''}>
              ${state.busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    `;
    document.getElementById('fcc-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.busy = true;
      state.error = null;
      render();
      try {
        const data = await api('login', {
          method: 'POST',
          body: { email: fd.get('email'), password: fd.get('password') },
        });
        state.authenticated = true;
        state.email = data.influencer?.email || fd.get('email');
        state.influencer = data.influencer || null;
        await loadCenter();
      } catch (err) {
        state.error = err.message || 'Sign in failed';
        state.busy = false;
        render();
      }
    });
  }

  async function loadCenter() {
    state.busy = true;
    try {
      state.data = await api('control-center', { query: `&range=${encodeURIComponent(state.range)}` });
      if (!state.foundationForm) syncFoundationForm();
      state.error = null;
    } catch (err) {
      if (err.status === 401) {
        state.authenticated = false;
        state.data = null;
        state.error = 'Session expired. Please sign in again.';
      } else {
        state.error = err.message || 'Failed to load control center';
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  async function logout() {
    try { await api('logout', { method: 'POST' }); } catch { /* ignore */ }
    destroyMap();
    state = {
      ...state,
      authenticated: false,
      email: null,
      influencer: null,
      data: null,
      foundationForm: null,
      foundationDirty: false,
      uploadingField: null,
      searchOpen: false,
      mapOpen: false,
      flash: null,
      error: null,
      busy: false,
    };
    render();
  }

  /* ─── Shell ─── */

  function renderShell(content) {
    const f = state.data?.foundation || {};
    const navOpen = state.navOpen;
    return `
      <div class="fcc-shell ${navOpen ? 'is-nav-open' : ''}">
        <div class="fcc-nav-backdrop" data-action="close-nav" aria-hidden="${navOpen ? 'false' : 'true'}"></div>
        <aside class="fcc-nav" id="fcc-nav" aria-label="Foundation sections">
          <div class="fcc-nav__mobile-head">
            <p class="fcc-nav__brand">World Choir</p>
            <button type="button" class="fcc-icon-btn" data-action="close-nav" aria-label="Close menu">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
          <div class="fcc-nav__brand-block">
            <img class="fcc-nav__logo" src="${WORLD_CHOIR_LOGO}" alt="World Choir" width="1024" height="1024" decoding="async">
            <p class="fcc-nav__title">Foundation Control Center</p>
            <p class="fcc-nav__foundation">${esc(f.name || 'Your Foundation')}</p>
          </div>
          <ul class="fcc-nav__list">
            ${SECTIONS.map((s) => `
              <li>
                <button type="button" class="fcc-nav__btn ${state.section === s.id ? 'is-active' : ''}"
                  data-nav="${esc(s.id)}">${esc(s.label)}</button>
              </li>
            `).join('')}
          </ul>
          <div class="fcc-nav__foot">
            <button type="button" class="fcc-btn-ghost" data-action="open-search">Search</button>
            <button type="button" class="fcc-btn-ghost" data-action="logout">Sign out</button>
          </div>
        </aside>
        <div class="fcc-main">
          <header class="fcc-mobile-bar">
            <button type="button" class="fcc-icon-btn" data-action="open-nav" aria-label="Open menu" aria-expanded="${navOpen}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
            <div class="fcc-mobile-bar__identity">
              <p class="fcc-mobile-bar__kicker">Foundation Control Center</p>
              <p class="fcc-mobile-bar__name">${esc(f.name || 'Your Foundation')}</p>
            </div>
            <div class="fcc-mobile-bar__actions">
              <button type="button" class="fcc-icon-btn" data-action="open-search" aria-label="Search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
              </button>
            </div>
          </header>
          <div class="fcc-top">
            <div>
              <p class="fcc-kicker">Foundation</p>
              <h1 class="fcc-h1">${esc(sectionTitle())}</h1>
              <p class="fcc-sub">${esc(sectionSub())}</p>
            </div>
            <div class="fcc-actions">
              <select class="fcc-range" id="fcc-range" aria-label="Date range">
                ${RANGES.map((r) => `
                  <option value="${esc(r.id)}" ${state.range === r.id ? 'selected' : ''}>${esc(r.label)}</option>
                `).join('')}
              </select>
              <button type="button" class="fcc-icon-btn fcc-desk-only" data-action="open-search" aria-label="Search" title="Search (⌘K)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
              </button>
            </div>
          </div>
          ${flashHtml()}
          ${state.error ? `<div class="fcc-flash is-err">${esc(state.error)}</div>` : ''}
          ${content}
        </div>
      </div>
      ${renderSearchOverlay()}
      ${renderMapDrawer()}
    `;
  }

  function sectionTitle() {
    return SECTIONS.find((s) => s.id === state.section)?.label || 'Overview';
  }

  function sectionSub() {
    const f = state.data?.foundation?.name || 'your Foundation';
    const map = {
      overview: `Command view for ${f}.`,
      foundation: "Shape your foundation's story and public profile.",
      donations: 'Verified donations for this Foundation only.',
      community: 'Supporters and where they gather.',
      settings: 'Foundation, team, financial, and security.',
    };
    return map[state.section] || '';
  }

  function go(section, opts = {}) {
    state.section = SECTION_IDS.has(section) ? section : 'overview';
    state.navOpen = false;
    if (opts.drill !== undefined) state.drill = opts.drill;
    if (opts.foundationTab) {
      state.foundationTab = FOUNDATION_TABS.has(opts.foundationTab) ? opts.foundationTab : 'page';
    }
    if (opts.settingsTab) state.settingsTab = opts.settingsTab;
    if (!opts.keepMap) state.mapOpen = false;
    state.flash = null;
    render();
  }

  /* ─── Charts / metrics ─── */

  function renderChart(series = [], valueKey = 'value') {
    if (!series.length) return emptyNote('Not enough data yet');
    const last = series.slice(-48);
    const max = Math.max(...last.map((s) => Number(s[valueKey] ?? s.amount ?? 0)), 0);
    if (max <= 0) return emptyNote('Not enough data yet');
    return `
      <div class="fcc-chart" aria-label="Timeline chart">
        ${last.map((s) => {
          const v = Number(s[valueKey] ?? s.amount ?? 0);
          const h = Math.max(4, (v / max) * 100);
          const tip = `${s.date}: ${valueKey === 'amount' || valueKey === 'value' ? money(v, currency()) : num(v)}`;
          return `<div class="fcc-chart__bar" title="${esc(tip)}" style="height:${h}%"></div>`;
        }).join('')}
      </div>
    `;
  }

  function metricBtn(value, label, section, extra = '') {
    return `
      <button type="button" class="fcc-link-metric" data-nav="${esc(section)}">
        <span>
          <span class="fcc-link-metric__value">${esc(value)}</span>
          <span class="fcc-link-metric__label">${esc(label)}</span>
        </span>
        <span class="fcc-link-metric__label">${esc(extra || 'Open')}</span>
      </button>
    `;
  }

  function renderRaisedSparkline(series = []) {
    const amounts = (series || [])
      .map((s) => Number(s.amount ?? s.value ?? 0))
      .filter((n) => Number.isFinite(n));
    if (amounts.length < 2) return '';
    let running = 0;
    const cumulative = amounts.map((n) => {
      running += Math.max(0, n);
      return running;
    });
    const max = Math.max(...cumulative);
    if (max <= 0) return '';

    const w = 360;
    const h = 64;
    const padX = 4;
    const padY = 6;
    const lastX = cumulative.length - 1;
    const coords = cumulative.map((v, i) => {
      const x = padX + (i / lastX) * (w - padX * 2);
      const y = h - padY - (v / max) * (h - padY * 2);
      return [x, y];
    });
    const line = coords
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${h} L${coords[0][0].toFixed(1)} ${h} Z`;
    const [endX, endY] = coords[coords.length - 1];

    return `
      <svg class="fcc-ov-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Verified donation history for the selected range">
        <path class="fcc-ov-spark__area" d="${area}"></path>
        <path class="fcc-ov-spark__line" d="${line}" fill="none"></path>
        <circle class="fcc-ov-spark__dot" cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="3.2"></circle>
      </svg>
    `;
  }

  function overviewViewBtn(section, label) {
    return `
      <button type="button" class="fcc-ov-view" data-nav="${esc(section)}" aria-label="View ${esc(label)}">
        View
      </button>
    `;
  }

  function overviewStat(value, label, copy, section) {
    return `
      <div class="fcc-ov-stat">
        <div class="fcc-ov-stat__top">
          <p class="fcc-ov-stat__value">${esc(value)}</p>
          ${overviewViewBtn(section, label)}
        </div>
        <p class="fcc-ov-stat__label">${esc(label)}</p>
        <p class="fcc-ov-stat__copy">${esc(copy)}</p>
      </div>
    `;
  }

  /* ─── Overview ─── */

  function renderOverview() {
    const d = state.data || {};
    const o = d.overview || {};
    const f = d.foundation || {};
    const growth = d.growth || {};
    const series = (growth.series && growth.series.amount) || [];
    const name = f.name || 'Your Foundation';
    const founder = f.creatorName || '';
    const country = f.country || '';
    const mission = pickFilled(f.mission, f.cardShortMission, f.shortDescription);
    const cover = String(f.coverImage || '').trim();
    const raised = o.rangedRaised != null ? o.rangedRaised : (o.totalRaised || 0);
    const supporters = o.rangedSupporters != null ? o.rangedSupporters : (o.totalSupporters || 0);
    const countries = o.countriesReached || 0;
    const cities = o.citiesReached || 0;
    const spark = renderRaisedSparkline(series);
    const foundedBits = [
      founder ? `Founded by ${founder}` : '',
      country,
    ].filter(Boolean);
    const initial = (name || 'F').trim().charAt(0).toUpperCase() || 'F';

    return `
      <section class="fcc-ov" aria-label="Foundation overview">
        <article class="fcc-ov-hero">
          <div
            class="fcc-ov-hero__bg"
            aria-hidden="true"
            style="background-image: url('${esc(OVERVIEW_HERO_BACKGROUND)}')"
          ></div>
          <div class="fcc-ov-hero__shade" aria-hidden="true"></div>
          <div class="fcc-ov-hero__body">
            <p class="fcc-kicker">Foundation Control Center</p>
            <h2 class="fcc-ov-hero__name">${esc(name)}</h2>
            ${foundedBits.length ? `<p class="fcc-ov-hero__byline">${esc(foundedBits.join(' · '))}</p>` : ''}
            ${mission ? `<p class="fcc-ov-hero__mission">${esc(mission)}</p>` : ''}
          </div>
          <div class="fcc-ov-hero__mark ${cover ? '' : 'is-fallback'}">
            <span class="fcc-ov-hero__fallback" aria-hidden="true">${esc(initial)}</span>
            ${cover ? `
              <img
                class="fcc-ov-hero__photo"
                src="${esc(cover)}"
                alt="${esc(name)} cover image"
                width="320"
                height="320"
                decoding="async"
              >
            ` : ''}
          </div>
        </article>

        <div class="fcc-ov-grid">
          <article class="fcc-ov-card fcc-ov-raised">
            <div class="fcc-ov-card__head">
              <p class="fcc-ov-card__kicker">Total raised</p>
              ${overviewViewBtn('donations', 'Total raised')}
            </div>
            <p class="fcc-ov-raised__value">${esc(money(raised, currency()))}</p>
            ${spark || '<p class="fcc-ov-raised__empty">Donation history will appear here as verified gifts are recorded.</p>'}
          </article>

          <article class="fcc-ov-card fcc-ov-audience" aria-label="Audience">
            <div class="fcc-ov-audience__primary">
              ${overviewStat(num(supporters), 'Supporters', 'People supporting your foundation', 'community')}
            </div>
            <div class="fcc-ov-audience__split">
              ${overviewStat(num(countries), 'Countries', 'Countries represented', 'donations')}
              ${overviewStat(num(cities), 'Cities', 'Cities represented', 'donations')}
            </div>
          </article>
        </div>

        <article class="fcc-ov-thanks">
          <div class="fcc-ov-thanks__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 11c0 5.5-7 10-7 10z"/>
            </svg>
          </div>
          <div class="fcc-ov-thanks__copy">
            <h2>Thank you for being part of World Choir</h2>
            <p>Your foundation is part of a global movement of love and unity.</p>
            <p>Together, we create a world where every voice matters.</p>
          </div>
        </article>
      </section>
    `;
  }

  /* ─── Foundation editor ─── */

  function causeIconSvg(kind) {
    const common = 'viewBox="0 0 24 24" aria-hidden="true"';
    const icons = {
      food: `<svg ${common}><path d="M8 3v8a4 4 0 008 0V3"/><path d="M12 11v10" stroke-linecap="round"/></svg>`,
      health: `<svg ${common}><path d="M12 21s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 11c0 5.5-7 10-7 10z"/></svg>`,
      education: `<svg ${common}><path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 12v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5"/></svg>`,
      aid: `<svg ${common}><path d="M12 3v18M3 12h18" stroke-linecap="round"/><circle cx="12" cy="12" r="8"/></svg>`,
      env: `<svg ${common}><path d="M12 21c4-4 6-7.5 6-11a6 6 0 10-12 0c0 3.5 2 7 6 11z"/><path d="M12 10v4" stroke-linecap="round"/></svg>`,
    };
    return icons[kind] || icons.aid;
  }

  function countryOptions(current) {
    const list = COUNTRIES.slice();
    const value = String(current || '').trim();
    if (value && !list.includes(value)) list.unshift(value);
    return list;
  }

  function previewFoundation() {
    const form = state.foundationForm || {};
    const persisted = state.data?.foundation || {};
    const overview = state.data?.overview || {};
    const donations = state.data?.donations || {};
    const category = form.category || persisted.category || persisted.primaryCategory || '';
    const totalRaised = Number(overview.totalRaised ?? donations.totalRaised ?? 0);
    const uniqueSupporters = Number(overview.totalSupporters ?? donations.totalSupporters ?? 0);
    return {
      id: persisted.id,
      foundationName: form.foundationName,
      creatorName: form.creatorName,
      country: form.country,
      mission: form.mission,
      primaryCategory: category,
      categories: category ? [category] : [],
      coverImage: form.coverImage,
      profileImage: form.profileImage,
      totalRaised,
      uniqueSupporters,
      raisedKnown: totalRaised > 0,
      activeProjectCount: 0,
      currency: state.data?.currency || 'EUR',
    };
  }

  function renderLivePreviewCard() {
    if (typeof FoundationPublicCard === 'undefined') return '';
    return FoundationPublicCard.render(previewFoundation(), {
      interactive: false,
      currency: state.data?.currency || 'EUR',
    });
  }

  function refreshLivePreview() {
    const card = document.getElementById('fcc-live-preview-card');
    if (!card || state.foundationTab !== 'page') return;
    card.innerHTML = renderLivePreviewCard();
  }

  function renderFoundation() {
    const form = state.foundationForm || {};
    const tab = FOUNDATION_TABS.has(state.foundationTab) ? state.foundationTab : 'page';
    const dirty = state.foundationDirty;
    const tabs = [
      { id: 'page', label: 'Page' },
      { id: 'card', label: 'Card' },
      { id: 'information', label: 'Information' },
    ];

    return `
      <section class="fcc-section fcc-foundation-editor">
        <div class="fcc-section__head">
          <div class="fcc-tabs" role="tablist" aria-label="Foundation editor">
            ${tabs.map((t) => `
              <button type="button" class="fcc-tab ${tab === t.id ? 'is-active' : ''}" data-ftab="${t.id}"
                role="tab" aria-selected="${tab === t.id ? 'true' : 'false'}">${esc(t.label)}</button>
            `).join('')}
          </div>
          <div class="fcc-actions">
            ${dirty ? '<span class="fcc-unsaved">Unsaved changes</span>' : ''}
            ${can('editFoundation') ? `
              <button type="button" class="fcc-btn" data-action="save-foundation" ${state.busy || !dirty ? 'disabled' : ''}>
                ${state.busy ? 'Saving…' : 'Save'}
              </button>
            ` : '<span class="fcc-muted">Your role cannot edit Foundation content.</span>'}
          </div>
        </div>

        ${tab === 'page' ? `
          <div class="fcc-page-editor">
            <div class="fcc-page-editor__form">
              ${renderFoundationPageFields(form)}
            </div>
            <aside class="fcc-live-preview" aria-hidden="true">
              <p class="fcc-live-preview__label">Live preview</p>
              <div id="fcc-live-preview-card">${renderLivePreviewCard()}</div>
            </aside>
          </div>
        ` : ''}
        ${tab === 'card' ? renderFoundationCardEditor(form) : ''}
        ${tab === 'information' ? `
          <div class="fcc-editor-grid">
            ${renderFoundationInfoFields(form)}
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderCausePicker(form, locked) {
    const selected = form.category || '';
    const detail = CAUSE_DETAILS[selected];
    return `
      <div class="fcc-field fcc-cause-field">
        <span class="fcc-field__label" id="fcc-cause-label">Primary cause</span>
        <input type="hidden" id="ff-category" name="category" value="${esc(selected)}">
        <div class="fcc-cause-picker" id="fcc-cause-picker">
          <button type="button" class="fcc-cause-trigger ${selected ? 'has-value' : ''}" id="fcc-cause-trigger"
            aria-haspopup="listbox" aria-expanded="false" aria-labelledby="fcc-cause-label fcc-cause-value"
            ${locked ? 'disabled' : ''}>
            <span class="fcc-cause-trigger__icon" aria-hidden="true">${causeIconSvg(detail?.icon || 'aid')}</span>
            <span class="fcc-cause-trigger__copy">
              <span class="fcc-cause-trigger__name" id="fcc-cause-value">${esc(selected || 'Select a cause')}</span>
              ${detail ? `<span class="fcc-cause-trigger__desc">${esc(detail.description)}</span>` : ''}
            </span>
            <span class="fcc-cause-trigger__chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </button>
          <ul class="fcc-cause-menu" id="fcc-cause-menu" role="listbox" aria-labelledby="fcc-cause-label" hidden>
            ${FOUNDATION_CAUSES.map((cause) => {
              const item = CAUSE_DETAILS[cause];
              const isSelected = cause === selected;
              return `
                <li role="option" class="fcc-cause-option ${isSelected ? 'is-selected' : ''}"
                  data-cause="${esc(cause)}" aria-selected="${isSelected ? 'true' : 'false'}" tabindex="-1">
                  <span class="fcc-cause-option__icon" aria-hidden="true">${causeIconSvg(item.icon)}</span>
                  <span class="fcc-cause-option__copy">
                    <span class="fcc-cause-option__name">${esc(cause)}</span>
                    <span class="fcc-cause-option__desc">${esc(item.description)}</span>
                  </span>
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  function renderFoundationPageFields(form) {
    const locked = !can('editFoundation');
    const countries = countryOptions(form.country);
    return `
      <form class="fcc-form fcc-page-form" id="fcc-foundation-form" data-part="page">
        <p class="fcc-page-kicker">Basics</p>
        <div class="fcc-field">
          <label for="ff-name">Foundation name</label>
          <input id="ff-name" name="foundationName" value="${esc(form.foundationName)}" autocomplete="organization" ${locked ? 'readonly' : ''}>
        </div>
        <div class="fcc-page-split">
          <div class="fcc-field">
            <label for="ff-creator">Founded by</label>
            <input id="ff-creator" name="creatorName" value="${esc(form.creatorName)}" autocomplete="name" ${locked ? 'readonly' : ''}>
          </div>
          <div class="fcc-field">
            <label for="ff-country">Country</label>
            <div class="fcc-select-wrap">
              <select id="ff-country" name="country" class="fcc-select" ${locked ? 'disabled' : ''}>
                <option value="">Select a country</option>
                ${countries.map((c) => `
                  <option value="${esc(c)}" ${form.country === c ? 'selected' : ''}>${esc(c)}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>
        ${renderCausePicker(form, locked)}

        <p class="fcc-page-kicker">Mission</p>
        <div class="fcc-field">
          <label class="sr-only" for="ff-mission">Mission</label>
          <textarea id="ff-mission" name="mission" class="fcc-textarea--story" rows="6"
            placeholder="What does this foundation exist to do?" ${locked ? 'readonly' : ''}>${esc(form.mission)}</textarea>
        </div>

        <p class="fcc-page-kicker">Why it started</p>
        <div class="fcc-field">
          <label class="sr-only" for="ff-why">Why it started</label>
          <textarea id="ff-why" name="whyStarted" class="fcc-textarea--story" rows="6"
            placeholder="What first made this work necessary?" ${locked ? 'readonly' : ''}>${esc(form.whyStarted)}</textarea>
        </div>

        <p class="fcc-page-kicker">How it works</p>
        <div class="fcc-field">
          <label class="sr-only" for="ff-how">How it works</label>
          <textarea id="ff-how" name="howItWorks" class="fcc-textarea--story" rows="6"
            placeholder="How does support become action?" ${locked ? 'readonly' : ''}>${esc(form.howItWorks)}</textarea>
        </div>

        <p class="fcc-page-kicker">Story</p>
        <div class="fcc-field">
          <label class="sr-only" for="ff-story">Story</label>
          <textarea id="ff-story" name="story" class="fcc-textarea--story" rows="7"
            placeholder="The longer story behind this foundation." ${locked ? 'readonly' : ''}>${esc(form.story)}</textarea>
        </div>

        <p class="fcc-page-kicker">Biography</p>
        <div class="fcc-field">
          <label class="sr-only" for="ff-bio">Biography</label>
          <textarea id="ff-bio" name="biography" class="fcc-textarea--story" rows="6"
            placeholder="A personal biography, if you want it on the public page." ${locked ? 'readonly' : ''}>${esc(form.biography)}</textarea>
        </div>
      </form>
    `;
  }

  function imageActionIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <circle cx="9" cy="10.5" r="1.4" fill="currentColor"/>
        <path d="M6.5 16.5l4.2-4.2 2.3 2.3 2.6-3.2 4.4 5.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function renderCardImageField(field, form, locked) {
    const isCover = field === 'coverImage';
    const value = isCover ? form.coverImage : form.profileImage;
    const has = !!String(value || '').trim();
    const loading = state.uploadingField === field;
    const name = form.foundationName || 'Foundation';
    const title = isCover ? 'Cover image' : 'Profile image';
    const copy = isCover
      ? 'Used as the wide visual on Donate cards, your public Foundation page, and Overview.'
      : 'Used as your foundation’s portrait in search, support checkout, and on your public Foundation page.';
    const emptyTitle = isCover ? 'Add a cover image' : 'Add a profile image';
    const emptyCopy = isCover
      ? 'A wide image generally works best, though any aspect ratio can be uploaded.'
      : 'A clear, recognizable square image generally works best.';
    const hint = isCover
      ? 'Recommended: Wide image · JPG, PNG, WebP, HEIC, and other images · Max 4 MB'
      : 'Recommended: Square image (1:1) · JPG, PNG, WebP, HEIC, and other images · Max 4 MB';
    const alt = `${name} ${isCover ? 'cover' : 'profile'} image`;
    const pickLabel = has ? 'Replace' : 'Add image';

    return `
      <section class="fcc-card-image ${has ? 'has-image' : ''} ${loading ? 'is-loading' : ''}" data-image-field="${esc(field)}">
        <div class="fcc-card-image__head">
          <h3 class="fcc-card-image__title">${esc(title)}</h3>
          <p class="fcc-card-image__copy">${esc(copy)}</p>
        </div>
        <input type="hidden" name="${esc(field)}" value="${esc(value || '')}">
        <div class="fcc-card-image__stage ${isCover ? 'is-cover' : 'is-profile'}">
          ${has ? `
            <img class="fcc-card-image__img" src="${esc(value)}" alt="${esc(alt)}" decoding="async">
          ` : `
            <div class="fcc-card-image__empty">
              <span class="fcc-card-image__empty-icon" aria-hidden="true">${imageActionIcon()}</span>
              <p class="fcc-card-image__empty-title">${esc(emptyTitle)}</p>
              <p class="fcc-card-image__empty-copy">${esc(emptyCopy)}</p>
            </div>
          `}
          ${loading ? '<div class="fcc-card-image__skel" aria-hidden="true"></div>' : ''}
        </div>
        ${locked ? '' : `
          <div class="fcc-card-image__actions">
            <label class="fcc-btn fcc-upload__pick" tabindex="0">
              <span class="fcc-card-image__pick-icon" aria-hidden="true">${imageActionIcon()}</span>
              ${esc(pickLabel)}
              <input type="file" accept="image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.svg,.ico,.jfif" hidden data-image-input="${esc(field)}" aria-label="${esc(pickLabel)} ${esc(title)}">
            </label>
            ${has ? `<button type="button" class="fcc-btn-ghost is-danger" data-action="clear-image" data-field="${esc(field)}" aria-label="Remove ${esc(title)}">Remove</button>` : ''}
          </div>
        `}
        <p class="fcc-card-image__hint">${esc(hint)}</p>
      </section>
    `;
  }

  function renderFoundationCardEditor(form) {
    const locked = !can('editFoundation');
    return `
      <form class="fcc-card-editor" id="fcc-foundation-form" data-part="card">
        <div class="fcc-card-editor__images">
          <p class="fcc-page-kicker">Card images</p>
          <p class="fcc-card-editor__lede">These images represent your foundation across World Choir.</p>
          ${renderCardImageField('profileImage', form, locked)}
          ${renderCardImageField('coverImage', form, locked)}
        </div>
        <aside class="fcc-card-editor__aside">
          <section class="fcc-card-tips">
            <div class="fcc-card-tips__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18h6"/>
                <path d="M10 22h4"/>
                <path d="M12 2a7 7 0 017 7c0 2.6-1.3 4.4-3.1 5.7-.5.4-.9 1.1-.9 1.8v.5H9v-.5c0-.7-.4-1.4-.9-1.8C6.3 13.4 5 11.6 5 9a7 7 0 017-7z"/>
              </svg>
            </div>
            <div>
              <h3 class="fcc-card-tips__title">Tips for great images</h3>
              <ul class="fcc-card-tips__list">
                <li>Use high-quality images that reflect your foundation’s identity and mission.</li>
                <li>Choose a clear, recognizable Profile Image.</li>
                <li>Wide images generally work best for the Cover Image.</li>
                <li>Avoid important text or faces extremely close to the edges — some placements may crop responsively.</li>
              </ul>
            </div>
          </section>
          <p class="fcc-page-kicker">Card content</p>
          <div class="fcc-field">
            <label for="ff-card-mission">Short mission (card)</label>
            <p class="fcc-card-field-help">A concise version of your mission for compact Foundation experiences, and a fallback when the full mission is empty.</p>
            <textarea id="ff-card-mission" name="cardShortMission" class="fcc-textarea--card" rows="5"
              placeholder="A short mission for compact Foundation experiences."
              ${locked ? 'readonly' : ''}>${esc(form.cardShortMission)}</textarea>
          </div>
          <div class="fcc-field">
            <label for="ff-short">Short description</label>
            <p class="fcc-card-field-help">A short introduction for places that need a little more context than the card mission.</p>
            <textarea id="ff-short" name="shortDescription" class="fcc-textarea--card" rows="6"
              placeholder="A brief introduction to your foundation."
              ${locked ? 'readonly' : ''}>${esc(form.shortDescription)}</textarea>
          </div>
        </aside>
      </form>
    `;
  }

  function renderFoundationInfoFields(form) {
    const s = form.socialLinks || {};
    return `
      <form class="fcc-form wide" id="fcc-foundation-form" data-part="information">
        <div class="fcc-field">
          <label for="ff-web">Website</label>
          <input id="ff-web" name="website" value="${esc(form.website)}" ${can('editFoundation') ? '' : 'readonly'}>
        </div>
        <div class="fcc-form two-col" style="max-width:none;padding:0;border:0;background:transparent">
          <div class="fcc-field">
            <label for="ff-ig">Instagram</label>
            <input id="ff-ig" name="instagram" value="${esc(s.instagram)}" ${can('editFoundation') ? '' : 'readonly'}>
          </div>
          <div class="fcc-field">
            <label for="ff-yt">YouTube</label>
            <input id="ff-yt" name="youtube" value="${esc(s.youtube)}" ${can('editFoundation') ? '' : 'readonly'}>
          </div>
          <div class="fcc-field">
            <label for="ff-x">X</label>
            <input id="ff-x" name="x" value="${esc(s.x)}" ${can('editFoundation') ? '' : 'readonly'}>
          </div>
          <div class="fcc-field">
            <label for="ff-tt">TikTok</label>
            <input id="ff-tt" name="tiktok" value="${esc(s.tiktok)}" ${can('editFoundation') ? '' : 'readonly'}>
          </div>
        </div>
        <p class="fcc-muted">Email: ${esc(state.data?.foundation?.email || state.email || '—')} · Change email in Settings → Security.</p>
      </form>
    `;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that image'));
      reader.readAsDataURL(file);
    });
  }

  function isLikelyImageFile(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('image/')) return true;
    // Some devices (esp. HEIC) omit MIME — fall back to extension.
    return /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|heic|heif|svg|ico|jfif|jp2)$/i.test(file.name || '');
  }

  async function uploadImageFromDevice(field, file) {
    if (!file) return;
    if (!isLikelyImageFile(file)) {
      setFlash('Please choose an image file.', 'err');
      render();
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setFlash('Image must be under 4 MB.', 'err');
      render();
      return;
    }

    readFoundationFormIntoState();
    if (!state.foundationForm) syncFoundationForm();

    const kind = field === 'coverImage' ? 'cover' : 'profile';
    state.busy = true;
    state.uploadingField = field;
    state.error = null;
    setFlash(`Uploading ${kind} image…`);
    render();

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const data = await api('upload-image', {
        method: 'POST',
        body: { dataUrl, kind, fileName: file.name || '' },
      });
      state.foundationForm[field] = data.url;
      state.foundationDirty = true;
      setFlash(`${kind === 'cover' ? 'Cover' : 'Profile'} image added — save to publish.`);
    } catch (err) {
      setFlash(err.message || 'Upload failed', 'err');
    } finally {
      state.busy = false;
      state.uploadingField = null;
      render();
    }
  }

  function markFoundationDirty() {
    state.foundationDirty = true;
    const head = root().querySelector('.fcc-section__head .fcc-actions');
    if (head && !root().querySelector('.fcc-unsaved')) {
      const span = document.createElement('span');
      span.className = 'fcc-unsaved';
      span.textContent = 'Unsaved changes';
      head.prepend(span);
    }
    const saveBtn = root().querySelector('[data-action="save-foundation"]');
    if (saveBtn && !state.busy) saveBtn.disabled = false;
  }

  function closeCauseMenu() {
    const trigger = document.getElementById('fcc-cause-trigger');
    const menu = document.getElementById('fcc-cause-menu');
    if (!trigger || !menu) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.getElementById('fcc-cause-picker')?.classList.remove('is-open');
  }

  function openCauseMenu() {
    const trigger = document.getElementById('fcc-cause-trigger');
    const menu = document.getElementById('fcc-cause-menu');
    if (!trigger || !menu || trigger.disabled) return;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.getElementById('fcc-cause-picker')?.classList.add('is-open');
    const selected = menu.querySelector('.fcc-cause-option.is-selected') || menu.querySelector('.fcc-cause-option');
    selected?.focus();
  }

  function applyCauseSelection(cause) {
    const input = document.getElementById('ff-category');
    if (input) input.value = cause;
    if (state.foundationForm) state.foundationForm.category = cause;
    markFoundationDirty();
    closeCauseMenu();
    const trigger = document.getElementById('fcc-cause-trigger');
    const detail = CAUSE_DETAILS[cause];
    if (trigger && detail) {
      trigger.classList.add('has-value');
      const icon = trigger.querySelector('.fcc-cause-trigger__icon');
      const name = trigger.querySelector('.fcc-cause-trigger__name');
      let desc = trigger.querySelector('.fcc-cause-trigger__desc');
      if (icon) icon.innerHTML = causeIconSvg(detail.icon);
      if (name) name.textContent = cause;
      if (!desc) {
        desc = document.createElement('span');
        desc.className = 'fcc-cause-trigger__desc';
        trigger.querySelector('.fcc-cause-trigger__copy')?.appendChild(desc);
      }
      desc.textContent = detail.description;
    }
    document.querySelectorAll('.fcc-cause-option').forEach((opt) => {
      const isSelected = opt.getAttribute('data-cause') === cause;
      opt.classList.toggle('is-selected', isSelected);
      opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
    refreshLivePreview();
    trigger?.focus();
  }

  function bindCausePicker() {
    const picker = document.getElementById('fcc-cause-picker');
    const trigger = document.getElementById('fcc-cause-trigger');
    const menu = document.getElementById('fcc-cause-menu');
    if (!picker || !trigger || !menu) return;

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      if (menu.hidden) openCauseMenu();
      else closeCauseMenu();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCauseMenu();
      }
    });

    menu.querySelectorAll('.fcc-cause-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        applyCauseSelection(opt.getAttribute('data-cause') || '');
      });
      opt.addEventListener('keydown', (e) => {
        const options = [...menu.querySelectorAll('.fcc-cause-option')];
        const index = options.indexOf(opt);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          options[(index + 1) % options.length]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          options[(index - 1 + options.length) % options.length]?.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          options[0]?.focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          options[options.length - 1]?.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          applyCauseSelection(opt.getAttribute('data-cause') || '');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeCauseMenu();
          trigger.focus();
        } else if (e.key === 'Tab') {
          closeCauseMenu();
        }
      });
    });
  }

  function bindImageUploads() {
    root().querySelectorAll('[data-image-input]').forEach((input) => {
      input.addEventListener('change', async () => {
        const field = input.getAttribute('data-image-input');
        const file = input.files && input.files[0];
        input.value = '';
        await uploadImageFromDevice(field, file);
      });
      const pick = input.closest('label');
      pick?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
    });
  }

  function readFoundationFormIntoState() {
    if (!state.foundationForm) return;
    const f = state.foundationForm;

    const readValue = (id) => {
      const el = document.getElementById(id);
      if (!el || el.disabled) return null;
      return String(el.value || '');
    };

    const textMap = {
      foundationName: 'ff-name',
      creatorName: 'ff-creator',
      country: 'ff-country',
      category: 'ff-category',
      mission: 'ff-mission',
      biography: 'ff-bio',
      whyStarted: 'ff-why',
      howItWorks: 'ff-how',
      story: 'ff-story',
      cardShortMission: 'ff-card-mission',
      shortDescription: 'ff-short',
      website: 'ff-web',
    };

    Object.entries(textMap).forEach(([key, id]) => {
      const value = readValue(id);
      if (value !== null) f[key] = value;
    });

    // Hidden image fields live in whichever tab is open.
    ['profileImage', 'coverImage'].forEach((field) => {
      const hidden = document.querySelector(`input[type="hidden"][name="${field}"]`);
      if (hidden) f[field] = String(hidden.value || '');
    });

    const social = { ...(f.socialLinks || {}) };
    [
      ['instagram', 'ff-ig'],
      ['youtube', 'ff-yt'],
      ['x', 'ff-x'],
      ['tiktok', 'ff-tt'],
    ].forEach(([key, id]) => {
      const value = readValue(id);
      if (value !== null) social[key] = value.trim();
    });
    f.socialLinks = {
      instagram: String(social.instagram || '').trim(),
      youtube: String(social.youtube || '').trim(),
      x: String(social.x || '').trim(),
      tiktok: String(social.tiktok || '').trim(),
    };

    state.foundationDirty = true;
  }

  async function saveFoundation() {
    if (!can('editFoundation') || state.busy) return;
    readFoundationFormIntoState();
    if (!state.foundationForm) syncFoundationForm();
    const f = state.foundationForm;
    if (!f) return;

    const socialLinks = {
      instagram: String(f.socialLinks?.instagram || '').trim(),
      youtube: String(f.socialLinks?.youtube || '').trim(),
      x: String(f.socialLinks?.x || '').trim(),
      tiktok: String(f.socialLinks?.tiktok || '').trim(),
    };
    const website = String(f.website || '').trim();
    f.website = website;
    f.socialLinks = socialLinks;

    state.busy = true;
    render();
    try {
      await api('influencer-update-profile', {
        method: 'POST',
        body: {
          displayName: f.creatorName,
          foundationName: f.foundationName,
          mission: f.mission,
          biography: f.biography,
          whyStarted: f.whyStarted,
          howItWorks: f.howItWorks,
          shortDescription: f.shortDescription,
          story: f.story,
          website,
          profileImage: f.profileImage,
          coverImage: f.coverImage,
          cardShortMission: f.cardShortMission,
          country: f.country,
          primaryCategory: f.category,
          socialLinks,
        },
      });
      await api('save-drafts', {
        method: 'POST',
        body: {
          page: {
            foundationName: f.foundationName,
            creatorName: f.creatorName,
            country: f.country,
            category: f.category,
            mission: f.mission,
            biography: f.biography,
            whyStarted: f.whyStarted,
            howItWorks: f.howItWorks,
            shortDescription: f.shortDescription,
            story: f.story,
            website,
            profileImage: f.profileImage,
            coverImage: f.coverImage,
            socialLinks,
          },
          card: {
            cardShortMission: f.cardShortMission,
            shortDescription: f.shortDescription,
            profileImage: f.profileImage,
          },
        },
      });
      setFlash('Foundation saved');
      state.foundationForm = null;
      state.foundationDirty = false;
      await loadCenter();
      syncFoundationForm();
      state.section = 'foundation';
      render();
    } catch (err) {
      setFlash(err.message || 'Save failed', 'err');
      state.busy = false;
      render();
    }
  }

  /* ─── Donations ─── */

  function renderDonations() {
    const don = state.data?.donations || {};
    const geo = state.data?.geography || {};
    const explorer = don.explorer || [];
    const cities = geo.cities || [];
    const countries = geo.countries || [];

    return `
      <section class="fcc-section">
        <div class="fcc-hero">
          <button type="button" class="fcc-hero__primary" data-nav="donations">
            <span class="fcc-hero__value">${esc(money(don.totalRaised || 0, currency()))}</span>
            <span class="fcc-hero__label">Total raised</span>
          </button>
          <div class="fcc-hero__secondary">
            ${metricBtn(num(don.totalDonations || 0), 'Donations', 'donations')}
            ${metricBtn(num(don.totalSupporters || 0), 'Supporters', 'community')}
            ${metricBtn(don.averageDonation != null ? money(don.averageDonation, currency()) : '—', 'Average', 'donations')}
            ${metricBtn(don.medianDonation != null ? money(don.medianDonation, currency()) : '—', 'Median', 'donations')}
          </div>
        </div>
        <p class="fcc-muted">
          New supporters ${esc(num(don.newSupporters || 0))} · Returning ${esc(num(don.repeatSupporters || 0))}
          · Foundation share ${esc(don.foundationSharePercent ?? '—')}% · Platform fee ${esc(don.platformFeePercent ?? '—')}%
        </p>
        ${don.conversionRate == null ? `<p class="fcc-note">${esc(don.conversionNote || 'Conversion rate requires Foundation page view tracking.')}</p>` : ''}
      </section>

      <section class="fcc-section">
        <div class="fcc-section__head">
          <h2>Timeline</h2>
          <button type="button" class="fcc-btn" data-action="open-map">Explore on map</button>
        </div>
        ${renderChart(don.timeline || [], 'amount')}
        ${geo.note ? `<p class="fcc-note">${esc(geo.note)}</p>` : ''}
      </section>

      <section class="fcc-section fcc-split">
        <div>
          <div class="fcc-section__head">
            <h2>Countries</h2>
          </div>
          ${renderCountryTable(countries)}
        </div>
        <div>
          <div class="fcc-section__head">
            <h2>Cities</h2>
            ${cities.length && can('exportData') ? `
              <button type="button" class="fcc-btn-ghost" data-action="export-cities">Export CSV</button>
            ` : ''}
          </div>
          ${renderCityTable(cities)}
        </div>
      </section>

      ${state.drill ? renderDrill() : ''}

      <section class="fcc-section">
        <div class="fcc-section__head">
          <h2>Donation explorer</h2>
          ${explorer.length && can('exportData') ? `
            <button type="button" class="fcc-btn-ghost" data-action="export-donations">Export CSV</button>
          ` : ''}
        </div>
        <p class="fcc-muted">Privacy-safe labels only. Identities appear when the supporter opted to share.</p>
        ${!explorer.length
          ? emptyNote('No verified donations in this range yet.')
          : `<div style="overflow:auto">
              <table class="fcc-rank">
                <thead>
                  <tr>
                    <th>Date</th><th>Supporter</th><th>Place</th><th>Message</th><th class="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${explorer.map((row) => `
                    <tr>
                      <td>${esc(when(row.date))}</td>
                      <td>${esc(row.supporterLabel)}${row.isReturning ? ' · returning' : (row.isNewSupporter ? ' · new' : '')}</td>
                      <td>${esc([row.city, row.country].filter(Boolean).join(', ') || '—')}</td>
                      <td>${row.message ? esc(row.message) : '—'}</td>
                      <td class="num">${esc(money(row.amount, row.currency || currency()))}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`}
      </section>
    `;
  }

  function renderCountryTable(countries) {
    if (!countries.length) return emptyNote('Not enough data yet');
    return `
      <table class="fcc-rank">
        <thead><tr><th>#</th><th>Country</th><th class="num">Raised</th><th class="num">Supporters</th></tr></thead>
        <tbody>
          ${countries.slice(0, 12).map((c) => `
            <tr>
              <td>${esc(c.rank || '')}</td>
              <td><button type="button" data-action="drill-country" data-country="${esc(c.country)}">${esc(c.country)}</button></td>
              <td class="num">${esc(money(c.totalRaised, currency()))}</td>
              <td class="num">${esc(num(c.supporters))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderCityTable(cities) {
    if (!cities.length) return emptyNote('Not enough data yet');
    return `
      <table class="fcc-rank">
        <thead><tr><th>#</th><th>City</th><th class="num">Raised</th><th class="num">Supporters</th></tr></thead>
        <tbody>
          ${cities.slice(0, 12).map((c) => `
            <tr>
              <td>${esc(c.rank || '')}</td>
              <td><button type="button" data-action="drill-city" data-city="${esc(c.city)}" data-country="${esc(c.country)}">${esc(c.city)}, ${esc(c.country)}</button></td>
              <td class="num">${esc(money(c.totalRaised, currency()))}</td>
              <td class="num">${esc(num(c.supporters))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderDrill() {
    const d = state.drill;
    if (!d) return '';
    if (d.type === 'country') {
      const c = (state.data?.geography?.countries || []).find(
        (x) => String(x.country).toLowerCase() === String(d.country).toLowerCase()
      );
      const cities = (state.data?.geography?.cities || []).filter(
        (x) => String(x.country).toLowerCase() === String(d.country).toLowerCase()
      );
      if (!c) return '';
      return `
        <div class="fcc-drill">
          <div class="fcc-section__head">
            <h3>${esc(c.country)}</h3>
            <button type="button" class="fcc-btn-ghost" data-action="clear-drill">Close</button>
          </div>
          <p class="fcc-muted">${esc(money(c.totalRaised, currency()))} · ${esc(num(c.supporters))} supporters · ${esc(num(c.cities))} cities · ${esc(num(c.donations))} donations</p>
          ${renderCityTable(cities)}
        </div>
      `;
    }
    if (d.type === 'city') {
      const c = (state.data?.geography?.cities || []).find(
        (x) => x.city === d.city && x.country === d.country
      );
      if (!c) return '';
      return `
        <div class="fcc-drill">
          <div class="fcc-section__head">
            <h3>${esc(c.city)}, ${esc(c.country)}</h3>
            <button type="button" class="fcc-btn-ghost" data-action="clear-drill">Close</button>
          </div>
          <p class="fcc-muted">
            ${esc(money(c.totalRaised, currency()))} raised · ${esc(num(c.supporters))} supporters · ${esc(num(c.donations))} donations
            ${c.averageDonation != null ? ` · avg ${esc(money(c.averageDonation, currency()))}` : ''}
          </p>
        </div>
      `;
    }
    return '';
  }

  /* ─── Community ─── */

  function renderCommunity() {
    const c = state.data?.community || {};
    const discovery = c.discovery || {};
    return `
      <section class="fcc-section">
        <div class="fcc-hero">
          <button type="button" class="fcc-hero__primary" data-nav="community">
            <span class="fcc-hero__value">${esc(num(c.totalSupporters || 0))}</span>
            <span class="fcc-hero__label">Supporters</span>
          </button>
          <div class="fcc-hero__secondary">
            ${metricBtn(num(c.newSupporters || 0), 'New', 'community')}
            ${metricBtn(num(c.returningSupporters || 0), 'Returning', 'community')}
            ${metricBtn(num(c.countriesReached || 0), 'Countries', 'donations')}
            ${metricBtn(num(c.citiesReached || 0), 'Cities', 'community')}
          </div>
        </div>
        <div class="fcc-actions" style="margin-bottom:24px">
          <button type="button" class="fcc-btn" data-action="open-map">Explore on map</button>
        </div>
      </section>

      <section class="fcc-section fcc-split">
        <div>
          <h2 class="fcc-section__label" style="margin-bottom:12px">Top countries</h2>
          ${renderCountryTable(c.topCountries || [])}
        </div>
        <div>
          <h2 class="fcc-section__label" style="margin-bottom:12px">Top cities</h2>
          ${renderCityTable(c.topCities || [])}
        </div>
      </section>

      <section class="fcc-section">
        <h2 class="fcc-section__label">Discovery</h2>
        ${discovery.available
          ? ''
          : emptyNote(discovery.note || 'Discovery attribution is not tracked yet.')}
      </section>
      ${state.drill ? renderDrill() : ''}
    `;
  }

  /* ─── Settings ─── */

  function renderSettings() {
    const f = state.data?.foundation || {};
    const team = state.data?.team || [];
    const fin = state.data?.financial || {};
    const sec = state.data?.security || {};
    const tabs = [
      { id: 'foundation', label: 'Foundation' },
      { id: 'team', label: 'Team' },
      { id: 'financial', label: 'Financial' },
      { id: 'security', label: 'Security' },
    ];
    if (!tabs.some((t) => t.id === state.settingsTab)) {
      state.settingsTab = 'foundation';
    }
    const tab = state.settingsTab;

    return `
      <section class="fcc-section">
        <div class="fcc-tabs">
          ${tabs.map((t) => `
            <button type="button" class="fcc-tab ${tab === t.id ? 'is-active' : ''}" data-stab="${t.id}">${esc(t.label)}</button>
          `).join('')}
        </div>

        ${tab === 'foundation' ? `
          <div class="fcc-block">
            <h3>${esc(f.name || 'Foundation')}</h3>
            <p class="fcc-muted">Founded by ${esc(f.creatorName || '—')} · ${esc(f.country || '—')} · ${esc(f.category || '—')}</p>
            <p class="fcc-muted" style="margin-top:8px">${esc(f.mission || 'No mission published yet.')}</p>
            <div class="fcc-form-actions" style="margin-top:14px">
              <button type="button" class="fcc-btn-ghost" data-nav="foundation">Edit Foundation content</button>
            </div>
          </div>
        ` : ''}

        ${tab === 'team' ? `
          <div class="fcc-block">
            <h3>Team</h3>
            ${!team.length ? emptyNote('No team members yet.') : `
              <ul class="fcc-list">
                ${team.map((m) => `
                  <li class="fcc-row">
                    <div>
                      <p class="fcc-row__title">${esc(m.name || m.email)}</p>
                      <p class="fcc-row__meta">${esc(m.email)} · ${esc(m.role || 'member')}</p>
                    </div>
                    <div class="fcc-row__actions">
                      ${can('manageTeam') ? `
                        <button type="button" class="fcc-btn-ghost is-danger" data-action="team-remove" data-id="${esc(m.id)}">Remove</button>
                      ` : ''}
                    </div>
                  </li>
                `).join('')}
              </ul>
            `}
            ${can('manageTeam') ? `
              <form class="fcc-form" id="fcc-team-form" style="margin-top:22px">
                <div class="fcc-field">
                  <label for="tm-name">Name</label>
                  <input id="tm-name" name="name" required>
                </div>
                <div class="fcc-field">
                  <label for="tm-email">Email</label>
                  <input id="tm-email" name="email" type="email" required>
                </div>
                <div class="fcc-field">
                  <label for="tm-role">Role</label>
                  <select id="tm-role" name="role">
                    ${['admin', 'editor', 'finance', 'analyst'].map((r) => `<option value="${r}">${r}</option>`).join('')}
                  </select>
                </div>
                <div class="fcc-form-actions">
                  <button class="fcc-btn" type="submit">Add member</button>
                </div>
              </form>
            ` : '<p class="fcc-muted">Your role cannot manage the team.</p>'}
          </div>
        ` : ''}

        ${tab === 'financial' ? `
          <div class="fcc-block">
            <h3>Financial</h3>
            ${fin.available
              ? ''
              : emptyNote(fin.note || 'Payout accounts and balances are not connected yet.')}
          </div>
        ` : ''}

        ${tab === 'security' ? `
          <div class="fcc-block">
            <h3>Account</h3>
            <p class="fcc-muted">Signed in as ${esc(state.email || f.email || '—')}</p>
          </div>
          <div class="fcc-block">
            <h3>Change password</h3>
            <form class="fcc-form" id="fcc-password-form">
              <div class="fcc-field">
                <label for="pw-cur">Current password</label>
                <input id="pw-cur" name="currentPassword" type="password" required autocomplete="current-password">
              </div>
              <div class="fcc-field">
                <label for="pw-new">New password</label>
                <input id="pw-new" name="newPassword" type="password" required autocomplete="new-password">
              </div>
              <div class="fcc-field">
                <label for="pw-confirm">Confirm password</label>
                <input id="pw-confirm" name="confirmPassword" type="password" required autocomplete="new-password">
              </div>
              <div class="fcc-form-actions">
                <button class="fcc-btn" type="submit">Update password</button>
              </div>
            </form>
          </div>
          <div class="fcc-block">
            <h3>Change email</h3>
            <form class="fcc-form" id="fcc-email-form">
              <div class="fcc-field">
                <label for="em-cur">Current password</label>
                <input id="em-cur" name="currentPassword" type="password" required>
              </div>
              <div class="fcc-field">
                <label for="em-new">New email</label>
                <input id="em-new" name="newEmail" type="email" required>
              </div>
              <div class="fcc-field">
                <label for="em-confirm">Confirm email</label>
                <input id="em-confirm" name="confirmEmail" type="email" required>
              </div>
              <div class="fcc-form-actions">
                <button class="fcc-btn" type="submit">Update email</button>
              </div>
            </form>
          </div>
          <div class="fcc-block">
            <h3>Two-factor authentication</h3>
            ${emptyNote(sec.twoFactorNote || 'Two-factor authentication is not enabled yet.')}
          </div>
        ` : ''}
      </section>
    `;
  }

  /* ─── Overlays ─── */

  function renderSearchOverlay() {
    const res = state.searchResults;
    const groups = res ? [
      { key: 'cities', label: 'Cities', section: 'community' },
      { key: 'countries', label: 'Countries', section: 'donations' },
      { key: 'team', label: 'Team', section: 'settings' },
      { key: 'settings', label: 'Settings', section: 'settings' },
    ] : [];
    return `
      <div class="fcc-overlay ${state.searchOpen ? 'is-open' : ''}" id="fcc-search">
        <div class="fcc-overlay__backdrop" data-action="close-search"></div>
        <div class="fcc-search__panel" role="dialog" aria-label="Search">
          <input class="fcc-search__input" id="fcc-search-input" type="search"
            placeholder="Search cities, countries, team…" value="${esc(state.searchQuery)}" autocomplete="off">
          ${!res ? `<p class="fcc-muted" style="margin-top:14px">Type to search this Foundation.</p>` : ''}
          ${groups.map((g) => {
            const items = res[g.key] || [];
            if (!items.length) return '';
            return `
              <div class="fcc-search__group">
                <h3>${esc(g.label)}</h3>
                ${items.slice(0, 8).map((item) => {
                  const label = item.title || item.name || item.city || item.country || item.label || item.email || 'Result';
                  const sub = item.country && item.city ? `${item.city}, ${item.country}` : (item.role || item.status || '');
                  return `
                    <button type="button" class="fcc-search__item" data-action="search-go"
                      data-section="${esc(g.section)}"
                      data-city="${esc(item.city || '')}"
                      data-country="${esc(item.country || '')}">
                      ${esc(label)}${sub ? ` · ${esc(sub)}` : ''}
                    </button>
                  `;
                }).join('')}
              </div>
            `;
          }).join('')}
          ${res && groups.every((g) => !(res[g.key] || []).length)
            ? `<p class="fcc-muted" style="margin-top:14px">No matches.</p>` : ''}
        </div>
      </div>
    `;
  }

  function renderMapDrawer() {
    const note = state.data?.map?.note;
    return `
      <div class="fcc-map-drawer ${state.mapOpen ? 'is-open' : ''}" id="fcc-map-drawer">
        <div class="fcc-map-drawer__backdrop" data-action="close-map"></div>
        <div class="fcc-map-drawer__panel">
          <div class="fcc-map-drawer__head">
            <h2>Support map</h2>
            <button type="button" class="fcc-btn-ghost" data-action="close-map">Close</button>
          </div>
          ${note ? `<p class="fcc-muted" style="margin-bottom:8px">${esc(note)}</p>` : ''}
          <div class="fcc-leaflet-shell fcc-leaflet-shell--drawer" style="flex:1;min-height:240px;margin-top:0">
            <div id="fcc-world-map"></div>
            <div class="city-card" id="owner-city-card">
              <p class="city-card__place" id="owner-city-card-place">—</p>
              <p class="city-card__voices" id="owner-city-card-voices">—</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function mountMap() {
    if (typeof OwnerMap === 'undefined') return;
    const points = state.data?.map?.points || [];
    const el = document.getElementById('fcc-world-map');
    if (!el || !state.mapOpen) {
      destroyMap();
      return;
    }
    OwnerMap.mount('fcc-world-map', points);
  }

  function destroyMap() {
    if (typeof OwnerMap !== 'undefined') OwnerMap.destroy();
  }

  /* ─── Render router ─── */

  function renderApp() {
    const map = {
      overview: renderOverview,
      foundation: renderFoundation,
      donations: renderDonations,
      community: renderCommunity,
      settings: renderSettings,
    };
    const fn = map[state.section] || renderOverview;
    root().innerHTML = renderShell(fn());
    bindApp();
    if (state.mapOpen) {
      requestAnimationFrame(() => mountMap());
    } else {
      destroyMap();
    }
  }

  function render() {
    document.body.classList.add('fcc-body');
    document.body.classList.toggle('is-fcc-nav-open', !!(state.authenticated && state.navOpen));
    document.body.classList.toggle('is-fcc-drawer-open', !!(state.mapOpen || state.searchOpen || state.navOpen));
    if (!state.authenticated) {
      document.body.classList.remove('is-fcc-nav-open', 'is-fcc-drawer-open');
      renderLogin();
      return;
    }
    if (!state.data) {
      root().innerHTML = `<p class="fcc-boot">${state.busy ? 'Loading Foundation Control Center…' : (state.error || 'Loading…')}</p>`;
      return;
    }
    syncRoute();
    renderApp();
  }

  function bindCardImagePreviews() {
    root().querySelectorAll('.fcc-card-image__img').forEach((img) => {
      const stage = img.closest('.fcc-card-image__stage');
      const markBroken = () => {
        img.hidden = true;
        stage?.classList.add('is-broken');
        if (stage && !stage.querySelector('.fcc-card-image__broken')) {
          const note = document.createElement('p');
          note.className = 'fcc-card-image__broken';
          note.textContent = 'This image could not be displayed. Replace it to choose another.';
          stage.appendChild(note);
        }
      };
      img.addEventListener('error', markBroken);
      if (img.complete && img.naturalWidth === 0) markBroken();
    });
  }

  function bindApp() {
    bindImageUploads();
    bindCardImagePreviews();
    bindCausePicker();
    root().querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => go(btn.getAttribute('data-nav')));
    });
    root().querySelectorAll('.fcc-ov-hero__photo').forEach((img) => {
      img.addEventListener('error', () => {
        img.hidden = true;
        img.closest('.fcc-ov-hero__mark')?.classList.add('is-fallback');
      });
    });

    document.getElementById('fcc-range')?.addEventListener('change', async (e) => {
      state.range = e.target.value;
      await loadCenter();
    });

    root().querySelectorAll('[data-growth]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.growthMetric = btn.getAttribute('data-growth');
        render();
      });
    });

    root().querySelectorAll('[data-activity]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activityFilter = btn.getAttribute('data-activity');
        render();
      });
    });

    root().querySelectorAll('[data-ftab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        readFoundationFormIntoState();
        const next = btn.getAttribute('data-ftab');
        state.foundationTab = FOUNDATION_TABS.has(next) ? next : 'page';
        render();
      });
    });

    root().querySelectorAll('[data-stab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.settingsTab = btn.getAttribute('data-stab');
        render();
      });
    });

    const fForm = document.getElementById('fcc-foundation-form');
    if (fForm) {
      fForm.addEventListener('input', () => {
        readFoundationFormIntoState();
        markFoundationDirty();
        refreshLivePreview();
      });
      fForm.addEventListener('change', () => {
        readFoundationFormIntoState();
        markFoundationDirty();
        refreshLivePreview();
      });
    }

    document.getElementById('fcc-team-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('team-upsert', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        setFlash('Team member added');
        await loadCenter();
      } catch (err) {
        setFlash(err.message || 'Failed to add member', 'err');
        render();
      }
    });

    document.getElementById('fcc-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('influencer-change-password', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        setFlash('Password updated');
        e.target.reset();
        render();
      } catch (err) {
        setFlash(err.message || 'Password change failed', 'err');
        render();
      }
    });

    document.getElementById('fcc-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const data = await api('influencer-change-email', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        state.email = data.email || fd.get('newEmail');
        setFlash('Email updated');
        await loadCenter();
      } catch (err) {
        setFlash(err.message || 'Email change failed', 'err');
        render();
      }
    });

    let searchTimer = null;
    document.getElementById('fcc-search-input')?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const q = state.searchQuery.trim();
        if (!q) {
          state.searchResults = null;
          render();
          return;
        }
        try {
          const data = await api('search', { query: `&q=${encodeURIComponent(q)}` });
          state.searchResults = data.results || null;
          render();
          const input = document.getElementById('fcc-search-input');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        } catch {
          state.searchResults = null;
        }
      }, 220);
    });
  }

  async function onClick(e) {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.getAttribute('data-action');

    if (action === 'logout') return logout();
    if (action === 'open-nav') {
      state.navOpen = true;
      render();
      return;
    }
    if (action === 'close-nav') {
      state.navOpen = false;
      render();
      return;
    }
    if (action === 'open-search') {
      state.searchOpen = true;
      state.navOpen = false;
      render();
      document.getElementById('fcc-search-input')?.focus();
      return;
    }
    if (action === 'close-search') {
      state.searchOpen = false;
      state.searchResults = null;
      render();
      return;
    }
    if (action === 'open-map') {
      state.mapOpen = true;
      render();
      return;
    }
    if (action === 'close-map') {
      state.mapOpen = false;
      destroyMap();
      render();
      return;
    }
    if (action === 'clear-image') {
      const field = t.getAttribute('data-field');
      readFoundationFormIntoState();
      if (state.foundationForm && field) {
        state.foundationForm[field] = '';
        state.foundationDirty = true;
      }
      render();
      return;
    }
    if (action === 'save-foundation') return saveFoundation();
    if (action === 'team-remove') {
      if (!confirm('Remove this team member?')) return;
      try {
        await api('team-remove', { method: 'POST', body: { id: t.getAttribute('data-id') } });
        setFlash('Team member removed');
        await loadCenter();
      } catch (err) {
        setFlash(err.message || 'Remove failed', 'err');
        render();
      }
      return;
    }
    if (action === 'drill-country') {
      state.drill = { type: 'country', country: t.getAttribute('data-country') };
      if (state.section !== 'donations' && state.section !== 'community') state.section = 'donations';
      render();
      return;
    }
    if (action === 'drill-city') {
      state.drill = {
        type: 'city',
        city: t.getAttribute('data-city'),
        country: t.getAttribute('data-country'),
      };
      if (state.section !== 'donations' && state.section !== 'community') state.section = 'community';
      render();
      return;
    }
    if (action === 'clear-drill') {
      state.drill = null;
      render();
      return;
    }
    if (action === 'export-donations') {
      exportCsv('foundation-donations.csv', state.data?.donations?.explorer || [], [
        { label: 'date', value: (r) => r.date },
        { label: 'supporter', value: (r) => r.supporterLabel },
        { label: 'city', value: (r) => r.city || '' },
        { label: 'country', value: (r) => r.country || '' },
        { label: 'amount', value: (r) => r.amount },
        { label: 'currency', value: (r) => r.currency || 'EUR' },
      ]);
      return;
    }
    if (action === 'export-cities') {
      exportCsv('foundation-cities.csv', state.data?.geography?.cities || [], [
        { label: 'rank', value: (r) => r.rank },
        { label: 'city', value: (r) => r.city },
        { label: 'country', value: (r) => r.country },
        { label: 'supporters', value: (r) => r.supporters },
        { label: 'donations', value: (r) => r.donations },
        { label: 'totalRaised', value: (r) => r.totalRaised },
      ]);
      return;
    }
    if (action === 'search-go') {
      const section = t.getAttribute('data-section');
      const city = t.getAttribute('data-city');
      const country = t.getAttribute('data-country');
      state.searchOpen = false;
      state.searchResults = null;
      if (city) state.drill = { type: 'city', city, country };
      else if (country && !city) state.drill = { type: 'country', country };
      else state.drill = null;
      if (section === 'settings') state.settingsTab = 'team';
      go(SECTION_IDS.has(section) ? section : 'overview');
    }
  }

  function onKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!state.authenticated) return;
      state.searchOpen = true;
      render();
      document.getElementById('fcc-search-input')?.focus();
    }
    if (e.key === 'Escape') {
      const causeMenu = document.getElementById('fcc-cause-menu');
      if (causeMenu && !causeMenu.hidden) {
        closeCauseMenu();
        document.getElementById('fcc-cause-trigger')?.focus();
        return;
      }
      if (state.searchOpen) {
        state.searchOpen = false;
        render();
      } else if (state.mapOpen) {
        state.mapOpen = false;
        destroyMap();
        render();
      }
    }
  }

  async function init() {
    document.addEventListener('keydown', onKeydown);
    root()?.addEventListener('click', onClick);
    document.addEventListener('mousedown', (e) => {
      const picker = document.getElementById('fcc-cause-picker');
      if (!picker || !picker.classList.contains('is-open')) return;
      if (!picker.contains(e.target)) closeCauseMenu();
    });
    window.addEventListener('hashchange', () => {
      if (!state.authenticated || !state.data) return;
      applyRoute();
      render();
    });
    root().innerHTML = `<p class="fcc-boot">Loading…</p>`;
    document.body.classList.add('fcc-body');
    try {
      const session = await api('session');
      if (session.authenticated) {
        state.authenticated = true;
        state.email = session.influencer?.email || null;
        state.influencer = session.influencer || null;
        applyRoute();
        await loadCenter();
        return;
      }
    } catch {
      /* show login */
    }
    state.authenticated = false;
    render();
  }

  return { init };
})();
