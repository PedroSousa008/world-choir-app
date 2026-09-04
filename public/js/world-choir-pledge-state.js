/**
 * World Choir — shared current-user pledge state (loading | pledged | not_pledged)
 */
const WorldChoirPledgeState = (() => {
  /** @type {'loading' | 'pledged' | 'not_pledged'} */
  let state = 'loading';
  const listeners = new Set();
  let initPromise = null;

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error('WorldChoirPledgeState listener error:', err);
      }
    });
    window.dispatchEvent(new CustomEvent('wc-pledge-state', { detail: state }));
  }

  function userHasVoiceNumber(pledge) {
    if (!pledge) return false;
    const n = pledge.voiceNumber ?? pledge.voice_number;
    return n != null && n !== '' && Number(n) > 0;
  }

  function syncFromDB() {
    if (typeof WorldChoirDB === 'undefined' || !WorldChoirDB.isPledgeLoaded()) {
      if (state !== 'loading') {
        state = 'loading';
        notify();
      }
      return state;
    }

    const pledge = typeof WorldChoirDB.getPledgeForCurrentUser === 'function'
      ? WorldChoirDB.getPledgeForCurrentUser()
      : null;
    const next = (WorldChoirDB.hasPledged() || userHasVoiceNumber(pledge))
      ? 'pledged'
      : 'not_pledged';
    if (state !== next) {
      state = next;
      notify();
    }
    return state;
  }

  function init() {
    if (!initPromise) {
      initPromise = (typeof WorldChoirDB !== 'undefined'
        ? WorldChoirDB.ready()
        : Promise.resolve()
      )
        .then(syncFromDB)
        .catch((err) => {
          console.error('WorldChoirPledgeState init failed:', err);
          // Do not assume not_pledged — keep loading so Home never flashes "I'll Sing"
          // for people who already have a Voice number.
          if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.isPledgeLoaded()) {
            syncFromDB();
          } else if (state !== 'loading') {
            state = 'loading';
            notify();
          }
        });

      window.addEventListener('wc-pledge-added', syncFromDB);
      window.addEventListener('wc-pledge-updated', syncFromDB);
      window.addEventListener('wc-pledges-synced', syncFromDB);
    }
    return initPromise;
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  }

  return {
    init,
    refresh: syncFromDB,
    getState: () => state,
    isLoaded: () => state !== 'loading',
    isPledged: () => state === 'pledged',
    subscribe,
  };
})();
