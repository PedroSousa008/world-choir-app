/**
 * World Choir — first-paint boot mode
 *
 * Default (test): brief black screen instead of skeletons.
 * To restore skeletons: set window.WC_SHOW_SKELETONS = true before this runs
 * (see the inline <script> in each page <head>).
 */
const WorldChoirBoot = (() => {
  let done = false;
  let safetyTimer = null;

  function showingSkeletons() {
    return window.WC_SHOW_SKELETONS === true;
  }

  function armSafety(ms = 2500) {
    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(ready, ms);
  }

  function ready() {
    if (done) return;
    done = true;
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    document.documentElement.classList.remove('wc-booting', 'wc-boot-skeletons');
  }

  // Head already adds wc-booting; arm a safety clear so the overlay never sticks.
  if (document.documentElement.classList.contains('wc-booting')) {
    armSafety();
  }

  return { ready, armSafety, showingSkeletons };
})();
