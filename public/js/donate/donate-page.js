/**
 * WorldChoirDonate — Creator Foundations experience (Donate tab)
 * Views: list → foundation profile → donate modal → confirmation
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
  let page = 1;
  let isSubmitting = false;

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

  function progressPercent(raised, goal) {
    if (!goal || goal <= 0) return 0;
    return Math.min(100, Math.round((raised / goal) * 100));
  }

  function initials(name) {
    return (name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  function portraitHtml(foundation, sizeClass = '') {
    const label = initials(foundation.creatorName);
    if (foundation.profileImage) {
      return `
        <div class="cf-portrait ${sizeClass}">
          <img
            class="cf-portrait__img"
            src="${esc(foundation.profileImage)}"
            alt=""
            loading="lazy"
            decoding="async"
            onerror="this.style.display='none';this.nextElementSibling.hidden=false;"
          >
          <span class="cf-portrait__fallback" hidden aria-hidden="true">${esc(label)}</span>
        </div>
      `;
    }
    return `
      <div class="cf-portrait ${sizeClass}">
        <span class="cf-portrait__fallback" aria-hidden="true">${esc(label)}</span>
      </div>
    `;
  }

  function verifiedBadge(status) {
    if (status !== 'verified') return '';
    return `<span class="cf-verified" title="Verified Creator Foundation"><span aria-hidden="true">✓</span> Verified</span>`;
  }

  function renderHero() {
    return `
      <header class="donate-hero fade-in">
        <p class="cf-kicker">Creator Foundations</p>
        <h1 class="donate-hero__title">Support people creating real change.</h1>
        <p class="donate-hero__copy">
          Every Creator Foundation represents someone who has consistently dedicated their time,
          creativity and community to improving the lives of others. Support verified missions
          and follow the impact your generosity creates.
        </p>
        <div class="donate-hero__art" aria-hidden="true">
          <span class="donate-hero__orb donate-hero__orb--a"></span>
          <span class="donate-hero__orb donate-hero__orb--b"></span>
          <span class="donate-hero__orb donate-hero__orb--c"></span>
          <span class="donate-hero__ring"></span>
        </div>
      </header>
    `;
  }

  function renderCard(foundation) {
    return `
      <article class="cf-card" data-id="${esc(foundation.id)}">
        <div class="cf-card__top">
          ${portraitHtml(foundation)}
          <div class="cf-card__meta">
            <div class="cf-card__title-row">
              <h3 class="cf-card__creator">${esc(foundation.creatorName)}</h3>
              ${verifiedBadge(foundation.verificationStatus)}
            </div>
            <p class="cf-card__foundation">${esc(foundation.foundationName)}</p>
            <p class="cf-card__country">${esc(foundation.country)}</p>
          </div>
        </div>
        <p class="cf-card__mission">${esc(foundation.mission)}</p>
        <div class="cf-card__chips">
          ${foundation.primaryCategory ? `<span class="donate-chip">${esc(foundation.primaryCategory)}</span>` : ''}
        </div>
        <div class="cf-card__stats">
          <div>
            <span class="cf-card__stat-value">${formatCount(foundation.donorCount)}</span>
            <span class="cf-card__stat-label">People donated</span>
          </div>
          <div>
            <span class="cf-card__stat-value">${formatCount(foundation.activeProjectCount)}</span>
            <span class="cf-card__stat-label">Active projects</span>
          </div>
        </div>
        <button class="btn btn-secondary cf-card__cta" type="button" data-action="view" data-id="${esc(foundation.id)}">
          View Foundation
        </button>
      </article>
    `;
  }

  function renderList() {
    const result = CreatorFoundationsStore.listActive({ page, pageSize: CreatorFoundationsStore.PAGE_SIZE });
    const root = document.getElementById('donate-content');

    if (!result.total) {
      root.innerHTML = `
        ${renderHero()}
        <div class="donate-state glass-card">
          <p class="donate-state__title">No Creator Foundations yet</p>
          <p class="donate-state__copy">Verified creators will appear here as the ecosystem grows.</p>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      ${renderHero()}
      <section class="donate-section" aria-labelledby="cf-featured-title">
        <h2 class="donate-section__title" id="cf-featured-title">Featured Creator Foundations</h2>
        <p class="donate-section__subtitle">A carefully curated circle of verified people creating lasting impact.</p>
        <div class="donate-grid" id="donate-grid">
          ${result.items.map(renderCard).join('')}
        </div>
        ${result.hasMore ? `
          <div class="donate-load-more">
            <button class="btn btn-secondary" type="button" id="donate-load-more">Show more</button>
          </div>
        ` : ''}
      </section>
    `;

    bindListEvents();
  }

  function bindListEvents() {
    document.getElementById('donate-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="view"]');
      if (!btn) return;
      const foundation = CreatorFoundationsStore.getById(btn.getAttribute('data-id'));
      if (foundation) openProfile(foundation);
    });

    document.getElementById('donate-load-more')?.addEventListener('click', () => {
      page += 1;
      const more = CreatorFoundationsStore.listActive({ page, pageSize: CreatorFoundationsStore.PAGE_SIZE });
      const grid = document.getElementById('donate-grid');
      if (!grid) return;
      grid.insertAdjacentHTML('beforeend', more.items.map(renderCard).join(''));
      if (!more.hasMore) {
        document.getElementById('donate-load-more')?.closest('.donate-load-more')?.remove();
      }
    });
  }

  function renderProjectCard(project, foundation) {
    const pct = progressPercent(project.raisedAmount, project.goalAmount);
    const currency = project.currency || CreatorFoundationsStore.getCurrency();
    return `
      <article class="cf-project">
        <div class="cf-project__head">
          <h3 class="cf-project__title">${esc(project.title)}</h3>
          <p class="cf-project__location">${esc(project.location)}</p>
        </div>
        <p class="cf-project__desc">${esc(project.description)}</p>
        <div class="cf-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Project funding progress">
          <div class="cf-progress__bar" style="width:${pct}%"></div>
        </div>
        <div class="cf-project__meta">
          <span>${formatMoney(project.raisedAmount, currency)} raised</span>
          <span>Goal ${formatMoney(project.goalAmount, currency)}</span>
        </div>
        ${project.impactSummary ? `<p class="cf-project__impact">${esc(project.impactSummary)}</p>` : ''}
        <button
          class="btn btn-primary"
          type="button"
          data-action="donate-project"
          data-foundation="${esc(foundation.id)}"
          data-project="${esc(project.id)}"
          ${!foundation.donationsEnabled ? 'disabled' : ''}
        >
          Donate directly
        </button>
      </article>
    `;
  }

  function renderProfile(foundation) {
    const platform = CreatorFoundationsStore.getPlatform();
    const allocation = (foundation.financialAllocation || [])
      .map((row) => `
        <div class="cf-alloc-row">
          <span>${esc(row.label)}</span>
          <strong>${esc(String(row.percent))}%</strong>
        </div>
      `)
      .join('');

    const values = (foundation.coreValues || [])
      .map((v) => `<span class="donate-chip">${esc(v)}</span>`)
      .join('');

    const activeProjects = foundation.projects.filter((p) => p.status === 'active');

    return `
      <div class="cf-profile fade-in">
        <button class="donate-back" type="button" id="donate-back">← Back</button>

        <header class="cf-profile__hero">
          ${portraitHtml(foundation, 'cf-portrait--xl')}
          <div class="cf-profile__hero-text">
            <div class="cf-card__title-row">
              <h1 class="cf-profile__foundation">${esc(foundation.foundationName)}</h1>
              ${verifiedBadge(foundation.verificationStatus)}
            </div>
            <p class="cf-profile__creator">by ${esc(foundation.creatorName)}</p>
            <p class="cf-profile__mission">${esc(foundation.mission)}</p>
            <div class="cf-profile__facts">
              <span>${esc(foundation.country)}</span>
              ${foundation.yearsActive != null ? `<span>${foundation.yearsActive} years active</span>` : ''}
              ${foundation.primaryCategory ? `<span>${esc(foundation.primaryCategory)}</span>` : ''}
            </div>
            <button
              class="btn btn-primary cf-profile__donate"
              type="button"
              id="cf-profile-donate"
              ${!foundation.donationsEnabled ? 'disabled' : ''}
            >
              ${foundation.donationsEnabled ? 'Donate' : 'Temporarily unavailable'}
            </button>
          </div>
        </header>

        <section class="cf-section">
          <h2>About</h2>
          <p>${esc(foundation.biography)}</p>
          ${foundation.whyStarted ? `
            <h3>Why this began</h3>
            <p>${esc(foundation.whyStarted)}</p>
          ` : ''}
          ${foundation.howItWorks ? `
            <h3>How the foundation works</h3>
            <p>${esc(foundation.howItWorks)}</p>
          ` : ''}
          ${values ? `<div class="cf-card__chips" style="margin-top:16px">${values}</div>` : ''}
        </section>

        <section class="cf-section" aria-labelledby="cf-projects-title">
          <h2 id="cf-projects-title">Active Projects</h2>
          ${activeProjects.length
            ? `<div class="cf-projects">${activeProjects.map((p) => renderProjectCard(p, foundation)).join('')}</div>`
            : `<p class="cf-muted">No active projects at the moment.</p>`}
        </section>

        <section class="cf-section" aria-labelledby="cf-transparency-title">
          <h2 id="cf-transparency-title">Transparency</h2>
          ${foundation.howDonationsAreUsed ? `
            <h3>How donations are used</h3>
            <p>${esc(foundation.howDonationsAreUsed)}</p>
          ` : ''}

          ${allocation ? `
            <h3>Financial allocation</h3>
            <div class="cf-alloc">${allocation}</div>
            <p class="cf-fee-note">
              Platform fee: ${esc(String(platform.feePercent || 5))}% —
              ${esc(platform.feePurpose || 'Operational costs that keep World Choir and Creator Foundations running.')}
            </p>
          ` : ''}

          <h3>Verification</h3>
          <p>
            Status:
            <strong>${foundation.verificationStatus === 'verified' ? 'Verified' : esc(foundation.verificationStatus)}</strong>
          </p>
          ${foundation.verificationNotes ? `<p class="cf-muted">${esc(foundation.verificationNotes)}</p>` : ''}

          ${foundation.legalOrganization ? `
            <h3>Legal organization</h3>
            <p>
              ${esc(foundation.legalOrganization.name)}
              ${foundation.legalOrganization.type ? ` · ${esc(foundation.legalOrganization.type)}` : ''}
              ${foundation.legalOrganization.registrationId ? `<br><span class="cf-muted">${esc(foundation.legalOrganization.registrationId)}</span>` : ''}
            </p>
          ` : ''}
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
      page = 1;
      renderList();
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
        A ${CreatorFoundationsStore.getPlatform().feePercent || 5}% platform fee helps keep World Choir and Creator Foundations working.
        Payment providers will be connected soon — confirmation is simulated for now.
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
      <div class="donate-confirm fade-in">
        <div class="donate-confirm__icon" aria-hidden="true">
          <span class="donate-confirm__check"></span>
        </div>
        <h1 class="donate-confirm__title">Thank you for supporting ${esc(firstName)}'s mission.</h1>
        <p class="donate-confirm__copy">
          Your generosity helps transform compassion into action.
          You'll be able to follow the progress of the projects you helped make possible.
        </p>
        <p class="donate-confirm__meta">${formatMoney(amount)} · ${esc(foundation.foundationName)}</p>
        <button class="btn btn-primary" type="button" id="donate-confirm-return">
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
      <div class="donate-state">
        <p class="donate-state__loading">Loading Creator Foundations…</p>
      </div>
    `;
  }

  function renderError(message) {
    document.getElementById('donate-content').innerHTML = `
      <div class="donate-state glass-card">
        <p class="donate-state__title">Something went quiet</p>
        <p class="donate-state__copy">${esc(message || 'Could not load Creator Foundations. Please try again.')}</p>
        <button class="btn btn-secondary" type="button" id="donate-retry">Try again</button>
      </div>
    `;
    document.getElementById('donate-retry')?.addEventListener('click', init);
  }

  async function init() {
    WorldChoirNav.startWatcher('donate');
    ensureModal();
    renderLoading();

    try {
      await CreatorFoundationsStore.ready();
      page = 1;
      renderList();
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
