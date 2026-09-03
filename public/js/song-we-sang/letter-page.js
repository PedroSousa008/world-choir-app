/**
 * Song We Sang — letter page orchestration.
 * Fixed viewport: no page scroll; letter is scaled to fit.
 */
(() => {
  const content = SongWeSangLetterContent.LETTER_CONTENT;
  const TYPE_INTERVAL = SongWeSangLetterContent.TYPE_INTERVAL;

  let typingController = null;
  let fitScale = 1;
  let resizeTimer = 0;

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
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

  function measureFullLetterHeight(shell) {
    const probe = document.createElement('div');
    probe.className = 'sws-letter';
    probe.setAttribute('aria-hidden', 'true');
    const width = Math.max(shell.clientWidth, 200);
    probe.style.cssText = [
      'position:absolute',
      'visibility:hidden',
      'pointer-events:none',
      'left:-9999px',
      'top:0',
      `width:${width}px`,
      'transform:none',
    ].join(';');
    document.body.appendChild(probe);
    SongWeSangTypingEngine.renderFull(probe, content);
    const height = probe.scrollHeight;
    probe.remove();
    return Math.max(height, 1);
  }

  function applyLetterFit() {
    const shell = document.getElementById('sws-letter-shell');
    const visual = document.getElementById('sws-letter-visual');
    if (!shell || !visual) return;

    const available = shell.clientHeight;
    if (available < 40) return;

    const needed = measureFullLetterHeight(shell);
    fitScale = Math.min(1, available / needed);
    // Slight safety inset so nothing clips on odd font metrics
    fitScale = Math.max(0.35, fitScale * 0.98);

    visual.style.transformOrigin = 'top center';
    visual.style.transform = `scale(${fitScale})`;
  }

  function showFullLetter(visualRoot) {
    SongWeSangTypingEngine.renderFull(visualRoot, content);
    visualRoot.classList.add('sws-letter--complete');
    applyLetterFit();
  }

  function lockScroll() {
    const block = (event) => {
      event.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    document.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
      },
      { passive: false }
    );
    window.addEventListener('scroll', () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    });
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
    lockScroll();
    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(applyLetterFit, 80);
    });
    window.visualViewport?.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(applyLetterFit, 80);
    });

    try {
      await WorldChoirDB.ready();
    } catch (err) {
      console.warn('Song We Sang: DB ready failed', err);
    }

    const alreadyStarted = WorldChoirDB.hasStartedSongWeSangLetter();
    const reduceMotion = prefersReducedMotion();

    // Fit before paint of letter so first frame is scaled.
    applyLetterFit();

    if (alreadyStarted || reduceMotion) {
      showFullLetter(visualRoot);
      if (!WorldChoirDB.hasCompletedSongWeSangLetter()) {
        WorldChoirDB.markSongWeSangLetterCompleted();
      }
      return;
    }

    // First genuine open — mark started immediately so interruptions don't restart.
    WorldChoirDB.markSongWeSangLetterStarted();
    applyLetterFit();

    typingController = SongWeSangTypingEngine.start({
      container: visualRoot,
      content,
      intervalMs: TYPE_INTERVAL,
      showCaret: true,
      onComplete() {
        typingController = null;
        visualRoot.classList.add('sws-letter--complete');
        applyLetterFit();
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
