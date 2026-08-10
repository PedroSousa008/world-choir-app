/**
 * Deprecated — Foundation Control Center lives in foundation-control.js.
 * Kept only so old cached HTML that still loads members.js does not crash.
 */
(function () {
  console.warn('[World Choir] members.js is deprecated. Use foundation-control.js / FoundationControl.');
  if (typeof FoundationControl !== 'undefined' && typeof FoundationControl.init === 'function') {
    FoundationControl.init();
  }
})();
