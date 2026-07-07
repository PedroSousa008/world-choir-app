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

  function syncFromDB() {
    if (typeof WorldChoirDB === 'undefined' || !WorldChoirDB.isPledgeLoaded()) {
      if (state !== 'loading') {
        state = 'loading';
        notify();
      }
      return state;
    }

    const next = WorldChoirDB.hasPledged() ? 'pledged' : 'not_pledged';
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
          state = 'not_pledged';
          notify();
        });

      window.addEventListener('wc-pledge-added', syncFromDB);
      window.addEventListener('wc-pledge-updated', syncFromDB);
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
