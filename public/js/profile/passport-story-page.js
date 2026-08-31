/**
 * PassportStoryPage — next chapter after Stamps (placeholder for now).
 */
const PassportStoryPage = (() => {
  function render() {
    return `
      <header class="passport-header passport-header--story-spacer" aria-hidden="true">
        <div>
          <h1 class="passport-header__title">Passport</h1>
        </div>
      </header>
      <div class="passport-card-wrap">
        <div class="passport-story-stage" aria-label="Your story">
          <button
            type="button"
            class="passport-card__back"
            id="passport-story-back"
            aria-label="Go back to Passport stamps"
          >
            ←
          </button>
        </div>
      </div>
    `;
  }

  function goBack() {
    if (typeof PassportRoute !== 'undefined') {
      PassportRoute.go('stamps', { replace: true });
      return;
    }
    window.location.replace('passport.html?page=stamps');
  }

  function mount() {
    const root = document.getElementById('passport-story-root');
    if (!root) return;
    root.innerHTML = render();
    document.getElementById('passport-story-back')?.addEventListener('click', goBack);
  }

  function init() {
    WorldChoirNav.startWatcher('profile');
    mount();
  }

  return { init };
})();
