/**
 * World Choir — first-paint boot mode
 *
 * Default (test): brief black screen instead of skeletons.
 * To restore skeletons: set window.WC_SHOW_SKELETONS = true before this runs
 * (see the inline <script> in each page <head>).
 *
 * Tab handoff: WorldChoirNav can hold the black overlay until the shared
 * tab indicator finishes arriving, so the page “opens” with the indicator.
 */
const WorldChoirBoot = (() => {
  let done = false;
  let contentReady = false;
  let navGate = false;
  let safetyTimer = null;
  const readyWaiters = [];

  function showingSkeletons() {
    return window.WC_SHOW_SKELETONS === true;
  }

  function armSafety(ms = 2500) {
    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(() => {
      // Never leave the UI stuck behind a handoff gate.
      navGate = false;
      ready();
      if (!done) {
        contentReady = true;
        flush();
      }
    }, ms);
  }

  function flush() {
    if (done) return;
    if (!contentReady) return;
    if (navGate) return;
    done = true;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    document.documentElement.classList.remove('wc-booting', 'wc-boot-skeletons', 'wc-nav-handoff');
  }

  function ready() {
    if (contentReady) {
      flush();
      return;
    }
    contentReady = true;
    const waiters = readyWaiters.splice(0, readyWaiters.length);
    waiters.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    flush();
  }

  /** When true, Boot.ready() waits until the nav indicator arrives. */
  function setNavGate(active) {
    navGate = !!active;
    flush();
  }

  function whenContentReady(fn) {
    if (typeof fn !== 'function') return;
    if (contentReady) {
      fn();
      return;
    }
    readyWaiters.push(fn);
  }

  function isContentReady() {
    return contentReady;
  }

  // If the previous tab started a handoff, hold the black overlay until the indicator arrives.
  if (document.documentElement.classList.contains('wc-nav-handoff')) {
    navGate = true;
  }

  // Head already adds wc-booting; arm a safety clear so the overlay never sticks.
  if (document.documentElement.classList.contains('wc-booting')) {
    armSafety();
  }

  return {
    ready,
    armSafety,
    showingSkeletons,
    setNavGate,
    whenContentReady,
    isContentReady,
  };
})();
