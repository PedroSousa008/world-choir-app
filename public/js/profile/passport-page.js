/**
 * PassportPage — full World Choir Passport experience
 */
const PassportPage = (() => {
  let passportData = null;
  let busyAction = null;

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function iconPeople() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    `;
  }

  function iconStar() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3z"/>
      </svg>
    `;
  }

  function iconDownload() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v12"/>
        <path d="m7 10 5 5 5-5"/>
        <path d="M5 21h14"/>
      </svg>
    `;
  }

  function iconWallet() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="6" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
        <circle cx="17" cy="14" r="1.2" fill="currentColor" stroke="none"/>
      </svg>
    `;
  }

  function iconShare() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="2.5"/>
        <circle cx="6" cy="12" r="2.5"/>
        <circle cx="18" cy="19" r="2.5"/>
        <path d="m8.2 13.2 7.5 4.1"/>
        <path d="m15.7 6.7-7.5 4.1"/>
      </svg>
    `;
  }

  function iconLock() {
    return `
      <svg class="passport-permanence__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2"/>
        <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
      </svg>
    `;
  }

  function iconLaurel() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 21c-4-2.5-6.5-6-6.5-10.5C5.5 6 8.5 3.5 12 3.5"/>
        <path d="M12 21c4-2.5 6.5-6 6.5-10.5C18.5 6 15.5 3.5 12 3.5"/>
        <path d="M8 8.5c1 .8 2.2 1.2 3.5 1.2"/>
        <path d="M16 8.5c-1 .8-2.2 1.2-3.5 1.2"/>
        <path d="M7.5 13c1.2.7 2.7 1.1 4.5 1.1"/>
        <path d="M16.5 13c-1.2.7-2.7 1.1-4.5 1.1"/>
      </svg>
    `;
  }

  function setActionBusy(which) {
    busyAction = which;
    ['download', 'wallet', 'share'].forEach((key) => {
      const btn = document.getElementById(`passport-action-${key}`);
      if (!btn) return;
      btn.disabled = !!which;
    });
  }

  function renderLoading() {
    return `
      <header class="passport-header">
        <div>
          <h1 class="passport-header__title">Passport</h1>
          <p class="passport-header__subtitle">Your voice. Your promise. Your place in history.</p>
        </div>
        <button type="button" class="passport-info-btn" id="passport-info-btn" aria-label="About World Choir Passport">i</button>
      </header>
      <div class="passport-card-wrap">
        ${WorldChoirPassport.renderCard({}, { loading: true })}
      </div>
      <div class="passport-permanence">
        ${iconLock()}
        <p>This is your unique World Choir Passport.<br>It cannot be changed or transferred.</p>
      </div>
    `;
  }

  function render(data) {
    const events = Number(data.eventsJoined) || 0;
    const acts = Number(data.dailyActsCompleted) || 0;

    return `
      <header class="passport-header">
        <div>
          <h1 class="passport-header__title">Passport</h1>
          <p class="passport-header__subtitle">Your voice. Your promise. Your place in history.</p>
        </div>
        <button type="button" class="passport-info-btn" id="passport-info-btn" aria-label="About World Choir Passport">i</button>
      </header>

      <div class="passport-card-wrap">
        ${WorldChoirPassport.renderCard(data)}
      </div>

      <div class="passport-permanence">
        ${iconLock()}
        <p>This is your unique World Choir Passport.<br>It cannot be changed or transferred.</p>
      </div>

      <section class="passport-stats" aria-label="Participation statistics">
        <div class="passport-stat">
          <div class="passport-stat__icon passport-stat__icon--events">${iconPeople()}</div>
          <p class="passport-stat__value">${esc(String(events))}</p>
          <p class="passport-stat__label">Events
Joined</p>
        </div>
        <div class="passport-stat">
          <div class="passport-stat__icon passport-stat__icon--acts">${iconStar()}</div>
          <p class="passport-stat__value">${esc(String(acts))}</p>
          <p class="passport-stat__label">Daily Acts
Completed</p>
        </div>
      </section>

      <section class="passport-actions" aria-label="Passport actions">
        <button type="button" class="passport-action" id="passport-action-download" aria-label="Download World Choir Passport">
          <span class="passport-action__icon">${iconDownload()}</span>
          <span class="passport-action__label">Download</span>
        </button>
        <button type="button" class="passport-action" id="passport-action-wallet" aria-label="Add World Choir Passport to Wallet">
          <span class="passport-action__icon">${iconWallet()}</span>
          <span class="passport-action__label">Add to Wallet</span>
        </button>
        <button type="button" class="passport-action" id="passport-action-share" aria-label="Share World Choir Passport">
          <span class="passport-action__icon">${iconShare()}</span>
          <span class="passport-action__label">Share</span>
        </button>
      </section>

      <button type="button" class="passport-journey-card" id="passport-journey-btn" aria-label="View your World Choir journey">
        <span class="passport-journey-card__icon">${iconLaurel()}</span>
        <span class="passport-journey-card__body">
          <p class="passport-journey-card__title">View Your Journey</p>
          <p class="passport-journey-card__copy">See your impact and milestones</p>
        </span>
        <span class="passport-journey-card__chevron" aria-hidden="true">›</span>
      </button>
    `;
  }

  function openInfo() {
    const overlay = document.getElementById('passport-info-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeInfo() {
    const overlay = document.getElementById('passport-info-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function bindInteractions() {
    document.getElementById('passport-info-btn')?.addEventListener('click', openInfo);
    document.getElementById('passport-info-close')?.addEventListener('click', closeInfo);
    document.getElementById('passport-info-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'passport-info-overlay') closeInfo();
    });

    document.getElementById('passport-action-download')?.addEventListener('click', async () => {
      if (!passportData || busyAction) return;
      setActionBusy('download');
      await WorldChoirPassport.downloadPassport(passportData);
      setActionBusy(null);
    });

    document.getElementById('passport-action-share')?.addEventListener('click', async () => {
      if (!passportData || busyAction) return;
      setActionBusy('share');
      await WorldChoirPassport.sharePassport(passportData);
      setActionBusy(null);
    });

    document.getElementById('passport-action-wallet')?.addEventListener('click', async () => {
      if (!passportData || busyAction) return;
      setActionBusy('wallet');
      try {
        await PassportWallet.addToWallet(passportData);
        WorldChoirPassport.showToast('Opening Wallet…');
      } catch (err) {
        if (err?.code === 'unsupported' || err?.code === 404 || err?.code === 501) {
          WorldChoirPassport.showToast(
            PassportWallet.isSupported()
              ? 'Wallet passes are being prepared — coming soon.'
              : 'Add to Wallet works on iPhone and Android.'
          );
        } else {
          WorldChoirPassport.showToast(
            PassportWallet.isSupported()
              ? 'Wallet passes are being prepared — coming soon.'
              : (err.message || 'Could not add to Wallet')
          );
        }
      } finally {
        setActionBusy(null);
      }
    });

    document.getElementById('passport-journey-btn')?.addEventListener('click', () => {
      window.location.href = 'passport-journey.html';
    });
  }

  async function mount() {
    const root = document.getElementById('passport-root');
    const page = document.getElementById('passport-page');
    if (!root) return;

    root.innerHTML = renderLoading();
    bindInteractions();

    try {
      await WorldChoirDB.ready();
      passportData = await WorldChoirPassport.loadPassportData();
      root.innerHTML = render(passportData);
      bindInteractions();
      page?.classList.add('is-entering');
      window.setTimeout(() => page?.classList.remove('is-entering'), 700);
    } catch (err) {
      console.error(err);
      root.innerHTML = `
        <header class="passport-header">
          <div>
            <h1 class="passport-header__title">Passport</h1>
            <p class="passport-header__subtitle">Could not load your Passport right now.</p>
          </div>
        </header>
        <button type="button" class="btn btn-primary" id="passport-retry">Try again</button>
      `;
      document.getElementById('passport-retry')?.addEventListener('click', () => mount());
    }
  }

  function init() {
    WorldChoirNav.startWatcher('profile');
    if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.start?.();
    mount();
  }

  return { init };
})();
