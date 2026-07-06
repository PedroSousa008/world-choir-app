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
  }

  function refresh() {
    render();
  }

  function init() {
    WorldChoirDB.ready()
      .then(() => {
        ChangeLocationModal.init();
        PracticeMode.init();
        WorldChoirNav.startWatcher('profile');
        render();
        window.addEventListener('wc-pledge-added', refresh);
        window.addEventListener('wc-pledge-updated', refresh);
        window.addEventListener('wc-pledges-synced', refresh);
      })
      .catch((err) => {
        console.error('Failed to connect to World Choir database:', err);
        WorldChoirNav.startWatcher('profile');
      });
  }

  return { init, refresh };
})();
