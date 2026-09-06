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
    const count = typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getPresentationVoiceCount
      ? WorldChoirDB.getPresentationVoiceCount()
      : (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.isPledgesLoaded()
        ? WorldChoirDB.getMapStats(WorldChoirConfig.CURRENT_EVENT.id)?.voices
        : null);

    if (count == null || Number.isNaN(Number(count))) {
      return { text: '', loading: true };
    }

    const n = Number(count);
    const formatted = n.toLocaleString('en-US');
    const text = n === 1 ? '1 VOICE' : `${formatted} VOICES`;
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

    document.getElementById('profile-privacy-prefs')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof WorldChoirPrivacy !== 'undefined' && WorldChoirPrivacy.openPreferences) {
        WorldChoirPrivacy.openPreferences();
      } else {
        window.location.href = 'privacy-policy.html';
      }
    });

    const warm = typeof WorldChoirPledgeState !== 'undefined' && WorldChoirPledgeState.isLoaded();
    if (warm) {
      profileReady = true;
      render();
    } else {
      renderSkeleton();
    }

    window.addEventListener('wc-world-stats', updateVoicesCounter);
    window.addEventListener('wc-pledges-synced', updateVoicesCounter);
    window.addEventListener('wc-map-data-state', updateVoicesCounter);
    window.addEventListener('wc-pledge-added', () => {
      updateVoicesCounter();
      void WorldChoirDB.fetchWorldStats?.().catch(() => {});
    });
    window.addEventListener('wc-voices-live-update', updateVoicesCounter);

    // Profile Voice counter via /api/stats — skip full pledge live sync on this page.
    if (typeof WorldChoirDB.startWorldStatsRefresh === 'function') {
      WorldChoirDB.startWorldStatsRefresh({ intervalMs: 5000 });
    } else {
      void WorldChoirDB.fetchWorldStats?.().then(() => updateVoicesCounter()).catch(() => {});
    }

    const fallback = setTimeout(() => revealProfile(), 220);

    WorldChoirPledgeState.init({ mode: 'myPledge' })
      .then(async () => {
        clearTimeout(fallback);
        revealProfile();
        WorldChoirPledgeState.subscribe(() => refresh());
        maybeOpenPracticeFromQuery();
        if (typeof WorldChoirPracticeConfig !== 'undefined') {
          WorldChoirPracticeConfig.scheduleWarmPracticeAudio?.();
        }
      })
      .catch((err) => {
        clearTimeout(fallback);
        console.error('Failed to connect to World Choir database:', err);
        revealProfile();
        maybeOpenPracticeFromQuery();
        if (typeof WorldChoirPracticeConfig !== 'undefined') {
          WorldChoirPracticeConfig.scheduleWarmPracticeAudio?.();
        }
      });
  }

  return { init, refresh };
})();
