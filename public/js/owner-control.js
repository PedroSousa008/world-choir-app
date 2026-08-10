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
    { id: 'event', label: 'Event' },
    { id: 'growth', label: 'Growth' },
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
    busy: false,
    searchOpen: false,
    searchQuery: '',
    searchResults: null,
    activityFilter: 'all',
    growthMetric: 'voices',
    citySort: 'voices',
    countrySort: 'voices',
    foundationView: 'curated',
    foundationDetail: null,
    cityDetail: null,
    countryDetail: null,
    mapFilters: {
      mode: 'voices',
      country: '',
      range: 'all',
      foundationId: '',
    },
  };

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
      throw err;
    }
    return data;
  }

  function setFlash(message, type = 'ok') {
    state.flash = message ? { message, type } : null;
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
        state.error = err.message || 'Failed to load control center';
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
            <button type="button" class="owner-btn-ghost" id="owner-open-search">Search</button>
            <button type="button" class="owner-btn-ghost" id="owner-logout">Sign out</button>
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
          <p class="owner-section__label">Growth · Voices</p>
          ${renderSpark(d.growth.voices)}
          <p class="owner-muted" style="margin-top:10px">Daily new Voices from real pledge timestamps. Open Growth for more series.</p>
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

  function renderSpark(series = []) {
    if (!series.length) {
      return `<div class="owner-empty">Growth trends will appear as more data becomes available.</div>`;
    }
    const max = Math.max(...series.map((s) => s.count), 1);
    const last = series.slice(-42);
    return `
      <div class="owner-chart" aria-label="Growth chart">
        ${last.map((s) => `
          <div class="owner-chart__bar" title="${esc(s.date)}: ${esc(s.count)}" style="height:${Math.max(4, (s.count / max) * 100)}%"></div>
        `).join('')}
      </div>
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
      return {
        cities: [],
        stats: { voices: 0, cities: 0, countries: 0 },
        note: f.mode === 'donations'
          ? 'Donation locations are not available yet. The donations ledger does not include geography.'
          : 'Combined mode needs donation geography. Showing no invented markers — use Voices until donation locations exist.',
        modeBlocked: true,
      };
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
        <p class="owner-muted">Voices pledged: ${esc(num(c.voices))} · Donors: ${esc(num(c.uniqueDonors))} · Donated: ${esc(money(c.totalDonations, state.data.currency))}</p>
        <p class="owner-muted" style="margin-top:8px">Donation geography by city is unavailable until the donations ledger includes location fields.</p>
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
    `;
  }

  function renderFoundations() {
    const list = state.data.foundations || [];
    const currency = state.data.currency || 'EUR';
    const detail = state.foundationDetail
      ? list.find((f) => f.id === state.foundationDetail)
      : null;

    return `
      <section class="owner-section">
        <div class="owner-panel__head">
          <div>
            <p class="owner-section__label">Creator Foundations</p>
            <h2 class="owner-h1" style="font-size:1.35rem;margin:0">Curated management</h2>
          </div>
          <div class="owner-chips">
            <button type="button" class="owner-chip ${state.foundationView === 'curated' ? 'is-active' : ''}" data-foundation-view="curated">Curated</button>
            <button type="button" class="owner-chip ${state.foundationView === 'data' ? 'is-active' : ''}" data-foundation-view="data">Data</button>
            <button type="button" class="owner-btn" id="owner-create-foundation">Create</button>
          </div>
        </div>
      </section>

      ${!list.length
        ? `<p class="owner-empty">No Creator Foundations yet. Create the first profile to publish it to Donate.</p>`
        : state.foundationView === 'curated'
          ? `<div class="owner-foundation-grid">
              ${list.map((f) => `
                <button type="button" class="owner-foundation-card" data-foundation-id="${esc(f.id)}">
                  <h3>${esc(f.foundation || f.creator)} <span class="owner-badge ${f.status === 'active' ? 'is-on' : ''}">${esc(f.status)}</span></h3>
                  <p class="owner-muted">${esc(f.creator)}${f.country ? ` · ${esc(f.country)}` : ''}</p>
                  <p class="owner-muted" style="margin-top:8px">Login: ${esc(f.email || '—')}</p>
                  <p class="owner-muted" style="margin-top:10px">${esc(money(f.totalRaised, currency))} raised · ${esc(num(f.uniqueDonors))} donors · ${esc(num(f.activeProjects))} projects</p>
                </button>
              `).join('')}
            </div>`
          : `<div class="owner-table-wrap"><table class="owner-table">
              <thead><tr>
                <th>Creator</th><th>Foundation</th><th>Login email</th><th>Country</th><th>Status</th>
                <th>Donors</th><th>Raised</th><th>Last activity</th>
              </tr></thead>
              <tbody>
                ${list.map((f) => `
                  <tr data-foundation-id="${esc(f.id)}" style="cursor:pointer">
                    <td>${esc(f.creator)}</td>
                    <td>${esc(f.foundation || '—')}</td>
                    <td>${esc(f.email || '—')}</td>
                    <td>${esc(f.country || '—')}</td>
                    <td>${esc(f.status)}</td>
                    <td>${esc(num(f.uniqueDonors))}</td>
                    <td>${esc(money(f.totalRaised, currency))}</td>
                    <td>${esc(when(f.lastActivity))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`}

      ${detail ? renderFoundationDetail(detail) : ''}
      <div id="owner-foundation-create-slot"></div>
    `;
  }

  function renderFoundationDetail(f) {
    const currency = state.data.currency || 'EUR';
    const hasStoredPassword = !!f.ownerLoginPassword;
    return `
      <div class="owner-detail">
        <h3>${esc(f.foundation || f.creator)}</h3>
        <p class="owner-muted">Founded by ${esc(f.creator)} · ${esc(f.status)} · ${esc(f.country || 'Country not set')}</p>
        ${f.mission ? `<p style="margin-top:12px;line-height:1.6">${esc(f.mission)}</p>` : ''}

        <div class="owner-group" style="margin-top:22px">
          <p class="owner-group__title">Members login credentials</p>
          <p class="owner-muted" style="margin-bottom:14px">
            These credentials open <strong>/members</strong> (Foundation Control Center) for this Creator.
            Change them here anytime — the Influencer signs in with the values you save.
          </p>
          <form class="owner-form" id="owner-foundation-credentials" style="max-width:560px">
            <input type="hidden" name="id" value="${esc(f.id)}">
            <div class="owner-field">
              <label>Email</label>
              <input name="email" type="email" value="${esc(f.email || '')}" required autocomplete="off">
            </div>
            <div class="owner-field">
              <label>Password</label>
              <div class="owner-password-row">
                <input
                  id="owner-foundation-password"
                  name="password"
                  type="text"
                  value="${esc(f.ownerLoginPassword || '')}"
                  ${hasStoredPassword ? '' : 'placeholder="Set a password to store and display it here"'}
                  minlength="8"
                  autocomplete="off"
                  spellcheck="false"
                >
                <button type="button" class="owner-btn-ghost" id="owner-copy-credentials" title="Copy email and password">Copy</button>
              </div>
            </div>
            ${hasStoredPassword
              ? ''
              : `<p class="owner-muted">No recoverable password on file yet (older accounts). Enter a new password and save to set and display it.</p>`}
            <button class="owner-btn" type="submit">Save credentials</button>
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
              <button type="button" class="owner-btn-ghost" data-toggle-foundation="${esc(f.id)}" data-active="${f.active ? 'false' : 'true'}">
                ${f.active ? 'Pause' : 'Activate'}
              </button>
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

  function renderGrowth() {
    const g = state.data.growth || {};
    const series = g[state.growthMetric] || [];
    return `
      <section class="owner-section">
        <p class="owner-section__label">Growth</p>
        <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">Historical momentum</h2>
        <p class="owner-sub">Built from real timestamps. Comparison percentages appear only when enough history exists.</p>
        <div class="owner-chips" style="margin-top:14px">
          ${['voices', 'users', 'donations', 'foundations'].map((m) => `
            <button type="button" class="owner-chip ${state.growthMetric === m ? 'is-active' : ''}" data-growth-metric="${m}">${esc(m)}</button>
          `).join('')}
        </div>
        ${renderSpark(series)}
        <p class="owner-muted" style="margin-top:12px">${esc(num(series.length))} days with recorded ${esc(state.growthMetric)}.</p>
        <p class="owner-muted" style="margin-top:8px">Unavailable: ${(state.data.unavailableCapabilities || []).filter((x) => /attribution|viral|invitation/i.test(x)).map(esc).join(' · ') || '—'}</p>
      </section>
    `;
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
      rows = [['creator', 'foundation', 'country', 'status', 'donors', 'raised']].concat(
        state.data.foundations.map((f) => [f.creator, f.foundation, f.country, f.status, f.uniqueDonors, f.totalRaised])
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
      case 'event': return renderEvent();
      case 'growth': return renderGrowth();
      case 'applications': return renderApplications();
      case 'operations': return renderOperations();
      case 'reports': return renderReports();
      case 'admin': return renderAdmin();
      case 'account': return renderAccount();
      default: return renderOverview();
    }
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
        render();
      });
    });
    root().querySelectorAll('[data-foundation-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.foundationView = btn.getAttribute('data-foundation-view');
        render();
      });
    });
    root().querySelectorAll('[data-foundation-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.foundationDetail = btn.getAttribute('data-foundation-id');
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
    root().querySelectorAll('[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => exportCsv(btn.getAttribute('data-export')));
    });

    document.getElementById('owner-create-foundation')?.addEventListener('click', openCreateFoundation);
    document.getElementById('owner-foundation-credentials')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        id: fd.get('id'),
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || ''),
      };
      if (!body.password || body.password.length < 8) {
        setFlash('Password must be at least 8 characters.', 'err');
        render();
        return;
      }
      try {
        await api('update-influencer', { method: 'POST', body });
        setFlash('Members login credentials updated. They can sign in at /members with these values.');
        await loadCenter();
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
    document.getElementById('owner-copy-credentials')?.addEventListener('click', async () => {
      const email = document.querySelector('#owner-foundation-credentials [name="email"]')?.value || '';
      const password = document.getElementById('owner-foundation-password')?.value || '';
      const text = `Email: ${email}\nPassword: ${password}\nLogin: /members`;
      try {
        await navigator.clipboard.writeText(text);
        setFlash('Credentials copied.');
        render();
      } catch {
        setFlash('Could not copy — select the fields manually.', 'err');
        render();
      }
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
    root().querySelectorAll('[data-toggle-foundation]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-toggle-foundation');
        const active = btn.getAttribute('data-active') === 'true';
        if (!window.confirm(active ? 'Activate this foundation?' : 'Pause this foundation?')) return;
        try {
          await api('update-influencer', { method: 'POST', body: { id, active } });
          setFlash(active ? 'Foundation activated.' : 'Foundation paused.');
          await loadCenter();
        } catch (err) {
          setFlash(err.message, 'err');
          render();
        }
      });
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
    const slot = document.getElementById('owner-foundation-create-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="owner-detail">
        <h3>Create Creator Foundation</h3>
        <p class="owner-muted" style="margin-bottom:14px">
          Email and temporary password become their Influencer login at <strong>/members</strong>.
          The foundation is published to Donate immediately.
        </p>
        <form class="owner-form" id="owner-foundation-create" style="max-width:560px">
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
            <button class="owner-btn-ghost" type="button" id="owner-create-cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.getElementById('owner-create-cancel')?.addEventListener('click', () => { slot.innerHTML = ''; });
    document.getElementById('owner-foundation-create')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('create-influencer', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        setFlash('Creator Foundation created. They can sign in at /members with the email and password you set.');
        await loadCenter();
      } catch (err) {
        setFlash(err.message, 'err');
        render();
      }
    });
  }

  function render() {
    if (!state.authenticated) {
      renderLogin();
      return;
    }
    if (!state.data) {
      root().innerHTML = `<p class="owner-boot">${state.busy ? 'Loading Owner Control Center…' : 'No data loaded.'}</p>`;
      return;
    }
    root().innerHTML = renderShell(sectionContent());
    bindShell();
    bindSectionEvents();
    mountOwnerMapIfNeeded();
  }

  function mountOwnerMapIfNeeded() {
    if (typeof OwnerMap === 'undefined') return;
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
      if (e.key === 'Escape' && state.searchOpen) closeSearch();
    });

    try {
      const session = await api('session');
      if (session.authenticated) {
        state.authenticated = true;
        state.email = session.email || null;
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
