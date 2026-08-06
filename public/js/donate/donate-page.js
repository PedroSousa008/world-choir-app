/**
 * WorldChoirDonate — Donate tab experience
 * Views: list → detail → donate modal → confirmation
 * Payments are mocked / architecture-ready (Apple Pay, Google Pay, Card, PayPal).
 */
const WorldChoirDonate = (() => {
  const AMOUNTS = () => FoundationsStore.getSuggestedAmounts();
  const PAYMENT_METHODS = [
    { id: 'apple_pay', label: 'Apple Pay', ready: true },
    { id: 'google_pay', label: 'Google Pay', ready: true },
    { id: 'card', label: 'Credit Card', ready: true },
    { id: 'paypal', label: 'PayPal', ready: true },
  ];

  let view = 'list';
  let selectedFoundation = null;
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

  function formatEuro(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '€—';
    return `€${n % 1 === 0 ? n : n.toFixed(2)}`;
  }

  function logoHtml(foundation, sizeClass = '') {
    const initials = (foundation.name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

    if (foundation.logo) {
      return `
        <div class="donate-logo ${sizeClass}">
          <img
            class="donate-logo__img"
            src="${esc(foundation.logo)}"
            alt=""
            loading="lazy"
            decoding="async"
            onerror="this.style.display='none';this.nextElementSibling.hidden=false;"
          >
          <span class="donate-logo__fallback" hidden aria-hidden="true">${esc(initials)}</span>
        </div>
      `;
    }

    return `
      <div class="donate-logo ${sizeClass}">
        <span class="donate-logo__fallback" aria-hidden="true">${esc(initials)}</span>
      </div>
    `;
  }

  function categoryChips(categories) {
    return (categories || [])
      .slice(0, 3)
      .map((c) => `<span class="donate-chip">${esc(c)}</span>`)
      .join('');
  }

  function verificationBadge(status) {
    if (status !== 'verified') return '';
    return `<span class="donate-verified" title="Verified organization"><span aria-hidden="true">✓</span> Verified</span>`;
  }

  function renderHero() {
    return `
      <header class="donate-hero fade-in">
        <h1 class="donate-hero__title">Turn harmony into action</h1>
        <p class="donate-hero__copy">
          Music can unite us for a moment.<br>
          Kindness can change lives for much longer.
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
    const unavailable = !foundation.donationsEnabled;
    return `
      <article class="donate-card" data-id="${esc(foundation.id)}">
        <div class="donate-card__top">
          ${logoHtml(foundation)}
          <div class="donate-card__meta">
            <div class="donate-card__title-row">
              <h3 class="donate-card__name">${esc(foundation.name)}</h3>
              ${verificationBadge(foundation.verificationStatus)}
            </div>
            <p class="donate-card__country">${esc(foundation.country)}</p>
          </div>
        </div>
        <p class="donate-card__desc">${esc(foundation.description)}</p>
        <div class="donate-card__chips">${categoryChips(foundation.categories)}</div>
        <div class="donate-card__actions">
          <button class="btn btn-secondary donate-card__learn" type="button" data-action="learn" data-id="${esc(foundation.id)}">
            Learn More
          </button>
          <button
            class="btn btn-primary donate-card__donate"
            type="button"
            data-action="donate"
            data-id="${esc(foundation.id)}"
            ${unavailable ? 'disabled' : ''}
          >
            ${unavailable ? 'Unavailable' : 'Donate'}
          </button>
        </div>
      </article>
    `;
  }

  function renderList() {
    const result = FoundationsStore.listActive({ page, pageSize: FoundationsStore.PAGE_SIZE });
    const root = document.getElementById('donate-content');

    if (!result.total) {
      root.innerHTML = `
        ${renderHero()}
        <div class="donate-state glass-card">
          <p class="donate-state__title">No foundations available</p>
          <p class="donate-state__copy">Charitable partners will appear here soon.</p>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      ${renderHero()}
      <section class="donate-section" aria-labelledby="donate-featured-title">
        <h2 class="donate-section__title" id="donate-featured-title">Featured Foundations</h2>
        <p class="donate-section__subtitle">Carefully selected organizations creating real-world impact.</p>
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
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const foundation = FoundationsStore.getById(id);
      if (!foundation) return;

      if (btn.getAttribute('data-action') === 'learn') {
        openDetail(foundation);
      } else if (btn.getAttribute('data-action') === 'donate') {
        openDonateModal(foundation);
      }
    });

    document.getElementById('donate-load-more')?.addEventListener('click', () => {
      page += 1;
      const more = FoundationsStore.listActive({ page, pageSize: FoundationsStore.PAGE_SIZE });
      const grid = document.getElementById('donate-grid');
      if (!grid) return;
      grid.insertAdjacentHTML('beforeend', more.items.map(renderCard).join(''));
      if (!more.hasMore) {
        document.getElementById('donate-load-more')?.closest('.donate-load-more')?.remove();
      }
    });
  }

  function renderDetail(foundation) {
    const metrics = (foundation.impactMetrics || [])
      .map((m) => `
        <div class="donate-metric">
          <span class="donate-metric__value">${esc(m.value)}</span>
          <span class="donate-metric__label">${esc(m.label)}</span>
        </div>
      `)
      .join('');

    const updates = (foundation.recentUpdates || [])
      .map((u) => `<li>${esc(u)}</li>`)
      .join('');

    return `
      <div class="donate-detail fade-in">
        <button class="donate-back" type="button" id="donate-back">← Back</button>

        <div class="donate-detail__header">
          ${logoHtml(foundation, 'donate-logo--lg')}
          <div>
            <div class="donate-card__title-row">
              <h1 class="donate-detail__name">${esc(foundation.name)}</h1>
              ${verificationBadge(foundation.verificationStatus)}
            </div>
            <p class="donate-detail__country">${esc(foundation.country)}</p>
            <div class="donate-card__chips">${categoryChips(foundation.categories)}</div>
          </div>
        </div>

        <section class="donate-detail__block">
          <h2>Mission</h2>
          <p>${esc(foundation.longDescription)}</p>
        </section>

        ${metrics ? `
          <section class="donate-detail__block">
            <h2>Impact</h2>
            <div class="donate-metrics">${metrics}</div>
          </section>
        ` : ''}

        ${foundation.howDonationsAreUsed ? `
          <section class="donate-detail__block">
            <h2>How donations are used</h2>
            <p>${esc(foundation.howDonationsAreUsed)}</p>
          </section>
        ` : ''}

        ${foundation.transparency ? `
          <section class="donate-detail__block">
            <h2>Transparency</h2>
            <p>${esc(foundation.transparency)}</p>
          </section>
        ` : ''}

        ${updates ? `
          <section class="donate-detail__block">
            <h2>Recent updates</h2>
            <ul class="donate-updates">${updates}</ul>
          </section>
        ` : ''}

        <div class="donate-detail__actions">
          ${foundation.website ? `
            <a class="btn btn-secondary" href="${esc(foundation.website)}" target="_blank" rel="noopener noreferrer">
              Official website
            </a>
          ` : ''}
          <button
            class="btn btn-primary"
            type="button"
            id="donate-detail-cta"
            ${!foundation.donationsEnabled ? 'disabled' : ''}
          >
            ${foundation.donationsEnabled ? 'Donate' : 'Temporarily unavailable'}
          </button>
        </div>
      </div>
    `;
  }

  function openDetail(foundation) {
    view = 'detail';
    selectedFoundation = foundation;
    const root = document.getElementById('donate-content');
    root.innerHTML = renderDetail(foundation);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById('donate-back')?.addEventListener('click', () => {
      view = 'list';
      selectedFoundation = null;
      page = 1;
      renderList();
    });

    document.getElementById('donate-detail-cta')?.addEventListener('click', () => {
      if (foundation.donationsEnabled) openDonateModal(foundation);
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

  function renderModalBody(foundation) {
    const amounts = AMOUNTS();
    return `
      <h2 class="modal-title" id="donate-modal-title">Donate to ${esc(foundation.name)}</h2>
      <p class="modal-copy">Choose an amount. Your gift extends the spirit of World Choir into the world.</p>

      <p class="donate-modal__label">One-time donation</p>
      <div class="donate-amounts" role="group" aria-label="Donation amount">
        ${amounts.map((a) => `
          <button
            type="button"
            class="donate-amount${selectedAmount === a ? ' is-selected' : ''}"
            data-amount="${a}"
          >${formatEuro(a)}</button>
        `).join('')}
        <button
          type="button"
          class="donate-amount${selectedAmount === 'custom' ? ' is-selected' : ''}"
          data-amount="custom"
        >Custom</button>
      </div>

      <div class="donate-custom" id="donate-custom" ${selectedAmount === 'custom' ? '' : 'hidden'}>
        <label class="form-label" for="donate-custom-input">Custom amount (EUR)</label>
        <input
          class="form-input"
          id="donate-custom-input"
          type="number"
          min="1"
          step="0.01"
          inputmode="decimal"
          placeholder="Enter amount"
          value="${esc(customAmount)}"
        >
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

      <p class="donate-modal__note">Secure payment integration is being prepared. For now, confirmation is simulated.</p>

      <div class="actions-row donate-modal__actions">
        <button class="btn btn-primary" type="button" id="donate-confirm-btn">Continue</button>
        <button class="btn btn-secondary" type="button" id="donate-cancel-btn">Cancel</button>
      </div>
    `;
  }

  function openDonateModal(foundation) {
    if (!foundation.donationsEnabled) {
      alert('Donations for this foundation are temporarily unavailable.');
      return;
    }

    ensureModal();
    selectedFoundation = foundation;
    selectedAmount = 25;
    customAmount = '';
    selectedPayment = 'card';
    isSubmitting = false;

    const overlay = document.getElementById('donate-modal-overlay');
    const body = document.getElementById('donate-modal-body');
    body.innerHTML = renderModalBody(foundation);
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
        const body = document.getElementById('donate-modal-body');
        body.innerHTML = renderModalBody(selectedFoundation);
        bindModalEvents();
        if (selectedAmount === 'custom') {
          document.getElementById('donate-custom-input')?.focus();
        }
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
      // Architecture-ready payment hook — mocked until provider is connected.
      await mockProcessPayment({
        foundationId: selectedFoundation.id,
        amount,
        currency: FoundationsStore.getCurrency(),
        method: selectedPayment,
        // recurring: false — future support without UI exposure
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
    const root = document.getElementById('donate-content');
    root.innerHTML = `
      <div class="donate-confirm fade-in">
        <div class="donate-confirm__icon" aria-hidden="true">
          <span class="donate-confirm__check"></span>
        </div>
        <h1 class="donate-confirm__title">Thank you.</h1>
        <p class="donate-confirm__copy">
          Every act of generosity carries the spirit of World Choir beyond the music.
        </p>
        <p class="donate-confirm__meta">
          ${formatEuro(amount)} · ${esc(foundation.name)}
        </p>
        <button class="btn btn-primary" type="button" id="donate-confirm-return">
          Return
        </button>
      </div>
    `;

    document.getElementById('donate-confirm-return')?.addEventListener('click', () => {
      view = 'list';
      selectedFoundation = null;
      page = 1;
      renderList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function renderLoading() {
    document.getElementById('donate-content').innerHTML = `
      <div class="donate-state">
        <p class="donate-state__loading">Loading foundations…</p>
      </div>
    `;
  }

  function renderError(message) {
    document.getElementById('donate-content').innerHTML = `
      <div class="donate-state glass-card">
        <p class="donate-state__title">Something went quiet</p>
        <p class="donate-state__copy">${esc(message || 'Could not load foundations. Please try again.')}</p>
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
      await FoundationsStore.ready();
      page = 1;
      view = 'list';
      renderList();
    } catch (err) {
      console.error('Donate init failed:', err);
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      renderError(offline
        ? 'You appear to be offline. Please reconnect and try again.'
        : (err.message || 'Could not load foundations.'));
    }
  }

  return { init };
})();
