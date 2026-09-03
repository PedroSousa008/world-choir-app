/**
 * Song We Sang — letter page orchestration.
 */
(() => {
  const content = SongWeSangLetterContent.LETTER_CONTENT;
  const TYPE_INTERVAL = SongWeSangLetterContent.LETTER_CHARACTER_INTERVAL_MS || SongWeSangLetterContent.TYPE_INTERVAL;

  let typingController = null;
  let followScroll = true;
  let scrollBound = false;

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  }

  function isNearBottom(thresholdPx = 96) {
    const doc = document.documentElement;
    const scrollBottom = window.scrollY + window.innerHeight;
    return scrollBottom >= doc.scrollHeight - thresholdPx;
  }

  function softFollowCaret() {
    if (!followScroll || !isNearBottom()) return;
    const caret = document.querySelector('.sws-letter__caret');
    const anchor = caret || document.getElementById('sws-letter-visual')?.lastElementChild;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 48) {
      window.scrollBy({ top: Math.min(rect.bottom - window.innerHeight + 64, 48), behavior: 'auto' });
    }
  }

  function bindScrollGuard() {
    if (scrollBound) return;
    scrollBound = true;
    let lastY = window.scrollY;
    window.addEventListener(
      'scroll',
      () => {
        const y = window.scrollY;
        if (y < lastY - 8) followScroll = false;
        else if (isNearBottom(64)) followScroll = true;
        lastY = y;
      },
      { passive: true }
    );
  }

  function fillSrLetter(srRoot) {
    if (!srRoot) return;
    srRoot.textContent = '';
    const title = document.createElement('h1');
    title.textContent = content.pageTitle || 'The Song We Sang';
    srRoot.appendChild(title);
    const body = document.createElement('div');
    srRoot.appendChild(body);
    SongWeSangTypingEngine.renderFull(body, content);
  }

  function showFullLetter(visualRoot) {
    SongWeSangTypingEngine.renderFull(visualRoot, content);
    visualRoot.classList.add('sws-letter--complete');
  }

  function cleanup() {
    if (typingController) {
      typingController.cancel();
      typingController = null;
    }
  }

  async function init() {
    const visualRoot = document.getElementById('sws-letter-visual');
    const srRoot = document.getElementById('sws-letter-sr');
    const titleEl = document.getElementById('sws-page-title');
    if (!visualRoot) return;

    if (titleEl && content.pageTitle) {
      titleEl.textContent = content.pageTitle;
    }

    fillSrLetter(srRoot);
    bindScrollGuard();
    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);

    try {
      await WorldChoirDB.ready();
    } catch (err) {
      console.warn('Song We Sang: DB ready failed', err);
    }

    const alreadyStarted = WorldChoirDB.hasStartedSongWeSangLetter();
    const reduceMotion = prefersReducedMotion();

    if (alreadyStarted || reduceMotion) {
      showFullLetter(visualRoot);
      if (!WorldChoirDB.hasCompletedSongWeSangLetter()) {
        WorldChoirDB.markSongWeSangLetterCompleted();
      }
      return;
    }

    // First genuine open — mark started immediately so interruptions don't restart.
    WorldChoirDB.markSongWeSangLetterStarted();

    typingController = SongWeSangTypingEngine.start({
      container: visualRoot,
      content,
      intervalMs: TYPE_INTERVAL,
      showCaret: true,
      onChar() {
        softFollowCaret();
      },
      onComplete() {
        typingController = null;
        visualRoot.classList.add('sws-letter--complete');
        WorldChoirDB.markSongWeSangLetterCompleted();
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
