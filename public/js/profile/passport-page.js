/**
 * PassportPage — full World Choir Passport experience
 */
const PassportPage = (() => {
  let passportData = null;
  let busyAction = null;
  let activeChapter = 'cover';

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

  function iconAward() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="5"/>
        <path d="M8.5 13 6 21l6-3 6 3-2.5-8"/>
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

  function resolveChapter(page) {
    if (page === 'stamps' || page === 'inside') return 'stamps';
    if (page === 'story') return 'story';
    return 'cover';
  }

  function cardPageForChapter(chapter) {
    return chapter === 'stamps' ? 'stamps' : 'cover';
  }

  function stampsEarnedCount(data = {}) {
    if (Number.isFinite(Number(data.stampsEarned))) return Number(data.stampsEarned);
    return (data.stamps || []).filter((stamp) => stamp.unlocked).length;
  }

  function renderParticipationStats(data = {}, { columns = 2 } = {}) {
    const events = Number(data.eventsJoined) || 0;
    const acts = Number(data.dailyActsCompleted) || 0;
    const stats = [
      {
        icon: iconPeople(),
        iconClass: 'events',
        value: events,
        label: 'Events\nJoined',
      },
      {
        icon: iconStar(),
        iconClass: 'acts',
        value: acts,
        label: 'Daily Acts\nCompleted',
      },
    ];

    if (columns >= 3) {
      stats.push({
        icon: iconAward(),
        iconClass: 'stamps',
        value: stampsEarnedCount(data),
        label: 'Stamps\nEarned',
      });
    }

    return `
      <section class="passport-stats${columns >= 3 ? ' passport-stats--triple' : ''}" aria-label="Participation statistics">
        ${stats.map((stat) => `
          <div class="passport-stat">
            <div class="passport-stat__icon passport-stat__icon--${stat.iconClass}">${stat.icon}</div>
            <p class="passport-stat__value">${esc(String(stat.value))}</p>
            <p class="passport-stat__label">${stat.label}</p>
          </div>`).join('')}
      </section>`;
  }

  function renderStoryView(data = {}) {
    return `
      <div id="passport-story-view" class="passport-story-view" hidden>
        <header class="passport-header">
          <div>
            <h1 class="passport-header__title">Passport</h1>
          </div>
          <button
            type="button"
            class="passport-info-btn"
            id="passport-story-info-btn"
            aria-label="About Pass the World"
          >i</button>
        </header>

        <div class="passport-card-wrap">
          <div class="passport-card passport-card--ptw is-inside" aria-label="Pass the World">
            <button
              type="button"
              class="passport-card__back"
              id="passport-story-back"
              aria-label="Go back to Passport stamps"
            >
              ←
            </button>
            <div id="passport-story-host" class="passport-story-host ptw-card-host"></div>
          </div>
        </div>

        <div class="passport-permanence" id="passport-story-permanence">
          ${iconLock()}
          <p>This is your unique World Choir Passport.<br>It cannot be changed or transferred.</p>
        </div>

        ${renderParticipationStats(data, { columns: 3 })}
      </div>
    `;
  }

  function renderLoading(chapter = 'cover') {
    if (chapter === 'story') {
      return `
        <div id="passport-main" class="passport-main" hidden></div>
        ${renderStoryView()}
      `;
    }
    return `
      <div id="passport-main" class="passport-main">
        <header class="passport-header">
          <div>
            <h1 class="passport-header__title">Passport</h1>
          </div>
          <button type="button" class="passport-info-btn" id="passport-info-btn" aria-label="About World Choir Passport">i</button>
        </header>
        <div class="passport-card-wrap">
          ${WorldChoirPassport.renderCard({}, { loading: true, page: cardPageForChapter(chapter) })}
        </div>
        <div class="passport-permanence">
          ${iconLock()}
          <p>This is your unique World Choir Passport.<br>It cannot be changed or transferred.</p>
        </div>
      </div>
      ${renderStoryView()}
    `;
  }

  function render(data, chapter = 'cover') {
    return `
      <div id="passport-main" class="passport-main">
        <header class="passport-header">
          <div>
            <h1 class="passport-header__title">Passport</h1>
          </div>
          <button type="button" class="passport-info-btn" id="passport-info-btn" aria-label="About World Choir Passport">i</button>
        </header>

        <div class="passport-card-wrap">
          ${WorldChoirPassport.renderCard(data, { page: cardPageForChapter(chapter) })}
        </div>

        <div class="passport-permanence">
          ${iconLock()}
          <p>This is your unique World Choir Passport.<br>It cannot be changed or transferred.</p>
        </div>

        ${renderParticipationStats(data, { columns: 2 })}

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
      </div>
      ${renderStoryView(data)}
    `;
  }

  function updateStoryStats(data = {}) {
    const story = document.getElementById('passport-story-view');
    if (!story) return;
    const existing = story.querySelector('.passport-stats');
    const next = renderParticipationStats(data, { columns: 3 });
    if (existing) {
      existing.outerHTML = next;
      return;
    }
    story.querySelector('#passport-story-permanence')?.insertAdjacentHTML('afterend', next);
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

  function applyChapter(chapter, { syncUrl = true, historyMode = 'replace' } = {}) {
    const next = resolveChapter(chapter);
    activeChapter = next;

    const pageEl = document.getElementById('passport-page');
    const main = document.getElementById('passport-main');
    const story = document.getElementById('passport-story-view');
    const isStory = next === 'story';

    document.body.classList.toggle('passport-story-body', isStory);
    pageEl?.classList.toggle('passport-story-page', isStory);

    if (main) main.hidden = isStory;
    if (story) story.hidden = !isStory;

    if (!isStory) {
      const card = document.querySelector('.passport-card');
      if (card) {
        WorldChoirPassport.setCardPage(card, next === 'stamps' ? 'inside' : 'cover', {
          historyMode,
          syncUrl: false,
        });
      }
    }

    if (syncUrl && typeof PassportRoute !== 'undefined') {
      PassportRoute.syncPassportHtmlUrl(next, { replace: historyMode !== 'push' });
    }
  }

  function mountPassTheWorld() {
    const host = document.getElementById('passport-story-host');
    if (!host || typeof PassTheWorld === 'undefined') return;
    if (PassTheWorld.isMounted?.() && host.querySelector('.ptw')) {
      if (typeof PassTheWorldMap !== 'undefined') PassTheWorldMap.invalidateSize?.();
      return;
    }
    PassTheWorld.mount(host);
  }

  function unmountPassTheWorld() {
    if (typeof PassTheWorld !== 'undefined') PassTheWorld.destroy();
  }

  function showChapter(chapter, opts = {}) {
    const next = resolveChapter(chapter);
    applyChapter(next, opts);
    if (next === 'stamps') {
      unmountPassTheWorld();
      const card = document.querySelector('.passport-card');
      if (card && typeof PassportStamps !== 'undefined') {
        PassportStamps.bindRevealAnimations(card);
      }
    } else if (next === 'story') {
      mountPassTheWorld();
    } else {
      unmountPassTheWorld();
    }
  }

  function bindStoryBack() {
    document.getElementById('passport-story-back')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showChapter('stamps', { historyMode: 'push' });
    });
    document.getElementById('passport-story-info-btn')?.addEventListener('click', openInfo);
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

    bindStoryBack();
    WorldChoirPassport.bindCardPages(document.getElementById('passport-root') || document);
  }

  function paint(data, chapter, { animate = false } = {}) {
    const root = document.getElementById('passport-root');
    const pageEl = document.getElementById('passport-page');
    if (!root) return;

    // Soft refresh on story: keep Pass the World mounted.
    if (chapter === 'story' && document.getElementById('passport-story-host')?.querySelector('.ptw')) {
      passportData = data;
      updateStoryStats(data);
      applyChapter('story', { syncUrl: true, historyMode: 'replace' });
      return;
    }

    root.innerHTML = render(data, chapter === 'story' ? 'stamps' : chapter);
    WorldChoirPassport.revealFeatureImages(root);
    bindInteractions();
    applyChapter(chapter, { syncUrl: true, historyMode: 'replace' });

    if (animate) {
      pageEl?.classList.add('is-entering');
      window.setTimeout(() => pageEl?.classList.remove('is-entering'), 420);
    }

    if (chapter === 'stamps') {
      const card = root.querySelector('.passport-card');
      if (card && typeof PassportStamps !== 'undefined') {
        PassportStamps.bindRevealAnimations(card);
      }
    } else if (chapter === 'story') {
      mountPassTheWorld();
    }
  }

  async function mount() {
    const root = document.getElementById('passport-root');
    if (!root) return;

    const chapter = resolveChapter(
      typeof PassportRoute !== 'undefined' ? PassportRoute.getPage() : 'cover'
    );
    activeChapter = chapter;

    const cached = WorldChoirPassport.getCachedPassportData?.() || null;
    if (cached) {
      passportData = cached;
      paint(cached, chapter, { animate: false });
    } else if (chapter === 'story') {
      root.innerHTML = renderLoading('story');
      bindStoryBack();
      applyChapter('story', { syncUrl: true, historyMode: 'replace' });
      mountPassTheWorld();
    } else {
      root.innerHTML = renderLoading(chapter);
      WorldChoirPassport.revealFeatureImages(root);
      bindInteractions();
      applyChapter(chapter, { syncUrl: true, historyMode: 'replace' });
    }

    try {
      await WorldChoirDB.ready();
      const fresh = await WorldChoirPassport.loadPassportData();
      passportData = fresh;

      // Avoid a full remount if user already switched chapters and content is warm.
      const current = resolveChapter(
        typeof PassportRoute !== 'undefined' ? PassportRoute.getPage() : activeChapter
      );
      paint(fresh, current, { animate: !cached && current !== 'story' });
    } catch (err) {
      console.error(err);
      if (!passportData) {
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
  }

  function init() {
    window.__passportShowChapter = showChapter;
    WorldChoirNav.startWatcher('profile');
    if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.start?.();
    mount();
  }

  return { init, showChapter };
})();
