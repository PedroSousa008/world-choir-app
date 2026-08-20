/**
 * PassportPage — World Choir Passport screen
 */
const PassportPage = (() => {
  let passport = null;
  let toastTimer = null;

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function showToast(message) {
    let el = document.getElementById('passport-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'passport-toast';
      el.className = 'passport-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  }

  function setActionsBusy(busy) {
    document.querySelectorAll('.passport-action').forEach((btn) => {
      btn.disabled = !!busy;
    });
  }

  function renderSkeleton() {
    return `
      <div class="passport-page__body">
        ${renderHeader()}
        <div class="wc-passport-wrap">
          ${WorldChoirPassport.renderCard({}, { loading: true })}
        </div>
        ${renderPermanence()}
        ${renderStats({ eventsJoined: null, dailyActsCompleted: null }, true)}
        ${renderActions()}
        ${renderJourneyCard()}
      </div>
      ${renderInfoModal()}
    `;
  }

  function renderHeader() {
    return `
      <header class="passport-header">
        <div>
          <button type="button" class="passport-header__back" id="passport-back" aria-label="Back to Profile">← Profile</button>
          <h1 class="passport-header__title">Passport</h1>
          <p class="passport-header__subtitle">Your voice. Your promise. Your place in history.</p>
        </div>
        <button type="button" class="passport-info-btn" id="passport-info-btn" aria-label="About World Choir Passport">i</button>
      </header>
    `;
  }

  function renderPermanence() {
    return `
      <div class="passport-permanence">
        <svg class="passport-permanence__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/>
        </svg>
        <p class="passport-permanence__text">This is your unique World Choir Passport.<br>It cannot be changed or transferred.</p>
      </div>
    `;
  }

  function renderStats(data, loading) {
    const events = loading ? '—' : String(data.eventsJoined ?? 0);
    const acts = loading ? '—' : String(data.dailyActsCompleted ?? 0);
    const loadingClass = loading ? ' passport-stat__value--loading' : '';
    return `
      <section class="passport-stats" aria-label="Participation statistics">
        <div class="passport-stat">
          <div class="passport-stat__icon" aria-hidden="true">◎</div>
          <div class="passport-stat__value${loadingClass}">${esc(events)}</div>
          <div class="passport-stat__label">Events
Joined</div>
        </div>
        <div class="passport-stat">
          <div class="passport-stat__icon" aria-hidden="true">✦</div>
          <div class="passport-stat__value${loadingClass}">${esc(acts)}</div>
          <div class="passport-stat__label">Daily Acts
Completed</div>
        </div>
      </section>
    `;
  }

  function renderActions() {
    return `
      <section class="passport-actions" aria-label="Passport actions">
        <button type="button" class="passport-action" id="passport-download" aria-label="Download World Choir Passport">
          <span class="passport-action__icon" aria-hidden="true">↓</span>
          <span class="passport-action__label">Download</span>
        </button>
        <button type="button" class="passport-action" id="passport-wallet" aria-label="Add World Choir Passport to Wallet">
          <span class="passport-action__icon" aria-hidden="true">▣</span>
          <span class="passport-action__label">Add to Wallet</span>
        </button>
        <button type="button" class="passport-action" id="passport-share" aria-label="Share World Choir Passport">
          <span class="passport-action__icon" aria-hidden="true">↗</span>
          <span class="passport-action__label">Share</span>
        </button>
      </section>
    `;
  }

  function renderJourneyCard() {
    return `
      <button type="button" class="passport-journey" id="passport-journey-btn" aria-label="View your World Choir journey">
        <span class="passport-journey__icon" aria-hidden="true">◇</span>
        <span class="passport-journey__copy">
          <span class="passport-journey__title">View Your Journey</span>
          <span class="passport-journey__sub">See your impact and milestones</span>
        </span>
        <span class="passport-journey__chevron" aria-hidden="true">›</span>
      </button>
    `;
  }

  function renderInfoModal() {
    return `
      <div class="overlay" id="passport-info-overlay" role="dialog" aria-modal="true" aria-labelledby="passport-info-title">
        <div class="modal">
          <h2 class="modal-title" id="passport-info-title">Your World Choir Passport</h2>
          <p class="modal-copy">
            Your World Choir Passport is a permanent record of your participation in World Choir.
            It contains your unique Voice Number, your location, your participation history,
            and milestones from your journey.
          </p>
          <button type="button" class="btn btn-primary" id="passport-info-close">Close</button>
        </div>
      </div>
    `;
  }

  function renderLoaded(data) {
    return `
      <div class="passport-page__body">
        ${renderHeader()}
        <div class="wc-passport-wrap">
          ${WorldChoirPassport.renderCard(data)}
        </div>
        ${renderPermanence()}
        ${renderStats(data, false)}
        ${renderActions()}
        ${renderJourneyCard()}
      </div>
      ${renderInfoModal()}
    `;
  }

  function bind() {
    document.getElementById('passport-back')?.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });

    document.getElementById('passport-info-btn')?.addEventListener('click', () => {
      document.getElementById('passport-info-overlay')?.classList.add('active');
    });

    const closeInfo = () => document.getElementById('passport-info-overlay')?.classList.remove('active');
    document.getElementById('passport-info-close')?.addEventListener('click', closeInfo);
    document.getElementById('passport-info-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'passport-info-overlay') closeInfo();
    });

    document.getElementById('passport-journey-btn')?.addEventListener('click', () => {
      window.location.href = 'passport-journey.html';
    });

    document.getElementById('passport-download')?.addEventListener('click', async () => {
      if (WorldChoirPassport.isExportBusy()) return;
      setActionsBusy(true);
      try {
        const result = await WorldChoirPassport.downloadPassport();
        if (result?.method === 'cancelled') return;
        if (result?.method === 'share') showToast('Passport ready to save');
        else showToast('Passport saved');
      } catch (err) {
        console.error(err);
        showToast('Could not save Passport');
      } finally {
        setActionsBusy(false);
      }
    });

    document.getElementById('passport-share')?.addEventListener('click', async () => {
      if (WorldChoirPassport.isExportBusy()) return;
      setActionsBusy(true);
      try {
        const result = await WorldChoirPassport.sharePassport();
        if (result?.method === 'cancelled') return;
        if (result?.method === 'download-fallback') showToast('Passport saved');
      } catch (err) {
        console.error(err);
        showToast('Could not share Passport');
      } finally {
        setActionsBusy(false);
      }
    });

    document.getElementById('passport-wallet')?.addEventListener('click', async () => {
      setActionsBusy(true);
      try {
        await PassportWalletService.addPassportToWallet();
        showToast('Opening Wallet…');
      } catch (err) {
        if (err?.code === 'unsupported') {
          showToast('Wallet is available on iPhone and Android');
        } else if (err?.code === 404 || err?.message?.includes('unavailable') || err?.message?.includes('Wallet')) {
          showToast('Wallet passes coming soon');
        } else {
          console.warn('Wallet:', err);
          showToast('Wallet passes coming soon');
        }
      } finally {
        setActionsBusy(false);
      }
    });
  }

  async function mount() {
    const root = document.getElementById('passport-root');
    if (!root) return;

    root.innerHTML = renderSkeleton();
    bind();

    try {
      await WorldChoirDB.ready();
      passport = await WorldChoirPassport.loadPassportData();
      root.innerHTML = renderLoaded(passport);
      document.querySelector('.passport-page')?.classList.add('passport-page--enter');
      bind();
    } catch (err) {
      console.error('Passport load failed:', err);
      showToast('Could not load Passport');
    }
  }

  function init() {
    WorldChoirNav.startWatcher('profile');
    mount();
  }

  return { init };
})();
