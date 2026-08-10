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
    { id: 'all', label: 'All' },
    { id: 'Food & Hunger', label: 'Food & Hunger' },
    { id: 'Health', label: 'Health' },
    { id: 'Education', label: 'Education' },
    { id: 'Humanitarian Aid', label: 'Humanitarian Aid' },
    { id: 'Environment', label: 'Environment' },
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
      sort: 'featured',
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
        <h1 class="df-intro__title">Creator Foundations</h1>
        <p class="df-intro__copy">Support verified people turning influence into meaningful action.</p>
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
            >${esc(f.label)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderFoundationRow(foundation) {
    const currency = CreatorFoundationsStore.getCurrency();
    const mark = foundation.coverImage
      ? `<img src="${esc(foundation.coverImage)}" alt="">`
      : esc(identityGlyph(foundation));

    return `
      <li>
        <button type="button" class="df-row" data-open-foundation="${esc(foundation.id)}">
          <span class="df-row__mark df-row__mark--cover">${mark}</span>
          <span class="df-row__body">
            <h3 class="df-row__name">${esc(foundation.foundationName)}</h3>
            <p class="df-row__meta">
              ${esc(foundation.creatorName)}${foundation.country ? ` · ${esc(foundation.country)}` : ''}
            </p>
            ${foundation.mission
              ? `<p class="df-row__mission">${esc(foundation.mission)}</p>`
              : ''}
            <div class="df-row__stats">
              <span><strong>${esc(formatMoney(foundation.totalRaised || 0, currency))}</strong> raised</span>
              <span><strong>${esc(formatCount(foundation.activeProjectCount || 0))}</strong> active projects</span>
            </div>
          </span>
          <span class="df-row__arrow" aria-hidden="true">${arrowSvg()}</span>
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

  function renderExplore(items) {
    const totalActive = getAllFoundations().length;
    if (!totalActive && selectedCause === 'all' && !(searchOpen && searchQuery.trim())) {
      return `
        <section class="df-explore df-rise df-rise-delay-3" aria-labelledby="df-explore-label">
          <p class="df-explore__label" id="df-explore-label">Explore by cause</p>
          ${renderCauseFilters()}
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

    return `
      <section class="df-explore df-rise df-rise-delay-3" aria-labelledby="df-explore-label">
        <p class="df-explore__label" id="df-explore-label">Explore by cause</p>
        ${renderCauseFilters()}
        ${items.length
          ? `<ul class="df-list">${items.map(renderFoundationRow).join('')}</ul>`
          : renderEmptyResults()}
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
    document.getElementById('df-view-all')?.addEventListener('click', resetExplore);

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
    const root = document.getElementById('donate-content');
    const demoBanner = CreatorFoundationsStore.usingDemoCatalog()
      ? `<p class="df-demo-banner" role="status">Development demo catalog — not production data.</p>`
      : '';

    root.innerHTML = `
      ${renderTopbar()}
      ${demoBanner}
      ${renderIntro()}
      ${renderExplore(items)}
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
