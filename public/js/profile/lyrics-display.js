/**
 * LyricsDisplay — synced lyrics with prev/current/next
 */
const LyricsDisplay = (() => {
  let rafId = null;

  /** Active line = last entry whose start time has been reached (until the next start time). */
  function getLyricIndex(currentTime, lyrics) {
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        return i;
      }
    }
    return -1;
  }

  function renderShell() {
    return `
      <div class="practice-playing" id="practice-playing">
        <div class="lyrics-display" id="lyrics-display">
          <div class="lyrics-display__row" aria-hidden="true">
            <span class="lyrics-display__wave lyrics-display__wave--left">
              <svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0"  y="14" width="4" height="12" rx="2" fill="currentColor"/>
                <rect x="6"  y="8"  width="4" height="24" rx="2" fill="currentColor"/>
                <rect x="12" y="4"  width="4" height="32" rx="2" fill="currentColor"/>
                <rect x="18" y="10" width="4" height="20" rx="2" fill="currentColor"/>
                <rect x="24" y="16" width="4" height="8"  rx="2" fill="currentColor"/>
              </svg>
            </span>
            <p class="lyrics-display__current" id="lyric-current">&nbsp;</p>
            <span class="lyrics-display__wave lyrics-display__wave--right">
              <svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0"  y="16" width="4" height="8"  rx="2" fill="currentColor"/>
                <rect x="6"  y="10" width="4" height="20" rx="2" fill="currentColor"/>
                <rect x="12" y="4"  width="4" height="32" rx="2" fill="currentColor"/>
                <rect x="18" y="8"  width="4" height="24" rx="2" fill="currentColor"/>
                <rect x="24" y="14" width="4" height="12" rx="2" fill="currentColor"/>
              </svg>
            </span>
          </div>
          <p class="lyrics-display__prev" id="lyric-prev">&nbsp;</p>
          <p class="lyrics-display__next" id="lyric-next">&nbsp;</p>
        </div>
      </div>
    `;
  }

  function mount(container) {
    container.innerHTML = renderShell();
    update(0);
  }

  function update(currentTime) {
    const lyrics = WorldChoirPracticeConfig.PRACTICE_LYRICS;
    const index = getLyricIndex(currentTime, lyrics);

    const prevEl = document.getElementById('lyric-prev');
    const currentEl = document.getElementById('lyric-current');
    const nextEl = document.getElementById('lyric-next');
    if (!prevEl || !currentEl || !nextEl) return;

    const prev = index > 0 ? lyrics[index - 1].text : '';
    const current = index >= 0 ? lyrics[index].text : '';
    const next = index >= 0 && index < lyrics.length - 1 ? lyrics[index + 1].text : '';

    if (prevEl.textContent !== prev) prevEl.textContent = prev || '\u00a0';
    if (currentEl.textContent !== current) {
      currentEl.textContent = current || '\u00a0';
      currentEl.classList.toggle('is-active', !!current);
    }
    if (nextEl.textContent !== next) nextEl.textContent = next || '\u00a0';
  }

  function startSync(audio) {
    stopSync();
    if (audio) update(audio.currentTime);
    function tick() {
      if (audio) update(audio.currentTime);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopSync() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return { mount, update, startSync, stopSync };
})();
