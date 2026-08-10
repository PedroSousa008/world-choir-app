/**
 * Foundation Control Center — Creator Foundation headquarters.
 * Data from /api/members?action=... only. Never invents metrics.
 */
const FoundationControl = (() => {
  const API = '/api/members';
  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'foundation', label: 'Foundation' },
    { id: 'projects', label: 'Projects' },
    { id: 'donations', label: 'Donations' },
    { id: 'community', label: 'Community' },
    { id: 'insights', label: 'Insights' },
    { id: 'updates', label: 'Updates' },
    { id: 'settings', label: 'Settings' },
  ];

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
    notifOpen: false,
    mapOpen: false,
    activityFilter: 'all',
    growthMetric: 'amount',
    foundationTab: 'page',
    foundationDirty: false,
    foundationForm: null,
    projectEdit: null,
    updateEdit: null,
    drill: null,
    settingsTab: 'foundation',
  };

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
    return `<div class="fcc-flash is-${esc(state.flash.type)}">${esc(state.flash.message)}</div>`;
  }

  function currency() {
    return state.data?.currency || 'EUR';
  }

  function can(perm) {
    return !!(state.data?.permissions && state.data.permissions[perm]);
  }

  function unreadCount() {
    return (state.data?.notifications || []).filter((n) => !n.read).length;
  }

  function syncFoundationForm(from) {
    const f = from || state.data?.foundation || {};
    const drafts = state.data?.drafts || {};
    const page = drafts.page || {};
    const card = drafts.card || {};
    state.foundationForm = {
      foundationName: page.foundationName ?? f.name ?? '',
      creatorName: page.creatorName ?? f.creatorName ?? '',
      country: page.country ?? f.country ?? '',
      category: page.category ?? f.category ?? '',
      mission: page.mission ?? f.mission ?? '',
      biography: page.biography ?? f.biography ?? '',
      whyStarted: page.whyStarted ?? f.whyStarted ?? '',
      howItWorks: page.howItWorks ?? f.howItWorks ?? '',
      shortDescription: page.shortDescription ?? f.shortDescription ?? '',
      story: page.story ?? f.story ?? '',
      website: page.website ?? f.website ?? '',
      profileImage: page.profileImage ?? f.profileImage ?? '',
      coverImage: page.coverImage ?? f.coverImage ?? '',
      cardShortMission: card.cardShortMission ?? f.cardShortMission ?? f.mission ?? '',
      socialLinks: {
        instagram: (f.socialLinks && f.socialLinks.instagram) || '',
        youtube: (f.socialLinks && f.socialLinks.youtube) || '',
        x: (f.socialLinks && f.socialLinks.x) || '',
        tiktok: (f.socialLinks && f.socialLinks.tiktok) || '',
        ...(page.socialLinks || {}),
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
        <img class="fcc-login__logo" src="images/world-choir-logo.png?v=20270706" alt="World Choir">
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
      searchOpen: false,
      notifOpen: false,
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
    const unread = unreadCount();
    return `
      <div class="fcc-shell">
        <aside class="fcc-nav">
          <p class="fcc-nav__brand">World Choir</p>
          <p class="fcc-nav__title">Foundation Control Center</p>
          <p class="fcc-nav__foundation">${esc(f.name || 'Your Foundation')}</p>
          <ul class="fcc-nav__list">
            ${SECTIONS.map((s) => `
              <li>
                <button type="button" class="fcc-nav__btn ${state.section === s.id ? 'is-active' : ''}"
                  data-nav="${esc(s.id)}">${esc(s.label)}</button>
              </li>
            `).join('')}
          </ul>
          <div class="fcc-nav__foot">
            <button type="button" class="fcc-btn-ghost" data-action="open-search">Search ⌘K</button>
            <button type="button" class="fcc-btn-ghost" data-action="logout">Sign out</button>
          </div>
        </aside>
        <div class="fcc-main">
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
              <button type="button" class="fcc-icon-btn" data-action="open-search" aria-label="Search" title="Search (⌘K)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
              </button>
              <button type="button" class="fcc-icon-btn" data-action="open-notif" aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>
                ${unread ? '<span class="fcc-icon-btn__badge"></span>' : ''}
              </button>
            </div>
          </div>
          ${flashHtml()}
          ${state.error ? `<div class="fcc-flash is-err">${esc(state.error)}</div>` : ''}
          ${content}
        </div>
      </div>
      ${renderSearchOverlay()}
      ${renderNotifDrawer()}
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
      foundation: 'Edit page, card, and public information with live preview.',
      projects: 'Create and manage Foundation projects.',
      donations: 'Verified donations for this Foundation only.',
      community: 'Supporters and where they gather.',
      insights: 'Growth and location leaders from real data.',
      updates: 'Publish updates to your supporters.',
      settings: 'Foundation, team, verification, and security.',
    };
    return map[state.section] || '';
  }

  function go(section, opts = {}) {
    state.section = section;
    if (opts.drill !== undefined) state.drill = opts.drill;
    if (opts.foundationTab) state.foundationTab = opts.foundationTab;
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

  /* ─── Overview ─── */

  function renderOverview() {
    const d = state.data;
    const o = d.overview || {};
    const today = d.today || {};
    const growth = d.growth || {};
    const series = (growth.series && growth.series[state.growthMetric]) || [];
    const activity = (d.activity || []).filter((a) =>
      state.activityFilter === 'all' || a.type === state.activityFilter
    );
    const cmp = growth.comparison || {};

    return `
      <section class="fcc-section">
        <div class="fcc-hero">
          <button type="button" class="fcc-hero__primary" data-nav="donations">
            <span class="fcc-hero__value">${esc(money(o.totalRaised || 0, currency()))}</span>
            <span class="fcc-hero__label">Raised · all time</span>
          </button>
          <div class="fcc-hero__secondary">
            ${metricBtn(num(o.totalSupporters || 0), 'Supporters', 'community')}
            ${metricBtn(num(o.countriesReached || 0), 'Countries', 'donations')}
            ${metricBtn(num(o.citiesReached || 0), 'Cities', 'community')}
            ${metricBtn(num(o.activeProjects || 0), 'Active projects', 'projects')}
          </div>
        </div>

        <div class="fcc-today">
          <p class="fcc-section__label">Today</p>
          ${today.empty
            ? emptyNote(today.message || 'No new Foundation activity today.')
            : `<div class="fcc-today__items">
                ${(today.items || []).map((item) => `
                  <div class="fcc-today__item">
                    <strong>${item.key === 'raised' ? esc(money(item.value, currency())) : esc(num(item.value))}</strong>
                    <span>${esc(item.label)}</span>
                  </div>
                `).join('')}
              </div>`}
        </div>

        <div class="fcc-section__head">
          <h2>Growth</h2>
          <div class="fcc-seg" data-seg="growth">
            <button type="button" data-growth="amount" class="${state.growthMetric === 'amount' ? 'is-active' : ''}">Raised</button>
            <button type="button" data-growth="donations" class="${state.growthMetric === 'donations' ? 'is-active' : ''}">Donations</button>
            <button type="button" data-growth="supporters" class="${state.growthMetric === 'supporters' ? 'is-active' : ''}">Supporters</button>
          </div>
        </div>
        ${renderChart(series, 'value')}
        <div class="fcc-chart-meta">
          <span>Range: ${esc(RANGES.find((r) => r.id === state.range)?.label || state.range)} · ${esc(money(o.rangedRaised || 0, currency()))} · ${esc(num(o.rangedSupporters || 0))} supporters</span>
          <span>${cmp.available
            ? `vs prior: raised ${cmp.raisedChangePct != null ? cmp.raisedChangePct + '%' : '—'} · supporters ${cmp.supportersChangePct != null ? cmp.supportersChangePct + '%' : '—'}`
            : esc(cmp.reason || 'Not enough historical data.')}</span>
        </div>
      </section>

      <section class="fcc-section">
        <div class="fcc-section__head">
          <h2>Activity</h2>
          <div class="fcc-seg" data-seg="activity">
            ${['all', 'donations', 'projects', 'updates', 'foundation'].map((f) => `
              <button type="button" data-activity="${f}" class="${state.activityFilter === f ? 'is-active' : ''}">${esc(f)}</button>
            `).join('')}
          </div>
        </div>
        ${!activity.length
          ? emptyNote('Activity will appear as donations and workspace events are recorded.')
          : `<ul class="fcc-feed">
              ${activity.slice(0, 40).map((a) => `
                <li class="fcc-feed__item">
                  <div>
                    <p class="fcc-feed__label">${esc(a.label)}</p>
                    ${a.detail ? `<p class="fcc-feed__detail">${esc(a.detail)}${a.actor ? ` · ${esc(a.actor)}` : ''}</p>` : ''}
                  </div>
                  <div class="fcc-feed__meta">${esc(when(a.at))}</div>
                </li>
              `).join('')}
            </ul>`}
      </section>

      ${(d.unavailableCapabilities || []).length ? `
        <p class="fcc-note">${esc((d.unavailableCapabilities || []).slice(0, 3).join(' · '))}</p>
      ` : ''}
    `;
  }

  /* ─── Foundation editor ─── */

  function renderFoundation() {
    const form = state.foundationForm || {};
    const tab = state.foundationTab;
    const dirty = state.foundationDirty;

    const tabs = [
      { id: 'page', label: 'Page' },
      { id: 'card', label: 'Card' },
      { id: 'information', label: 'Information' },
      { id: 'preview', label: 'Preview' },
    ];

    return `
      <section class="fcc-section">
        <div class="fcc-section__head">
          <div class="fcc-tabs">
            ${tabs.map((t) => `
              <button type="button" class="fcc-tab ${tab === t.id ? 'is-active' : ''}" data-ftab="${t.id}">${esc(t.label)}</button>
            `).join('')}
          </div>
          <div class="fcc-actions">
            ${dirty ? '<span class="fcc-unsaved">Unsaved changes</span>' : ''}
            ${can('editFoundation') ? `
              <button type="button" class="fcc-btn" data-action="save-foundation" ${state.busy ? 'disabled' : ''}>
                ${state.busy ? 'Saving…' : 'Save'}
              </button>
            ` : '<span class="fcc-muted">Your role cannot edit Foundation content.</span>'}
          </div>
        </div>

        <div class="fcc-editor-grid ${tab === 'preview' ? '' : 'has-preview'}">
          <div>
            ${tab === 'page' ? renderFoundationPageFields(form) : ''}
            ${tab === 'card' ? renderFoundationCardFields(form) : ''}
            ${tab === 'information' ? renderFoundationInfoFields(form) : ''}
            ${tab === 'preview' ? renderFoundationPreview(form, true) : ''}
          </div>
          ${tab !== 'preview' ? `<div>${renderFoundationPreview(form, false)}</div>` : ''}
        </div>
      </section>
    `;
  }

  function renderFoundationPageFields(form) {
    return `
      <form class="fcc-form wide" id="fcc-foundation-form" data-part="page">
        <div class="fcc-field">
          <label for="ff-name">Foundation name</label>
          <input id="ff-name" name="foundationName" value="${esc(form.foundationName)}" ${can('editFoundation') ? '' : 'readonly'}>
        </div>
        <div class="fcc-field">
          <label for="ff-creator">Founded by</label>
          <input id="ff-creator" name="creatorName" value="${esc(form.creatorName)}" ${can('editFoundation') ? '' : 'readonly'}>
        </div>
        <div class="fcc-form two-col" style="max-width:none;padding:0;border:0;background:transparent">
          <div class="fcc-field">
            <label for="ff-country">Country</label>
            <input id="ff-country" name="country" value="${esc(form.country)}" ${can('editFoundation') ? '' : 'readonly'}>
          </div>
          <div class="fcc-field">
            <label for="ff-category">Category</label>
            <input id="ff-category" name="category" value="${esc(form.category)}" ${can('editFoundation') ? '' : 'readonly'}>
          </div>
        </div>
        <div class="fcc-field">
          <label for="ff-mission">Mission</label>
          <textarea id="ff-mission" name="mission" ${can('editFoundation') ? '' : 'readonly'}>${esc(form.mission)}</textarea>
        </div>
        <div class="fcc-field">
          <label for="ff-bio">Biography</label>
          <textarea id="ff-bio" name="biography" ${can('editFoundation') ? '' : 'readonly'}>${esc(form.biography)}</textarea>
        </div>
        <div class="fcc-field">
          <label for="ff-why">Why it started</label>
          <textarea id="ff-why" name="whyStarted" ${can('editFoundation') ? '' : 'readonly'}>${esc(form.whyStarted)}</textarea>
        </div>
        <div class="fcc-field">
          <label for="ff-how">How it works</label>
          <textarea id="ff-how" name="howItWorks" ${can('editFoundation') ? '' : 'readonly'}>${esc(form.howItWorks)}</textarea>
        </div>
        <div class="fcc-field">
          <label for="ff-story">Story</label>
          <textarea id="ff-story" name="story" ${can('editFoundation') ? '' : 'readonly'}>${esc(form.story)}</textarea>
        </div>
      </form>
    `;
  }

  function renderFoundationCardFields(form) {
    return `
      <form class="fcc-form wide" id="fcc-foundation-form" data-part="card">
        <div class="fcc-field">
          <label for="ff-card-mission">Short mission (card)</label>
          <textarea id="ff-card-mission" name="cardShortMission" ${can('editFoundation') ? '' : 'readonly'}>${esc(form.cardShortMission)}</textarea>
        </div>
        <div class="fcc-field">
          <label for="ff-short">Short description</label>
          <textarea id="ff-short" name="shortDescription" ${can('editFoundation') ? '' : 'readonly'}>${esc(form.shortDescription)}</textarea>
        </div>
        <div class="fcc-field">
          <label for="ff-profile">Profile image URL</label>
          <input id="ff-profile" name="profileImage" value="${esc(form.profileImage)}" ${can('editFoundation') ? '' : 'readonly'}>
        </div>
        <div class="fcc-field">
          <label for="ff-cover">Cover image URL</label>
          <input id="ff-cover" name="coverImage" value="${esc(form.coverImage)}" ${can('editFoundation') ? '' : 'readonly'}>
        </div>
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

  function renderFoundationPreview(form, full) {
    const mark = form.profileImage
      ? `<img src="${esc(form.profileImage)}" alt="">`
      : (form.foundationName || 'F').slice(0, 1).toUpperCase();
    const mission = form.mission || form.cardShortMission || '';
    return `
      <div class="fcc-preview">
        <p class="fcc-preview__label">${full ? 'Public preview' : 'Live preview'}</p>
        <p class="fcc-kicker" style="margin-bottom:10px">Featured Foundation</p>
        <h2 class="fcc-df-featured__title">${esc(form.foundationName || 'Foundation name')}</h2>
        <p class="fcc-df-featured__byline">Founded by ${esc(form.creatorName || '—')}</p>
        ${form.country ? `<p class="fcc-df-featured__place">${esc(form.country)}</p>` : ''}
        <p class="fcc-df-featured__mission">${esc(mission || 'Mission details will appear as they are published.')}</p>
        <span class="fcc-df-cta">Support this Foundation</span>

        <div class="fcc-df-row">
          <span class="fcc-df-row__mark">${mark}</span>
          <div>
            <h3 class="fcc-df-row__name">${esc(form.foundationName || 'Foundation name')}</h3>
            <p class="fcc-df-row__meta">${esc([form.creatorName, form.country].filter(Boolean).join(' · ') || '—')}</p>
            <p class="fcc-df-row__mission">${esc(form.cardShortMission || form.shortDescription || mission || 'Short mission for the donate list.')}</p>
          </div>
        </div>
      </div>
    `;
  }

  function readFoundationFormIntoState() {
    const el = document.getElementById('fcc-foundation-form');
    if (!el || !state.foundationForm) return;
    const fd = new FormData(el);
    const f = state.foundationForm;
    for (const [k, v] of fd.entries()) {
      if (['instagram', 'youtube', 'x', 'tiktok'].includes(k)) {
        f.socialLinks = f.socialLinks || {};
        f.socialLinks[k] = String(v);
      } else {
        f[k] = String(v);
      }
    }
    state.foundationDirty = true;
  }

  async function saveFoundation() {
    if (!can('editFoundation')) return;
    readFoundationFormIntoState();
    const f = state.foundationForm;
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
          website: f.website,
          profileImage: f.profileImage,
          coverImage: f.coverImage,
          cardShortMission: f.cardShortMission,
          country: f.country,
          primaryCategory: f.category,
          socialLinks: f.socialLinks,
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
            website: f.website,
            profileImage: f.profileImage,
            coverImage: f.coverImage,
            socialLinks: f.socialLinks,
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
      await loadCenter();
    } catch (err) {
      setFlash(err.message || 'Save failed', 'err');
      state.busy = false;
      render();
    }
  }

  /* ─── Projects ─── */

  function renderProjects() {
    const projects = state.data?.projects || [];
    const edit = state.projectEdit;

    return `
      <section class="fcc-section">
        <div class="fcc-section__head">
          <h2>${edit ? (edit.id ? 'Edit project' : 'New project') : 'Projects'}</h2>
          ${can('createProjects') && !edit ? `
            <button type="button" class="fcc-btn" data-action="project-new">Create project</button>
          ` : ''}
        </div>

        ${edit ? renderProjectForm(edit) : ''}

        ${!projects.length && !edit
          ? emptyNote('No projects yet. Create one when you are ready.')
          : `<ul class="fcc-list">
              ${projects.map((p) => `
                <li class="fcc-row">
                  <div>
                    <p class="fcc-row__title">${esc(p.title)} <span class="fcc-pill is-${esc(p.status)}">${esc(p.status)}</span></p>
                    <p class="fcc-row__meta">
                      ${esc(p.shortDescription || p.description || '—')}
                      <br>${esc(money(p.fundingRaised || 0, currency()))} raised
                      ${p.fundingGoal != null ? ` of ${esc(money(p.fundingGoal, currency()))}` : ''}
                      ${p.location || p.country ? ` · ${esc([p.location, p.country].filter(Boolean).join(', '))}` : ''}
                    </p>
                  </div>
                  <div class="fcc-row__actions">
                    ${can('createProjects') ? `
                      <button type="button" class="fcc-btn-ghost" data-action="project-edit" data-id="${esc(p.id)}">Edit</button>
                      ${p.status !== 'active' ? `<button type="button" class="fcc-btn-ghost" data-action="project-status" data-id="${esc(p.id)}" data-status="active">Activate</button>` : ''}
                      ${p.status === 'active' ? `<button type="button" class="fcc-btn-ghost" data-action="project-status" data-id="${esc(p.id)}" data-status="paused">Pause</button>` : ''}
                      ${p.status !== 'completed' ? `<button type="button" class="fcc-btn-ghost" data-action="project-status" data-id="${esc(p.id)}" data-status="completed">Complete</button>` : ''}
                      ${p.status !== 'archived' ? `<button type="button" class="fcc-btn-ghost is-danger" data-action="project-status" data-id="${esc(p.id)}" data-status="archived">Archive</button>` : ''}
                    ` : ''}
                  </div>
                </li>
              `).join('')}
            </ul>`}
      </section>
    `;
  }

  function renderProjectForm(p) {
    return `
      <form class="fcc-form wide" id="fcc-project-form" style="margin-bottom:28px">
        ${p.id ? `<input type="hidden" name="id" value="${esc(p.id)}">` : ''}
        <div class="fcc-field">
          <label for="pj-title">Title</label>
          <input id="pj-title" name="title" required value="${esc(p.title || '')}">
        </div>
        <div class="fcc-field">
          <label for="pj-short">Short description</label>
          <textarea id="pj-short" name="shortDescription">${esc(p.shortDescription || '')}</textarea>
        </div>
        <div class="fcc-field">
          <label for="pj-desc">Description</label>
          <textarea id="pj-desc" name="description">${esc(p.description || '')}</textarea>
        </div>
        <div class="fcc-form two-col" style="max-width:none;padding:0;border:0;background:transparent">
          <div class="fcc-field">
            <label for="pj-loc">Location</label>
            <input id="pj-loc" name="location" value="${esc(p.location || '')}">
          </div>
          <div class="fcc-field">
            <label for="pj-country">Country</label>
            <input id="pj-country" name="country" value="${esc(p.country || '')}">
          </div>
          <div class="fcc-field">
            <label for="pj-cat">Category</label>
            <input id="pj-cat" name="category" value="${esc(p.category || '')}">
          </div>
          <div class="fcc-field">
            <label for="pj-goal">Funding goal (EUR)</label>
            <input id="pj-goal" name="fundingGoal" type="number" min="0" step="0.01" value="${esc(p.fundingGoal ?? '')}">
          </div>
          <div class="fcc-field">
            <label for="pj-start">Start date</label>
            <input id="pj-start" name="startDate" type="date" value="${esc((p.startDate || '').slice(0, 10))}">
          </div>
          <div class="fcc-field">
            <label for="pj-end">Expected completion</label>
            <input id="pj-end" name="expectedCompletionDate" type="date" value="${esc((p.expectedCompletionDate || '').slice(0, 10))}">
          </div>
        </div>
        <div class="fcc-field">
          <label for="pj-cover">Cover image URL</label>
          <input id="pj-cover" name="coverImage" value="${esc(p.coverImage || '')}">
        </div>
        <div class="fcc-form-actions">
          <button class="fcc-btn" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Saving…' : 'Save project'}</button>
          <button class="fcc-btn-ghost" type="button" data-action="project-cancel">Cancel</button>
        </div>
      </form>
    `;
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
                    <th>Date</th><th>Supporter</th><th>Place</th><th class="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${explorer.map((row) => `
                    <tr>
                      <td>${esc(when(row.date))}</td>
                      <td>${esc(row.supporterLabel)}${row.isReturning ? ' · returning' : (row.isNewSupporter ? ' · new' : '')}</td>
                      <td>${esc([row.city, row.country].filter(Boolean).join(', ') || '—')}</td>
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

  /* ─── Insights ─── */

  function renderInsights() {
    const ins = state.data?.insights || {};
    const funnel = ins.conversionFunnel || {};
    const content = ins.contentPerformance || {};
    const bySup = ins.locationLeaders?.bySupporters || [];
    const byRaised = ins.locationLeaders?.byRaised || [];

    return `
      <section class="fcc-section">
        <div class="fcc-section__head"><h2>Growth</h2></div>
        ${renderChart(ins.growth || [], 'amount')}
      </section>

      <section class="fcc-section fcc-split">
        <div>
          <h2 class="fcc-section__label" style="margin-bottom:12px">Leaders by supporters</h2>
          ${renderCityTable(bySup)}
        </div>
        <div>
          <h2 class="fcc-section__label" style="margin-bottom:12px">Leaders by raised</h2>
          ${renderCityTable(byRaised)}
        </div>
      </section>

      <section class="fcc-section">
        <h2 class="fcc-section__label">Conversion funnel</h2>
        ${funnel.available
          ? ''
          : `
            <p class="fcc-note">${esc(funnel.note || 'Funnel stages are not tracked yet.')}</p>
            <div class="fcc-funnel">
              <div class="fcc-funnel__stage">Page views — unavailable</div>
              <div class="fcc-funnel__stage">Donation starts — unavailable</div>
              <div class="fcc-funnel__stage">Completed donations — use Donations section</div>
            </div>
          `}
      </section>

      <section class="fcc-section">
        <h2 class="fcc-section__label">Content performance</h2>
        ${emptyNote(content.note || 'Content performance tracking is not connected yet.')}
      </section>
    `;
  }

  /* ─── Updates ─── */

  function renderUpdates() {
    const updates = state.data?.updates || [];
    const edit = state.updateEdit;
    return `
      <section class="fcc-section">
        <div class="fcc-section__head">
          <h2>${edit ? (edit.id ? 'Edit update' : 'New update') : 'Updates'}</h2>
          ${can('publishUpdates') && !edit ? `
            <button type="button" class="fcc-btn" data-action="update-new">Create update</button>
          ` : ''}
        </div>

        ${edit ? `
          <form class="fcc-form wide" id="fcc-update-form" style="margin-bottom:28px">
            ${edit.id ? `<input type="hidden" name="id" value="${esc(edit.id)}">` : ''}
            <div class="fcc-field">
              <label for="up-title">Title</label>
              <input id="up-title" name="title" required value="${esc(edit.title || '')}">
            </div>
            <div class="fcc-field">
              <label for="up-body">Body</label>
              <textarea id="up-body" name="body" required>${esc(edit.body || '')}</textarea>
            </div>
            <div class="fcc-form two-col" style="max-width:none;padding:0;border:0;background:transparent">
              <div class="fcc-field">
                <label for="up-type">Type</label>
                <select id="up-type" name="type">
                  ${['foundation', 'project', 'milestone'].map((t) => `
                    <option value="${t}" ${(edit.type || 'foundation') === t ? 'selected' : ''}>${t}</option>
                  `).join('')}
                </select>
              </div>
              <div class="fcc-field">
                <label for="up-status">Status</label>
                <select id="up-status" name="status">
                  ${['draft', 'published'].map((t) => `
                    <option value="${t}" ${(edit.status || 'draft') === t ? 'selected' : ''}>${t}</option>
                  `).join('')}
                </select>
              </div>
            </div>
            <div class="fcc-form-actions">
              <button class="fcc-btn" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Saving…' : 'Save update'}</button>
              <button class="fcc-btn-ghost" type="button" data-action="update-cancel">Cancel</button>
            </div>
          </form>
        ` : ''}

        ${!updates.length && !edit
          ? emptyNote('No updates yet.')
          : `<ul class="fcc-list">
              ${updates.map((u) => `
                <li class="fcc-row">
                  <div>
                    <p class="fcc-row__title">${esc(u.title)} <span class="fcc-pill is-${esc(u.status)}">${esc(u.status)}</span></p>
                    <p class="fcc-row__meta">${esc((u.body || '').slice(0, 160))}${(u.body || '').length > 160 ? '…' : ''}
                      <br>${esc(when(u.publishedAt || u.updatedAt || u.createdAt))} · ${esc(u.type || 'foundation')}
                    </p>
                  </div>
                  <div class="fcc-row__actions">
                    ${can('publishUpdates') ? `
                      <button type="button" class="fcc-btn-ghost" data-action="update-edit" data-id="${esc(u.id)}">Edit</button>
                      ${u.status !== 'published' ? `<button type="button" class="fcc-btn-ghost" data-action="update-publish" data-id="${esc(u.id)}">Publish</button>` : ''}
                    ` : ''}
                  </div>
                </li>
              `).join('')}
            </ul>`}
      </section>
    `;
  }

  /* ─── Settings ─── */

  function renderSettings() {
    const f = state.data?.foundation || {};
    const team = state.data?.team || [];
    const ver = state.data?.verification || {};
    const fin = state.data?.financial || {};
    const sec = state.data?.security || {};
    const tabs = [
      { id: 'foundation', label: 'Foundation' },
      { id: 'team', label: 'Team' },
      { id: 'verification', label: 'Verification' },
      { id: 'financial', label: 'Financial' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'security', label: 'Security' },
    ];
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

        ${tab === 'verification' ? `
          <div class="fcc-block">
            <h3>Verification</h3>
            <div class="fcc-status-line">
              <span class="fcc-status-dot ${ver.status === 'verified' ? 'is-verified' : ''}"></span>
              ${esc(ver.status || 'unverified')}
            </div>
            <p class="fcc-muted" style="margin-top:12px">${esc(ver.note || 'Verification is managed by World Choir.')}</p>
            <p class="fcc-note">Status is read-only. World Choir reviews verification — Foundations cannot self-verify.</p>
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

        ${tab === 'notifications' ? `
          <div class="fcc-block">
            <h3>Notification preferences</h3>
            <p class="fcc-note">Granular notification preferences are not configurable yet. You receive workspace alerts in the notifications drawer. Mark items read there.</p>
            <div class="fcc-form-actions">
              <button type="button" class="fcc-btn-ghost" data-action="open-notif">Open notifications</button>
            </div>
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
      { key: 'projects', label: 'Projects', section: 'projects' },
      { key: 'updates', label: 'Updates', section: 'updates' },
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
            placeholder="Search projects, updates, cities…" value="${esc(state.searchQuery)}" autocomplete="off">
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

  function renderNotifDrawer() {
    const list = state.data?.notifications || [];
    return `
      <div class="fcc-overlay ${state.notifOpen ? 'is-open' : ''}" id="fcc-notif">
        <div class="fcc-overlay__backdrop" data-action="close-notif"></div>
        <div class="fcc-notif-panel" role="dialog" aria-label="Notifications">
          <div class="fcc-section__head">
            <h2>Notifications</h2>
            <button type="button" class="fcc-btn-ghost" data-action="notif-read-all">Mark all read</button>
          </div>
          ${!list.length
            ? emptyNote('No notifications yet.')
            : list.map((n) => `
              <div class="fcc-notif-item ${n.read ? '' : 'is-unread'}">
                <p class="fcc-notif-item__title">${esc(n.title)}</p>
                <p class="fcc-notif-item__body">${esc(n.body || '')}<br>${esc(when(n.createdAt))}</p>
                ${!n.read ? `<button type="button" class="fcc-btn-ghost" style="margin-top:8px" data-action="notif-read" data-id="${esc(n.id)}">Mark read</button>` : ''}
              </div>
            `).join('')}
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
      projects: renderProjects,
      donations: renderDonations,
      community: renderCommunity,
      insights: renderInsights,
      updates: renderUpdates,
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
    if (!state.authenticated) {
      renderLogin();
      return;
    }
    if (!state.data) {
      root().innerHTML = `<p class="fcc-boot">${state.busy ? 'Loading Foundation Control Center…' : (state.error || 'Loading…')}</p>`;
      return;
    }
    renderApp();
  }

  function bindApp() {
    root().querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => go(btn.getAttribute('data-nav')));
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
        state.foundationTab = btn.getAttribute('data-ftab');
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
        const unsaved = root().querySelector('.fcc-unsaved');
        if (!unsaved && state.foundationDirty) {
          const head = root().querySelector('.fcc-section__head .fcc-actions');
          if (head) {
            const span = document.createElement('span');
            span.className = 'fcc-unsaved';
            span.textContent = 'Unsaved changes';
            head.prepend(span);
          }
        }
        const preview = root().querySelector('.fcc-editor-grid > div:last-child');
        if (preview && state.foundationTab !== 'preview') {
          preview.innerHTML = renderFoundationPreview(state.foundationForm, false);
        }
      });
    }

    document.getElementById('fcc-project-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      if (body.fundingGoal === '') delete body.fundingGoal;
      state.busy = true;
      render();
      try {
        await api('project-upsert', { method: 'POST', body });
        state.projectEdit = null;
        setFlash('Project saved');
        await loadCenter();
      } catch (err) {
        setFlash(err.message || 'Failed to save project', 'err');
        state.busy = false;
        render();
      }
    });

    document.getElementById('fcc-update-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      state.busy = true;
      render();
      try {
        await api('update-upsert', { method: 'POST', body });
        state.updateEdit = null;
        setFlash(body.status === 'published' ? 'Update published' : 'Update saved');
        await loadCenter();
      } catch (err) {
        setFlash(err.message || 'Failed to save update', 'err');
        state.busy = false;
        render();
      }
    });

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
    if (action === 'open-search') {
      state.searchOpen = true;
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
    if (action === 'open-notif') {
      state.notifOpen = true;
      render();
      return;
    }
    if (action === 'close-notif') {
      state.notifOpen = false;
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
    if (action === 'save-foundation') return saveFoundation();
    if (action === 'project-new') {
      state.projectEdit = { title: '', status: 'draft' };
      render();
      return;
    }
    if (action === 'project-cancel') {
      state.projectEdit = null;
      render();
      return;
    }
    if (action === 'project-edit') {
      const p = (state.data?.projects || []).find((x) => x.id === t.getAttribute('data-id'));
      state.projectEdit = p ? { ...p } : null;
      render();
      return;
    }
    if (action === 'project-status') {
      const id = t.getAttribute('data-id');
      const status = t.getAttribute('data-status');
      if (!confirm(`Set project status to “${status}”?`)) return;
      try {
        await api('project-status', { method: 'POST', body: { id, status } });
        setFlash(`Project ${status}`);
        await loadCenter();
      } catch (err) {
        setFlash(err.message || 'Status update failed', 'err');
        render();
      }
      return;
    }
    if (action === 'update-new') {
      state.updateEdit = { title: '', body: '', type: 'foundation', status: 'draft' };
      render();
      return;
    }
    if (action === 'update-cancel') {
      state.updateEdit = null;
      render();
      return;
    }
    if (action === 'update-edit') {
      const u = (state.data?.updates || []).find((x) => x.id === t.getAttribute('data-id'));
      state.updateEdit = u ? { ...u } : null;
      render();
      return;
    }
    if (action === 'update-publish') {
      const u = (state.data?.updates || []).find((x) => x.id === t.getAttribute('data-id'));
      if (!u || !confirm('Publish this update?')) return;
      try {
        await api('update-upsert', { method: 'POST', body: { ...u, status: 'published' } });
        setFlash('Update published');
        await loadCenter();
      } catch (err) {
        setFlash(err.message || 'Publish failed', 'err');
        render();
      }
      return;
    }
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
    if (action === 'notif-read') {
      try {
        await api('notifications-read', { method: 'POST', body: { id: t.getAttribute('data-id') } });
        await loadCenter();
        state.notifOpen = true;
        render();
      } catch (err) {
        setFlash(err.message || 'Failed', 'err');
        render();
      }
      return;
    }
    if (action === 'notif-read-all') {
      try {
        await api('notifications-read', { method: 'POST', body: { all: true } });
        await loadCenter();
        state.notifOpen = true;
        render();
      } catch (err) {
        setFlash(err.message || 'Failed', 'err');
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
      go(section || 'overview');
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
      if (state.searchOpen) {
        state.searchOpen = false;
        render();
      } else if (state.notifOpen) {
        state.notifOpen = false;
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
    root().innerHTML = `<p class="fcc-boot">Loading…</p>`;
    document.body.classList.add('fcc-body');
    try {
      const session = await api('session');
      if (session.authenticated) {
        state.authenticated = true;
        state.email = session.influencer?.email || null;
        state.influencer = session.influencer || null;
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
