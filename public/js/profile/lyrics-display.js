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
    const { title, artist } = WorldChoirPracticeConfig.PRACTICE_SONG;
    return `
      <div class="practice-playing" id="practice-playing">
        <div class="lyrics-display" id="lyrics-display">
          <p class="lyrics-display__prev" id="lyric-prev">&nbsp;</p>
          <p class="lyrics-display__current" id="lyric-current">&nbsp;</p>
          <p class="lyrics-display__next" id="lyric-next">&nbsp;</p>
          <p class="lyrics-display__song">${title} · ${artist}</p>
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
