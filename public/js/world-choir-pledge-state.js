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

  function resolveStateFromPledge(pledge) {
    if (pledge || userHasVoiceNumber(pledge)) return 'pledged';
    return 'not_pledged';
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
    const next = (WorldChoirDB.hasPledged?.() || userHasVoiceNumber(pledge))
      ? 'pledged'
      : 'not_pledged';
    if (state !== next) {
      state = next;
      notify();
    }
    return state;
  }

  async function resolveFromMyPledge() {
    if (typeof WorldChoirDB === 'undefined' || typeof WorldChoirDB.syncMyPledge !== 'function') {
      return syncFromDB();
    }
    try {
      await WorldChoirDB.syncMyPledge();
    } catch (err) {
      console.error('WorldChoirPledgeState syncMyPledge failed:', err);
    }
    return syncFromDB();
  }

  function init() {
    if (!initPromise) {
      initPromise = (typeof WorldChoirDB !== 'undefined'
        ? WorldChoirDB.ready()
        : Promise.resolve()
      )
        .then(syncFromDB)
        .catch(async (err) => {
          console.error('WorldChoirPledgeState init failed:', err);
          // Bootstrap may fail on map pledges while my-pledge still works — resolve CTA from that.
          await resolveFromMyPledge();
          // If still unknown, stay loading only briefly; never flash I'll Sing for pledged voices.
          if (state === 'loading' && typeof WorldChoirDB !== 'undefined' && WorldChoirDB.isPledgeLoaded()) {
            syncFromDB();
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
    resolveFromMyPledge,
    getState: () => state,
    isLoaded: () => state !== 'loading',
    isPledged: () => state === 'pledged',
    subscribe,
  };
})();
