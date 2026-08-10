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
  let selectedExplore = 'trending';
  let moreCausesOpen = false;
  let lastFocusEl = null;

  const CAUSE_FILTERS = [
    { id: 'all', label: 'All Causes', icon: 'all' },
    { id: 'Food & Hunger', label: 'Food & Hunger', icon: 'food' },
    { id: 'Health', label: 'Health', icon: 'health' },
    { id: 'Education', label: 'Education', icon: 'education' },
    { id: 'Humanitarian Aid', label: 'Humanitarian Aid', icon: 'aid' },
    { id: 'Environment', label: 'Environment', icon: 'env' },
  ];

  const EXPLORE_FILTERS = [
    { id: 'trending', label: 'Trending' },
    { id: 'new', label: 'New' },
    { id: 'mostActive', label: 'Most Active' },
    { id: 'near', label: 'Near You' },
    { id: 'recent', label: 'Recently Updated' },
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

  function getUserCountry() {
    try {
      if (typeof WorldChoirDB === 'undefined') return '';
      const user = WorldChoirDB.getCurrentUser?.() || WorldChoirDB.getOrCreateUser?.();
      return String(user?.country || '').trim();
    } catch {
      return '';
    }
  }

  function getFilteredFoundations() {
    const category = selectedCause === 'all' ? null : selectedCause;
    const query = searchOpen ? searchQuery : '';
    const userCountry = getUserCountry();
    const nearCountry = selectedExplore === 'near' && userCountry ? userCountry : null;
    const result = CreatorFoundationsStore.listActive({
      page: 1,
      pageSize: 500,
      sort: selectedExplore === 'near' ? 'near' : selectedExplore,
      category,
      query,
      country: nearCountry,
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
    return `
      <div class="df-topbar df-rise">
        <p class="df-kicker">Donate</p>
        ${searchOpen ? '' : `
          <button type="button" class="df-search-trigger" id="df-search-open" aria-label="Search foundations">
            ${searchIconSvg()}
          </button>
        `}
      </div>
      ${searchOpen ? `
        <div class="df-search-inline df-rise" role="search">
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
      ` : ''}
    `;
  }

  function renderIntro() {
    return `
      <header class="df-intro df-rise df-rise-delay-1">
        <h1 class="df-intro__title">Discover Impact</h1>
        <p class="df-intro__lead">People you trust.<br>Causes you can change.</p>
        <p class="df-intro__copy">Support verified creators turning their influence into real, meaningful and measurable action.</p>
      </header>
    `;
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
          <button
            type="button"
            class="df-cause df-cause--more ${moreCausesOpen ? 'is-active' : ''}"
            id="df-causes-more"
            aria-expanded="${moreCausesOpen ? 'true' : 'false'}"
          >
            <span>More</span>
          </button>
        </div>
        ${moreCausesOpen ? `
          <p class="df-causes__note">These are the primary World Choir causes. More focused filters may arrive as Foundations join.</p>
        ` : ''}
      </div>
    `;
  }

  function renderExploreSorts() {
    return `
      <div class="df-sort" aria-labelledby="df-sort-label">
        <p class="df-sort__label" id="df-sort-label">Explore</p>
        <div class="df-sort__scroller" role="toolbar" aria-label="Explore sorting">
          ${EXPLORE_FILTERS.map((f) => `
            <button
              type="button"
              class="df-sort__btn ${selectedExplore === f.id ? 'is-active' : ''}"
              data-explore="${esc(f.id)}"
              aria-pressed="${selectedExplore === f.id ? 'true' : 'false'}"
            >${esc(f.label)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderFeatured(foundation) {
    if (!foundation) return '';
    const img = visualUrl(foundation);
    const mission = shortMission(foundation, 120);
    const activity = foundation.activeProjectCount > 0
      ? `<p class="df-spotlight__stat">
          <span class="df-spotlight__stat-icon">${causeIconSvg('projects')}</span>
          ${esc(formatCount(foundation.activeProjectCount))} active project${foundation.activeProjectCount === 1 ? '' : 's'}
        </p>`
      : `<p class="df-spotlight__note">${isNewFoundation(foundation) ? 'New to World Choir' : 'Be among the first to support this foundation.'}</p>`;

    return `
      <section class="df-spotlight df-rise df-rise-delay-2" aria-labelledby="df-spotlight-label">
        <p class="df-section-label" id="df-spotlight-label">Featured this week</p>
        <button type="button" class="df-spotlight__card" data-open-foundation="${esc(foundation.id)}">
          <div class="df-spotlight__copy">
            ${foundation.profileImage
              ? `<img class="df-spotlight__avatar" src="${esc(foundation.profileImage)}" alt="">`
              : `<span class="df-spotlight__avatar df-spotlight__avatar--glyph">${esc(identityGlyph(foundation))}</span>`}
            <h2 class="df-spotlight__name">${esc(foundation.foundationName)}</h2>
            ${mission ? `<p class="df-spotlight__mission">${esc(mission)}</p>` : ''}
            <p class="df-spotlight__meta">
              ${esc(foundation.creatorName)}${foundation.country ? ` · ${esc(foundation.country)}` : ''}
            </p>
            ${activity}
            <span class="df-spotlight__cta">Explore Foundation <span aria-hidden="true">→</span></span>
          </div>
          <div class="df-spotlight__media ${img ? 'has-image' : ''}" aria-hidden="true">
            ${img
              ? `<img src="${esc(img)}" alt="">`
              : `<span class="df-spotlight__fallback">${esc(identityGlyph(foundation))}</span>`}
          </div>
        </button>
      </section>
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
    const nearNoCountry = selectedExplore === 'near' && !getUserCountry();
    const copy = nearNoCountry
      ? 'Share your place when you Join to discover Foundations near you.'
      : searching
        ? 'No Creator Foundations match this search in the selected cause.'
        : selectedCause === 'all'
          ? 'Verified Creator Foundations will appear here as the circle grows.'
          : 'There are currently no Creator Foundations in this cause.';

    return `
      <div class="df-empty">
        <p class="df-empty__title">No foundations found</p>
        <p class="df-empty__copy">${esc(copy)}</p>
        ${selectedCause !== 'all' || searching || selectedExplore === 'near' ? `
          <button type="button" class="df-empty__action" id="df-view-all">View all foundations</button>
        ` : ''}
      </div>
    `;
  }

  function renderFoundationsSection(items) {
    return `
      <section class="df-foundations df-rise df-rise-delay-3" aria-labelledby="df-foundations-label">
        <p class="df-section-label" id="df-foundations-label">Foundations</p>
        ${items.length
          ? `<ul class="df-fcards">${items.map(renderFoundationCard).join('')}</ul>`
          : renderEmptyResults()}
      </section>
    `;
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
        ${renderExploreSorts()}
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
    selectedExplore = 'trending';
    moreCausesOpen = false;
    searchOpen = false;
    searchQuery = '';
    renderHome();
  }

  function bindHomeEvents(opts = {}) {
    document.getElementById('df-search-open')?.addEventListener('click', openSearch);
    document.getElementById('df-search-close')?.addEventListener('click', closeSearch);
    document.getElementById('df-view-all')?.addEventListener('click', resetExplore);
    document.getElementById('df-causes-more')?.addEventListener('click', () => {
      moreCausesOpen = !moreCausesOpen;
      renderHome({ keepSearchFocus: searchOpen });
    });
    document.getElementById('df-see-projects')?.addEventListener('click', () => {
      const el = document.getElementById('df-now-label');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const searchInput = document.getElementById('df-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value || '';
        renderHome({ keepSearchFocus: true, caret: e.target.selectionStart });
      });
      if (opts.focusSearch || opts.keepSearchFocus) {
        const caret = opts.caret != null ? opts.caret : searchInput.value.length;
        requestAnimationFrame(() => {
          searchInput.focus();
          try {
            searchInput.setSelectionRange(caret, caret);
          } catch {
            /* ignore */
          }
        });
      }
    }

    document.querySelectorAll('[data-cause]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCause = btn.getAttribute('data-cause') || 'all';
        moreCausesOpen = false;
        renderHome({ keepSearchFocus: searchOpen });
      });
    });

    document.querySelectorAll('[data-explore]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedExplore = btn.getAttribute('data-explore') || 'trending';
        renderHome({ keepSearchFocus: searchOpen });
      });
    });

    document.querySelectorAll('[data-open-foundation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const foundation = CreatorFoundationsStore.getById(btn.getAttribute('data-open-foundation'));
        if (foundation) openProfile(foundation);
      });
    });
  }

  function renderHome(opts = {}) {
    const items = getFilteredFoundations();
    const all = getAllFoundations();
    const featured = CreatorFoundationsStore.getFeaturedFoundation(
      selectedCause === 'all' && !(searchOpen && searchQuery.trim())
        ? all
        : items
    );
    const listItems = featured
      ? items.filter((f) => f.id !== featured.id)
      : items;
    // Keep featured in list when filtering — still show it in Foundations if it's the only match
    const foundationsForList = (items.length === 1 && featured && items[0].id === featured.id)
      ? items
      : (featured && selectedCause === 'all' && !(searchOpen && searchQuery.trim())
        ? listItems
        : items);

    const root = document.getElementById('donate-content');
    const demoBanner = CreatorFoundationsStore.usingDemoCatalog()
      ? `<p class="df-demo-banner" role="status">Development demo catalog — not production data.</p>`
      : '';

    const showFeatured = featured
      && selectedCause === 'all'
      && selectedExplore === 'trending'
      && !(searchOpen && searchQuery.trim());

    root.innerHTML = `
      ${renderTopbar()}
      ${demoBanner}
      ${renderIntro()}
      ${renderDiscoveryChrome()}
      ${showFeatured ? renderFeatured(featured) : ''}
      ${!all.length && selectedCause === 'all' && !(searchOpen && searchQuery.trim())
        ? `
          <section class="df-foundations df-rise df-rise-delay-3">
            <div class="df-empty">
              <p class="df-empty__title">A carefully curated beginning</p>
              <p class="df-empty__copy">
                Verified Creator Foundations will appear here as the circle grows.
                We only show real people and real missions.
              </p>
            </div>
          </section>
        `
        : renderFoundationsSection(foundationsForList)}
      ${renderHappeningNow()}
    `;
    bindHomeEvents(opts);
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

    return `
      <article class="df-project">
        <h3 class="df-project__title">${esc(project.title)}</h3>
        ${project.location ? `<p class="df-project__location">${esc(project.location)}</p>` : ''}
        ${project.description
          ? `<p class="df-project__desc">${esc(project.description)}</p>`
          : `<p class="df-project__desc df-muted">Project details will appear as they are published.</p>`}
        ${showProgress ? `
          <div class="df-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="df-progress__bar" style="width:${pct}%"></div>
          </div>
          <div class="df-project__meta">
            <span>${formatMoney(project.raisedAmount, currency)} raised</span>
            <span>Goal ${formatMoney(project.goalAmount, currency)}</span>
          </div>
        ` : `
          <div class="df-project__meta">
            ${project.goalAmount != null
              ? `<span>Goal ${formatMoney(project.goalAmount, currency)}</span>`
              : '<span>Funding progress appears when verified donations are recorded.</span>'}
          </div>
        `}
        ${project.impactSummary ? `<p class="df-project__desc">${esc(project.impactSummary)}</p>` : ''}
        <button
          class="df-featured__cta"
          type="button"
          data-action="donate-project"
          data-foundation="${esc(foundation.id)}"
          data-project="${esc(project.id)}"
          ${!foundation.donationsEnabled ? 'disabled' : ''}
        >
          Donate to project
        </button>
      </article>
    `;
  }

  function renderImpactMetrics(metrics) {
    if (!metrics.length) {
      return `<p class="df-muted">Impact measures appear here only when verified.</p>`;
    }
    return `
      <div class="df-impact-grid">
        ${metrics.map((m) => `
          <div>
            <span class="df-impact-item__value">${esc(String(m.value))}</span>
            <span class="df-impact-item__label">${esc(m.label)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderProfileHero(foundation) {
    const cover = foundation.coverImage
      ? `<img class="df-profile-hero__cover-img" src="${esc(foundation.coverImage)}" alt="">`
      : '';
    const avatar = foundation.profileImage
      ? `<img src="${esc(foundation.profileImage)}" alt="">`
      : `<span>${esc(identityGlyph(foundation))}</span>`;

    return `
      <div class="df-profile-hero">
        <div class="df-profile-hero__cover ${foundation.coverImage ? 'has-image' : ''}">
          ${cover}
        </div>
        <div class="df-profile-hero__avatar" aria-hidden="true">
          ${avatar}
        </div>
      </div>
    `;
  }

  function renderProfile(foundation) {
    const platform = CreatorFoundationsStore.getPlatform();
    const allocation = (foundation.financialAllocation || [])
      .map((row) => `
        <div class="df-alloc-row">
          <span>${esc(row.label)}</span>
          <strong>${esc(String(row.percent))}%</strong>
        </div>
      `)
      .join('');

    const values = (foundation.coreValues || [])
      .map((v) => `<span class="df-chip">${esc(v)}</span>`)
      .join('');

    const activeProjects = foundation.projects.filter((p) => p.status === 'active');
    const invite = (foundation.uniqueSupporters || 0) === 0
      ? `<p class="df-featured__invite">Be among the first to support this mission.</p>`
      : '';

    return `
      <div class="df-profile df-rise">
        <button class="df-back" type="button" id="donate-back">← Back</button>

        ${renderProfileHero(foundation)}

        <div class="df-profile__identity">
          <h1 class="df-profile__title">
            ${esc(foundation.foundationName)}
            ${verifiedMark(foundation.verificationStatus)}
          </h1>
          <p class="df-profile__byline">Founded by ${esc(foundation.creatorName)}</p>
          ${foundation.country ? `<p class="df-profile__place">${esc(foundation.country)}</p>` : ''}
        </div>

        ${foundation.mission
          ? `<p class="df-profile__mission">${esc(foundation.mission)}</p>`
          : `<p class="df-profile__mission df-muted">Mission details will appear as they are published.</p>`}

        ${metricsRow(foundation)}
        ${invite}

        <div class="df-profile__actions">
          <button
            class="df-btn-primary"
            type="button"
            id="cf-profile-donate"
            ${!foundation.donationsEnabled ? 'disabled' : ''}
          >
            ${foundation.donationsEnabled ? 'Donate' : 'Temporarily unavailable'}
          </button>
        </div>

        <section class="df-section">
          <h2>About</h2>
          ${foundation.biography
            ? `<p>${esc(foundation.biography)}</p>`
            : `<p class="df-muted">This information has not yet been published.</p>`}
          ${foundation.whyStarted ? `
            <h3>Why this began</h3>
            <p>${esc(foundation.whyStarted)}</p>
          ` : ''}
          ${foundation.howItWorks ? `
            <h3>How the foundation works</h3>
            <p>${esc(foundation.howItWorks)}</p>
          ` : ''}
          ${values ? `<div class="df-chips">${values}</div>` : ''}
        </section>

        <section class="df-section">
          <h2>Impact</h2>
          ${renderImpactMetrics(foundation.impactMetrics)}
        </section>

        <section class="df-section">
          <h2>Active Projects</h2>
          ${activeProjects.length
            ? `<div class="df-projects">${activeProjects.map((p) => renderProjectCard(p, foundation)).join('')}</div>`
            : `<p class="df-muted">0 active projects.</p>`}
        </section>

        <section class="df-section">
          <h2>Transparency</h2>
          <h3>How donations are used</h3>
          ${foundation.howDonationsAreUsed
            ? `<p>${esc(foundation.howDonationsAreUsed)}</p>`
            : `<p class="df-muted">This information has not yet been published.</p>`}

          <h3>Financial allocation</h3>
          ${allocation
            ? `
              <div class="df-alloc">${allocation}</div>
              <p class="df-fee-note">
                Platform fee: ${esc(String(platform.feePercent || 10))}% —
                ${esc(platform.feePurpose || 'Operational costs that keep World Choir and Creator Foundations running.')}
              </p>
            `
            : `<p class="df-muted">This information has not yet been published.</p>`}

          <h3>Legal organization</h3>
          ${foundation.legalOrganization
            ? `<p>
                ${esc(foundation.legalOrganization.name)}
                ${foundation.legalOrganization.type ? ` · ${esc(foundation.legalOrganization.type)}` : ''}
                ${foundation.legalOrganization.registrationId
                  ? `<br><span class="df-muted">${esc(foundation.legalOrganization.registrationId)}</span>`
                  : ''}
              </p>`
            : `<p class="df-muted">This information has not yet been published.</p>`}
        </section>
      </div>
    `;
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

    document.getElementById('cf-profile-donate')?.addEventListener('click', () => {
      if (foundation.donationsEnabled) openDonateModal(foundation, null);
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

    ensureModal();
    selectedFoundation = foundation;
    selectedProject = project || null;
    selectedAmount = 25;
    customAmount = '';
    selectedPayment = 'card';
    isSubmitting = false;

    const overlay = document.getElementById('donate-modal-overlay');
    const body = document.getElementById('donate-modal-body');
    body.innerHTML = renderModalBody(foundation, selectedProject);
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    bindModalEvents();
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

  function renderLoading() {
    document.getElementById('donate-content').innerHTML = `
      <div class="df-state">
        <p class="df-state__loading">Loading Creator Foundations…</p>
      </div>
    `;
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

  async function init() {
    WorldChoirNav.startWatcher('donate');
    ensureModal();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchOpen) closeSearch();
    });
    renderLoading();

    try {
      await CreatorFoundationsStore.ready();
      renderHome();
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
