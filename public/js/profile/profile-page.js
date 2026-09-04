/**
 * ProfilePage — orchestrates all profile sections
 */
const ProfilePage = (() => {
  const SECTIONS = {
    identity: 'profile-identity-root',
    participation: 'profile-participation-root',
    practice: 'profile-practice-root',
    history: 'profile-history-root',
    invite: 'profile-invite-root',
    dailyActs: 'profile-daily-acts-root',
  };

  let profileReady = false;

  function getVoicesCounterContent() {
    if (typeof WorldChoirDB === 'undefined' || !WorldChoirDB.isPledgesLoaded()) {
      return { text: '', loading: true };
    }

    const stats = WorldChoirDB.getMapStats(WorldChoirConfig.CURRENT_EVENT.id);
    const count = stats?.voices ?? 0;
    const formatted = count.toLocaleString('en-US');
    const text = count === 1 ? '1 VOICE' : `${formatted} VOICES`;
    return { text, loading: false };
  }

  function updateVoicesCounter() {
    const el = document.getElementById('profile-voices-counter');
    if (!el) return;

    const { text, loading } = getVoicesCounterContent();
    if (loading) {
      el.className = 'wc-skel wc-skel--voices';
      el.textContent = '';
      el.setAttribute('aria-hidden', 'true');
      return;
    }

    el.className = 'profile-voices-counter';
    el.removeAttribute('aria-hidden');
    const prev = el.textContent;
    el.textContent = text;
    el.classList.toggle('profile-voices-counter--loading', false);

    if (text !== prev && prev) {
      el.classList.remove('profile-voices-counter--bump');
      void el.offsetWidth;
      el.classList.add('profile-voices-counter--bump');
    }
  }

  function renderSkeleton() {
    updateVoicesCounter();
    const card = `
      <div class="wc-skel-card wc-skel-card--row" aria-hidden="true">
        <span class="wc-skel wc-skel--avatar"></span>
        <span style="flex:1;min-width:0">
          <span class="wc-skel wc-skel--line wc-skel--line-mid"></span>
          <span class="wc-skel wc-skel--line wc-skel--line-short"></span>
        </span>
      </div>`;
    const block = `
      <div class="wc-skel-card" aria-hidden="true">
        <span class="wc-skel wc-skel--line wc-skel--line-mid"></span>
        <span class="wc-skel wc-skel--line"></span>
        <span class="wc-skel wc-skel--line wc-skel--line-short"></span>
      </div>`;

    Object.entries(SECTIONS).forEach(([key, id], index) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = index === 0 ? card : block;
    });
  }

  function render() {
    updateVoicesCounter();

    UserIdentityCard.mount(document.getElementById(SECTIONS.identity), {
      onChangeLocation: () => {
        ChangeLocationModal.open({
          mode: 'change',
          onSuccess: () => refresh(),
        });
      },
      onOpenPassport: () => {
        window.location.href = 'passport.html';
      },
    });

    ParticipationStatusCard.mount(document.getElementById(SECTIONS.participation), {
      onIllSing: () => {
        ChangeLocationModal.open({
          mode: 'pledge',
          onSuccess: () => refresh(),
        });
      },
    });

    PracticeSongButton.mount(document.getElementById(SECTIONS.practice), {
      onPractice: () => {
        PracticeMode.open({ onExit: () => {} });
      },
    });

    WorldChoirHistory.mount(document.getElementById(SECTIONS.history));
    InviteButton.mount(document.getElementById(SECTIONS.invite));
    DailyActsButton.mount(document.getElementById(SECTIONS.dailyActs));
  }

  function refresh() {
    render();
  }

  function revealProfile() {
    if (profileReady) {
      refresh();
      return;
    }
    profileReady = true;
    render();
  }

  function maybeOpenPracticeFromQuery() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('practice') !== '1') return;
      PracticeMode.open({ onExit: () => {} });
      const url = new URL(window.location.href);
      url.searchParams.delete('practice');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
  }

  function init() {
    ChangeLocationModal.init();
    PracticeMode.init();
    DailyActsPeace.init();
    OwnerAccess.init();
    WorldChoirNav.startWatcher('profile');

    const warm = typeof WorldChoirPledgeState !== 'undefined' && WorldChoirPledgeState.isLoaded();
    if (warm) {
      profileReady = true;
      render();
    } else {
      renderSkeleton();
    }

    window.addEventListener('wc-pledges-synced', updateVoicesCounter);
    window.addEventListener('wc-map-data-state', updateVoicesCounter);
    window.addEventListener('wc-pledge-added', updateVoicesCounter);
    window.addEventListener('wc-voices-live-update', updateVoicesCounter);
    WorldChoirDB.startLiveSync({ intervalMs: 2000 });

    const fallback = setTimeout(() => revealProfile(), 220);

    WorldChoirPledgeState.init()
      .then(async () => {
        clearTimeout(fallback);
        revealProfile();
        WorldChoirPledgeState.subscribe(() => refresh());
        maybeOpenPracticeFromQuery();
      })
      .catch((err) => {
        clearTimeout(fallback);
        console.error('Failed to connect to World Choir database:', err);
        revealProfile();
        maybeOpenPracticeFromQuery();
      });
  }

  return { init, refresh };
})();
