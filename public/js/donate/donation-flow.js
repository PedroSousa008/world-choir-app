/**
 * WorldChoirDonationFlow — one-time donation checkout.
 * Steps: amount → payment → donor → message → summary → success.
 * Live path uses Stripe. Controlled test path (server-gated) never calls Stripe.
 */
const WorldChoirDonationFlow = (() => {
  const STEPS = ['amount', 'payment', 'donor', 'message', 'summary', 'success', 'receipt'];

  let state = null;
  let stripe = null;
  let elements = null;
  let paymentElement = null;
  let config = null;
  let isSubmitting = false;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
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

  function deviceId() {
    try {
      return WorldChoirDB?.getDeviceId?.() || null;
    } catch {
      return null;
    }
  }

  function participationLocation() {
    try {
      const pledge = WorldChoirDB?.getPledgeForCurrentUser?.();
      const user = WorldChoirDB?.getCurrentUser?.();
      return {
        city: String(pledge?.city || user?.city || '').trim(),
        country: String(pledge?.country || user?.country || '').trim(),
        latitude: pledge?.latitude ?? user?.latitude ?? null,
        longitude: pledge?.longitude ?? user?.longitude ?? null,
      };
    } catch {
      return { city: '', country: '', latitude: null, longitude: null };
    }
  }

  function feeSplit(amount) {
    const grossCents = Math.round(Number(amount) * 100);
    const feePercent = config?.platformFeePercent ?? 10;
    const feeCents = Math.round(grossCents * (feePercent / 100));
    return {
      amountGross: grossCents / 100,
      platformFee: feeCents / 100,
      foundationAmount: (grossCents - feeCents) / 100,
      feePercent,
      foundationPercent: 100 - feePercent,
    };
  }

  function resetState(foundation, project) {
    state = {
      step: 'amount',
      foundation,
      project: project || null,
      amountChoice: null,
      customAmount: '',
      amount: null,
      donationId: null,
      clientSecret: null,
      paymentIntentId: null,
      testMode: false,
      testCardNumber: '',
      testExpMonth: '',
      testExpYear: '',
      testCvc: '',
      paymentLabel: '',
      firstName: '',
      lastName: '',
      donorDisplayName: '',
      donorAnonymous: false,
      message: '',
      receipt: null,
      error: '',
      feeDetailsOpen: false,
    };
  }

  function chosenAmount() {
    if (state.amountChoice === 'custom') {
      const n = parseFloat(String(state.customAmount).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    if (state.amountChoice == null || state.amountChoice === '') return null;
    return Number(state.amountChoice);
  }

  function minAmount() {
    return Number(config?.minDonation || 1);
  }

  async function loadConfig() {
    if (config) return config;
    const res = await fetch('/api/donations?action=config');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load payment configuration.');
    config = data;
    return config;
  }

  async function ensureStripe() {
    await loadConfig();
    if (config.testPaymentsEnabled) {
      return null;
    }
    if (!config.configured || !config.publishableKey) {
      const err = new Error(config.message || 'Payments are not configured yet.');
      err.code = 'PAYMENTS_NOT_CONFIGURED';
      throw err;
    }
    if (!window.Stripe) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://js.stripe.com/v3/';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Could not load Stripe.js'));
        document.head.appendChild(s);
      });
    }
    if (!stripe) stripe = window.Stripe(config.publishableKey);
    return stripe;
  }

  function isTestPaymentsMode() {
    return !!(config?.testPaymentsEnabled || state?.testMode);
  }

  function readTestCardFromDom() {
    return {
      number: document.getElementById('df-co-card-number')?.value || state.testCardNumber || '',
      expMonth: document.getElementById('df-co-card-exp-month')?.value || state.testExpMonth || '',
      expYear: document.getElementById('df-co-card-exp-year')?.value || state.testExpYear || '',
      cvc: document.getElementById('df-co-card-cvc')?.value || state.testCvc || '',
    };
  }

  function persistTestCardFromDom() {
    const card = readTestCardFromDom();
    state.testCardNumber = card.number;
    state.testExpMonth = card.expMonth;
    state.testExpYear = card.expYear;
    state.testCvc = card.cvc;
    return card;
  }

  function validateControlledTestCard(card) {
    const digits = String(card.number || '').replace(/\D/g, '');
    const month = String(card.expMonth || '').replace(/\D/g, '').padStart(2, '0').slice(-2);
    const yearRaw = String(card.expYear || '').replace(/\D/g, '');
    const year = yearRaw.length === 4 ? yearRaw.slice(-2) : yearRaw.slice(0, 2);
    const cvc = String(card.cvc || '').replace(/\D/g, '');
    if (digits === '0000000000000000' && month === '03' && year === '30' && cvc === '123') {
      return true;
    }
    return false;
  }

  function root() {
    return document.getElementById('df-checkout-root');
  }

  function ensureShell() {
    if (document.getElementById('df-checkout-root')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="df-checkout-root" class="df-checkout" hidden aria-hidden="true"></div>
    `);
    ensureLocationOverlay();
  }

  function ensureLocationOverlay() {
    if (document.getElementById('change-location-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" id="change-location-overlay">
        <div class="modal" role="dialog" aria-labelledby="location-modal-title">
          <h2 class="modal-title" id="location-modal-title">Change Participation Location</h2>
          <p class="modal-copy" id="location-modal-copy">
            Update where you will sing from. Your World Choir location will be used for this donation.
          </p>
          <div class="form-group">
            <label class="form-label" for="location-country">Country</label>
            <select class="form-input form-select" id="location-country">
              <option value="">Select country</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="location-city">City</label>
            <input class="form-input" id="location-city" type="text" placeholder="Your city" autocomplete="address-level2">
          </div>
          <div class="actions-row">
            <button class="btn btn-primary" id="location-confirm" type="button">Save Location</button>
            <button class="btn btn-secondary" id="location-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    `);
    try {
      ChangeLocationModal?.init?.();
    } catch {
      /* optional */
    }
  }

  function openChangeLocation() {
    ensureLocationOverlay();
    const loc = participationLocation();
    const mode = loc.city && loc.country ? 'change' : 'pledge';
    if (typeof ChangeLocationModal?.open === 'function') {
      ChangeLocationModal.open({
        mode,
        onSuccess: async () => {
          render();
        },
      });
      return;
    }
    alert('Location change is temporarily unavailable.');
  }

  function closeFlow() {
    destroyPaymentElement();
    const el = root();
    if (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '';
    }
    document.body.classList.remove('df-checkout-open');
    state = null;
  }

  function destroyPaymentElement() {
    try {
      paymentElement?.unmount?.();
    } catch {
      /* ignore */
    }
    paymentElement = null;
    elements = null;
  }

  function stepIndex() {
    return STEPS.indexOf(state.step);
  }

  function canGoBack() {
    return state.step !== 'success'
      && state.step !== 'receipt'
      && state.step !== 'amount'
      && state.step !== 'not_configured';
  }

  function goBack() {
    if (!canGoBack()) return;
    const order = ['amount', 'payment', 'donor', 'message', 'summary'];
    const i = order.indexOf(state.step);
    if (i > 0) {
      // Returning to amount invalidates the PaymentIntent UI — remount later.
      if (order[i - 1] === 'amount') destroyPaymentElement();
      state.step = order[i - 1];
      state.error = '';
      render();
    }
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  }

  function currencySymbol(currency = 'EUR') {
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      }).formatToParts(0);
      return parts.find((p) => p.type === 'currency')?.value || '€';
    } catch {
      return '€';
    }
  }

  function header(title, { showKicker = true } = {}) {
    return `
      <header class="df-checkout__top">
        ${canGoBack()
          ? `<button type="button" class="df-checkout__back" id="df-co-back">← Back</button>`
          : `<span class="df-checkout__back-spacer"></span>`}
        <button type="button" class="df-checkout__close" id="df-co-close" aria-label="Close">×</button>
      </header>
      ${showKicker && title ? `<p class="df-checkout__kicker">${esc(title)}</p>` : ''}
    `;
  }

  function foundationHeading() {
    const f = state.foundation;
    const projectLine = state.project
      ? `<p class="df-checkout__project">Project: ${esc(state.project.title)}</p>`
      : '';
    return `
      <h1 class="df-checkout__title">Support ${esc(f.foundationName)}</h1>
      <p class="df-checkout__byline">${esc(f.creatorName)}</p>
      ${projectLine}
    `;
  }

  function foundationIdentityCard() {
    const f = state.foundation;
    const img = String(f.profileImage || f.coverImage || '').trim();
    const verified = f.verificationStatus === 'verified'
      ? `<span class="df-checkout__verified">Verified Creator Foundation</span>`
      : '';
    const projectLine = state.project
      ? `<p class="df-checkout__project">Project: ${esc(state.project.title)}</p>`
      : '';

    return `
      <div class="df-checkout__identity">
        <div class="df-checkout__avatar ${img ? 'has-image' : ''}" aria-hidden="true">
          ${img
            ? `<img src="${esc(img)}" alt="">`
            : `<span>${esc(initials(f.foundationName || f.creatorName))}</span>`}
        </div>
        <div class="df-checkout__identity-text">
          <h1 class="df-checkout__foundation-name">${esc(f.foundationName)}</h1>
          <p class="df-checkout__creator">by ${esc(f.creatorName)}</p>
          ${verified}
          ${projectLine}
        </div>
      </div>
    `;
  }

  function locationBlock({ requireChange = false, compact = false } = {}) {
    const loc = participationLocation();
    const has = loc.city && loc.country;
    return `
      <div class="df-checkout__location${compact ? ' df-checkout__location--compact' : ''}">
        <p class="df-checkout__meta-label">Your World Choir location</p>
        <p class="df-checkout__location-value">
          <span class="df-checkout__loc-icon" aria-hidden="true">◎</span>
          ${has
            ? esc(`${loc.city}, ${loc.country}`)
            : '<span class="df-checkout__warn">Add your location to continue</span>'}
        </p>
        <button type="button" class="df-checkout__link" id="df-co-change-loc">
          ${has ? 'Change location' : 'Choose location'}
        </button>
        ${requireChange && !has
          ? '<p class="df-checkout__note">Donations use your World Choir participation city — not GPS or billing address.</p>'
          : ''}
      </div>
    `;
  }

  function amountContinueLabel() {
    const amt = chosenAmount();
    const min = minAmount();
    if (amt != null && amt >= min) return `Continue with ${formatMoney(amt)}`;
    return 'Continue';
  }

  function amountIsValid() {
    const amt = chosenAmount();
    return amt != null && amt >= minAmount();
  }

  function feePreviewHtml() {
    const amt = chosenAmount();
    if (amt == null || amt < minAmount()) return '';
    const split = feeSplit(amt);
    return `
      <div class="df-checkout__fee-preview" id="df-co-fee-preview">
        <div class="df-checkout__fee-row"><span>Foundation</span><strong>${esc(formatMoney(split.foundationAmount))}</strong></div>
        <div class="df-checkout__fee-row"><span>World Choir</span><strong>${esc(formatMoney(split.platformFee))}</strong></div>
        <div class="df-checkout__fee-row df-checkout__fee-row--total"><span>Total</span><strong>${esc(formatMoney(split.amountGross))}</strong></div>
      </div>
    `;
  }

  function renderAmount() {
    const amounts = config?.suggestedAmounts || [5, 10, 25, 50, 100];
    const currency = config?.currency || 'EUR';
    const symbol = currencySymbol(currency);
    const feeOpen = state.feeDetailsOpen === true;
    const valid = amountIsValid();

    return `
      <div class="df-checkout__amount-step">
        ${header('', { showKicker: false })}

        <p class="df-checkout__eyebrow">Support a mission</p>
        ${foundationIdentityCard()}

        <p class="df-checkout__prompt">Choose an amount you'd like to give.</p>

        <div class="df-checkout__amounts" role="group" aria-label="Donation amount">
          ${amounts.map((a) => `
            <button
              type="button"
              class="df-checkout__amount${state.amountChoice === a ? ' is-selected' : ''}"
              data-amount="${a}"
              aria-pressed="${state.amountChoice === a ? 'true' : 'false'}"
            >
              ${formatMoney(a, currency)}
            </button>
          `).join('')}
          <button
            type="button"
            class="df-checkout__amount${state.amountChoice === 'custom' ? ' is-selected' : ''}"
            data-amount="custom"
            aria-pressed="${state.amountChoice === 'custom' ? 'true' : 'false'}"
          >
            Custom
          </button>
        </div>

        <div class="df-checkout__custom-field${state.amountChoice === 'custom' ? ' is-open' : ''}" ${state.amountChoice === 'custom' ? '' : 'hidden'}>
          <label class="df-checkout__custom-label" for="df-co-custom">Custom amount</label>
          <div class="df-checkout__custom-input">
            <span class="df-checkout__currency" aria-hidden="true">${esc(symbol)}</span>
            <input
              id="df-co-custom"
              type="number"
              min="${minAmount()}"
              step="0.01"
              inputmode="decimal"
              placeholder="0.00"
              value="${esc(state.customAmount)}"
              aria-label="Custom donation amount in ${esc(currency)}"
            >
          </div>
        </div>

        ${locationBlock({ requireChange: true, compact: true })}

        ${state.error ? `<p class="df-checkout__error" role="alert">${esc(state.error)}</p>` : ''}

        <button
          type="button"
          class="df-checkout__cta"
          id="df-co-next"
          ${valid ? '' : 'disabled'}
        >${esc(amountContinueLabel())}</button>

        <div class="df-checkout__transparency">
          <p class="df-checkout__transparency-kicker">One-time donation</p>
          <p class="df-checkout__transparency-copy">
            10% of every donation supports World Choir's operational costs.
            The remaining 90% goes directly to the Foundation.
          </p>
          <button
            type="button"
            class="df-checkout__fee-toggle"
            id="df-co-fee-toggle"
            aria-expanded="${feeOpen ? 'true' : 'false'}"
          >
            <span aria-hidden="true">ⓘ</span> How donations are allocated
          </button>
          <div class="df-checkout__fee-details" id="df-co-fee-details" ${feeOpen ? '' : 'hidden'}>
            ${feePreviewHtml() || '<p class="df-checkout__note">Select an amount to see the allocation.</p>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderNotConfigured() {
    const logo = (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO?.url)
      ? WorldChoirConfig.LOGO.url
      : 'images/world-choir-logo.png';
    return `
      <header class="df-checkout__top">
        <span class="df-checkout__back-spacer"></span>
        <button type="button" class="df-checkout__close" id="df-co-close" aria-label="Close">×</button>
      </header>
      <div class="df-checkout__summary">
        <img class="df-checkout__logo" src="${esc(logo)}" alt="World Choir" width="72" height="72">
        <h1 class="df-checkout__title">Payments almost ready</h1>
        <p class="df-checkout__hint">
          The donation flow is built and waiting for Stripe credentials.
          Live Apple Pay, Google Pay, and card payments will unlock as soon as keys are connected.
        </p>
        <p class="df-checkout__note">
          No charge is made and no donation is recorded until Stripe confirms a successful payment.
        </p>
        <button type="button" class="df-checkout__cta" id="df-co-close-cta">Close</button>
      </div>
    `;
  }

  function renderPayment() {
    if (isTestPaymentsMode()) {
      return `
        ${header('Payment')}
        ${foundationHeading()}
        <p class="df-checkout__hint">One-time donation of <strong>${esc(formatMoney(state.amount))}</strong></p>
        <div class="df-checkout__card-form" role="group" aria-label="Card payment">
          <div class="form-group">
            <label class="form-label" for="df-co-card-number">Card number</label>
            <input
              class="form-input"
              id="df-co-card-number"
              type="text"
              inputmode="numeric"
              autocomplete="cc-number"
              placeholder="0000 0000 0000 0000"
              maxlength="23"
              value="${esc(state.testCardNumber)}"
            >
          </div>
          <div class="df-checkout__card-row">
            <div class="form-group">
              <label class="form-label" for="df-co-card-exp-month">Exp. month</label>
              <input
                class="form-input"
                id="df-co-card-exp-month"
                type="text"
                inputmode="numeric"
                autocomplete="cc-exp-month"
                placeholder="MM"
                maxlength="2"
                value="${esc(state.testExpMonth)}"
              >
            </div>
            <div class="form-group">
              <label class="form-label" for="df-co-card-exp-year">Exp. year</label>
              <input
                class="form-input"
                id="df-co-card-exp-year"
                type="text"
                inputmode="numeric"
                autocomplete="cc-exp-year"
                placeholder="YY"
                maxlength="4"
                value="${esc(state.testExpYear)}"
              >
            </div>
            <div class="form-group">
              <label class="form-label" for="df-co-card-cvc">CVC</label>
              <input
                class="form-input"
                id="df-co-card-cvc"
                type="text"
                inputmode="numeric"
                autocomplete="cc-csc"
                placeholder="123"
                maxlength="4"
                value="${esc(state.testCvc)}"
              >
            </div>
          </div>
        </div>
        ${state.error ? `<p class="df-checkout__error" role="alert">${esc(state.error)}</p>` : ''}
        <button type="button" class="df-checkout__cta" id="df-co-next">Continue</button>
        <p class="df-checkout__secure">World Choir never stores card numbers.</p>
      `;
    }

    return `
      ${header('Payment')}
      ${foundationHeading()}
      <p class="df-checkout__hint">One-time donation of <strong>${esc(formatMoney(state.amount))}</strong></p>
      <div id="df-co-payment-element" class="df-checkout__payment-el"></div>
      ${state.error ? `<p class="df-checkout__error" role="alert">${esc(state.error)}</p>` : ''}
      <button type="button" class="df-checkout__cta" id="df-co-next">Continue</button>
      <p class="df-checkout__secure">Payments are processed securely by Stripe. World Choir never stores card numbers.</p>
    `;
  }

  /** Keep Payment Element alive (hidden) while donor/message/summary steps run. */
  function paymentHoldHtml() {
    if (isTestPaymentsMode()) return '';
    if (!state.clientSecret || state.step === 'payment' || state.step === 'amount' || state.step === 'success' || state.step === 'receipt') {
      return '';
    }
    return `<div id="df-co-payment-element" class="df-checkout__payment-hold" aria-hidden="true"></div>`;
  }

  function renderDonor() {
    return `
      ${header('Your name')}
      <p class="df-checkout__hint">How should this Foundation see you?</p>
      <div class="form-group">
        <label class="form-label" for="df-co-first">First name</label>
        <input class="form-input" id="df-co-first" type="text" autocomplete="given-name" value="${esc(state.firstName)}" ${state.donorAnonymous ? 'disabled' : ''}>
      </div>
      <div class="form-group">
        <label class="form-label" for="df-co-last">Last name</label>
        <input class="form-input" id="df-co-last" type="text" autocomplete="family-name" value="${esc(state.lastName)}" ${state.donorAnonymous ? 'disabled' : ''}>
      </div>
      <label class="df-checkout__check">
        <input type="checkbox" id="df-co-anon" ${state.donorAnonymous ? 'checked' : ''}>
        <span>Donate anonymously</span>
      </label>
      <p class="df-checkout__note">Your payment details stay private. This only controls what the Foundation sees.</p>
      ${state.error ? `<p class="df-checkout__error" role="alert">${esc(state.error)}</p>` : ''}
      <button type="button" class="df-checkout__cta" id="df-co-next">Continue</button>
    `;
  }

  function renderMessage() {
    const max = config?.maxMessageLength || 500;
    return `
      ${header('Leave a message')}
      <p class="df-checkout__hint">Write a message to the people behind this Foundation. Optional.</p>
      <textarea class="form-input df-checkout__message" id="df-co-message" rows="5" maxlength="${max}" placeholder="Share a few words of encouragement…">${esc(state.message)}</textarea>
      <p class="df-checkout__counter"><span id="df-co-msg-count">${state.message.length}</span> / ${max}</p>
      ${state.error ? `<p class="df-checkout__error" role="alert">${esc(state.error)}</p>` : ''}
      <button type="button" class="df-checkout__cta" id="df-co-next">Continue</button>
    `;
  }

  function renderSummary() {
    const split = feeSplit(state.amount);
    const loc = participationLocation();
    const donorLabel = state.donorAnonymous
      ? 'Anonymous'
      : (state.donorDisplayName || [state.firstName, state.lastName].filter(Boolean).join(' ') || '—');
    const logo = (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO?.url)
      ? WorldChoirConfig.LOGO.url
      : 'images/world-choir-logo.png';

    return `
      ${header('Donation summary')}
      <div class="df-checkout__summary">
        <img class="df-checkout__logo" src="${esc(logo)}" alt="World Choir" width="72" height="72">
        <h1 class="df-checkout__title">${esc(state.foundation.foundationName)}</h1>
        <p class="df-checkout__byline">${esc(state.foundation.creatorName)}</p>

        <div class="df-checkout__fee-card">
          <div class="df-checkout__fee-row"><span>Your donation</span><strong>${esc(formatMoney(split.amountGross))}</strong></div>
          <div class="df-checkout__fee-row"><span>Foundation receives</span><strong>${esc(formatMoney(split.foundationAmount))}</strong></div>
          <div class="df-checkout__fee-row"><span>World Choir</span><strong>${esc(formatMoney(split.platformFee))}</strong></div>
          <div class="df-checkout__fee-row df-checkout__fee-row--total"><span>Total charged</span><strong>${esc(formatMoney(split.amountGross))}</strong></div>
        </div>
        <p class="df-checkout__note">
          ${split.feePercent}% of every donation supports World Choir's operational costs, helping us maintain and operate the platform.
        </p>

        <div class="df-checkout__meta">
          <p><span class="df-checkout__meta-label">Donor</span><br>${esc(donorLabel)}</p>
          ${state.message ? `<p><span class="df-checkout__meta-label">Message</span><br>“${esc(state.message)}”</p>` : ''}
          <p>
            <span class="df-checkout__meta-label">World Choir location</span><br>
            ${loc.city && loc.country ? esc(`${loc.city}, ${loc.country}`) : '<span class="df-checkout__warn">Add your location to continue</span>'}
            <button type="button" class="df-checkout__link" id="df-co-change-loc">Change location</button>
          </p>
          <p><span class="df-checkout__meta-label">Payment method</span><br>${esc(state.paymentLabel || 'Card')}</p>
        </div>

        <p class="df-checkout__confirm-line">You are donating ${esc(formatMoney(state.amount))} to ${esc(state.foundation.foundationName)}.</p>
        ${state.error ? `<p class="df-checkout__error" role="alert">${esc(state.error)}</p>` : ''}
        <button type="button" class="df-checkout__cta" id="df-co-donate" ${isSubmitting ? 'disabled' : ''}>
          ${isSubmitting ? 'Processing…' : `Donate ${formatMoney(state.amount)}`}
        </button>
      </div>
    `;
  }

  function renderSuccess() {
    const f = state.foundation;
    const receipt = state.receipt;
    return `
      <header class="df-checkout__top">
        <span class="df-checkout__back-spacer"></span>
        <button type="button" class="df-checkout__close" id="df-co-close" aria-label="Close">×</button>
      </header>
      <div class="df-checkout__success">
        <p class="df-checkout__kicker">Thank you</p>
        <h1 class="df-checkout__title">You just supported<br>${esc(f.foundationName)}</h1>
        <p class="df-checkout__byline">by ${esc(f.creatorName)}</p>
        <p class="df-checkout__success-amount">${esc(formatMoney(state.amount))}</p>
        <p class="df-checkout__hint">Your support is now part of this Foundation's journey.</p>

        <div class="df-checkout__community">
          <p class="df-checkout__meta-label">${esc(f.foundationName)}</p>
          <p>${esc(formatCount(f.uniqueSupporters || 0))} supporters</p>
          ${f.raisedKnown || (f.totalRaised > 0)
            ? `<p>${esc(formatMoney(f.totalRaised || 0))} raised</p>`
            : ''}
        </div>

        <div class="df-checkout__success-actions">
          <button type="button" class="df-checkout__cta" id="df-co-home">Return Home</button>
          <button type="button" class="df-checkout__cta df-checkout__cta--ghost" id="df-co-receipt">View donation details</button>
          <button type="button" class="df-checkout__link" id="df-co-share">Help more people discover this mission</button>
          <a class="df-checkout__link" id="df-co-map" href="map.html?foundation=${esc(encodeURIComponent(f.id))}">See support around the world</a>
        </div>
      </div>
    `;
  }

  function renderReceipt() {
    const r = state.receipt || {};
    const logo = (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO?.url)
      ? WorldChoirConfig.LOGO.url
      : 'images/world-choir-logo.png';
    const method = r.paymentMethodType === 'card' && r.cardLast4
      ? `${(r.cardBrand || 'Card').toString()} •••• ${r.cardLast4}`
      : (r.paymentMethodType || 'Card');

    return `
      <header class="df-checkout__top">
        <button type="button" class="df-checkout__back" id="df-co-back-success">← Back</button>
        <button type="button" class="df-checkout__close" id="df-co-close" aria-label="Close">×</button>
      </header>
      <div class="df-checkout__receipt">
        <img class="df-checkout__logo" src="${esc(logo)}" alt="World Choir" width="64" height="64">
        <h1 class="df-checkout__title">Donation details</h1>
        <div class="df-checkout__fee-card">
          <div class="df-checkout__fee-row"><span>Foundation</span><strong>${esc(r.foundationName || state.foundation.foundationName)}</strong></div>
          <div class="df-checkout__fee-row"><span>Creator</span><strong>${esc(r.creatorName || state.foundation.creatorName)}</strong></div>
          <div class="df-checkout__fee-row"><span>Donation</span><strong>${esc(formatMoney(r.amountGross))}</strong></div>
          <div class="df-checkout__fee-row"><span>Foundation receives</span><strong>${esc(formatMoney(r.foundationAmount))}</strong></div>
          <div class="df-checkout__fee-row"><span>World Choir</span><strong>${esc(formatMoney(r.platformFee))}</strong></div>
          <div class="df-checkout__fee-row"><span>Status</span><strong>${esc(r.status || 'succeeded')}</strong></div>
          <div class="df-checkout__fee-row"><span>Donor</span><strong>${esc(r.donorDisplayName || 'Anonymous')}</strong></div>
          ${r.message ? `<div class="df-checkout__fee-row"><span>Message</span><strong>“${esc(r.message)}”</strong></div>` : ''}
          <div class="df-checkout__fee-row"><span>Location</span><strong>${esc([r.city, r.country].filter(Boolean).join(', ') || '—')}</strong></div>
          <div class="df-checkout__fee-row"><span>Payment</span><strong>${esc(method)}</strong></div>
          <div class="df-checkout__fee-row"><span>Date</span><strong>${esc(r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')}</strong></div>
          <div class="df-checkout__fee-row"><span>Reference</span><strong>${esc(r.id || state.donationId)}</strong></div>
        </div>
        <button type="button" class="df-checkout__cta" id="df-co-home">Return Home</button>
      </div>
    `;
  }

  function renderBody() {
    switch (state.step) {
      case 'amount': return renderAmount();
      case 'payment': return renderPayment();
      case 'donor': return renderDonor();
      case 'message': return renderMessage();
      case 'summary': return renderSummary();
      case 'success': return renderSuccess();
      case 'receipt': return renderReceipt();
      case 'not_configured': return renderNotConfigured();
      default: return renderAmount();
    }
  }

  async function mountPaymentElement() {
    const mount = document.getElementById('df-co-payment-element');
    if (!mount || !state.clientSecret) return;
    await ensureStripe();

    // Remount existing element into the new DOM node after re-render.
    if (paymentElement && elements) {
      try {
        paymentElement.mount('#df-co-payment-element');
        return;
      } catch {
        destroyPaymentElement();
      }
    }

    elements = stripe.elements({
      clientSecret: state.clientSecret,
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#4ec5e8',
          colorBackground: '#0a0a0c',
          colorText: '#f2efe8',
          colorDanger: '#ff6b6b',
          fontFamily: 'Inter, system-ui, sans-serif',
          borderRadius: '10px',
        },
      },
    });
    paymentElement = elements.create('payment', {
      layout: 'tabs',
    });
    paymentElement.mount('#df-co-payment-element');
  }

  async function createIntent() {
    const amount = chosenAmount();
    const min = minAmount();
    if (amount == null || amount < min) {
      throw new Error(`Enter an amount of at least ${formatMoney(min)}.`);
    }
    state.amount = Math.round(amount * 100) / 100;

    await loadConfig();
    if (!isTestPaymentsMode()) {
      await ensureStripe();
    }

    const idempotencyKey = `wc-${deviceId() || 'anon'}-${state.foundation.id}-${state.amount}-${Date.now()}`;
    const res = await fetch('/api/donations?action=create-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        foundationId: state.foundation.id,
        projectId: state.project?.id || null,
        amount: state.amount,
        currency: config.currency || 'EUR',
        deviceId: deviceId(),
        idempotencyKey,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start payment.');
    state.donationId = data.donationId;
    state.clientSecret = data.clientSecret || null;
    state.paymentIntentId = data.paymentIntentId || null;
    state.testMode = data.testMode === true || config.testPaymentsEnabled === true;
  }

  async function confirmTestPayment() {
    const card = persistTestCardFromDom();
    const loc = participationLocation();
    const anonymous = state.donorAnonymous;
    const donorDisplayName = anonymous
      ? 'Anonymous'
      : [state.firstName, state.lastName].filter(Boolean).join(' ').trim() || state.donorDisplayName;
    const idempotencyKey = `test-complete-${state.donationId}`;
    const res = await fetch('/api/donations?action=complete-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        donationId: state.donationId,
        cardNumber: card.number,
        expMonth: card.expMonth,
        expYear: card.expYear,
        cvc: card.cvc,
        idempotencyKey,
        firstName: state.firstName,
        lastName: state.lastName,
        donorDisplayName,
        donorAnonymous: anonymous,
        message: state.message,
        city: loc.city,
        country: loc.country,
        latitude: loc.latitude,
        longitude: loc.longitude,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Your donation could not be completed. Please try again.');
    if (!data.donation) throw new Error('Your donation could not be confirmed. Please try again.');
    return data.donation;
  }

  async function persistDonorAndMessage() {
    const loc = participationLocation();
    const anonymous = state.donorAnonymous;
    const donorDisplayName = anonymous
      ? 'Anonymous'
      : [state.firstName, state.lastName].filter(Boolean).join(' ').trim();

    if (!anonymous && !donorDisplayName) {
      throw new Error('Enter your name, or choose to donate anonymously.');
    }
    if (!loc.city || !loc.country) {
      throw new Error('Add your World Choir location before confirming.');
    }

    state.donorDisplayName = donorDisplayName;

    const res = await fetch('/api/donations?action=update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donationId: state.donationId,
        firstName: state.firstName,
        lastName: state.lastName,
        donorDisplayName,
        donorAnonymous: anonymous,
        message: state.message,
        city: loc.city,
        country: loc.country,
        latitude: loc.latitude,
        longitude: loc.longitude,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save donor details.');
  }

  async function confirmPayment() {
    if (isSubmitting) return;
    isSubmitting = true;
    state.error = '';
    render();

    try {
      await persistDonorAndMessage();

      let receipt = null;
      if (isTestPaymentsMode()) {
        receipt = await confirmTestPayment();
      } else {
        await ensureStripe();

        if (!elements) {
          throw new Error('Payment session expired. Go back and enter your payment details again.');
        }

        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          redirect: 'if_required',
          confirmParams: {
            return_url: `${window.location.origin}/donate.html?donation=${encodeURIComponent(state.donationId)}`,
            payment_method_data: {
              billing_details: {
                name: state.donorAnonymous
                  ? undefined
                  : (state.donorDisplayName || undefined),
              },
            },
          },
        });

        if (error) {
          throw new Error(error.message || 'Your donation could not be completed. Please check your payment details and try again.');
        }

        if (paymentIntent && paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') {
          throw new Error('Your donation could not be completed. Please try again.');
        }

        for (let i = 0; i < 12; i += 1) {
          const res = await fetch('/api/donations?action=confirm-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ donationId: state.donationId }),
          });
          const data = await res.json();
          if (data.ready && data.donation) {
            receipt = data.donation;
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        if (!receipt) {
          const res = await fetch(`/api/donations?action=receipt&id=${encodeURIComponent(state.donationId)}`);
          const data = await res.json();
          if (res.ok) receipt = data.donation;
        }
      }

      if (!receipt) {
        throw new Error('Your donation could not be confirmed. Please try again.');
      }

      state.receipt = receipt;
      state.step = 'success';

      try {
        await CreatorFoundationsStore.refresh?.()
          || CreatorFoundationsStore.ready?.(true);
        const fresh = CreatorFoundationsStore.getById(state.foundation.id);
        if (fresh) state.foundation = fresh;
      } catch {
        /* ignore */
      }

      destroyPaymentElement();
      render();
    } catch (err) {
      state.error = err.message || 'Your donation could not be completed. Please try again.';
      render();
    } finally {
      isSubmitting = false;
    }
  }

  async function advanceFromAmount() {
    state.error = '';
    const loc = participationLocation();
    if (!loc.city || !loc.country) {
      state.error = 'Add your World Choir location before continuing.';
      render();
      return;
    }
    try {
      await createIntent();
      state.step = 'payment';
      render();
      if (!isTestPaymentsMode()) {
        await mountPaymentElement();
      }
    } catch (err) {
      state.error = err.message || 'Could not continue.';
      render();
    }
  }

  async function advanceFromPayment() {
    state.error = '';
    if (isTestPaymentsMode()) {
      const card = persistTestCardFromDom();
      if (!validateControlledTestCard(card)) {
        state.error = 'Please check your payment details and try again.';
        render();
        return;
      }
      state.paymentLabel = 'Card';
      state.step = 'donor';
      render();
      return;
    }

    if (!state.clientSecret || !elements) {
      state.error = 'Payment is not ready. Go back and try again.';
      render();
      return;
    }
    try {
      const { error } = await elements.submit();
      if (error) {
        state.error = error.message || 'Check your payment details and try again.';
        render();
        await mountPaymentElement();
        return;
      }
      state.paymentLabel = 'Card';
      state.step = 'donor';
      render();
    } catch (err) {
      state.error = err.message || 'Check your payment details and try again.';
      render();
    }
  }

  function advanceFromDonor() {
    state.error = '';
    state.firstName = document.getElementById('df-co-first')?.value?.trim() || '';
    state.lastName = document.getElementById('df-co-last')?.value?.trim() || '';
    state.donorAnonymous = !!document.getElementById('df-co-anon')?.checked;
    if (!state.donorAnonymous && !state.firstName && !state.lastName) {
      state.error = 'Enter your name, or choose to donate anonymously.';
      render();
      return;
    }
    state.step = 'message';
    render();
  }

  function advanceFromMessage() {
    state.message = document.getElementById('df-co-message')?.value || '';
    state.step = 'summary';
    render();
  }

  function bind() {
    document.getElementById('df-co-close')?.addEventListener('click', () => {
      if (state?.step === 'success' || state?.step === 'receipt' || state?.step === 'not_configured') {
        closeFlow();
        return;
      }
      // Amount step: leave quietly — no payment started, Foundation page remains.
      if (state?.step === 'amount' && !state?.donationId) {
        closeFlow();
        return;
      }
      if (confirm('Leave this donation? Your payment will not be completed.')) {
        closeFlow();
      }
    });
    document.getElementById('df-co-close-cta')?.addEventListener('click', closeFlow);
    document.getElementById('df-co-back')?.addEventListener('click', goBack);
    document.getElementById('df-co-back-success')?.addEventListener('click', () => {
      state.step = 'success';
      render();
    });

    document.querySelectorAll('[data-amount]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-amount');
        state.amountChoice = raw === 'custom' ? 'custom' : Number(raw);
        state.error = '';
        render();
        if (state.amountChoice === 'custom') document.getElementById('df-co-custom')?.focus();
      });
    });
    document.getElementById('df-co-custom')?.addEventListener('input', (e) => {
      state.customAmount = e.target.value;
      const cta = document.getElementById('df-co-next');
      if (cta && state.step === 'amount') {
        cta.textContent = amountContinueLabel();
        cta.disabled = !amountIsValid();
      }
      const details = document.getElementById('df-co-fee-details');
      if (details && state.feeDetailsOpen) {
        details.innerHTML = feePreviewHtml()
          || '<p class="df-checkout__note">Select an amount to see the allocation.</p>';
      }
    });

    document.getElementById('df-co-fee-toggle')?.addEventListener('click', () => {
      state.feeDetailsOpen = !state.feeDetailsOpen;
      const toggle = document.getElementById('df-co-fee-toggle');
      const details = document.getElementById('df-co-fee-details');
      if (toggle) toggle.setAttribute('aria-expanded', state.feeDetailsOpen ? 'true' : 'false');
      if (details) {
        details.hidden = !state.feeDetailsOpen;
        if (state.feeDetailsOpen) {
          details.innerHTML = feePreviewHtml()
            || '<p class="df-checkout__note">Select an amount to see the allocation.</p>';
        }
      }
    });

    document.getElementById('df-co-anon')?.addEventListener('change', (e) => {
      state.donorAnonymous = !!e.target.checked;
      render();
    });
    document.getElementById('df-co-first')?.addEventListener('input', (e) => {
      state.firstName = e.target.value;
    });
    document.getElementById('df-co-last')?.addEventListener('input', (e) => {
      state.lastName = e.target.value;
    });
    document.getElementById('df-co-message')?.addEventListener('input', (e) => {
      state.message = e.target.value;
      const c = document.getElementById('df-co-msg-count');
      if (c) c.textContent = String(state.message.length);
    });

    document.getElementById('df-co-change-loc')?.addEventListener('click', openChangeLocation);

    document.getElementById('df-co-next')?.addEventListener('click', () => {
      if (state.step === 'amount') advanceFromAmount();
      else if (state.step === 'payment') advanceFromPayment();
      else if (state.step === 'donor') advanceFromDonor();
      else if (state.step === 'message') advanceFromMessage();
    });

    document.getElementById('df-co-donate')?.addEventListener('click', confirmPayment);

    document.getElementById('df-co-home')?.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
    document.getElementById('df-co-receipt')?.addEventListener('click', () => {
      state.step = 'receipt';
      render();
    });
    document.getElementById('df-co-share')?.addEventListener('click', async () => {
      const url = new URL(window.location.href);
      url.searchParams.set('foundation', state.foundation.slug || state.foundation.id);
      const shareData = {
        title: state.foundation.foundationName,
        text: `Discover ${state.foundation.foundationName} on World Choir.`,
        url: url.toString(),
      };
      try {
        if (navigator.share) await navigator.share(shareData);
        else await navigator.clipboard.writeText(shareData.url);
      } catch {
        /* ignore */
      }
    });
  }

  function render() {
    const el = root();
    if (!el || !state) return;
    const amountClass = state.step === 'amount' ? ' df-checkout__panel--amount' : '';
    el.innerHTML = `<div class="df-checkout__panel${amountClass} df-rise">${renderBody()}${paymentHoldHtml()}</div>`;
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('df-checkout-open');
    bind();
    if (state.clientSecret && !isTestPaymentsMode() && state.step !== 'amount' && state.step !== 'success' && state.step !== 'receipt') {
      requestAnimationFrame(() => { mountPaymentElement(); });
    }
  }

  async function start(foundation, project = null) {
    if (!foundation?.donationsEnabled) {
      alert('Donations for this foundation are temporarily unavailable.');
      return;
    }
    ensureShell();
    resetState(foundation, project);
    try {
      config = null;
      await loadConfig();
      if (!config.configured) {
        state.step = 'not_configured';
        render();
        return;
      }
      state.testMode = config.testPaymentsEnabled === true;
      render();
    } catch (err) {
      alert(err.message || 'Could not open donation flow.');
    }
  }

  /** Resume after redirect-based wallet payment */
  async function resumeFromQuery() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const donationId = params.get('donation');
      if (!donationId) return false;
      ensureShell();
      await loadConfig();
      const res = await fetch(`/api/donations?action=receipt&id=${encodeURIComponent(donationId)}`);
      const data = await res.json();
      if (!res.ok || !data.donation) return false;
      const foundation = CreatorFoundationsStore.getById(data.donation.foundationId);
      if (!foundation) return false;
      resetState(foundation, null);
      state.donationId = donationId;
      state.amount = data.donation.amountGross;
      state.receipt = data.donation;
      state.step = data.donation.status === 'succeeded' || data.donation.status === 'completed'
        ? 'success'
        : 'summary';
      render();
      // Clean query
      params.delete('donation');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', next);
      return true;
    } catch {
      return false;
    }
  }

  return { start, close: closeFlow, resumeFromQuery };
})();
