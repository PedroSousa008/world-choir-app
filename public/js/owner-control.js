/**
 * Owner Control Center — private headquarters for World Choir.
 * All metrics come from /api/admin?action=control-center (real data only).
 *
 * Cross-tab rule: shared facts (map, metrics, activity, foundations, etc.) must
 * use one data path. Never ship a one-off preview that can drift from its
 * dedicated tab — e.g. Overview / Event / Map all mount OwnerMap + getFilteredMapCities().
 */
const OwnerControl = (() => {
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'community', label: 'Community' },
    { id: 'map', label: 'Map' },
    { id: 'donations', label: 'Donations' },
    { id: 'foundations', label: 'Creator Foundations' },
    { id: 'sponsors', label: 'Sponsors' },
    { id: 'event', label: 'Event' },
    { id: 'daily-acts', label: 'Daily Acts' },
    { id: 'pass-the-world', label: 'Pass the World' },
    { id: 'growth', label: 'Growth' },
    { id: 'promise-memory', label: 'Post Event Promise Memory' },
    { id: 'applications', label: 'Applications' },
    { id: 'operations', label: 'Operations' },
    { id: 'reports', label: 'Reports' },
    { id: 'admin', label: 'Admin' },
    { id: 'account', label: 'Account' },
  ];

  let state = {
    authenticated: false,
    email: null,
    data: null,
    section: 'overview',
    flash: null,
    error: null,
    inventory: null,
    busy: false,
    searchOpen: false,
    searchQuery: '',
    searchResults: null,
    activityFilter: 'all',
    growthMetric: 'voices',
    growthRange: '30d',
    growthCustomFrom: '',
    growthCustomTo: '',
    growthRangeOpen: false,
    citySort: 'voices',
    countrySort: 'voices',
    foundationLayout: 'list',
    foundationQuery: '',
    foundationStatusFilter: 'all',
    foundationCategoryFilter: 'all',
    foundationSort: 'updated',
    foundationPage: 1,
    foundationDetail: null,
    foundationCreateOpen: false,
    foundationActionMenu: null,
    cityDetail: null,
    countryDetail: null,
    dailyPeace: null,
    dailyPeaceView: 'users',
    dailyPeaceUserId: null,
    dailyPeaceQuery: '',
    dailyPeaceFilter: 'all',
    dailyPeaceBusy: false,
    dailyPeaceError: null,
    dapView: 'library',
    dapLibrary: null,
    dapLibraryBusy: false,
    dapQuery: '',
    dapFilter: 'all',
    dapPartnershipId: null,
    dapPartnershipDetail: null,
    dapFormMode: false,
    dapForm: null,
    dapFormError: null,
    mapFilters: {
      mode: 'voices',
      country: '',
      range: 'all',
      foundationId: '',
    },
    ptwData: null,
    ptwBusy: false,
    ptwRange: '30d',
    ptwRoundId: null,
    ptwMapMode: 'invitations',
    ptwGeoTab: 'countries',
    ptwCountryQuery: '',
    ptwCityQuery: '',
    ptwCityPage: 1,
    pmData: null,
    pmBusy: false,
    pmQuery: '',
    pmEvent: 'all',
    pmCountry: '',
    pmCity: '',
    pmFolder: '',
    pmDateFrom: '',
    pmDateTo: '',
    pmSort: 'newest',
    pmPage: 1,
    pmSelectedIds: [],
    pmDetail: null,
    pmFolderModal: null,
    pmCityQuery: '',
    pmCityPage: 1,
    sponsorsData: null,
    sponsorsBusy: false,
    sponsorsView: 'roster',
    sponsorsQuery: '',
    sponsorFormMode: null,
    sponsorDetail: null,
    sponsorsReorderBusy: false,
    sponsorsPage: 1,
    sponsorPendingLogo: null,
    sponsorAnalyticsId: null,
    sponsorAnalyticsDetail: null,
    sponsorAnalyticsBusy: false,
    sponsorAnalyticsError: null,
    sponsorAnalyticsRange: '30d',
    sponsorAnalyticsRangeOpen: false,
    sponsorAnalyticsCustomFrom: null,
    sponsorAnalyticsCustomTo: null,
    sponsorAnalyticsChartMetric: 'impressions',
  };

  const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

  function applyOwnerRoute() {
    const parts = String(window.location.hash || '').replace(/^#/, '').split('/').filter(Boolean);
    if (!parts.length) return;
    if (!SECTION_IDS.has(parts[0])) return;
    state.section = parts[0];
    if (parts[0] !== 'daily-acts') return;
    const sub = parts[1];
    if (['library', 'engagement', 'partnerships'].includes(sub)) {
      state.dapView = sub;
    } else if (['users', 'acts'].includes(sub)) {
      state.dapView = 'engagement';
      state.dailyPeaceView = sub;
    }
    const third = parts[2];
    if (state.dapView === 'partnerships' && third && third !== 'new') {
      state.dapPartnershipId = third;
      state.dapPartnershipDetail = null;
    }
    if (state.dapView === 'engagement' && third && third.startsWith('user-')) {
      state.dailyPeaceUserId = third.slice(5);
    }
  }

  function ownerHash() {
    if (!state.authenticated) return '';
    const section = state.section || 'overview';
    const parts = [section];
    if (section === 'daily-acts') {
      parts.push(state.dapView || 'library');
      if (state.dapView === 'partnerships' && state.dapPartnershipId) {
        parts.push(state.dapPartnershipId);
      } else if (state.dapView === 'engagement' && state.dailyPeaceUserId) {
        parts.push(`user-${state.dailyPeaceUserId}`);
      }
    }
    if (section === 'overview' && parts.length === 1) return '';
    return `#${parts.join('/')}`;
  }

  function syncOwnerRoute() {
    const hash = ownerHash();
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (url === cur) return;
    window.history.replaceState(null, '', url);
  }

  const root = () => document.getElementById('owner-root');

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(amount, currency = 'EUR') {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      }).format(n);
    } catch {
      return `${n} ${currency}`;
    }
  }

  function num(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function pct(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return `${Number(n)}%`;
  }

  function when(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  async function api(action, { method = 'GET', body, query = '' } = {}) {
    const res = await fetch(`/api/admin?action=${encodeURIComponent(action)}${query}`, {
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
      err.storageUnavailable = !!(data && data.storageUnavailable);
      err.inventory = data && data.inventory;
      throw err;
    }
    return data;
  }

  function setFlash(message, type = 'ok') {
    state.flash = message ? { message, type } : null;
  }

  async function copyMembersCredentials(email, password) {
    const text = `Email: ${email}\nPassword: ${password}\nLogin: /members`;
    try {
      await navigator.clipboard.writeText(text);
      setFlash('Credentials copied. Share them securely with the Creator.');
      render();
    } catch {
      setFlash('Could not copy — select the fields manually.', 'err');
      render();
    }
  }

  function flashHtml() {
    if (!state.flash) return '';
    return `<div class="owner-flash is-${esc(state.flash.type)}">${esc(state.flash.message)}</div>`;
  }

  /* ─── Login ─── */

  function renderLogin() {
    root().innerHTML = `
      <div class="owner-login">
        <p class="owner-kicker">World Choir</p>
        <h1>Owner Control Center</h1>
        <p class="owner-sub">Private headquarters. Sign in with your Owner credentials.</p>
        ${state.error ? `<div class="owner-flash is-err">${esc(state.error)}</div>` : ''}
        <form class="owner-form" id="owner-login-form" style="margin-top:22px">
          <div class="owner-field">
            <label for="owner-email">Email</label>
            <input id="owner-email" name="email" type="email" required autocomplete="username">
          </div>
          <div class="owner-field">
            <label for="owner-password">Password</label>
            <input id="owner-password" name="password" type="password" required autocomplete="current-password">
          </div>
          <button class="owner-btn" type="submit" ${state.busy ? 'disabled' : ''}>
            ${state.busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    `;

    document.getElementById('owner-login-form')?.addEventListener('submit', async (e) => {
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
        state.email = data.email || null;
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
      state.data = await api('control-center');
      state.error = null;
    } catch (err) {
      if (err.status === 401) {
        state.authenticated = false;
        state.data = null;
        state.error = 'Session expired. Please sign in again.';
      } else {
        state.error = err.storageUnavailable
          ? (err.message || 'World Choir records are temporarily unavailable. Nothing has been deleted.')
          : (err.message || 'Failed to load control center');
        state.inventory = err.inventory || null;
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  /* ─── Shell ─── */

  function renderShell(content) {
    const o = state.data?.overview || {};
    return `
      <div class="owner-shell">
        <aside class="owner-nav">
          <p class="owner-nav__brand">World Choir</p>
          <p class="owner-nav__title">Owner Control Center</p>
          <ul class="owner-nav__list">
            ${SECTIONS.map((s) => `
              <li>
                <button type="button" class="owner-nav__btn ${state.section === s.id ? 'is-active' : ''}" data-section="${s.id}">
                  ${esc(s.label)}
                </button>
              </li>
            `).join('')}
          </ul>
          <div class="owner-nav__foot">
            <button type="button" class="owner-nav__btn" id="owner-open-search">Search</button>
            <button type="button" class="owner-nav__btn" id="owner-logout">Sign out</button>
          </div>
        </aside>
        <main class="owner-main">
          <div class="owner-top">
            <div>
              <p class="owner-kicker">World Choir</p>
              <h1 class="owner-h1">Owner Control Center</h1>
              <div class="owner-status">
                <span class="owner-status__dot ${o.systemHealth === 'operational' ? '' : 'is-warn'}"></span>
                ${o.systemHealth === 'operational' ? 'All systems operational' : esc(o.systemHealth || 'Status unknown')}
              </div>
            </div>
            <div class="owner-actions">
              <button type="button" class="owner-icon-btn" id="owner-open-search-top" aria-label="Search">⌕</button>
              <button type="button" class="owner-btn-ghost" id="owner-refresh">Refresh</button>
            </div>
          </div>
          ${flashHtml()}
          ${state.error ? `<div class="owner-flash is-err">${esc(state.error)}</div>` : ''}
          ${content}
        </main>
      </div>
      ${renderSearchOverlay()}
    `;
  }

  function bindShell() {
    root().querySelectorAll('[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.section = btn.getAttribute('data-section');
        state.foundationDetail = null;
        state.cityDetail = null;
        state.countryDetail = null;
        state.ptwRoundId = null;
        state.sponsorFormMode = null;
        state.sponsorDetail = null;
        state.sponsorPendingLogo = null;
        if (typeof OwnerPassTheWorld !== 'undefined') OwnerPassTheWorld.stopPolling();
        setFlash(null);
        render();
      });
    });
    document.getElementById('owner-logout')?.addEventListener('click', async () => {
      try { await api('logout', { method: 'POST', body: {} }); } catch { /* ignore */ }
      state.authenticated = false;
      state.data = null;
      render();
    });
    document.getElementById('owner-refresh')?.addEventListener('click', () => loadCenter());
    document.getElementById('owner-open-search')?.addEventListener('click', openSearch);
    document.getElementById('owner-open-search-top')?.addEventListener('click', openSearch);
    bindSearch();
  }

  /* ─── Search ─── */

  function renderSearchOverlay() {
    const r = state.searchResults || {};
    const groups = [
      ['Foundations', r.foundations, (x) => `${x.foundation || x.creator}`, 'foundations'],
      ['Creators', r.creators, (x) => x.creator, 'foundations'],
      ['Cities', r.cities, (x) => `${x.city}, ${x.country}`, 'community'],
      ['Countries', r.countries, (x) => x.country, 'community'],
      ['Voices', r.voices, (x) => x.voiceName || x.userId, 'community'],
    ];

    return `
      <div class="owner-search ${state.searchOpen ? 'is-open' : ''}" id="owner-search" aria-hidden="${!state.searchOpen}">
        <div class="owner-search__backdrop" id="owner-search-backdrop"></div>
        <div class="owner-search__panel" role="dialog" aria-label="Global search">
          <input class="owner-search__input" id="owner-search-input" type="search" placeholder="Search foundations, creators, cities, countries, voices" value="${esc(state.searchQuery)}">
          <div id="owner-search-results">
            ${!state.searchQuery.trim() ? `<p class="owner-muted" style="margin-top:16px">Type to search across the platform.</p>` : ''}
            ${groups.map(([title, items, labelFn, section]) => {
              if (!items || !items.length) return '';
              return `
                <div class="owner-search__group">
                  <h3>${esc(title)}</h3>
                  ${items.map((item) => `
                    <button type="button" class="owner-search__item" data-jump-section="${section}" data-jump-id="${esc(item.id || item.city || item.country || item.userId || '')}">
                      ${esc(labelFn(item))}
                    </button>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
          <div style="margin-top:14px">
            <button type="button" class="owner-btn-ghost" id="owner-search-close">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  function openSearch() {
    state.searchOpen = true;
    render();
    requestAnimationFrame(() => document.getElementById('owner-search-input')?.focus());
  }

  function closeSearch() {
    state.searchOpen = false;
    state.searchQuery = '';
    state.searchResults = null;
    render();
  }

  function bindSearch() {
    document.getElementById('owner-search-backdrop')?.addEventListener('click', closeSearch);
    document.getElementById('owner-search-close')?.addEventListener('click', closeSearch);
    const input = document.getElementById('owner-search-input');
    let timer = null;
    input?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!state.searchQuery.trim()) {
          state.searchResults = null;
          render();
          openSearchKeepFocus();
          return;
        }
        try {
          const data = await api('search', { query: `&q=${encodeURIComponent(state.searchQuery)}` });
          state.searchResults = data.results;
          render();
          openSearchKeepFocus();
        } catch {
          /* ignore */
        }
      }, 220);
    });
    root().querySelectorAll('[data-jump-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.section = btn.getAttribute('data-jump-section');
        closeSearch();
      });
    });
  }

  function openSearchKeepFocus() {
    state.searchOpen = true;
    const val = state.searchQuery;
    const el = document.getElementById('owner-search-input');
    if (el) {
      el.focus();
      el.value = val;
      try { el.setSelectionRange(val.length, val.length); } catch { /* ignore */ }
    }
  }

  /* ─── Overview ─── */

  function renderOverview() {
    const d = state.data;
    const o = d.overview;
    const currency = d.currency || 'EUR';

    return `
      <section class="owner-section">
        <p class="owner-section__label">Global state</p>
        <div class="owner-groups">
          <div class="owner-group">
            <p class="owner-group__title">Community</p>
            ${metricBtn(o.totalVoices, 'Voices pledged', 'community')}
            ${metricBtn(o.totalUsers, 'Registered users', 'community')}
            ${metricBtn(o.countries, 'Countries', 'community', { sort: 'countries' })}
            ${metricBtn(o.cities, 'Cities', 'community', { sort: 'cities' })}
            ${metricBtn(o.voicesToday, 'New voices today', 'community')}
          </div>
          <div class="owner-group">
            <p class="owner-group__title">Giving</p>
            ${metricBtn(money(o.totalDonated, currency), 'Total donated', 'donations', null, true)}
            ${metricBtn(o.totalDonors, 'Donors', 'donations')}
            ${metricBtn(o.totalDonations, 'Donations', 'donations')}
            ${metricBtn(money(o.operationsShare, currency), 'Operations share (10%)', 'donations', null, true)}
          </div>
          <div class="owner-group">
            <p class="owner-group__title">Foundations</p>
            ${metricBtn(o.activeFoundations, 'Active Creator Foundations', 'foundations')}
            ${metricBtn(o.foundationsTotal, 'Total profiles', 'foundations')}
            ${metricBtn(o.mapPoints, 'Mapped voices', 'map')}
          </div>
        </div>
        ${o.operationsNote ? `<p class="owner-muted" style="margin-top:14px">${esc(o.operationsNote)}</p>` : ''}
      </section>

      <section class="owner-section owner-two-col">
        <div>
          ${renderGrowthPanel({ embed: true, showCards: false })}
          <div style="margin-top:12px">
            <button type="button" class="owner-btn-ghost" data-section-jump="growth">Open Growth</button>
          </div>
        </div>
        <div>
          <p class="owner-section__label">Global map</p>
          ${renderOwnerLeafletMap({ compact: true })}
          ${(() => {
            const filtered = getFilteredMapCities();
            const filtersActive = hasActiveMapFilters();
            return `
              <p class="owner-muted" style="margin-top:10px">
                ${esc(num(filtered.stats.voices))} geolocated Voices · ${esc(num(filtered.stats.cities))} cities · ${esc(num(filtered.stats.countries))} countries
                ${filtersActive ? ' · matching Map filters' : ''}
              </p>
              ${filtered.note ? `<p class="owner-muted">${esc(filtered.note)}</p>` : ''}
            `;
          })()}
          <div style="margin-top:12px">
            <button type="button" class="owner-btn-ghost" data-section-jump="map">Open Global Map</button>
          </div>
        </div>
      </section>

      <section class="owner-section owner-two-col">
        <div>
          <p class="owner-section__label">Needs attention</p>
          <div class="owner-panel">
            ${(d.operations.alerts || []).length
              ? d.operations.alerts.map((a) => `<p>${esc(a)}</p>`).join('')
              : `<p class="owner-empty" style="padding:8px 0">All clear.</p>`}
          </div>
        </div>
        <div>
          <p class="owner-section__label">Recent activity</p>
          ${renderActivity(d.activity, true)}
          <div style="margin-top:12px">
            <button type="button" class="owner-btn-ghost" data-section-jump="operations">View operations</button>
          </div>
        </div>
      </section>
    `;
  }

  function metricBtn(value, label, section, extra, raw = false) {
    return `
      <button type="button" class="owner-metric" data-section-jump="${esc(section)}" ${extra?.sort ? `data-focus="${extra.sort}"` : ''}>
        <span>
          <span class="owner-metric__value">${raw ? esc(value) : esc(num(value))}</span>
          <span class="owner-metric__label" style="display:block;margin-top:4px">${esc(label)}</span>
        </span>
        <span class="owner-metric__go">Explore</span>
      </button>
    `;
  }

  /** Shared Leaflet shell — Overview, Map, Event all mount the same OwnerMap instance. */
  function renderOwnerLeafletMap({ compact = false } = {}) {
    return `
      <div class="owner-leaflet-shell ${compact ? 'owner-leaflet-shell--compact' : ''}">
        <div id="owner-world-map"></div>
        <div class="city-card" id="owner-city-card">
          <p class="city-card__place" id="owner-city-card-place">—</p>
          <p class="city-card__voices" id="owner-city-card-voices">—</p>
        </div>
      </div>
    `;
  }

  function hasActiveMapFilters() {
    const f = state.mapFilters || {};
    return f.mode !== 'voices' || !!f.country || f.range !== 'all' || !!f.foundationId;
  }

  function getMapRangeBounds(range) {
    const now = Date.now();
    if (range === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { from: start.getTime(), to: now };
    }
    const days = { '7d': 7, '30d': 30, '90d': 90 }[range];
    if (!days) return { from: null, to: null };
    return { from: now - days * 86400000, to: now };
  }

  function getFilteredMapCities() {
    const f = state.mapFilters;
    const points = state.data?.map?.points || [];
    const { from, to } = getMapRangeBounds(f.range);
    const foundation = (state.data.foundations || []).find((x) => x.id === f.foundationId);

    if (f.mode === 'donations' || f.mode === 'combined') {
      const donationPoints = state.data?.map?.donationPoints || [];
      if (!donationPoints.length) {
        return {
          cities: [],
          stats: { voices: 0, cities: 0, countries: 0 },
          note: f.mode === 'donations'
            ? 'Donation map points appear when verified donations include World Choir participation coordinates.'
            : 'Combined mode needs donation geography. Showing Voices until donation coordinates exist.',
          modeBlocked: f.mode === 'donations',
        };
      }

      let filteredDonations = donationPoints.filter((p) =>
        Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
      );
      if (f.country) {
        filteredDonations = filteredDonations.filter(
          (p) => String(p.country || '').toLowerCase() === f.country.toLowerCase()
        );
      }
      if (foundation?.country && f.mode === 'donations') {
        // Keep donation points; foundation filter is country-based for Voices only.
      }

      if (f.mode === 'donations') {
        const cities = filteredDonations.map((p) => ({
          city: p.city || 'Unknown city',
          country: p.country || 'Unknown country',
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          count: p.count || p.donors || 1,
          voices: 0,
          donors: p.donors || p.count || 1,
          raised: p.raised || 0,
          currency: state.data.currency || 'EUR',
        }));
        return {
          cities,
          stats: {
            voices: 0,
            cities: cities.length,
            countries: new Set(cities.map((c) => c.country)).size,
          },
          note: null,
          modeBlocked: false,
        };
      }
      // combined: fall through after merging donation markers into Voices path below
      state._combinedDonationCities = filteredDonations;
    } else {
      state._combinedDonationCities = null;
    }

    let filtered = points.filter((p) =>
      Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
    );

    if (f.country) {
      filtered = filtered.filter(
        (p) => String(p.country || '').toLowerCase() === f.country.toLowerCase()
      );
    }

    if (from != null) {
      filtered = filtered.filter((p) => {
        const t = p.pledgedAt ? new Date(p.pledgedAt).getTime() : NaN;
        if (!Number.isFinite(t)) return false;
        if (t < from) return false;
        if (to != null && t > to) return false;
        return true;
      });
    }

    if (foundation?.country) {
      filtered = filtered.filter(
        (p) => String(p.country || '').toLowerCase() === String(foundation.country).toLowerCase()
      );
    }

    const byCity = new Map();
    filtered.forEach((p) => {
      const city = p.city || 'Unknown city';
      const country = p.country || 'Unknown country';
      const key = `${city}|${country}`;
      if (!byCity.has(key)) {
        byCity.set(key, {
          city,
          country,
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          count: 0,
          voices: 0,
          donors: 0,
          raised: 0,
          currency: state.data.currency || 'EUR',
        });
      }
      const row = byCity.get(key);
      row.count += 1;
      row.voices += 1;
    });

    if (f.mode === 'combined' && Array.isArray(state._combinedDonationCities)) {
      state._combinedDonationCities.forEach((p) => {
        const city = p.city || 'Unknown city';
        const country = p.country || 'Unknown country';
        const key = `${city}|${country}`;
        if (!byCity.has(key)) {
          byCity.set(key, {
            city,
            country,
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            count: 0,
            voices: 0,
            donors: 0,
            raised: 0,
            currency: state.data.currency || 'EUR',
          });
        }
        const row = byCity.get(key);
        row.donors += p.donors || p.count || 1;
        row.raised += Number(p.raised) || 0;
        row.count = Math.max(row.count, row.voices + row.donors);
      });
    }

    const cities = Array.from(byCity.values());
    const countries = new Set(cities.map((c) => c.country));
    return {
      cities,
      stats: {
        voices: filtered.length,
        cities: cities.length,
        countries: countries.size,
      },
      note: cities.length ? null : 'No geolocated Voices match these filters.',
      modeBlocked: false,
    };
  }

  function renderMap() {
    const countries = (state.data.countries || []).map((c) => c.country).filter(Boolean);
    const foundations = state.data.foundations || [];
    const f = state.mapFilters;
    const filtered = getFilteredMapCities();

    return `
      <section class="owner-section">
        <p class="owner-section__label">Geographic intelligence</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Global Map</h2>
        <p class="owner-sub">Same live map as the public Map tab — with Owner-only filters.</p>
      </section>

      <section class="owner-map-filters">
        <div class="owner-field">
          <label>Mode</label>
          <select id="owner-map-mode">
            <option value="voices" ${f.mode === 'voices' ? 'selected' : ''}>Voices</option>
            <option value="donations" ${f.mode === 'donations' ? 'selected' : ''}>Donations</option>
            <option value="combined" ${f.mode === 'combined' ? 'selected' : ''}>Combined</option>
          </select>
        </div>
        <div class="owner-field">
          <label>Country</label>
          <select id="owner-map-country">
            <option value="">All countries</option>
            ${countries.map((c) => `
              <option value="${esc(c)}" ${f.country === c ? 'selected' : ''}>${esc(c)}</option>
            `).join('')}
          </select>
        </div>
        <div class="owner-field">
          <label>Date range</label>
          <select id="owner-map-range">
            <option value="all" ${f.range === 'all' ? 'selected' : ''}>All time</option>
            <option value="today" ${f.range === 'today' ? 'selected' : ''}>Today</option>
            <option value="7d" ${f.range === '7d' ? 'selected' : ''}>7 days</option>
            <option value="30d" ${f.range === '30d' ? 'selected' : ''}>30 days</option>
            <option value="90d" ${f.range === '90d' ? 'selected' : ''}>90 days</option>
          </select>
        </div>
        <div class="owner-field">
          <label>Creator Foundation</label>
          <select id="owner-map-foundation">
            <option value="">All foundations</option>
            ${foundations.map((x) => `
              <option value="${esc(x.id)}" ${f.foundationId === x.id ? 'selected' : ''}>
                ${esc(x.foundation || x.creator)}
              </option>
            `).join('')}
          </select>
        </div>
      </section>

      <div class="owner-map-stats">
        <div><strong>${esc(num(filtered.stats.voices))}</strong><span>Voices</span></div>
        <div><strong>${esc(num(filtered.stats.cities))}</strong><span>Cities</span></div>
        <div><strong>${esc(num(filtered.stats.countries))}</strong><span>Countries</span></div>
      </div>

      ${renderOwnerLeafletMap()}
      ${filtered.note ? `<p class="owner-muted" style="margin-top:12px">${esc(filtered.note)}</p>` : ''}
      ${f.foundationId && f.mode === 'voices'
        ? `<p class="owner-muted">Foundation filter currently narrows Voices by that foundation’s country. Voices are not yet linked to individual foundations.</p>`
        : ''}
    `;
  }

  /* ─── Community ─── */

  function renderCommunity() {
    const c = state.data.community;
    const cities = [...state.data.cities].sort((a, b) => {
      if (state.citySort === 'city') return a.city.localeCompare(b.city);
      return b.voices - a.voices;
    });
    const countries = [...state.data.countries].sort((a, b) => {
      if (state.countrySort === 'country') return a.country.localeCompare(b.country);
      return b.voices - a.voices;
    });

    return `
      <section class="owner-section">
        <p class="owner-section__label">Community</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">People & participation</h2>
        <p class="owner-sub">Registered users, Voices pledged, and geographic intelligence from real participation data.</p>
      </section>

      <section class="owner-section owner-groups">
        <div class="owner-group">
          <p class="owner-group__title">Definitions</p>
          <p class="owner-muted">Registered users: accounts created.<br>
          Voices pledged: confirmed participants.<br>
          Donors: unique verified donation identities.</p>
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Snapshot</p>
          ${metricBtn(c.registeredUsers, 'Registered users', 'community')}
          ${metricBtn(c.voicesPledged, 'Voices pledged', 'community')}
          ${metricBtn(c.usersWithPromise, 'Promises submitted', 'community')}
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Not tracked yet</p>
          <p class="owner-muted">${(c.unavailable || []).map(esc).join(' · ') || '—'}</p>
        </div>
      </section>

      <section class="owner-section">
        <p class="owner-section__label">Participation funnel</p>
        <div class="owner-funnel">
          ${(c.funnel || []).map((step) => `
            <div class="owner-funnel__step">
              <div>
                <div class="owner-funnel__label">${esc(step.label)}</div>
                <div class="owner-funnel__meta">
                  ${step.rateFromPrevious != null ? `${pct(step.rateFromPrevious)} from previous stage` : 'Entry stage'}
                  ${step.note ? ` · ${esc(step.note)}` : ''}
                </div>
              </div>
              <div class="owner-funnel__count">${esc(num(step.count))}</div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="owner-section">
        <div class="owner-panel__head">
          <div>
            <p class="owner-section__label">City intelligence</p>
            <p class="owner-muted">${esc(num(cities.length))} cities with pledged Voices</p>
          </div>
          <div class="owner-chips">
            <button type="button" class="owner-chip ${state.citySort === 'voices' ? 'is-active' : ''}" data-city-sort="voices">Most Voices</button>
            <button type="button" class="owner-chip ${state.citySort === 'city' ? 'is-active' : ''}" data-city-sort="city">A–Z</button>
            <button type="button" class="owner-btn-ghost" data-export="cities">Export CSV</button>
          </div>
        </div>
        ${renderCityTable(cities)}
        ${state.cityDetail ? renderCityDetail(state.cityDetail) : ''}
      </section>

      <section class="owner-section">
        <div class="owner-panel__head">
          <div>
            <p class="owner-section__label">Country intelligence</p>
            <p class="owner-muted">${esc(num(countries.length))} countries represented</p>
          </div>
          <div class="owner-chips">
            <button type="button" class="owner-chip ${state.countrySort === 'voices' ? 'is-active' : ''}" data-country-sort="voices">Most Voices</button>
            <button type="button" class="owner-chip ${state.countrySort === 'country' ? 'is-active' : ''}" data-country-sort="country">A–Z</button>
            <button type="button" class="owner-btn-ghost" data-export="countries">Export CSV</button>
          </div>
        </div>
        ${renderCountryTable(countries)}
        ${state.countryDetail ? renderCountryDetail(state.countryDetail) : ''}
      </section>
    `;
  }

  function renderCityTable(cities) {
    if (!cities.length) return `<p class="owner-empty">No city data yet.</p>`;
    return `
      <div class="owner-table-wrap">
        <table class="owner-table">
          <thead>
            <tr>
              <th>Rank</th><th>City</th><th>Country</th><th>Voices</th>
              <th>Donors</th><th>Donated</th><th>Conversion</th>
            </tr>
          </thead>
          <tbody>
            ${cities.map((c) => `
              <tr data-city-key="${esc(c.city)}|${esc(c.country)}" style="cursor:pointer">
                <td>${esc(c.rank)}</td>
                <td>${esc(c.city)}</td>
                <td>${esc(c.country)}</td>
                <td>${esc(num(c.voices))}</td>
                <td>${esc(num(c.uniqueDonors))}</td>
                <td>${esc(money(c.totalDonations, state.data.currency))}</td>
                <td>${c.donationConversion == null ? '—' : esc(pct(c.donationConversion))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCityDetail(c) {
    return `
      <div class="owner-detail">
        <h3>${esc(c.city)}, ${esc(c.country)}</h3>
        <p class="owner-muted">Voices pledged: ${esc(num(c.voices))} · Donors: ${esc(num(c.uniqueDonors))} · Donated: ${esc(money(c.totalDonations, state.data.currency))}${c.donationCount != null ? ` · Donations: ${esc(num(c.donationCount))}` : ''}</p>
      </div>
    `;
  }

  function renderCountryTable(countries) {
    if (!countries.length) return `<p class="owner-empty">No country data yet.</p>`;
    return `
      <div class="owner-table-wrap">
        <table class="owner-table">
          <thead>
            <tr>
              <th>Country</th><th>Voices</th><th>Cities</th><th>Foundations</th>
              <th>Donors</th><th>Donated</th>
            </tr>
          </thead>
          <tbody>
            ${countries.map((c) => `
              <tr data-country-key="${esc(c.country)}" style="cursor:pointer">
                <td>${esc(c.country)}</td>
                <td>${esc(num(c.voices))}</td>
                <td>${esc(num(c.cities))}</td>
                <td>${esc(num(c.foundations))}</td>
                <td>${esc(num(c.donors))}</td>
                <td>${esc(money(c.totalDonated, state.data.currency))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCountryDetail(c) {
    return `
      <div class="owner-detail">
        <h3>${esc(c.country)}</h3>
        <p class="owner-muted">Voices: ${esc(num(c.voices))} · Cities: ${esc(num(c.cities))} · Creator Foundations: ${esc(num(c.foundations))}</p>
        <p class="owner-muted" style="margin-top:8px">
          Donors: ${esc(num(c.donors))}
          · Donated: ${esc(money(c.totalDonated, state.data.currency))}
          ${c.foundationAllocation != null ? ` · Foundation allocation: ${esc(money(c.foundationAllocation, state.data.currency))}` : ''}
          ${c.platformFee != null ? ` · Platform fee: ${esc(money(c.platformFee, state.data.currency))}` : ''}
        </p>
      </div>
    `;
  }

  /* ─── Map / Donations / Foundations / etc. ─── */

  function renderActivity(items = [], compact = false) {
    const filtered = state.activityFilter === 'all'
      ? items
      : items.filter((i) => i.type === state.activityFilter);
    const list = (compact ? filtered.slice(0, 8) : filtered.slice(0, 40));

    return `
      <div class="owner-chips">
        ${['all', 'community', 'donations', 'foundations', 'system'].map((f) => `
          <button type="button" class="owner-chip ${state.activityFilter === f ? 'is-active' : ''}" data-activity-filter="${f}">${esc(f)}</button>
        `).join('')}
      </div>
      ${!list.length
        ? `<p class="owner-empty">No activity recorded yet.</p>`
        : `<ul class="owner-activity">
            ${list.map((i) => `
              <li>
                <div>
                  <div class="owner-activity__label">${esc(i.label)}</div>
                  <div class="owner-activity__detail">${esc(i.detail || '')}</div>
                </div>
                <div class="owner-activity__time">${esc(when(i.at))}</div>
              </li>
            `).join('')}
          </ul>`}
    `;
  }

  function renderDonations() {
    const d = state.data.donations;
    const currency = state.data.currency || 'EUR';
    return `
      <section class="owner-section">
        <p class="owner-section__label">Donations</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Donation control center</h2>
        <p class="owner-sub">Verified donations only. Mock or preview payments are never counted.</p>
      </section>
      <section class="owner-section owner-groups">
        <div class="owner-group">
          <p class="owner-group__title">Totals</p>
          ${metricBtn(money(d.totalDonated, currency), 'Total donated', 'donations', null, true)}
          ${metricBtn(d.totalDonors, 'Donors', 'donations')}
          ${metricBtn(d.totalDonations, 'Donations', 'donations')}
          ${metricBtn(d.donationsToday, 'Donations today', 'donations')}
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Quality</p>
          ${metricBtn(d.averageDonation == null ? '—' : money(d.averageDonation, currency), 'Average donation', 'donations', null, true)}
          ${metricBtn(d.medianDonation == null ? '—' : money(d.medianDonation, currency), 'Median donation', 'donations', null, true)}
          ${metricBtn(d.conversionRate == null ? '—' : pct(d.conversionRate), 'Conversion vs Voices', 'donations', null, true)}
          <p class="owner-muted" style="margin-top:8px">${esc(d.conversionDefinition || '')}</p>
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Operations</p>
          ${metricBtn(money(d.operationsShare, currency), `Owner ops share (${d.platformFeePercent}%)`, 'donations', null, true)}
          <p class="owner-muted" style="margin-top:8px">${esc(d.note || 'Verified donation activity will appear here.')}</p>
        </div>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Foundation performance</p>
        ${!(d.byFoundation || []).length
          ? `<p class="owner-empty">No Creator Foundations yet.</p>`
          : `<div class="owner-table-wrap"><table class="owner-table">
              <thead><tr>
                <th>Creator</th><th>Foundation</th><th>Status</th><th>Country</th>
                <th>Donors</th><th>Raised</th><th>Avg</th><th>Projects</th>
              </tr></thead>
              <tbody>
                ${d.byFoundation.map((f) => `
                  <tr>
                    <td>${esc(f.creator)}</td>
                    <td>${esc(f.foundation)}</td>
                    <td>${esc(f.status)}</td>
                    <td>${esc(f.country || '—')}</td>
                    <td>${esc(num(f.uniqueDonors))}</td>
                    <td>${esc(money(f.totalRaised, currency))}</td>
                    <td>${f.averageDonation == null ? '—' : esc(money(f.averageDonation, currency))}</td>
                    <td>${esc(num(f.activeProjects))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`}
        <p class="owner-muted" style="margin-top:12px">Unavailable until tracked: ${(d.unavailable || []).map(esc).join(' · ')}</p>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Recent donations</p>
        ${!(d.recent || []).length
          ? `<p class="owner-empty">No verified donations yet.</p>`
          : `<div class="owner-table-wrap"><table class="owner-table">
              <thead><tr>
                <th>Date</th><th>Foundation</th><th>Amount</th><th>Foundation net</th>
                <th>Ops fee</th><th>Donor</th><th>Place</th><th>Status</th><th>Type</th>
              </tr></thead>
              <tbody>
                ${d.recent.map((row) => `
                  <tr>
                    <td>${esc(when(row.createdAt))}</td>
                    <td>${esc(row.foundationName || '—')}<div class="owner-muted">${esc(row.creatorName || '')}</div></td>
                    <td>${esc(money(row.amount, row.currency || currency))}</td>
                    <td>${esc(money(row.foundationAmount, row.currency || currency))}</td>
                    <td>${esc(money(row.platformFee, row.currency || currency))}</td>
                    <td>${esc(row.donorDisplayName || 'Anonymous')}${row.message ? `<div class="owner-muted">“${esc(row.message)}”</div>` : ''}</td>
                    <td>${esc([row.city, row.country].filter(Boolean).join(', ') || '—')}</td>
                    <td>${esc(row.status || '—')}</td>
                    <td>${row.isTest ? 'TEST' : 'REAL'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`}
      </section>
    `;
  }

  const FOUNDATION_PAGE_SIZE = 10;

  function foundationDateShort(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  function displayWebsite(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return raw.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  function foundationGlyph(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  }

  function foundationStatusMeta(status) {
    if (status === 'active') return { label: 'Active', tone: 'active' };
    if (status === 'draft') return { label: 'Draft', tone: 'draft' };
    if (status === 'paused') return { label: 'Inactive', tone: 'paused' };
    return { label: status || '—', tone: 'paused' };
  }

  function getFoundationCategories(list) {
    const cats = new Set();
    list.forEach((f) => {
      if (f.primaryCategory) cats.add(f.primaryCategory);
    });
    return [...cats].sort((a, b) => a.localeCompare(b));
  }

  function filterSortFoundations(list) {
    let items = list.slice();
    const q = String(state.foundationQuery || '').trim().toLowerCase();
    if (q) {
      items = items.filter((f) => (
        String(f.foundation || '').toLowerCase().includes(q)
        || String(f.creator || '').toLowerCase().includes(q)
        || String(f.email || '').toLowerCase().includes(q)
        || String(f.country || '').toLowerCase().includes(q)
        || String(f.primaryCategory || '').toLowerCase().includes(q)
        || displayWebsite(f.website).toLowerCase().includes(q)
      ));
    }
    if (state.foundationStatusFilter && state.foundationStatusFilter !== 'all') {
      items = items.filter((f) => f.status === state.foundationStatusFilter);
    }
    if (state.foundationCategoryFilter && state.foundationCategoryFilter !== 'all') {
      items = items.filter((f) => f.primaryCategory === state.foundationCategoryFilter);
    }
    const sort = state.foundationSort || 'updated';
    items.sort((a, b) => {
      if (sort === 'created') {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      }
      if (sort === 'raised') {
        return (Number(b.totalRaised) || 0) - (Number(a.totalRaised) || 0);
      }
      if (sort === 'name') {
        return String(a.foundation || a.creator || '').localeCompare(String(b.foundation || b.creator || ''));
      }
      if (sort === 'projects') {
        return (Number(b.totalProjects) || 0) - (Number(a.totalProjects) || 0);
      }
      return String(b.updatedAt || b.lastActivity || '').localeCompare(String(a.updatedAt || a.lastActivity || ''));
    });
    return items;
  }

  function paginateFoundations(items, page) {
    const totalPages = Math.max(1, Math.ceil(items.length / FOUNDATION_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page || 1), totalPages);
    const start = (safePage - 1) * FOUNDATION_PAGE_SIZE;
    return {
      items: items.slice(start, start + FOUNDATION_PAGE_SIZE),
      page: safePage,
      totalPages,
      total: items.length,
    };
  }

  function foundationActivityThumb(item, list) {
    if (item.type === 'foundations' && String(item.id || '').startsWith('inf-')) {
      const id = String(item.id).slice(4);
      const f = list.find((x) => x.id === id);
      return f?.profileImage || f?.coverImage || '';
    }
    return '';
  }

  function renderFoundationRow(f, currency) {
    const status = foundationStatusMeta(f.status);
    const coverGlyph = foundationGlyph(f.foundation || f.creator);
    const creatorGlyph = foundationGlyph(f.creator);
    const websiteLabel = displayWebsite(f.website);
    const projectCount = Number.isFinite(Number(f.totalProjects))
      ? Number(f.totalProjects)
      : Number(f.activeProjects) || 0;
    return `
      <tr data-foundation-id="${esc(f.id)}" class="owner-cf-row">
        <td>
          <div class="owner-cf-foundation">
            <span class="owner-cf-foundation__cover ${f.coverImage ? 'has-image' : ''}" aria-hidden="true">
              ${f.coverImage
                ? `<img src="${esc(f.coverImage)}" alt="">`
                : `<span>${esc(coverGlyph)}</span>`}
            </span>
            <span class="owner-cf-foundation__meta">
              <span class="owner-cf-foundation__name">${esc(f.foundation || f.creator)}</span>
              ${f.verificationStatus === 'verified'
                ? '<span class="owner-cf-badge">VERIFIED</span>'
                : ''}
              ${websiteLabel
                ? `<span class="owner-cf-foundation__url">${esc(websiteLabel)}</span>`
                : (f.email ? `<span class="owner-cf-foundation__url">${esc(f.email)}</span>` : '')}
            </span>
          </div>
        </td>
        <td>
          <div class="owner-cf-creator">
            <span class="owner-cf-creator__avatar ${f.profileImage ? 'has-image' : ''}" aria-hidden="true">
              ${f.profileImage
                ? `<img src="${esc(f.profileImage)}" alt="">`
                : `<span>${esc(creatorGlyph)}</span>`}
            </span>
            <span>${esc(f.creator)}</span>
          </div>
        </td>
        <td>
          <span class="owner-cf-status owner-cf-status--${status.tone}">
            <span class="owner-cf-status__dot" aria-hidden="true"></span>
            ${esc(status.label)}
          </span>
        </td>
        <td>${esc(num(projectCount))}</td>
        <td>${esc(f.primaryCategory || '—')}</td>
        <td>${esc(foundationDateShort(f.createdAt))}</td>
        <td>
          <div class="owner-cf-actions">
            <button type="button" class="owner-cf-action" data-foundation-id="${esc(f.id)}" title="Edit foundation" aria-label="Edit foundation">✎</button>
            <button type="button" class="owner-cf-action" data-foundation-export="${esc(f.id)}" title="Export foundation" aria-label="Export foundation">⤓</button>
            <div class="owner-cf-menu-wrap">
              <button
                type="button"
                class="owner-cf-action ${state.foundationActionMenu === f.id ? 'is-open' : ''}"
                data-foundation-menu-toggle="${esc(f.id)}"
                title="More actions"
                aria-label="More actions"
                aria-expanded="${state.foundationActionMenu === f.id ? 'true' : 'false'}"
              >⋯</button>
              ${state.foundationActionMenu === f.id ? `
                <div class="owner-cf-menu" role="menu">
                  <button
                    type="button"
                    class="owner-cf-menu__item ${f.status === 'active' ? 'is-current' : ''}"
                    data-foundation-status="${esc(f.id)}"
                    data-status="active"
                    role="menuitem"
                    ${f.status === 'active' ? 'disabled' : ''}
                  >Active</button>
                  <button
                    type="button"
                    class="owner-cf-menu__item ${f.status === 'paused' ? 'is-current' : ''}"
                    data-foundation-status="${esc(f.id)}"
                    data-status="inactive"
                    role="menuitem"
                    ${f.status === 'paused' ? 'disabled' : ''}
                  >Inactive</button>
                  <button
                    type="button"
                    class="owner-cf-menu__item owner-cf-menu__item--danger"
                    data-foundation-delete="${esc(f.id)}"
                    role="menuitem"
                  >Delete</button>
                </div>
              ` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function renderFoundationGridCard(f, currency) {
    const status = foundationStatusMeta(f.status);
    const coverGlyph = foundationGlyph(f.foundation || f.creator);
    const creatorGlyph = foundationGlyph(f.creator);
    const projectCount = Number.isFinite(Number(f.totalProjects))
      ? Number(f.totalProjects)
      : Number(f.activeProjects) || 0;
    return `
      <button type="button" class="owner-cf-card" data-foundation-id="${esc(f.id)}">
        <span class="owner-cf-card__cover ${f.coverImage ? 'has-image' : ''}">
          ${f.coverImage
            ? `<img src="${esc(f.coverImage)}" alt="">`
            : `<span>${esc(coverGlyph)}</span>`}
        </span>
        <span class="owner-cf-card__body">
          <span class="owner-cf-card__title">
            ${esc(f.foundation || f.creator)}
            ${f.verificationStatus === 'verified' ? '<span class="owner-cf-badge">VERIFIED</span>' : ''}
          </span>
          <span class="owner-cf-card__creator">
            <span class="owner-cf-creator__avatar ${f.profileImage ? 'has-image' : ''}" aria-hidden="true">
              ${f.profileImage
                ? `<img src="${esc(f.profileImage)}" alt="">`
                : `<span>${esc(creatorGlyph)}</span>`}
            </span>
            ${esc(f.creator)}
          </span>
          <span class="owner-cf-card__meta">
            <span class="owner-cf-status owner-cf-status--${status.tone}">
              <span class="owner-cf-status__dot" aria-hidden="true"></span>
              ${esc(status.label)}
            </span>
            · ${esc(num(projectCount))} projects · ${esc(money(f.totalRaised, currency))}
          </span>
        </span>
      </button>
    `;
  }

  function renderFoundations() {
    const list = state.data.foundations || [];
    const currency = state.data.currency || 'EUR';
    const platformFee = Number(state.data.platformFeePercent);
    const foundationShare = Number.isFinite(platformFee) ? 100 - platformFee : 90;
    const detail = state.foundationDetail
      ? list.find((f) => f.id === state.foundationDetail)
      : null;
    const categories = getFoundationCategories(list);
    const filtered = filterSortFoundations(list);
    const pageData = paginateFoundations(filtered, state.foundationPage);
    const activeCount = list.filter((f) => f.status === 'active').length;
    const draftCount = list.filter((f) => f.status === 'draft').length;
    const pausedCount = list.filter((f) => f.status === 'paused').length;
    const totalProjects = list.reduce((sum, f) => sum + (Number(f.totalProjects) || Number(f.activeProjects) || 0), 0);
    const totalRaised = list.reduce((sum, f) => sum + (Number(f.totalRaised) || 0), 0);
    const statusTotal = Math.max(1, list.length);
    const donutActive = Math.round((activeCount / statusTotal) * 100);
    const donutDraft = Math.round((draftCount / statusTotal) * 100);
    const donutPaused = Math.max(0, 100 - donutActive - donutDraft);
    const foundationActivity = (state.data.activity || [])
      .filter((item) => item.type === 'foundations' || item.type === 'donations')
      .slice(0, 6);
    const pageButtons = Array.from({ length: pageData.totalPages }, (_, i) => i + 1);

    return `
      <div class="owner-cf">
        <div class="owner-cf__layout">
          <div class="owner-cf__main">
            <header class="owner-cf__header">
              <div>
                <h2 class="owner-cf__title">Creator Foundations</h2>
                <p class="owner-muted owner-cf__subtitle">
                  Manage creator foundations, public profiles, and Members logins.
                </p>
              </div>
              <button type="button" class="owner-btn" id="owner-create-foundation">+ Create Foundation</button>
            </header>

            <div class="owner-cf__stats">
              <article class="owner-cf-stat">
                <p class="owner-cf-stat__label">Total Foundations</p>
                <p class="owner-cf-stat__value">${esc(num(list.length))}</p>
              </article>
              <article class="owner-cf-stat">
                <p class="owner-cf-stat__label">Active Foundations</p>
                <p class="owner-cf-stat__value">${esc(num(activeCount))}</p>
              </article>
              <article class="owner-cf-stat">
                <p class="owner-cf-stat__label">Total Projects</p>
                <p class="owner-cf-stat__value">${esc(num(totalProjects))}</p>
              </article>
              <article class="owner-cf-stat">
                <p class="owner-cf-stat__label">Total Raised</p>
                <p class="owner-cf-stat__value">${esc(money(totalRaised, currency))}</p>
                <p class="owner-cf-stat__note">${esc(foundationShare)}% goes to foundations</p>
              </article>
            </div>

            <div class="owner-cf__toolbar">
              <label class="owner-cf-search">
                <span class="owner-cf-search__icon" aria-hidden="true">⌕</span>
                <input
                  id="owner-cf-search"
                  class="owner-cf-search__input"
                  type="search"
                  placeholder="Search foundations..."
                  value="${esc(state.foundationQuery)}"
                >
              </label>
              <select class="owner-cf-select" id="owner-cf-status-filter" aria-label="Filter by status">
                <option value="all" ${state.foundationStatusFilter === 'all' ? 'selected' : ''}>All statuses</option>
                <option value="active" ${state.foundationStatusFilter === 'active' ? 'selected' : ''}>Active</option>
                <option value="draft" ${state.foundationStatusFilter === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="paused" ${state.foundationStatusFilter === 'paused' ? 'selected' : ''}>Inactive</option>
              </select>
              <select class="owner-cf-select" id="owner-cf-category-filter" aria-label="Filter by category">
                <option value="all" ${state.foundationCategoryFilter === 'all' ? 'selected' : ''}>All categories</option>
                ${categories.map((cat) => `
                  <option value="${esc(cat)}" ${state.foundationCategoryFilter === cat ? 'selected' : ''}>${esc(cat)}</option>
                `).join('')}
              </select>
              <select class="owner-cf-select" id="owner-cf-sort" aria-label="Sort foundations">
                <option value="updated" ${state.foundationSort === 'updated' ? 'selected' : ''}>Sort by: Recently Updated</option>
                <option value="created" ${state.foundationSort === 'created' ? 'selected' : ''}>Sort by: Created Date</option>
                <option value="raised" ${state.foundationSort === 'raised' ? 'selected' : ''}>Sort by: Total Raised</option>
                <option value="projects" ${state.foundationSort === 'projects' ? 'selected' : ''}>Sort by: Projects</option>
                <option value="name" ${state.foundationSort === 'name' ? 'selected' : ''}>Sort by: Name</option>
              </select>
              <div class="owner-cf-view-toggle" role="group" aria-label="View mode">
                <button type="button" class="owner-cf-view-btn ${state.foundationLayout === 'list' ? 'is-active' : ''}" data-foundation-layout="list" title="List view" aria-label="List view">☰</button>
                <button type="button" class="owner-cf-view-btn ${state.foundationLayout === 'grid' ? 'is-active' : ''}" data-foundation-layout="grid" title="Grid view" aria-label="Grid view">▦</button>
              </div>
            </div>

            ${!list.length
              ? `<p class="owner-empty owner-cf__empty">No Creator Foundations yet. Create the first profile to publish it to Donate.</p>`
              : !pageData.total
                ? `<p class="owner-empty owner-cf__empty">No foundations match your filters.</p>`
                : state.foundationLayout === 'grid'
                  ? `<div class="owner-cf-grid">
                      ${pageData.items.map((f) => renderFoundationGridCard(f, currency)).join('')}
                    </div>`
                  : `<div class="owner-cf-table-wrap">
                      <table class="owner-cf-table">
                        <thead>
                          <tr>
                            <th>Foundation</th>
                            <th>Creator</th>
                            <th>Status</th>
                            <th>Projects</th>
                            <th>Focus Area</th>
                            <th>Created</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${pageData.items.map((f) => renderFoundationRow(f, currency)).join('')}
                        </tbody>
                      </table>
                    </div>`}

            ${pageData.total > FOUNDATION_PAGE_SIZE ? `
              <nav class="owner-cf-pagination" aria-label="Foundations pagination">
                <button type="button" class="owner-cf-page-btn" data-foundation-page="${esc(pageData.page - 1)}" ${pageData.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
                ${pageButtons.map((n) => `
                  <button type="button" class="owner-cf-page-btn ${n === pageData.page ? 'is-active' : ''}" data-foundation-page="${n}">${n}</button>
                `).join('')}
                <button type="button" class="owner-cf-page-btn" data-foundation-page="${esc(pageData.page + 1)}" ${pageData.page >= pageData.totalPages ? 'disabled' : ''} aria-label="Next page">›</button>
              </nav>
            ` : ''}

            <section class="owner-section owner-group owner-cf-recover">
              <p class="owner-group__title">Recover Members login password</p>
              <p class="owner-muted" style="margin-bottom:14px">
                Set a new temporary password using the Creator’s login email.
                You cannot view a password they chose themselves — only reset it here.
              </p>
              <form class="owner-form" id="owner-reset-influencer-password" style="max-width:560px">
                <div class="owner-field">
                  <label for="owner-reset-email">Login email</label>
                  <input
                    id="owner-reset-email"
                    name="email"
                    type="email"
                    list="owner-foundation-emails"
                    required
                    autocomplete="off"
                    placeholder="creator@example.com"
                  >
                  <datalist id="owner-foundation-emails">
                    ${list.map((f) => `<option value="${esc(f.email || '')}"></option>`).join('')}
                  </datalist>
                </div>
                <div class="owner-field">
                  <label for="owner-reset-password">New temporary password</label>
                  <div class="owner-password-row">
                    <input
                      id="owner-reset-password"
                      name="newPassword"
                      type="text"
                      required
                      minlength="8"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="At least 8 characters"
                    >
                    <button type="button" class="owner-btn-ghost" id="owner-reset-copy-credentials" title="Copy email and password">Copy</button>
                  </div>
                </div>
                <button class="owner-btn" type="submit">Reset password</button>
              </form>
            </section>
          </div>

          <aside class="owner-cf__aside">
            <section class="owner-cf-panel">
              <h3 class="owner-cf-panel__title">Foundation Status</h3>
              <div class="owner-cf-donut-wrap">
                <div
                  class="owner-cf-donut"
                  style="--cf-active:${donutActive}%;--cf-draft:${donutDraft}%;--cf-paused:${donutPaused}%"
                  aria-hidden="true"
                ></div>
                <ul class="owner-cf-donut-legend">
                  <li><span class="owner-cf-dot owner-cf-dot--active"></span> Active <strong>${esc(donutActive)}%</strong></li>
                  <li><span class="owner-cf-dot owner-cf-dot--draft"></span> Draft <strong>${esc(donutDraft)}%</strong></li>
                  <li><span class="owner-cf-dot owner-cf-dot--paused"></span> Inactive <strong>${esc(donutPaused)}%</strong></li>
                </ul>
              </div>
            </section>

            <section class="owner-cf-panel">
              <h3 class="owner-cf-panel__title">Quick Actions</h3>
              <div class="owner-cf-quick">
                <button type="button" class="owner-cf-quick__btn" id="owner-cf-quick-create">Create Foundation</button>
                <a class="owner-cf-quick__btn" href="/members" target="_blank" rel="noopener">Open Members Portal</a>
                <a class="owner-cf-quick__btn" href="/donate" target="_blank" rel="noopener">View Donate Page</a>
                <button type="button" class="owner-cf-quick__btn" data-export="foundations">Export Foundations</button>
              </div>
            </section>

            <section class="owner-cf-panel">
              <h3 class="owner-cf-panel__title">Recent Activity</h3>
              ${foundationActivity.length
                ? `<ul class="owner-cf-activity">
                    ${foundationActivity.map((item) => {
                      const thumb = foundationActivityThumb(item, list);
                      return `
                        <li class="owner-cf-activity__item">
                          <span class="owner-cf-activity__thumb ${thumb ? 'has-image' : ''}">
                            ${thumb ? `<img src="${esc(thumb)}" alt="">` : '<span>•</span>'}
                          </span>
                          <span class="owner-cf-activity__copy">
                            <strong>${esc(item.label)}</strong>
                            <span>${esc(item.detail)}</span>
                            <time>${esc(when(item.at))}</time>
                          </span>
                        </li>
                      `;
                    }).join('')}
                  </ul>`
                : '<p class="owner-muted">No recent foundation activity yet.</p>'}
            </section>
          </aside>
        </div>
      </div>
      ${detail ? renderFoundationDetail(detail) : ''}
      ${state.foundationCreateOpen ? renderFoundationCreateModal() : ''}
    `;
  }

  function renderFoundationCreateModal() {
    return `
      <div class="owner-cf-modal" role="dialog" aria-modal="true" aria-labelledby="owner-cf-create-title">
        <button type="button" class="owner-cf-modal__backdrop" data-foundation-create-close aria-label="Close create panel"></button>
        <div class="owner-cf-modal__card">
          <button type="button" class="owner-cf-modal__close" data-foundation-create-close aria-label="Close">×</button>
          <div class="owner-detail owner-cf-modal__content">
            <h3 id="owner-cf-create-title">Create Creator Foundation</h3>
            <p class="owner-muted" style="margin-bottom:14px">
              Email and temporary password become their Influencer login at <strong>/members</strong>.
              Passwords are never stored in plain text — copy them right after you create the foundation.
              The foundation is published to Donate immediately.
            </p>
            <form class="owner-form" id="owner-foundation-create">
              <div class="owner-field"><label>Email (Members login)</label><input name="email" type="email" required autocomplete="off"></div>
              <div class="owner-field"><label>Temporary password (Members login)</label><input name="password" type="text" required minlength="8" autocomplete="off"></div>
              <div class="owner-field"><label>Display name</label><input name="displayName" required></div>
              <div class="owner-field"><label>Foundation name</label><input name="foundationName"></div>
              <div class="owner-field"><label>Country</label><input name="country"></div>
              <div class="owner-field">
                <label>Primary cause</label>
                <select name="primaryCategory" required>
                  <option value="">Select a cause</option>
                  <option value="Food &amp; Hunger">Food &amp; Hunger</option>
                  <option value="Health">Health</option>
                  <option value="Education">Education</option>
                  <option value="Humanitarian Aid">Humanitarian Aid</option>
                  <option value="Environment">Environment</option>
                </select>
              </div>
              <div class="owner-field"><label>Mission</label><textarea name="mission"></textarea></div>
              <div class="owner-actions">
                <button class="owner-btn" type="submit">Create &amp; publish</button>
                <button class="owner-btn-ghost" type="button" data-foundation-create-close>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  function renderFoundationDetail(f) {
    const currency = state.data.currency || 'EUR';
    return `
      <div class="owner-cf-modal" role="dialog" aria-modal="true" aria-labelledby="owner-cf-modal-title">
        <button type="button" class="owner-cf-modal__backdrop" data-foundation-detail-close aria-label="Close edit panel"></button>
        <div class="owner-cf-modal__card">
          <button type="button" class="owner-cf-modal__close" data-foundation-detail-close aria-label="Close">×</button>
          <div class="owner-detail owner-cf-modal__content">
            <h3 id="owner-cf-modal-title">${esc(f.foundation || f.creator)}</h3>
        <p class="owner-muted">Founded by ${esc(f.creator)} · ${esc(f.status)} · ${esc(f.country || 'Country not set')}</p>
        ${f.mission ? `<p style="margin-top:12px;line-height:1.6">${esc(f.mission)}</p>` : ''}

        <div class="owner-group" style="margin-top:22px">
          <p class="owner-group__title">Members login</p>
          <p class="owner-muted" style="margin-bottom:14px">
            Login email for <strong>/members</strong>. Passwords chosen by the Creator are never shown here.
          </p>
          <form class="owner-form" id="owner-foundation-credentials" style="max-width:560px">
            <input type="hidden" name="id" value="${esc(f.id)}">
            <div class="owner-field">
              <label>Login email</label>
              <input name="email" type="email" value="${esc(f.email || '')}" required autocomplete="off">
            </div>
            <button class="owner-btn" type="submit">Save login email</button>
          </form>
          <form class="owner-form" id="owner-foundation-reset-password" style="max-width:560px;margin-top:18px">
            <div class="owner-field">
              <label>New temporary password</label>
              <div class="owner-password-row">
                <input
                  id="owner-foundation-reset-password-input"
                  name="newPassword"
                  type="text"
                  minlength="8"
                  required
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Set a new password to share with them"
                >
                <button type="button" class="owner-btn-ghost" id="owner-foundation-reset-copy" title="Copy email and password">Copy</button>
              </div>
            </div>
            <button class="owner-btn" type="submit">Reset password for this Creator</button>
          </form>
        </div>

        <div class="owner-groups" style="margin-top:18px">
          <div class="owner-group">
            <p class="owner-group__title">Financial</p>
            <p class="owner-muted">Raised ${esc(money(f.totalRaised, currency))}<br>Donors ${esc(num(f.uniqueDonors))}<br>Active projects ${esc(num(f.activeProjects))}</p>
          </div>
          <div class="owner-group">
            <p class="owner-group__title">Management</p>
            <div class="owner-actions" style="margin-top:8px">
              ${f.status !== 'active'
                ? `<button type="button" class="owner-btn-ghost" data-foundation-status="${esc(f.id)}" data-status="active">Set Active</button>`
                : ''}
              ${f.status === 'active'
                ? `<button type="button" class="owner-btn-ghost" data-foundation-status="${esc(f.id)}" data-status="inactive">Set Inactive</button>`
                : ''}
              <button type="button" class="owner-btn-ghost owner-btn-ghost--danger" data-foundation-delete="${esc(f.id)}">Delete foundation</button>
              <a class="owner-btn-ghost" href="/donate" target="_blank" rel="noopener">View public Donate</a>
            </div>
          </div>
        </div>
        <form class="owner-form" id="owner-foundation-edit" style="margin-top:22px;max-width:560px">
          <input type="hidden" name="id" value="${esc(f.id)}">
          <div class="owner-field"><label>Display name</label><input name="displayName" value="${esc(f.creator)}" required></div>
          <div class="owner-field"><label>Foundation name</label><input name="foundationName" value="${esc(f.foundation || '')}"></div>
          <div class="owner-field"><label>Country</label><input name="country" value="${esc(f.country || '')}"></div>
          <div class="owner-field">
            <label>Primary cause</label>
            <select name="primaryCategory">
              <option value="">Select a cause</option>
              ${['Food & Hunger', 'Health', 'Education', 'Humanitarian Aid', 'Environment'].map((c) => `
                <option value="${esc(c)}" ${(f.primaryCategory || '') === c ? 'selected' : ''}>${esc(c)}</option>
              `).join('')}
            </select>
          </div>
          <div class="owner-field"><label>Mission</label><textarea name="mission">${esc(f.mission || '')}</textarea></div>
          <div class="owner-field"><label>Biography</label><textarea name="biography">${esc(f.biography || '')}</textarea></div>
          <button class="owner-btn" type="submit">Save profile</button>
        </form>
          </div>
        </div>
      </div>
    `;
  }

  function renderEvent() {
    const e = state.data.event;
    const eventDate = (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.getEventStart)
      ? WorldChoirConfig.getEventStart()
      : null;
    const now = Date.now();
    const countdown = eventDate ? Math.max(0, eventDate.getTime() - now) : null;
    const days = countdown != null ? Math.floor(countdown / 86400000) : null;

    return `
      <section class="owner-section">
        <p class="owner-section__label">Event</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Event control center</h2>
        <p class="owner-sub">Readiness from real participation. Live event-day telemetry appears when those signals are connected.</p>
      </section>
      <section class="owner-section owner-groups">
        <div class="owner-group">
          <p class="owner-group__title">Readiness</p>
          ${metricBtn(e.voicesPledged, 'Voices pledged', 'event')}
          ${metricBtn(e.countries, 'Countries', 'event')}
          ${metricBtn(e.cities, 'Cities', 'event')}
          ${metricBtn(e.promisesSubmitted, 'Promises submitted', 'event')}
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Countdown</p>
          <p class="owner-metric__value">${days == null ? '—' : esc(num(days))}</p>
          <p class="owner-muted">${eventDate ? `Days until ${esc(eventDate.toUTCString())}` : 'Event date unavailable in this view.'}</p>
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Not connected yet</p>
          <p class="owner-muted">${(e.unavailable || []).map(esc).join(' · ')}</p>
        </div>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Geographic readiness</p>
        ${renderOwnerLeafletMap({ compact: true })}
        ${(() => {
          const filtered = getFilteredMapCities();
          return `<p class="owner-muted" style="margin-top:10px">${esc(num(filtered.stats.voices))} mapped Voices · same live map as Overview &amp; Global Map${hasActiveMapFilters() ? ' · matching Map filters' : ''}</p>`;
        })()}
      </section>
    `;
  }

  function utcDay(iso = new Date()) {
    return new Date(iso).toISOString().slice(0, 10);
  }

  function shiftUtcDay(day, delta) {
    const d = new Date(`${day}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  function inclusiveDaySpan(from, to) {
    if (!from || !to || from > to) return 0;
    const a = new Date(`${from}T12:00:00.000Z`).getTime();
    const b = new Date(`${to}T12:00:00.000Z`).getTime();
    return Math.round((b - a) / 86400000) + 1;
  }

  function formatGrowthDay(day, long = false) {
    if (!day) return '—';
    const d = new Date(`${day}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return day;
    return d.toLocaleDateString('en-GB', long
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short' });
  }

  const GROWTH_CHART = { w: 800, h: 260 };

  const GROWTH_METRICS = {
    voices: {
      label: 'Voices',
      title: 'Voices Growth Over Time',
      blurb: 'Total committed voices registered on World Choir.',
      unit: 'voices',
      unitOne: 'voice',
    },
    users: {
      label: 'Users',
      title: 'User Growth Over Time',
      blurb: 'People who have created a World Choir account.',
      unit: 'users',
      unitOne: 'user',
    },
    donations: {
      label: 'Donations',
      title: 'Donation Growth Over Time',
      blurb: 'Verified donations completed through World Choir.',
      unit: 'donations',
      unitOne: 'donation',
    },
    foundations: {
      label: 'Foundations',
      title: 'Foundation Growth Over Time',
      blurb: 'Creator Foundations created on World Choir.',
      unit: 'foundations',
      unitOne: 'foundation',
    },
  };

  const GROWTH_RANGES = [
    { id: '7d', label: 'Last 7 Days', days: 7 },
    { id: '30d', label: 'Last 30 Days', days: 30 },
    { id: '90d', label: 'Last 90 Days', days: 90 },
    { id: '1y', label: 'Last 1 Year', days: 365 },
    { id: 'all', label: 'All Time' },
    { id: 'custom', label: 'Custom Range' },
  ];

  function growthUsesAmount(series) {
    return (series || []).some((p) => Number(p.amount) > 0);
  }

  function growthPointValue(point, useAmount) {
    if (!point) return 0;
    if (useAmount) {
      const amt = Number(point.amount);
      return Number.isFinite(amt) ? amt : 0;
    }
    return Number(point.count) || 0;
  }

  function growthRangeBounds(series) {
    const today = utcDay();
    const first = series[0]?.date;
    const last = series[series.length - 1]?.date || today;
    const range = state.growthRange || '30d';
    if (range === 'all') {
      return { from: first || today, to: last > today ? last : today, label: 'All Time' };
    }
    if (range === 'custom') {
      let from = state.growthCustomFrom || first || today;
      let to = state.growthCustomTo || today;
      if (from > to) {
        const swap = from;
        from = to;
        to = swap;
      }
      return { from, to, label: `${formatGrowthDay(from, true)} → ${formatGrowthDay(to, true)}` };
    }
    const opt = GROWTH_RANGES.find((r) => r.id === range);
    const days = opt?.days || 30;
    const to = today;
    const from = shiftUtcDay(to, -(days - 1));
    return { from, to, label: opt?.label || 'Last 30 Days' };
  }

  function buildGrowthView() {
    const metric = { ...(GROWTH_METRICS[state.growthMetric] || GROWTH_METRICS.voices) };
    const raw = [...((state.data.growth || {})[state.growthMetric] || [])]
      .filter((p) => p && p.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const useAmount = state.growthMetric === 'donations' && growthUsesAmount(raw);
    if (useAmount) {
      metric.blurb = 'Total verified donation volume completed through World Choir.';
    }
    const bounds = growthRangeBounds(raw);
    const inRange = raw.filter((p) => p.date >= bounds.from && p.date <= bounds.to);
    let running = 0;
    const allCumulative = raw.map((p) => {
      running += growthPointValue(p, useAmount);
      return { date: p.date, increment: growthPointValue(p, useAmount), total: running };
    });
    const points = [];
    allCumulative.forEach((p, idx) => {
      if (p.date < bounds.from || p.date > bounds.to) return;
      const prev = idx > 0 ? allCumulative[idx - 1] : null;
      points.push({
        ...p,
        prevTotal: prev ? prev.total : null,
        prevDate: prev ? prev.date : null,
      });
    });
    const periodGrowth = inRange.reduce((sum, p) => sum + growthPointValue(p, useAmount), 0);
    const endTotal = points.length
      ? points[points.length - 1].total
      : allCumulative.filter((p) => p.date <= bounds.to).pop()?.total || 0;
    const calendarDays = inclusiveDaySpan(bounds.from, bounds.to);
    const recordedDays = points.length;
    const avgDaily = calendarDays > 0 ? periodGrowth / calendarDays : null;

    const spanDays = calendarDays;
    const prevTo = shiftUtcDay(bounds.from, -1);
    const prevFrom = spanDays > 0 ? shiftUtcDay(prevTo, -(spanDays - 1)) : prevTo;
    const prevGrowth = raw
      .filter((p) => p.date >= prevFrom && p.date <= prevTo)
      .reduce((sum, p) => sum + growthPointValue(p, useAmount), 0);
    const prevHasHistory = raw.some((p) => p.date <= prevTo);
    let comparison = null;
    if (prevHasHistory && prevGrowth > 0 && Number.isFinite(periodGrowth)) {
      comparison = {
        pct: Math.round(((periodGrowth - prevGrowth) / prevGrowth) * 1000) / 10,
        previous: prevGrowth,
      };
    }

    const canProject = recordedDays >= 7 && avgDaily != null && avgDaily > 0;
    const projection = canProject ? endTotal + (avgDaily * 30) : null;

    return {
      metric,
      useAmount,
      bounds,
      points,
      periodGrowth,
      endTotal,
      calendarDays,
      recordedDays,
      avgDaily,
      comparison,
      projection,
      empty: raw.length === 0,
    };
  }

  function formatGrowthNumber(value, view) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const absNum = Math.abs(n);
    if (view.useAmount) return money(absNum, state.data.currency);
    if (Math.abs(absNum - Math.round(absNum)) < 0.05) return num(Math.round(absNum));
    return (Math.round(absNum * 10) / 10).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function formatGrowthValue(value, view, { signed = false } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const abs = formatGrowthNumber(n, view);
    const roundedAbs = Math.abs(n);
    const isOne = !view.useAmount && Math.abs(roundedAbs - 1) < 0.05;
    const unit = view.useAmount ? '' : ` ${isOne ? view.metric.unitOne : view.metric.unit}`;
    if (!signed) return `${abs}${unit}`;
    if (n === 0) return view.useAmount ? money(0, state.data.currency) : `0 ${view.metric.unit}`;
    return `${n > 0 ? '+' : '−'}${abs}${unit}`;
  }

  function growthLinePath(coords) {
    if (!coords.length) return '';
    if (coords.length === 1) return `M${coords[0].x} ${coords[0].y}`;
    let d = `M${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i += 1) {
      const prev = coords[i - 1];
      const cur = coords[i];
      const cpx = (prev.x + cur.x) / 2;
      d += ` C ${cpx} ${prev.y}, ${cpx} ${cur.y}, ${cur.x} ${cur.y}`;
    }
    return d;
  }

  function renderGrowthChart(view) {
    const points = view.points;
    if (!points.length) {
      return `
        <div class="owner-growth-empty">
          <p class="owner-growth-empty__title">${view.empty
            ? 'World Choir is just beginning to build its history.'
            : 'No activity was recorded in this range.'}</p>
          <p class="owner-muted" style="margin-top:8px">${view.empty
            ? `Historical momentum will appear here as ${esc(view.metric.unit)} accumulate.`
            : `Try another data range to see ${esc(view.metric.unit)} that already exist.`}</p>
        </div>
      `;
    }

    const w = GROWTH_CHART.w;
    const h = GROWTH_CHART.h;
    const pad = { t: 18, r: 16, b: 16, l: 16 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const values = points.map((p) => p.total);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const spread = dataMax - dataMin;
    const padAmt = spread === 0 ? Math.max(1, dataMax * 0.08 || 1) : spread * 0.14;
    const minY = Math.max(0, dataMin - padAmt);
    const maxY = dataMax + padAmt || 1;
    const ySpan = maxY - minY || 1;
    const coords = points.map((p, i) => {
      const x = points.length === 1
        ? pad.l + innerW / 2
        : pad.l + (i / (points.length - 1)) * innerW;
      const y = pad.t + innerH - ((p.total - minY) / ySpan) * innerH;
      return { x, y, ...p };
    });
    const line = growthLinePath(coords);
    const bottom = pad.t + innerH;
    const area = `${line} L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
    const yTicks = [maxY, minY + ySpan / 2, minY];
    const xTicks = coords.length === 1
      ? [coords[0]]
      : [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]]
        .filter((c, i, arr) => arr.findIndex((x) => x.date === c.date) === i);
    const showDots = coords.length <= 14;
    const yLabel = (tick) => (view.useAmount ? money(tick, state.data.currency) : num(Math.round(tick)));

    return `
      <div class="owner-growth-chart" data-growth-chart data-growth-points="${esc(JSON.stringify(coords.map((c) => ({
        x: c.x,
        y: c.y,
        date: c.date,
        total: c.total,
        increment: c.increment,
        prevTotal: c.prevTotal,
        prevDate: c.prevDate,
      }))))}">
        <div class="owner-growth-chart__plot">
          <div class="owner-growth-chart__y" aria-hidden="true">
            ${yTicks.map((tick) => `<span>${esc(yLabel(tick))}</span>`).join('')}
          </div>
          <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(view.metric.title)}">
            <defs>
              <linearGradient id="owner-growth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#4ec5e8" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="#4ec5e8" stop-opacity="0"/>
              </linearGradient>
              <filter id="owner-growth-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.2" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            ${yTicks.map((tick) => {
              const y = pad.t + innerH - ((tick - minY) / ySpan) * innerH;
              return `<line class="owner-growth-chart__grid" x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}"/>`;
            }).join('')}
            <path class="owner-growth-chart__area" d="${area}" fill="url(#owner-growth-fill)"/>
            <path class="owner-growth-chart__line" d="${line}" filter="url(#owner-growth-glow)"/>
            ${showDots ? coords.map((c) => `<circle class="owner-growth-chart__dot" cx="${c.x}" cy="${c.y}" r="3.2"/>`).join('') : ''}
            <rect class="owner-growth-chart__hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
            <circle class="owner-growth-chart__hover-dot" data-growth-hover-dot cx="0" cy="0" r="5" hidden/>
          </svg>
        </div>
        <div class="owner-growth-chart__x" aria-hidden="true">
          ${xTicks.map((c) => `<span>${esc(formatGrowthDay(c.date))}</span>`).join('')}
        </div>
        <div class="owner-growth-tip" data-growth-tip hidden></div>
      </div>
    `;
  }

  function renderGrowthComparison(view) {
    const cmp = view.comparison;
    if (!cmp) {
      return `<span class="owner-growth-delta is-flat">Not enough historical data</span>`;
    }
    if (cmp.pct === 0) {
      return `<span class="owner-growth-delta is-flat">0.0% vs previous period</span>`;
    }
    return `<span class="owner-growth-delta ${cmp.pct > 0 ? 'is-up' : 'is-down'}">${cmp.pct > 0 ? '↑' : '↓'} ${esc(Math.abs(cmp.pct).toFixed(1))}% vs previous period</span>`;
  }

  function renderGrowthPanel({ embed = false, showCards = true } = {}) {
    const view = buildGrowthView();
    const rangeLabel = state.growthRange === 'custom'
      ? view.bounds.label
      : (GROWTH_RANGES.find((r) => r.id === state.growthRange)?.label || view.bounds.label);
    const cmpHtml = renderGrowthComparison(view);

    return `
      <div class="owner-growth ${embed ? 'owner-growth--embed' : ''}">
        ${embed ? '<p class="owner-section__label">Growth</p>' : ''}
        <div class="owner-growth-toolbar">
          <div class="owner-chips owner-growth-metrics">
            ${Object.entries(GROWTH_METRICS).map(([id, m]) => `
              <button type="button" class="owner-chip ${state.growthMetric === id ? 'is-active' : ''}" data-growth-metric="${id}">${esc(m.label)}</button>
            `).join('')}
          </div>
          <div class="owner-growth-range" data-growth-range-wrap>
            <button type="button" class="owner-btn-ghost owner-growth-range__btn" data-growth-range-toggle aria-expanded="${state.growthRangeOpen ? 'true' : 'false'}">
              Data range: ${esc(rangeLabel)}
              <span class="owner-growth-range__caret" aria-hidden="true"></span>
            </button>
            ${state.growthRangeOpen ? `
              <div class="owner-growth-range__menu" data-growth-range-menu role="listbox" aria-label="Data range">
                ${GROWTH_RANGES.map((r) => `
                  <button type="button" class="owner-growth-range__option ${state.growthRange === r.id ? 'is-active' : ''}" data-growth-range="${r.id}" role="option" aria-selected="${state.growthRange === r.id ? 'true' : 'false'}">${esc(r.label)}</button>
                `).join('')}
                ${state.growthRange === 'custom' ? `
                  <div class="owner-growth-range__custom">
                    <label class="owner-field">
                      <span>Start date</span>
                      <input type="date" data-growth-custom="from" value="${esc(state.growthCustomFrom || view.bounds.from)}">
                    </label>
                    <label class="owner-field">
                      <span>End date</span>
                      <input type="date" data-growth-custom="to" value="${esc(state.growthCustomTo || view.bounds.to)}">
                    </label>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="owner-growth-hero">
          <div class="owner-growth-hero__head">
            <p class="owner-section__label">${esc(view.metric.title)}</p>
            <p class="owner-muted">${esc(view.metric.blurb)}</p>
          </div>
          ${renderGrowthChart(view)}
          <div class="owner-growth-hero__stats">
            <p class="owner-growth-hero__value">${esc(formatGrowthValue(view.endTotal, view))}</p>
            ${cmpHtml}
            <p class="owner-muted" style="margin-top:10px">${esc(growthRecordedCopy(view))}</p>
          </div>
        </div>

        ${showCards && !view.empty ? `
          <div class="owner-groups owner-growth-cards">
            <div class="owner-group">
              <p class="owner-group__title">Data range</p>
              <p class="owner-metric__value">${esc(rangeLabel)}</p>
              <p class="owner-metric__label">${esc(formatGrowthDay(view.bounds.from, true))} → ${esc(formatGrowthDay(view.bounds.to, true))}</p>
            </div>
            <div class="owner-group">
              <p class="owner-group__title">Total growth</p>
              <p class="owner-metric__value">${esc(formatGrowthValue(view.periodGrowth, view, { signed: true }))}</p>
              <p class="owner-metric__label">Added during this range</p>
            </div>
            <div class="owner-group">
              <p class="owner-group__title">Average daily growth</p>
              <p class="owner-metric__value">${view.avgDaily == null ? '—' : esc(formatGrowthValue(view.avgDaily, view, { signed: true }))}</p>
              <p class="owner-metric__label">${view.calendarDays ? `${esc(num(view.calendarDays))} calendar days in range` : '—'}</p>
            </div>
            <div class="owner-group">
              <p class="owner-group__title">Recorded days</p>
              <p class="owner-metric__value">${esc(num(view.recordedDays))}</p>
              <p class="owner-metric__label">${view.recordedDays === 1 ? 'day with real activity' : 'days with real activity'}</p>
            </div>
            ${view.projection != null ? `
              <div class="owner-group">
                <p class="owner-group__title">Projected</p>
                <p class="owner-metric__value">${esc(formatGrowthValue(view.projection, view))}</p>
                <p class="owner-metric__label">30 days ahead from this range’s average daily growth</p>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  function growthRecordedCopy(view) {
    if (view.empty) return 'No historical records yet.';
    if (view.recordedDays === 0) {
      return `No days recorded in this range · ${formatGrowthDay(view.bounds.from, true)} – ${formatGrowthDay(view.bounds.to, true)}`;
    }
    if (view.recordedDays === 1) {
      return `Historical data available: 1 day · ${formatGrowthDay(view.points[0].date, true)}`;
    }
    return `Historical data available: ${num(view.recordedDays)} days · ${formatGrowthDay(view.bounds.from)} – ${formatGrowthDay(view.bounds.to)}`;
  }

  function renderGrowth() {
    const view = buildGrowthView();

    return `
      <section class="owner-section">
        <p class="owner-section__label">Growth</p>
        <h2 class="owner-h1">Historical Momentum</h2>
        <p class="owner-sub">${view.empty
          ? 'World Choir is just beginning to build its history.'
          : 'See how World Choir is growing over time.'}</p>
        ${renderGrowthPanel({ showCards: true })}
      </section>
    `;
  }

  async function ensureDapLibraryLoaded(force = false) {
    if (state.dapLibraryBusy) return;
    if (state.dapLibrary && !force) return;
    state.dapLibraryBusy = true;
    try {
      state.dapLibrary = await api('daily-peace-partnerships');
    } catch (err) {
      state.dapLibrary = { catalogCount: 0, acts: [], partnerships: [], error: err.message };
    } finally {
      state.dapLibraryBusy = false;
    }
  }

  async function loadPartnershipDetail(id) {
    state.dapPartnershipDetail = await api('daily-peace-partnership', { query: `&id=${encodeURIComponent(id)}` });
  }

  async function ensurePtwLoaded(silent = false) {
    if (state.ptwBusy) return;
    state.ptwBusy = true;
    if (!silent) render();
    try {
      const q = new URLSearchParams({ range: state.ptwRange || '30d' });
      if (state.ptwRoundId) q.set('roundId', state.ptwRoundId);
      state.ptwData = await api('pass-the-world', { query: `&${q.toString()}` });
    } catch (err) {
      if (!silent) setFlash(err.message || 'Could not load Pass the World analytics.', 'err');
    } finally {
      state.ptwBusy = false;
    }
  }

  function renderPassTheWorld() {
    if (!state.ptwData && !state.ptwBusy) {
      ensurePtwLoaded().then(() => render());
      return `<section class="owner-section"><p class="owner-muted">Loading Pass the World…</p></section>`;
    }
    if (typeof OwnerPassTheWorld === 'undefined') {
      return `<section class="owner-section"><p class="owner-muted">Pass the World module not loaded.</p></section>`;
    }
    return OwnerPassTheWorld.render(state, { esc, money, num, when });
  }

  async function ensurePromiseMemoryLoaded(silent = false) {
    if (state.pmBusy) return;
    state.pmBusy = true;
    if (!silent) render();
    try {
      const q = typeof OwnerPromiseMemory !== 'undefined'
        ? OwnerPromiseMemory.buildQuery(state)
        : '';
      state.pmData = await api('promise-memory', { query: q ? `&${q}` : '' });
      if (state.pmData?.filters) {
        state.pmEvent = state.pmData.filters.eventId || state.pmEvent;
        state.pmCountry = state.pmData.filters.country || '';
        state.pmCity = state.pmData.filters.city || '';
        state.pmDateFrom = state.pmData.filters.dateFrom || '';
        state.pmDateTo = state.pmData.filters.dateTo || '';
        state.pmQuery = state.pmData.filters.q || state.pmQuery;
        state.pmSort = state.pmData.filters.sort || state.pmSort;
        state.pmFolder = state.pmData.filters.folderId || '';
      }
    } catch (err) {
      if (!silent) setFlash(err.message || 'Could not load Promise Memory.', 'err');
    } finally {
      state.pmBusy = false;
    }
  }

  function renderPromiseMemory() {
    if (!state.pmData && !state.pmBusy) {
      ensurePromiseMemoryLoaded().then(() => render());
      return `<section class="owner-section"><p class="owner-muted">Loading Promise Memory…</p></section>`;
    }
    if (typeof OwnerPromiseMemory === 'undefined') {
      return `<section class="owner-section"><p class="owner-muted">Promise Memory module not loaded.</p></section>`;
    }
    return OwnerPromiseMemory.render(state, { esc, money, num, when });
  }

  async function ensureSponsorsLoaded(force = false) {
    if (state.sponsorsBusy && !force) return;
    if (state.sponsorsData && !force) return;
    state.sponsorsBusy = true;
    try {
      state.sponsorsData = await api('map-sponsors');
    } catch (err) {
      state.sponsorsData = {
        capacity: 20,
        overview: { totalCompanies: 0, activeCount: 0, inactiveCount: 0, availablePositions: 20 },
        slots: [],
        inactive: [],
        companies: [],
        error: err.message,
      };
    } finally {
      state.sponsorsBusy = false;
    }
  }

  function renderSponsors() {
    if (!state.sponsorsData && !state.sponsorsBusy) {
      ensureSponsorsLoaded().then(() => render());
      return `<section class="owner-section"><p class="owner-muted">Loading sponsors…</p></section>`;
    }
    if (typeof OwnerMapSponsors === 'undefined') {
      return `<section class="owner-section"><p class="owner-muted">Sponsors module not loaded.</p></section>`;
    }
    return OwnerMapSponsors.render(state, { esc, money, num, when });
  }

  async function ensureDailyPeaceLoaded() {
    if (state.dailyPeace || state.dailyPeaceBusy) return;
    state.dailyPeaceBusy = true;
    state.dailyPeaceError = null;
    try {
      state.dailyPeace = await api('daily-peace');
    } catch (err) {
      state.dailyPeaceError = err.message || 'Could not load Daily Acts data.';
      state.dailyPeace = { totals: {}, users: [], acts: [] };
    } finally {
      state.dailyPeaceBusy = false;
    }
  }

  function renderDailyActsEngagement() {
    const data = state.dailyPeace || { totals: {}, users: [], acts: [] };
    const totals = data.totals || {};
    const q = String(state.dailyPeaceQuery || '').trim().toLowerCase();
    const filter = state.dailyPeaceFilter || 'all';

    if (state.dailyPeaceUserId) {
      const user = (data.users || []).find((u) => u.userId === state.dailyPeaceUserId);
      if (!user) {
        return `
          <section class="owner-section">
            <button type="button" class="owner-btn-ghost" data-dap-back>← Back to users</button>
            <p class="owner-empty" style="margin-top:16px">User not found in Daily Acts data.</p>
          </section>
        `;
      }
      let history = user.history || [];
      if (q) {
        history = history.filter((h) =>
          `${h.actText || ''} ${h.category || ''} ${h.reflection || ''} ${h.assignmentDate || ''}`.toLowerCase().includes(q)
        );
      }
      if (filter === 'completed') history = history.filter((h) => h.status === 'completed');
      if (filter === 'still_open') history = history.filter((h) => h.status === 'still_open');
      if (filter === 'on_time') history = history.filter((h) => h.completedOnAssignedDay);
      if (filter === 'later') history = history.filter((h) => h.status === 'completed' && !h.completedOnAssignedDay);
      if (filter === 'has_reflection') history = history.filter((h) => !!h.reflection);
      if (filter === 'no_reflection') history = history.filter((h) => h.status === 'completed' && !h.reflection);

      return `
        <section class="owner-section">
          <button type="button" class="owner-btn-ghost" data-dap-back>← Back to users</button>
          <p class="owner-section__label" style="margin-top:16px">User Daily Act Summary</p>
          <h2 class="owner-h1" style="font-size:1.25rem;margin-bottom:6px">${esc(user.voiceName || user.userId)}</h2>
          <p class="owner-muted">${esc(user.city || '—')}${user.country ? `, ${esc(user.country)}` : ''} · Voice #${esc(user.voiceNumber ?? '—')} · ${esc(user.userId)}</p>
          <div class="owner-groups" style="margin-top:16px">
            <div class="owner-group">${metricBtn(user.totalCompleted, 'Completed', 'daily-acts')}</div>
            <div class="owner-group">${metricBtn(user.onTimeCompleted, 'On time', 'daily-acts')}</div>
            <div class="owner-group">${metricBtn(user.completedLater, 'Completed later', 'daily-acts')}</div>
            <div class="owner-group">${metricBtn(user.currentStreak, 'Current streak', 'daily-acts')}</div>
            <div class="owner-group">${metricBtn(user.longestStreak, 'Longest streak', 'daily-acts')}</div>
            <div class="owner-group">${metricBtn(user.reflections, 'Reflections', 'daily-acts')}</div>
          </div>
        </section>
        <section class="owner-section">
          <p class="owner-section__label">Daily Act History</p>
          <input class="owner-input" type="search" placeholder="Search acts, categories, reflections…" value="${esc(state.dailyPeaceQuery)}" data-dap-query style="margin-bottom:12px">
          <div class="owner-chips" style="margin-bottom:14px">
            ${[
              ['all', 'All'],
              ['completed', 'Completed'],
              ['still_open', 'Still Open'],
              ['on_time', 'On assigned day'],
              ['later', 'Completed later'],
              ['has_reflection', 'Has reflection'],
              ['no_reflection', 'No reflection'],
            ].map(([id, label]) => `
              <button type="button" class="owner-chip ${filter === id ? 'is-active' : ''}" data-dap-filter="${id}">${esc(label)}</button>
            `).join('')}
          </div>
          <div class="owner-table-wrap">
            <table class="owner-table">
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Act</th>
                  <th>Partner</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Completed</th>
                  <th>On day</th>
                  <th>Reflection</th>
                </tr>
              </thead>
              <tbody>
                ${history.length ? history.map((h) => `
                  <tr>
                    <td>${esc(h.assignmentDate || '—')}</td>
                    <td>${esc(h.actText || h.actId)}</td>
                    <td>${esc(h.companyName || '—')}</td>
                    <td>${esc(h.category || '—')}</td>
                    <td>${esc(h.status === 'completed' ? 'Completed' : 'Still Open')}</td>
                    <td>${esc(h.completedAt ? when(h.completedAt) : '—')}</td>
                    <td>${h.status === 'completed' ? (h.completedOnAssignedDay ? 'Yes' : 'No') : '—'}</td>
                    <td>${h.reflection ? `<blockquote class="owner-dap-review">${esc(h.reflection)}</blockquote>` : '—'}</td>
                  </tr>
                `).join('') : `<tr><td colspan="8">No matching history.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }

    if (state.dailyPeaceView === 'reflections') {
      const reviews = [];
      for (const u of data.users || []) {
        for (const h of u.history || []) {
          if (!h.reflection) continue;
          reviews.push({
            ...h,
            voiceName: u.voiceName,
            voiceNumber: u.voiceNumber,
            city: u.city,
            country: u.country,
            userId: u.userId,
          });
        }
      }
      reviews.sort((a, b) => String(b.assignmentDate || '').localeCompare(String(a.assignmentDate || '')));
      const filtered = q
        ? reviews.filter((r) => `${r.reflection} ${r.actText} ${r.companyName || ''} ${r.voiceName || ''} ${r.city || ''} ${r.country || ''}`.toLowerCase().includes(q))
        : reviews;
      return `
        <section class="owner-section">
          <p class="owner-section__label">Daily Acts</p>
          <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Reflections</h2>
          <p class="owner-sub">Written messages from people who completed a Daily Act of Peace, including sponsored acts.</p>
          <div class="owner-chips" style="margin:14px 0">
            <button type="button" class="owner-chip" data-dap-view="users">Users</button>
            <button type="button" class="owner-chip" data-dap-view="acts">Act performance</button>
            <button type="button" class="owner-chip is-active" data-dap-view="reflections">Reflections</button>
          </div>
          <input class="owner-input" type="search" placeholder="Search reflections, acts, partners…" value="${esc(state.dailyPeaceQuery)}" data-dap-query style="margin-bottom:12px">
          <div class="owner-table-wrap">
            <table class="owner-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Person</th>
                  <th>Place</th>
                  <th>Act</th>
                  <th>Partner</th>
                  <th>Reflection</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map((r) => `
                  <tr>
                    <td>${esc(r.assignmentDate || '—')}</td>
                    <td>${esc(r.voiceName || r.userId)}${r.voiceNumber != null ? ` · #${esc(r.voiceNumber)}` : ''}</td>
                    <td>${esc(r.city || '—')}${r.country ? `, ${esc(r.country)}` : ''}</td>
                    <td>${esc(r.actText || r.actId)}</td>
                    <td>${esc(r.companyName || '—')}</td>
                    <td><blockquote class="owner-dap-review">${esc(r.reflection)}</blockquote></td>
                  </tr>
                `).join('') : `<tr><td colspan="6" class="owner-empty">No reflections recorded yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }

    if (state.dailyPeaceView === 'acts') {
      let acts = data.acts || [];
      if (q) {
        acts = acts.filter((a) => `${a.text || ''} ${a.category || ''} ${a.actId || ''}`.toLowerCase().includes(q));
      }
      return `
        <section class="owner-section">
          <p class="owner-section__label">Daily Acts</p>
          <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Act performance</h2>
          <p class="owner-sub">Real assignment and completion counts from stored Daily Acts records.</p>
          <div class="owner-chips" style="margin:14px 0">
            <button type="button" class="owner-chip" data-dap-view="users">Users</button>
            <button type="button" class="owner-chip is-active" data-dap-view="acts">Act performance</button>
            <button type="button" class="owner-chip" data-dap-view="reflections">Reflections</button>
          </div>
          <input class="owner-input" type="search" placeholder="Search acts…" value="${esc(state.dailyPeaceQuery)}" data-dap-query style="margin-bottom:12px">
          <div class="owner-table-wrap">
            <table class="owner-table">
              <thead>
                <tr>
                  <th>Act</th>
                  <th>Category</th>
                  <th>Assigned</th>
                  <th>Completed</th>
                  <th>Rate</th>
                  <th>On time</th>
                  <th>Later</th>
                  <th>Reflections</th>
                </tr>
              </thead>
              <tbody>
                ${acts.length ? acts.map((a) => `
                  <tr>
                    <td>${esc(a.text || a.actId)}</td>
                    <td>${esc(a.category || '—')}</td>
                    <td>${esc(num(a.assigned))}</td>
                    <td>${esc(num(a.completed))}</td>
                    <td>${esc(num(a.completionRate))}%</td>
                    <td>${esc(num(a.onTime))}</td>
                    <td>${esc(num(a.later))}</td>
                    <td>${esc(num(a.reflections))}</td>
                  </tr>
                `).join('') : `<tr><td colspan="8">No act performance data yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }

    let users = data.users || [];
    if (q) {
      users = users.filter((u) =>
        `${u.voiceName || ''} ${u.userId || ''} ${u.city || ''} ${u.country || ''} ${u.voiceNumber ?? ''}`.toLowerCase().includes(q)
      );
    }

    return `
      <section class="owner-section">
        <p class="owner-section__label">Daily Acts</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Daily Acts engagement</h2>
        <p class="owner-sub">Real user participation in Daily Acts of Peace. Reflections remain private to the owner view.</p>
        ${state.dailyPeaceError ? `<p class="owner-empty">${esc(state.dailyPeaceError)}</p>` : ''}
        <div class="owner-groups" style="margin-top:16px">
          <div class="owner-group">${metricBtn(totals.usersEngaged, 'Users engaged', 'daily-acts')}</div>
          <div class="owner-group">${metricBtn(totals.totalCompletions, 'Completions', 'daily-acts')}</div>
          <div class="owner-group">${metricBtn(totals.onTimeCompletions, 'On-time', 'daily-acts')}</div>
          <div class="owner-group">${metricBtn(totals.reflections, 'Reflections', 'daily-acts')}</div>
          <div class="owner-group">${metricBtn(totals.stillOpen, 'Still open', 'daily-acts')}</div>
        </div>
        <div class="owner-chips" style="margin:18px 0 12px">
          <button type="button" class="owner-chip" data-dap-main-view="library">Library</button>
          <button type="button" class="owner-chip is-active" data-dap-main-view="engagement">Engagement</button>
          <button type="button" class="owner-chip" data-dap-main-view="partnerships">Partnerships</button>
          <button type="button" class="owner-chip is-active" data-dap-view="users">Users</button>
          <button type="button" class="owner-chip" data-dap-view="acts">Act performance</button>
          <button type="button" class="owner-chip" data-dap-view="reflections">Reflections</button>
          <button type="button" class="owner-chip" data-dap-refresh>Refresh</button>
        </div>
        <input class="owner-input" type="search" placeholder="Search users…" value="${esc(state.dailyPeaceQuery)}" data-dap-query style="margin-bottom:12px">
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Identifier</th>
                <th>Completed</th>
                <th>On time</th>
                <th>Streak</th>
                <th>Last completed</th>
                <th>Reflections</th>
              </tr>
            </thead>
            <tbody>
              ${users.length ? users.map((u) => `
                <tr class="owner-row-click" data-dap-user="${esc(u.userId)}" style="cursor:pointer">
                  <td>${esc(u.voiceName || '—')}</td>
                  <td>${esc(u.userId)}</td>
                  <td>${esc(num(u.totalCompleted))}</td>
                  <td>${esc(num(u.onTimeCompleted))}</td>
                  <td>${esc(num(u.currentStreak))}</td>
                  <td>${esc(u.lastCompletedAt ? when(u.lastCompletedAt) : '—')}</td>
                  <td>${esc(num(u.reflections))}</td>
                </tr>
              `).join('') : `<tr><td colspan="7">No Daily Acts engagement recorded yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderDailyActs() {
    const needsLibrary = state.dapView === 'library'
      || state.dapView === 'partnerships'
      || state.dapFormMode
      || state.dapPartnershipId;

    if (needsLibrary && !state.dapLibrary && !state.dapLibraryBusy) {
      ensureDapLibraryLoaded().then(() => {
        if (state.dapPartnershipId && !state.dapPartnershipDetail) {
          loadPartnershipDetail(state.dapPartnershipId).then(() => render()).catch(() => render());
        } else {
          render();
        }
      });
      return `
        <section class="owner-section">
          <p class="owner-section__label">Daily Acts</p>
          <p class="owner-muted">Loading Daily Acts library…</p>
        </section>
      `;
    }

    if (state.dapView === 'engagement') {
      if (!state.dailyPeace && !state.dailyPeaceError) {
        if (!state.dailyPeaceBusy) ensureDailyPeaceLoaded().then(() => render());
        return `<section class="owner-section"><p class="owner-muted">Loading engagement data…</p></section>`;
      }
    }

    if (typeof OwnerDailyPeacePartnerships !== 'undefined') {
      const engagementHtml = state.dapView === 'engagement' ? renderDailyActsEngagement() : '';
      if (state.dapView !== 'engagement' || state.dapFormMode || state.dapPartnershipId) {
        return OwnerDailyPeacePartnerships.render(state, { esc, money, num, when }, engagementHtml);
      }
      if (state.dapView === 'engagement') return engagementHtml;
    }

    if (!state.dailyPeace && !state.dailyPeaceError) {
      if (!state.dailyPeaceBusy) ensureDailyPeaceLoaded().then(() => render());
      return `<section class="owner-section"><p class="owner-muted">Loading…</p></section>`;
    }
    return renderDailyActsEngagement();
  }

  function renderApplications() {
    const a = state.data.applications;
    return `
      <section class="owner-section">
        <p class="owner-section__label">Applications & verification</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Creator pipeline</h2>
        <p class="owner-empty">${esc(a.note || 'No applications require review.')}</p>
        <p class="owner-muted">Manage live Creator profiles in Creator Foundations.</p>
        <div style="margin-top:14px">
          <button type="button" class="owner-btn-ghost" data-section-jump="foundations">Open Creator Foundations</button>
        </div>
      </section>
    `;
  }

  function renderOperations() {
    const ops = state.data.operations;
    return `
      <section class="owner-section">
        <p class="owner-section__label">Operations</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">System health</h2>
        <div class="owner-groups" style="margin-top:16px">
          ${(ops.health.services || []).map((s) => `
            <div class="owner-group">
              <p class="owner-group__title">${esc(s.name)}</p>
              <div class="owner-status">
                <span class="owner-status__dot ${s.status === 'operational' ? '' : (s.status === 'not_connected' ? 'is-warn' : 'is-down')}"></span>
                ${esc(s.status.replace(/_/g, ' '))}
              </div>
              ${s.note ? `<p class="owner-muted" style="margin-top:8px">${esc(s.note)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Alert center</p>
        <p class="owner-empty">${esc(ops.note || 'All clear.')}</p>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Activity</p>
        ${renderActivity(state.data.activity)}
      </section>
    `;
  }

  function renderReports() {
    const ex = state.data.reports.executiveSummary;
    const currency = state.data.currency || 'EUR';
    return `
      <section class="owner-section">
        <p class="owner-section__label">Reports</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Executive summary</h2>
        <p class="owner-sub">A truthful snapshot of World Choir as a business — real totals only.</p>
      </section>
      <section class="owner-section owner-groups">
        <div class="owner-group">
          <p class="owner-group__title">Community</p>
          <p class="owner-muted">
            Users ${esc(num(ex.community.totalUsers))}<br>
            Voices ${esc(num(ex.community.voicesPledged))}<br>
            Countries ${esc(num(ex.community.countries))}<br>
            Cities ${esc(num(ex.community.cities))}
          </p>
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Financial</p>
          <p class="owner-muted">
            Donated ${esc(money(ex.financial.totalDonated, currency))}<br>
            Donors ${esc(num(ex.financial.donors))}<br>
            Average ${ex.financial.averageDonation == null ? '—' : esc(money(ex.financial.averageDonation, currency))}
          </p>
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Creator ecosystem</p>
          <p class="owner-muted">
            Active ${esc(num(ex.creatorEcosystem.activeFoundations))}<br>
            Profiles ${esc(num(ex.creatorEcosystem.totalProfiles))}<br>
            Applications ${esc(num(ex.creatorEcosystem.applications))}
          </p>
        </div>
        <div class="owner-group">
          <p class="owner-group__title">Operations</p>
          <p class="owner-muted">
            Health ${esc(ex.operations.systemHealth)}<br>
            Critical alerts ${esc(num(ex.operations.criticalAlerts))}<br>
            Ops share ${esc(money(ex.operations.operationsShare, currency))}
          </p>
        </div>
      </section>
      <div class="owner-actions">
        <button type="button" class="owner-btn-ghost" data-export="executive">Export executive CSV</button>
        <button type="button" class="owner-btn-ghost" data-export="cities">Export cities CSV</button>
        <button type="button" class="owner-btn-ghost" data-export="countries">Export countries CSV</button>
        <button type="button" class="owner-btn-ghost" data-export="foundations">Export foundations CSV</button>
      </div>
    `;
  }

  function renderAdmin() {
    const a = state.data.admin;
    return `
      <section class="owner-section">
        <p class="owner-section__label">Admin</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Roles & audit</h2>
        <p class="owner-sub">Future-proof permission model. Only Owner is provisioned today.</p>
      </section>
      <section class="owner-section owner-groups">
        ${(a.roles || []).map((r) => `
          <div class="owner-group">
            <p class="owner-group__title">${esc(r.label)}</p>
            <p class="owner-muted">${esc(r.note)}</p>
          </div>
        `).join('')}
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Audit log</p>
        <p class="owner-empty">${esc(a.auditNote || 'No audit events yet.')}</p>
      </section>
    `;
  }

  function renderAccount() {
    return `
      <section class="owner-section">
        <p class="owner-section__label">Account</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Owner security</h2>
        <p class="owner-sub">Signed in as ${esc(state.email || 'owner')}</p>
      </section>
      <section class="owner-section owner-two-col">
        <form class="owner-form" id="owner-email-form">
          <p class="owner-section__label">Change email</p>
          <div class="owner-field"><label>New email</label><input name="newEmail" type="email" required></div>
          <div class="owner-field"><label>Confirm email</label><input name="confirmEmail" type="email" required></div>
          <div class="owner-field"><label>Current password</label><input name="currentPassword" type="password" required></div>
          <button class="owner-btn" type="submit">Update email</button>
        </form>
        <form class="owner-form" id="owner-password-form">
          <p class="owner-section__label">Change password</p>
          <div class="owner-field"><label>Current password</label><input name="currentPassword" type="password" required></div>
          <div class="owner-field"><label>New password</label><input name="newPassword" type="password" required minlength="8"></div>
          <div class="owner-field"><label>Confirm password</label><input name="confirmPassword" type="password" required minlength="8"></div>
          <button class="owner-btn" type="submit">Update password</button>
        </form>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Security</p>
        <p class="owner-muted">Two-factor authentication, session revocation, and login history are not connected yet.</p>
      </section>
    `;
  }

  /* ─── Export ─── */

  function foundationDisplayName(f) {
    return f?.foundation || f?.creator || 'this foundation';
  }

  async function applyFoundationStatus(id, status) {
    const f = (state.data.foundations || []).find((row) => row.id === id);
    if (!f) return;
    const name = foundationDisplayName(f);
    const msg = status === 'active'
      ? `Set "${name}" to Active? It will appear on the Donate page for users.`
      : `Set "${name}" to Inactive? It will be hidden from the Donate page but kept in Creator Foundations.`;
    if (!window.confirm(msg)) return;
    try {
      await api('update-influencer', {
        method: 'POST',
        body: status === 'active'
          ? { id, active: true, published: true }
          : { id, active: false, published: true },
      });
      state.foundationActionMenu = null;
      setFlash(status === 'active' ? 'Foundation set to Active.' : 'Foundation set to Inactive.');
      await loadCenter();
    } catch (err) {
      setFlash(err.message, 'err');
      render();
    }
  }

  async function deleteFoundation(id) {
    const f = (state.data.foundations || []).find((row) => row.id === id);
    if (!f) return;
    const name = foundationDisplayName(f);
    if (!window.confirm(
      `Permanently delete "${name}"? It will be removed from Creator Foundations and from Donations. This cannot be undone.`
    )) return;
    try {
      await api('delete-influencer', { method: 'POST', body: { id } });
      if (state.foundationDetail === id) state.foundationDetail = null;
      state.foundationActionMenu = null;
      setFlash('Foundation deleted.');
      await loadCenter();
    } catch (err) {
      setFlash(err.message, 'err');
      render();
    }
  }

  function exportFoundationCsv(foundationId) {
    const f = (state.data.foundations || []).find((row) => row.id === foundationId);
    if (!f) return;
    const rows = [
      ['creator', 'foundation', 'email', 'country', 'status', 'category', 'donors', 'raised', 'projects', 'website', 'created'],
      [
        f.creator,
        f.foundation,
        f.email,
        f.country,
        f.status,
        f.primaryCategory,
        f.uniqueDonors,
        f.totalRaised,
        f.totalProjects ?? f.activeProjects,
        f.website,
        f.createdAt,
      ],
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-choir-foundation-${String(f.foundation || f.creator || f.id).replace(/[^\w.-]+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv(kind) {
    let rows = [];
    if (kind === 'cities') {
      rows = [['rank', 'city', 'country', 'voices', 'donors', 'total_donations']].concat(
        state.data.cities.map((c) => [c.rank, c.city, c.country, c.voices, c.uniqueDonors, c.totalDonations])
      );
    } else if (kind === 'countries') {
      rows = [['country', 'voices', 'cities', 'foundations', 'donors', 'total_donated']].concat(
        state.data.countries.map((c) => [c.country, c.voices, c.cities, c.foundations, c.donors, c.totalDonated])
      );
    } else if (kind === 'foundations') {
      rows = [['creator', 'foundation', 'email', 'country', 'status', 'category', 'donors', 'raised', 'projects', 'website', 'created']].concat(
        state.data.foundations.map((f) => [
          f.creator,
          f.foundation,
          f.email,
          f.country,
          f.status,
          f.primaryCategory,
          f.uniqueDonors,
          f.totalRaised,
          f.totalProjects ?? f.activeProjects,
          f.website,
          f.createdAt,
        ])
      );
    } else if (kind === 'executive') {
      const ex = state.data.reports.executiveSummary;
      rows = [
        ['metric', 'value'],
        ['users', ex.community.totalUsers],
        ['voices', ex.community.voicesPledged],
        ['countries', ex.community.countries],
        ['cities', ex.community.cities],
        ['donated', ex.financial.totalDonated],
        ['donors', ex.financial.donors],
        ['active_foundations', ex.creatorEcosystem.activeFoundations],
      ];
    }
    const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-choir-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── Render router ─── */

  function sectionContent() {
    switch (state.section) {
      case 'overview': return renderOverview();
      case 'community': return renderCommunity();
      case 'map': return renderMap();
      case 'donations': return renderDonations();
      case 'foundations': return renderFoundations();
      case 'sponsors': return renderSponsors();
      case 'event': return renderEvent();
      case 'daily-acts': return renderDailyActs();
      case 'pass-the-world': return renderPassTheWorld();
      case 'promise-memory': return renderPromiseMemory();
      case 'growth': return renderGrowth();
      case 'applications': return renderApplications();
      case 'operations': return renderOperations();
      case 'reports': return renderReports();
      case 'admin': return renderAdmin();
      case 'account': return renderAccount();
      default: return renderOverview();
    }
  }

  function bindGrowthRange() {
    const wrap = root().querySelector('[data-growth-range-wrap]');
    if (!wrap) return;
    wrap.querySelector('[data-growth-range-toggle]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.growthRangeOpen = !state.growthRangeOpen;
      render();
    });
    wrap.querySelectorAll('[data-growth-range]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-growth-range');
        if (id === 'custom') {
          if (!state.growthCustomFrom || !state.growthCustomTo) {
            const series = [...((state.data.growth || {})[state.growthMetric] || [])]
              .filter((p) => p && p.date)
              .sort((a, b) => String(a.date).localeCompare(String(b.date)));
            const current = growthRangeBounds(series);
            state.growthCustomFrom = current.from;
            state.growthCustomTo = current.to;
          }
          state.growthRange = 'custom';
          state.growthRangeOpen = true;
        } else {
          state.growthRange = id;
          state.growthRangeOpen = false;
        }
        render();
      });
    });
    wrap.querySelectorAll('[data-growth-custom]').forEach((input) => {
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('change', () => {
        const which = input.getAttribute('data-growth-custom');
        if (which === 'from') state.growthCustomFrom = input.value;
        if (which === 'to') state.growthCustomTo = input.value;
        state.growthRange = 'custom';
        state.growthRangeOpen = true;
        render();
      });
    });
  }

  function bindGrowthChart() {
    const chart = root().querySelector('[data-growth-chart]');
    if (!chart) return;
    let points = [];
    try {
      points = JSON.parse(chart.getAttribute('data-growth-points') || '[]');
    } catch {
      points = [];
    }
    const svg = chart.querySelector('svg');
    const tip = chart.querySelector('[data-growth-tip]');
    const dot = chart.querySelector('[data-growth-hover-dot]');
    if (!svg || !tip || !points.length) return;
    const view = buildGrowthView();

    function nearest(ev) {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return points[0];
      const x = ((ev.clientX - rect.left) / rect.width) * GROWTH_CHART.w;
      let best = points[0];
      let bestDist = Infinity;
      points.forEach((p) => {
        const dist = Math.abs(p.x - x);
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      });
      return best;
    }

    function hide() {
      tip.hidden = true;
      if (dot) dot.setAttribute('hidden', '');
    }

    function show(ev) {
      const p = nearest(ev);
      if (!p) return;
      const changeBits = [];
      if (Number.isFinite(Number(p.increment))) {
        changeBits.push(esc(formatGrowthValue(p.increment, view, { signed: true })));
      }
      if (p.prevTotal != null && Number(p.prevTotal) > 0 && Number.isFinite(Number(p.total))) {
        const dayPct = Math.round(((Number(p.total) - Number(p.prevTotal)) / Number(p.prevTotal)) * 1000) / 10;
        if (Number.isFinite(dayPct)) {
          changeBits.push(`${dayPct > 0 ? '+' : ''}${dayPct.toFixed(1)}% vs previous recorded day`);
        }
      }
      const changeClass = Number(p.increment) < 0 ? 'is-down' : Number(p.increment) > 0 ? 'is-up' : 'is-flat';
      tip.innerHTML = `
        <p class="owner-growth-tip__date">${esc(formatGrowthDay(p.date, true))}</p>
        <p class="owner-growth-tip__value">${esc(formatGrowthValue(p.total, view))}</p>
        ${changeBits.length ? `<p class="owner-growth-tip__change ${changeClass}">${changeBits.join(' · ')}</p>` : ''}
      `;
      tip.hidden = false;
      if (dot) {
        dot.removeAttribute('hidden');
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
      }
      const chartRect = chart.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const px = svgRect.left - chartRect.left + (p.x / GROWTH_CHART.w) * svgRect.width;
      const py = svgRect.top - chartRect.top + (p.y / GROWTH_CHART.h) * svgRect.height;
      const tipW = tip.offsetWidth || 180;
      const tipH = tip.offsetHeight || 72;
      let left = px - tipW / 2;
      left = Math.max(8, Math.min(left, chartRect.width - tipW - 8));
      let top = py - tipH - 14;
      if (top < 8) top = py + 16;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    chart.addEventListener('pointermove', show);
    chart.addEventListener('pointerdown', show);
    chart.addEventListener('pointerleave', hide);
  }

  function onGrowthRangeDocumentClick(e) {
    if (!state.growthRangeOpen) return;
    if (state.growthRange === 'custom') return;
    const wrap = root()?.querySelector('[data-growth-range-wrap]');
    if (wrap && wrap.contains(e.target)) return;
    state.growthRangeOpen = false;
    render();
  }

  function bindSectionEvents() {
    root().querySelectorAll('[data-section-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.section = btn.getAttribute('data-section-jump');
        render();
      });
    });
    root().querySelectorAll('[data-activity-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activityFilter = btn.getAttribute('data-activity-filter');
        render();
      });
    });
    root().querySelectorAll('[data-city-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.citySort = btn.getAttribute('data-city-sort');
        render();
      });
    });
    root().querySelectorAll('[data-country-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.countrySort = btn.getAttribute('data-country-sort');
        render();
      });
    });
    root().querySelectorAll('[data-growth-metric]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.growthMetric = btn.getAttribute('data-growth-metric');
        state.growthRangeOpen = false;
        render();
      });
    });
    bindGrowthRange();
    bindGrowthChart();
    root().querySelectorAll('[data-dap-main-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.dapView = btn.getAttribute('data-dap-main-view') || 'library';
        state.dapPartnershipId = null;
        state.dapPartnershipDetail = null;
        state.dapFormMode = false;
        state.dapForm = null;
        if (state.dapView === 'library' || state.dapView === 'partnerships') {
          state.dapLibrary = null;
        }
        render();
      });
    });
    root().querySelectorAll('[data-dap-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-dap-view');
        if (['library', 'engagement', 'partnerships'].includes(view)) {
          state.dapView = view;
          state.dapPartnershipId = null;
          state.dapPartnershipDetail = null;
          state.dapFormMode = false;
          if (view === 'library' || view === 'partnerships') {
            state.dapLibrary = null;
          }
        } else {
          state.dailyPeaceView = view;
          state.dapView = 'engagement';
        }
        state.dailyPeaceUserId = null;
        render();
      });
    });
    root().querySelectorAll('[data-dap-user]').forEach((row) => {
      row.addEventListener('click', () => {
        state.dailyPeaceUserId = row.getAttribute('data-dap-user');
        state.dailyPeaceQuery = '';
        state.dailyPeaceFilter = 'all';
        render();
      });
    });
    root().querySelectorAll('[data-dap-back]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.dailyPeaceUserId = null;
        state.dailyPeaceQuery = '';
        state.dailyPeaceFilter = 'all';
        render();
      });
    });
    root().querySelectorAll('[data-dap-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = btn.getAttribute('data-dap-filter');
        if (['all', 'sponsored', 'not_sponsored', 'company_created', 'standard', 'active', 'expired'].includes(f)) {
          state.dapFilter = f;
        } else {
          state.dailyPeaceFilter = f;
        }
        render();
      });
    });
    root().querySelectorAll('[data-dap-query]').forEach((input) => {
      input.addEventListener('input', () => {
        if (state.dapView === 'library' || state.dapView === 'partnerships') {
          state.dapQuery = input.value || '';
        } else {
          state.dailyPeaceQuery = input.value || '';
        }
        render();
        const el = root().querySelector('[data-dap-query]');
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    });
    root().querySelectorAll('[data-dap-refresh-library]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.dapLibrary = null;
        await ensureDapLibraryLoaded(true);
        render();
      });
    });
    root().querySelectorAll('[data-dap-refresh-partnership]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!state.dapPartnershipId) return;
        state.dapPartnershipDetail = null;
        try {
          await loadPartnershipDetail(state.dapPartnershipId);
        } catch (err) {
          setFlash(err.message, 'err');
        }
        render();
      });
    });
    root().querySelectorAll('[data-dap-create-partnership]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.dapFormMode = true;
        state.dapForm = {
          partnershipType: 'sponsored_standard',
          assignmentMethod: 'random',
          randomMinDay: 1,
          randomMaxDay: state.dapLibrary?.catalogCount || 403,
          currency: 'EUR',
          paymentStatus: 'pending',
        };
        state.dapFormError = null;
        render();
      });
    });
    root().querySelectorAll('[data-dap-sponsor-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.dapFormMode = true;
        state.dapForm = {
          actId: btn.getAttribute('data-dap-sponsor-act'),
          partnershipType: 'sponsored_standard',
          assignmentMethod: 'random',
          randomMinDay: 1,
          randomMaxDay: state.dapLibrary?.catalogCount || 403,
          currency: 'EUR',
          paymentStatus: 'pending',
        };
        state.dapFormError = null;
        render();
      });
    });
    root().querySelectorAll('[data-dap-open-partnership]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.dapPartnershipId = btn.getAttribute('data-dap-open-partnership');
        state.dapPartnershipDetail = null;
        try {
          await loadPartnershipDetail(state.dapPartnershipId);
        } catch (err) {
          setFlash(err.message, 'err');
        }
        render();
      });
    });
    root().querySelectorAll('[data-dap-back-library]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.dapPartnershipId = null;
        state.dapPartnershipDetail = null;
        state.dapFormMode = false;
        state.dapForm = null;
        render();
      });
    });
    root().querySelectorAll('[data-dap-edit-partnership]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-dap-edit-partnership');
        const p = state.dapPartnershipDetail?.partnership;
        if (!p) return;
        state.dapFormMode = true;
        state.dapForm = { ...p, companyAct: p.companyAct || null };
        state.dapFormError = null;
        render();
      });
    });
    async function publishPartnershipById(id) {
      try {
        await api('publish-daily-peace-partnership', { method: 'POST', body: { id } });
        state.dapLibrary = null;
        state.dapPartnershipDetail = null;
        await ensureDapLibraryLoaded();
        if (id) await loadPartnershipDetail(id);
        state.dapPartnershipId = id;
        setFlash('Partnership published.');
      } catch (err) {
        setFlash(err.message, 'err');
      }
      render();
    }
    root().querySelectorAll('[data-dap-publish-partnership]').forEach((btn) => {
      btn.addEventListener('click', () => publishPartnershipById(btn.getAttribute('data-dap-publish-partnership')));
    });
    root().querySelectorAll('[data-dap-pause-partnership]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('set-daily-peace-partnership-status', { method: 'POST', body: { id: btn.getAttribute('data-dap-pause-partnership'), status: 'paused' } });
          state.dapLibrary = null;
          await ensureDapLibraryLoaded();
          await loadPartnershipDetail(state.dapPartnershipId);
          setFlash('Partnership paused. Featured by stays on Daily Acts that already showed it.');
        } catch (err) {
          setFlash(err.message, 'err');
        }
        render();
      });
    });
    root().querySelectorAll('[data-dap-resume-partnership]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('set-daily-peace-partnership-status', { method: 'POST', body: { id: btn.getAttribute('data-dap-resume-partnership'), status: 'active' } });
          state.dapLibrary = null;
          await ensureDapLibraryLoaded();
          await loadPartnershipDetail(state.dapPartnershipId);
          setFlash('Partnership resumed.');
        } catch (err) {
          setFlash(err.message, 'err');
        }
        render();
      });
    });

    const partnershipForm = document.getElementById('dap-partnership-form');
    if (partnershipForm) {
      document.getElementById('dap-partnership-type')?.addEventListener('change', (e) => {
        const isCompany = e.target.value === 'company_created';
        document.getElementById('dap-standard-act-picker').style.display = isCompany ? 'none' : '';
        document.getElementById('dap-company-act-fields').style.display = isCompany ? '' : 'none';
      });
      document.getElementById('dap-assignment-method')?.addEventListener('change', (e) => {
        const isSpecific = e.target.value === 'specific_date';
        document.getElementById('dap-field-random-min').style.display = isSpecific ? 'none' : '';
        document.getElementById('dap-field-random-max').style.display = isSpecific ? 'none' : '';
        document.getElementById('dap-field-specific-date').style.display = isSpecific ? '' : 'none';
      });
      document.getElementById('dap-logo-upload')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result;
          const fd = new FormData(partnershipForm);
          const body = collectPartnershipForm(fd);
          state.dapForm = { ...(state.dapForm || {}), ...body, companyLogoUrl: dataUrl };
          state.dapFormError = null;

          const preview = document.querySelector('.owner-upload__preview');
          if (preview) {
            preview.innerHTML = '';
            const img = document.createElement('img');
            img.alt = '';
            img.src = dataUrl;
            preview.appendChild(img);
          }
          const previewLogo = document.querySelector('.owner-dap-preview-card .owner-dap-logo, .owner-dap-preview-meta img');
          if (previewLogo) previewLogo.src = dataUrl;

          try {
            let id = state.dapForm?.id;
            if (!id) {
              const created = await api('create-daily-peace-partnership', { method: 'POST', body });
              id = created.partnership.id;
              state.dapForm = { ...created.partnership, companyLogoUrl: dataUrl };
            }
            const updated = await api('upload-daily-peace-partnership-logo', {
              method: 'POST',
              body: { id, dataUrl, fileName: file.name },
            });
            state.dapForm = updated.partnership;
            render();
          } catch (err) {
            state.dapFormError = err.message;
            render();
          }
        };
        reader.readAsDataURL(file);
      });
      partnershipForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(partnershipForm);
        const body = collectPartnershipForm(fd);
        state.dapForm = { ...(state.dapForm || {}), ...body };
        try {
          if (state.dapForm?.id) {
            await api('update-daily-peace-partnership', { method: 'POST', body: { id: state.dapForm.id, ...body } });
          } else {
            const created = await api('create-daily-peace-partnership', { method: 'POST', body });
            state.dapForm = created.partnership;
          }
          state.dapLibrary = null;
          await ensureDapLibraryLoaded();
          state.dapFormMode = false;
          state.dapForm = null;
          state.dapFormError = null;
          setFlash('Partnership saved.');
        } catch (err) {
          state.dapFormError = err.message;
        }
        render();
      });
    }

    function normalizeDateInput(input) {
      const raw = String(input || '').trim();
      if (!raw) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const eu = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
      if (eu) {
        const day = Number(eu[1]);
        const month = Number(eu[2]);
        const year = eu[3];
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      return raw;
    }

    function collectPartnershipForm(fd) {
      const partnershipType = fd.get('partnershipType');
      const body = {
        companyName: String(fd.get('companyName') || '').trim(),
        companyWebsiteUrl: String(fd.get('companyWebsiteUrl') || '').trim(),
        partnershipType,
        startDate: normalizeDateInput(fd.get('startDate')),
        endDate: normalizeDateInput(fd.get('endDate')),
        contractedAmount: Number(fd.get('contractedAmount')) || 0,
        currency: String(fd.get('currency') || 'EUR').trim(),
        paymentStatus: fd.get('paymentStatus'),
        assignmentMethod: fd.get('assignmentMethod'),
        randomMinDay: Number(fd.get('randomMinDay')) || 1,
        randomMaxDay: Number(fd.get('randomMaxDay')) || (state.dapLibrary?.catalogCount || 403),
        specificDate: normalizeDateInput(fd.get('specificDate')) || null,
        internalNotes: String(fd.get('internalNotes') || '').trim(),
        actId: fd.get('actId') || null,
        companyLogoUrl: state.dapForm?.companyLogoUrl || null,
      };
      if (partnershipType === 'company_created') {
        body.companyAct = {
          text: String(fd.get('companyActText') || '').trim(),
          explanation: String(fd.get('companyActExplanation') || '').trim(),
          category: fd.get('companyActCategory'),
        };
      }
      return body;
    }
    root().querySelectorAll('[data-dap-refresh]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.dailyPeace = null;
        await ensureDailyPeaceLoaded();
        render();
      });
    });
    root().querySelectorAll('[data-foundation-layout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.foundationLayout = btn.getAttribute('data-foundation-layout') || 'list';
        render();
      });
    });
    document.getElementById('owner-cf-search')?.addEventListener('input', (e) => {
      state.foundationQuery = e.target.value;
      state.foundationPage = 1;
      render();
    });
    document.getElementById('owner-cf-status-filter')?.addEventListener('change', (e) => {
      state.foundationStatusFilter = e.target.value;
      state.foundationPage = 1;
      render();
    });
    document.getElementById('owner-cf-category-filter')?.addEventListener('change', (e) => {
      state.foundationCategoryFilter = e.target.value;
      state.foundationPage = 1;
      render();
    });
    document.getElementById('owner-cf-sort')?.addEventListener('change', (e) => {
      state.foundationSort = e.target.value;
      state.foundationPage = 1;
      render();
    });
    root().querySelectorAll('[data-foundation-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = Number(btn.getAttribute('data-foundation-page'));
        if (!Number.isFinite(next) || btn.disabled) return;
        state.foundationPage = next;
        render();
      });
    });
    root().querySelectorAll('[data-foundation-export]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportFoundationCsv(btn.getAttribute('data-foundation-export'));
      });
    });
    root().querySelectorAll('.owner-cf-menu-wrap').forEach((wrap) => {
      wrap.addEventListener('click', (e) => e.stopPropagation());
    });
    root().querySelectorAll('[data-foundation-menu-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-foundation-menu-toggle');
        state.foundationActionMenu = state.foundationActionMenu === id ? null : id;
        render();
      });
    });
    root().querySelectorAll('[data-foundation-status]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-foundation-status');
        const status = btn.getAttribute('data-status');
        if (!id || !status || btn.disabled) return;
        await applyFoundationStatus(id, status);
      });
    });
    root().querySelectorAll('[data-foundation-delete]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-foundation-delete');
        if (!id) return;
        await deleteFoundation(id);
      });
    });
    if (state.foundationActionMenu) {
      const closeMenu = (e) => {
        if (e.target.closest('.owner-cf-menu-wrap')) return;
        state.foundationActionMenu = null;
        document.removeEventListener('click', closeMenu);
        render();
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    root().querySelectorAll('[data-foundation-detail-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.foundationDetail = null;
        render();
      });
    });
    root().querySelectorAll('[data-foundation-create-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.foundationCreateOpen = false;
        render();
      });
    });
    if (state.foundationDetail) {
      const onEscape = (e) => {
        if (e.key !== 'Escape') return;
        state.foundationDetail = null;
        document.removeEventListener('keydown', onEscape);
        render();
      };
      document.addEventListener('keydown', onEscape);
    }
    if (state.foundationCreateOpen) {
      const onEscape = (e) => {
        if (e.key !== 'Escape') return;
        state.foundationCreateOpen = false;
        document.removeEventListener('keydown', onEscape);
        render();
      };
      document.addEventListener('keydown', onEscape);
    }
    root().querySelectorAll('[data-foundation-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('[data-foundation-export]') || e.target.closest('.owner-cf-menu-wrap')) return;
        state.foundationDetail = btn.getAttribute('data-foundation-id');
        state.foundationCreateOpen = false;
        state.section = 'foundations';
        render();
      });
    });
    root().querySelectorAll('[data-city-key]').forEach((row) => {
      row.addEventListener('click', () => {
        const [city, country] = row.getAttribute('data-city-key').split('|');
        state.cityDetail = state.data.cities.find((c) => c.city === city && c.country === country) || null;
        render();
      });
    });
    root().querySelectorAll('[data-country-key]').forEach((row) => {
      row.addEventListener('click', () => {
        const country = row.getAttribute('data-country-key');
        state.countryDetail = state.data.countries.find((c) => c.country === country) || null;
        render();
      });
    });
    if (typeof OwnerPassTheWorld !== 'undefined' && state.section === 'pass-the-world') {
      OwnerPassTheWorld.bind(root(), state, { esc, money, num, when }, {
        api,
        onRender: () => render(),
        loadData: async (silent) => {
          await ensurePtwLoaded(silent);
          render();
        },
      });
    } else if (typeof OwnerPassTheWorld !== 'undefined') {
      OwnerPassTheWorld.stopPolling();
    }

    if (typeof OwnerPromiseMemory !== 'undefined' && state.section === 'promise-memory') {
      OwnerPromiseMemory.bind(root(), state, { esc, money, num, when }, {
        api,
        onRender: () => render(),
        setFlash,
        loadData: async (silent) => {
          await ensurePromiseMemoryLoaded(silent);
          render();
        },
      });
    } else if (typeof OwnerPromiseMemory !== 'undefined') {
      OwnerPromiseMemory.stopPolling();
    }

    if (typeof OwnerMapSponsors !== 'undefined' && state.section === 'sponsors') {
      OwnerMapSponsors.bind(root(), state, { esc, money, num, when }, {
        api,
        onRender: () => render(),
        setFlash,
        loadData: async (force) => {
          await ensureSponsorsLoaded(force);
          render();
        },
      });
    }

    root().querySelectorAll('[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => exportCsv(btn.getAttribute('data-export')));
    });

    document.getElementById('owner-create-foundation')?.addEventListener('click', openCreateFoundation);
    document.getElementById('owner-cf-quick-create')?.addEventListener('click', openCreateFoundation);
    document.getElementById('owner-foundation-create')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      try {
        await api('create-influencer', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        state.foundationCreateOpen = false;
        await copyMembersCredentials(email, password);
        await loadCenter();
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
    document.getElementById('owner-reset-influencer-password')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = String(fd.get('email') || '').trim();
      const newPassword = String(fd.get('newPassword') || '');
      if (newPassword.length < 8) {
        setFlash('Password must be at least 8 characters.', 'err');
        render();
        return;
      }
      try {
        await api('reset-influencer-password', { method: 'POST', body: { email, newPassword } });
        await copyMembersCredentials(email, newPassword);
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
    document.getElementById('owner-reset-copy-credentials')?.addEventListener('click', async () => {
      const email = document.getElementById('owner-reset-email')?.value || '';
      const password = document.getElementById('owner-reset-password')?.value || '';
      if (!email || password.length < 8) {
        setFlash('Enter the login email and a password of at least 8 characters first.', 'err');
        render();
        return;
      }
      await copyMembersCredentials(email, password);
    });
    document.getElementById('owner-foundation-credentials')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        id: fd.get('id'),
        email: String(fd.get('email') || '').trim(),
      };
      try {
        await api('update-influencer', { method: 'POST', body });
        setFlash('Members login email updated.');
        await loadCenter();
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
    document.getElementById('owner-foundation-reset-password')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const detail = (state.data.foundations || []).find((f) => f.id === state.foundationDetail);
      const email = String(detail?.email || '').trim();
      const newPassword = String(fd.get('newPassword') || '');
      if (!email) {
        setFlash('Save a login email for this foundation first.', 'err');
        render();
        return;
      }
      if (newPassword.length < 8) {
        setFlash('Password must be at least 8 characters.', 'err');
        render();
        return;
      }
      try {
        await api('reset-influencer-password', { method: 'POST', body: { email, newPassword } });
        e.target.reset();
        await copyMembersCredentials(email, newPassword);
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
    document.getElementById('owner-foundation-reset-copy')?.addEventListener('click', async () => {
      const detail = (state.data.foundations || []).find((f) => f.id === state.foundationDetail);
      const email = String(detail?.email || '').trim();
      const password = document.getElementById('owner-foundation-reset-password-input')?.value || '';
      if (!email || password.length < 8) {
        setFlash('Enter a new password of at least 8 characters first.', 'err');
        render();
        return;
      }
      await copyMembersCredentials(email, password);
    });
    document.getElementById('owner-foundation-edit')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('update-influencer', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        setFlash('Foundation updated.');
        await loadCenter();
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });

    document.getElementById('owner-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const data = await api('change-email', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        state.email = data.email || state.email;
        setFlash('Email updated.');
        e.target.reset();
        render();
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
    document.getElementById('owner-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('change-password', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        setFlash('Password updated.');
        e.target.reset();
        render();
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
  }

  function openCreateFoundation() {
    state.foundationCreateOpen = true;
    state.foundationDetail = null;
    state.foundationActionMenu = null;
    render();
  }

  function render() {
    if (!state.authenticated) {
      renderLogin();
      return;
    }
    if (!state.data) {
      const inventory = state.inventory;
      const inventoryHtml = inventory
        ? `<p class="owner-muted" style="margin-top:14px">Stored records still present: ${esc(num(inventory.voices))} voices · ${esc(num(inventory.users))} users · ${esc(num(inventory.files))} files</p>`
        : '';
      root().innerHTML = `
        <p class="owner-boot">${state.busy ? 'Loading Owner Control Center…' : esc(state.error || 'No data loaded.')}</p>
        ${!state.busy && state.error ? `<p class="owner-muted" style="max-width:28em;margin:12px auto 0;text-transform:none;letter-spacing:0;font-size:0.88rem;line-height:1.5">${esc(state.error)}</p>${inventoryHtml}` : ''}
      `;
      return;
    }
    syncOwnerRoute();
    root().innerHTML = renderShell(sectionContent());
    bindShell();
    bindSectionEvents();
    mountOwnerMapIfNeeded();
  }

  function mountOwnerMapIfNeeded() {
    if (typeof OwnerMap === 'undefined') return;

    const analyticsMapHost = document.getElementById('owner-sponsor-analytics-map');
    if (analyticsMapHost) {
      if (typeof OwnerMapSponsors !== 'undefined' && OwnerMapSponsors.mountAnalyticsMap) {
        OwnerMapSponsors.mountAnalyticsMap(state);
      } else {
        const cities = typeof OwnerMapSponsors !== 'undefined'
          ? OwnerMapSponsors.getAnalyticsMapCities(
            state.sponsorAnalyticsDetail?.clickMapPoints,
            state.sponsorAnalyticsDetail?.countries,
            state.data?.map?.points
          )
          : [];
        OwnerMap.mount('owner-sponsor-analytics-map', cities);
      }
      return;
    }

    const mapHost = document.getElementById('owner-world-map');
    // Any tab that embeds the shared map shell stays wired to the same filtered data.
    if (!mapHost) {
      OwnerMap.destroy();
      return;
    }
    const filtered = getFilteredMapCities();
    OwnerMap.mount('owner-world-map', filtered.cities);

    const sync = (key, value) => {
      state.mapFilters[key] = value;
      render();
    };
    document.getElementById('owner-map-mode')?.addEventListener('change', (e) => sync('mode', e.target.value));
    document.getElementById('owner-map-country')?.addEventListener('change', (e) => sync('country', e.target.value));
    document.getElementById('owner-map-range')?.addEventListener('change', (e) => sync('range', e.target.value));
    document.getElementById('owner-map-foundation')?.addEventListener('change', (e) => sync('foundationId', e.target.value));
  }

  async function init() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (state.authenticated) openSearch();
      }
      if (e.key === 'Escape' && state.growthRangeOpen) {
        state.growthRangeOpen = false;
        render();
        return;
      }
      if (e.key === 'Escape' && state.searchOpen) closeSearch();
    });
    document.addEventListener('click', onGrowthRangeDocumentClick);
    window.addEventListener('hashchange', () => {
      if (!state.authenticated || !state.data) return;
      applyOwnerRoute();
      render();
    });

    try {
      const session = await api('session');
      if (session.authenticated) {
        state.authenticated = true;
        state.email = session.email || null;
        applyOwnerRoute();
        await loadCenter();
        return;
      }
    } catch {
      /* not signed in */
    }
    renderLogin();
  }

  return { init };
})();
