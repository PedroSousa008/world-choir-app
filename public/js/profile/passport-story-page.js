/**
 * PassportStoryPage — next chapter after Stamps (placeholder for now).
 */
const PassportStoryPage = (() => {
  function render() {
    return `
      <header class="passport-story-header">
        <button
          type="button"
          class="passport-story-back"
          id="passport-story-back"
          aria-label="Go back to Passport stamps"
        >
          ← Go back
        </button>
      </header>
    `;
  }

  function goBack() {
    window.location.href = 'passport.html?page=stamps';
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
