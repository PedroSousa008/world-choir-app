/**
 * ProfilePage — orchestrates all profile sections
 */
const ProfilePage = (() => {
  const SECTIONS = {
    identity: 'profile-identity-root',
    participation: 'profile-participation-root',
    practice: 'profile-practice-root',
    promise: 'profile-promise-root',
    history: 'profile-history-root',
    invite: 'profile-invite-root',
    dailyActs: 'profile-daily-acts-root',
  };

  function render() {
    UserIdentityCard.mount(document.getElementById(SECTIONS.identity), {
      onChangeLocation: () => {
        ChangeLocationModal.open({
          mode: 'change',
          onSuccess: () => refresh(),
        });
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

    PromiseCard.mount(document.getElementById(SECTIONS.promise));
    WorldChoirHistory.mount(document.getElementById(SECTIONS.history));
    InviteButton.mount(document.getElementById(SECTIONS.invite));
    DailyActsButton.mount(document.getElementById(SECTIONS.dailyActs));
  }

  function refresh() {
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
    // Instant first paint — same idea as Donate.
    ChangeLocationModal.init();
    PracticeMode.init();
    DailyActsPeace.init();
    OwnerAccess.init();
    WorldChoirNav.startWatcher('profile');
    render();

    WorldChoirPledgeState.init()
      .then(() => {
        refresh();
        WorldChoirPledgeState.subscribe(() => refresh());
        maybeOpenPracticeFromQuery();
      })
      .catch((err) => {
        console.error('Failed to connect to World Choir database:', err);
        refresh();
      });
  }

  return { init, refresh };
})();
