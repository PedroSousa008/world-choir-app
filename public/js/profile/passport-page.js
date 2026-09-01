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

  function iconRoute() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 19h4l4-8 4 3 4-9"/>
      </svg>
    `;
  }

  function iconPlane() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2.5 12h5.5l2-6 3.5 10 2.5-6.5h5"/>
      </svg>
    `;
  }

  function iconGlobe() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18"/>
        <path d="M12 3c2.6 2.8 4 6 4 9s-1.4 6.2-4 9"/>
        <path d="M12 3c-2.6 2.8-4 6-4 9s1.4 6.2 4 9"/>
      </svg>
    `;
  }

  function iconCalendar() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="2"/>
        <path d="M8 3v4"/>
        <path d="M16 3v4"/>
        <path d="M4 10h16"/>
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

  function iconStamp() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 3h6v4.5H9z"/>
        <rect x="6.5" y="7.5" width="11" height="7.5" rx="1.5"/>
        <path d="M5.5 15h13v2.2a1.8 1.8 0 0 1-1.8 1.8H7.3a1.8 1.8 0 0 1-1.8-1.8V15z"/>
        <path d="M8.5 10.2h7"/>
        <path d="M8.5 12.4h4.8"/>
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

  function formatJourneyKm(n) {
    if (n == null || Number.isNaN(Number(n))) return '0';
    return Math.round(Number(n)).toLocaleString();
  }

  function defaultJourneyStats() {
    return { totalKm: 0, countries: 0, daysSinceBegan: 0 };
  }

  function renderJourneyStats(stats = {}) {
    const items = [
      {
        icon: iconPlane(),
        iconClass: 'km',
        value: formatJourneyKm(stats.totalKm),
        label: 'Total KM\nTravelled',
        valueAttr: 'data-ptw-stat-km',
      },
      {
        icon: iconGlobe(),
        iconClass: 'countries',
        value: Number(stats.countries) || 0,
        label: 'Countries',
      },
      {
        icon: iconCalendar(),
        iconClass: 'days',
        value: Number(stats.daysSinceBegan) || 0,
        label: 'Days Since the\nJourney Began',
      },
    ];

    return `
      <section class="passport-stats passport-stats--triple" aria-label="Pass the World journey statistics">
        ${items.map((stat) => `
          <div class="passport-stat">
            <div class="passport-stat__icon passport-stat__icon--${stat.iconClass}">${stat.icon}</div>
            <p class="passport-stat__value"${stat.valueAttr ? ` ${stat.valueAttr}` : ''}>${esc(String(stat.value))}</p>
            <p class="passport-stat__label">${stat.label}</p>
          </div>`).join('')}
      </section>`;
  }

  function liveJourneyTotalKm(payload, travelledKm) {
    if (!payload?.stats) return 0;
    if (payload.journey?.status !== 'TRAVELLING') return Number(payload.stats.totalKm) || 0;
    const fetchedTravelled = Number(payload.journey.progress?.travelledKm) || 0;
    const base = (Number(payload.stats.totalKm) || 0) - fetchedTravelled;
    return base + travelledKm;
  }

  function updateJourneyStatsKm(km) {
    const el = document.querySelector('#passport-story-view [data-ptw-stat-km]');
    if (el) el.textContent = formatJourneyKm(km);
  }

  async function fetchPassTheWorldStats() {
    try {
      let id = '';
      if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getDeviceId) {
        id = WorldChoirDB.getDeviceId() || '';
      }
      const params = new URLSearchParams({ eventId: 'world-choir-2027' });
      if (id) params.set('deviceId', id);
      const res = await fetch(`/api/pass-the-world?${params}`, { cache: 'no-store' });
      if (!res.ok) return defaultJourneyStats();
      const data = await res.json();
      return data.stats || defaultJourneyStats();
    } catch {
      return defaultJourneyStats();
    }
  }

  function updateJourneyStats(stats = {}) {
    const story = document.getElementById('passport-story-view');
    if (!story) return;
    const existing = story.querySelector('.passport-stats');
    const next = renderJourneyStats(stats);
    if (existing) {
      existing.outerHTML = next;
      return;
    }
    story.querySelector('#passport-story-permanence')?.insertAdjacentHTML('afterend', next);
  }

  async function refreshJourneyStats() {
    let stats = null;
    if (typeof PassTheWorld !== 'undefined' && PassTheWorld.getStats) {
      stats = PassTheWorld.getStats();
    }
    if (!stats) stats = await fetchPassTheWorldStats();
    updateJourneyStats(stats);
  }

  function renderStampsCollectedStat(data = {}) {
    return `
      <section class="passport-stats passport-stats--single" aria-label="Stamps collected">
        <div class="passport-stat">
          <div class="passport-stat__icon passport-stat__icon--stamps">${iconStamp()}</div>
          <p class="passport-stat__value">${esc(String(stampsEarnedCount(data)))}</p>
          <p class="passport-stat__label">Stamps\nCollected</p>
        </div>
      </section>`;
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

  function renderMainStats(data = {}, chapter = 'cover') {
    if (chapter === 'stamps') return renderStampsCollectedStat(data);
    return renderParticipationStats(data, { columns: 2 });
  }

  function updateMainStats(chapter = activeChapter) {
    const main = document.getElementById('passport-main');
    if (!main || !passportData || chapter === 'story') return;
    const statsChapter = chapter === 'stamps' ? 'stamps' : 'cover';
    const next = renderMainStats(passportData, statsChapter);
    const existing = main.querySelector('.passport-stats');
    if (existing) {
      existing.outerHTML = next;
      return;
    }
    main.querySelector('.passport-permanence')?.insertAdjacentHTML('afterend', next);
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

        ${renderJourneyStats()}
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
    const statsChapter = chapter === 'stamps' ? 'stamps' : 'cover';
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

        ${renderMainStats(data, statsChapter)}
      </div>
      ${renderStoryView(data)}
    `;
  }

  function updateInfoActionsVisibility(chapter = activeChapter) {
    const isStamps = chapter === 'stamps';
    const actions = document.getElementById('passport-info-actions');
    const download = document.getElementById('passport-action-download');
    const wallet = document.getElementById('passport-action-wallet');
    const share = document.getElementById('passport-action-share');
    const overlay = document.getElementById('passport-info-overlay');

    if (download) download.hidden = !isStamps;
    if (wallet) wallet.hidden = !isStamps;
    if (share) share.hidden = !isStamps;
    if (actions) {
      actions.hidden = !isStamps;
      actions.classList.toggle('passport-info-modal__actions--visible', isStamps);
    }
    overlay?.classList.toggle('is-stamps-actions', isStamps);
  }

  function updateStoryStats(data = {}) {
    refreshJourneyStats();
  }

  function openInfo() {
    updateInfoActionsVisibility();
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
      updateMainStats(next);
    }

    updateInfoActionsVisibility(next);

    if (syncUrl && typeof PassportRoute !== 'undefined') {
      PassportRoute.syncPassportHtmlUrl(next, { replace: historyMode !== 'push' });
    }
  }

  function mountPassTheWorld() {
    const host = document.getElementById('passport-story-host');
    if (!host || typeof PassTheWorld === 'undefined') return;
    if (PassTheWorld.isMounted?.() && host.querySelector('.ptw')) {
      if (typeof PassTheWorldMap !== 'undefined') PassTheWorldMap.invalidateSize?.();
      refreshJourneyStats();
      return;
    }
    PassTheWorld.mount(host).then(() => refreshJourneyStats()).catch(() => refreshJourneyStats());
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
    updateInfoActionsVisibility(activeChapter);
    WorldChoirNav.startWatcher('profile');
    if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.start?.();
    mount();
  }

  return { init, showChapter, updateJourneyStats, refreshJourneyStats, updateJourneyStatsKm, liveJourneyTotalKm };
})();
