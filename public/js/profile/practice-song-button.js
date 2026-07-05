/**
 * PracticeSongButton — large premium practice CTA
 */
const PracticeSongButton = (() => {
  const song = () => WorldChoirPracticeConfig.PRACTICE_SONG;

  function render() {
    const { title, artist } = song();
    return `
      <div class="practice-section profile-section" id="practice-song-section">
        <button class="btn btn-practice" id="practice-song-btn" type="button">
          Practice the Song
          <span class="btn-practice-sub">${escapeHtml(title)} · ${escapeHtml(artist)}</span>
        </button>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function mount(container, { onPractice }) {
    container.innerHTML = render();
    document.getElementById('practice-song-btn')?.addEventListener('click', onPractice);
  }

  return { render, mount };
})();
