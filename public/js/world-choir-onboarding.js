/**
 * WorldChoirOnboarding — first-time introduction + Profile replay.
 *
 * Modes:
 * - firstTime: mark hasCompletedWorldChoirOnboarding when finished
 * - replay: never mutate completion; return to Profile (or caller onDone)
 */
const WorldChoirOnboarding = (() => {
  const CARDS = [
    {
      kicker: '01',
      title: 'One world. One song.',
      body: 'For a few minutes, people everywhere will come together to sing the same song at the exact same moment.',
      hint: 'Tap anywhere to continue',
    },
    {
      kicker: '02',
      title: 'Your voice matters',
      body: 'Tap “I’ll Sing” to become part of World Choir.\n\nThe moment you join, you become part of a global choir preparing to sing together.',
    },
    {
      kicker: '03',
      title: 'This is your voice',
      body: 'You’ll receive your own unique Voice Number.\n\nA simple reminder that you are not just watching this moment.\n\nYou are part of it.',
    },
    {
      kicker: '04',
      title: 'See the world join',
      body: 'Every real participant becomes part of the World Choir map.\n\nWatch voices from around the world come together, one by one.',
    },
    {
      kicker: '05',
      title: 'Practice before the moment',
      body: 'Before the event, you’ll be able to learn the song and follow along at your own pace.\n\nSo when the moment arrives, you’re ready to sing with the world.',
    },
    {
      kicker: '06',
      title: 'When the time comes, sing',
      body: 'On the day of the event, the music and lyrics will guide everyone through the same song — wherever they are in the world.\n\nMillions of voices.\n\nOne shared moment.',
    },
    {
      kicker: '07',
      title: 'When the song ends',
      body: 'The moment doesn’t have to end with the music.\n\nYou’ll have the opportunity to make a promise to the world and become part of the memory we create together.',
    },
    {
      kicker: '08',
      title: 'A moment we create together',
      body: 'World Choir is about connection, humanity and reminding ourselves that, despite everything that separates us, we are still capable of coming together.',
      closing: 'Let’s sing.',
    },
  ];

  const TOTAL = CARDS.length;
  const TRANSITION_MS = 220;

  let open = false;
  let index = 0;
  let mode = 'firstTime';
  let locked = false;
  let onDone = null;
  let rootEl = null;

  function logoSrc() {
    if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO?.src) {
      return WorldChoirConfig.LOGO.src;
    }
    return 'images/world-choir-logo.png?v=20270706';
  }

  function ensureShell() {
    if (rootEl) return rootEl;
    rootEl = document.createElement('div');
    rootEl.id = 'wc-onboarding';
    rootEl.className = 'wc-onboarding';
    rootEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(rootEl);
    return rootEl;
  }

  function formatProgress(i) {
    const current = String(i + 1).padStart(2, '0');
    const total = String(TOTAL).padStart(2, '0');
    return `${current} — ${total}`;
  }

  function renderCardInner(i) {
    const card = CARDS[i];
    const bodyHtml = String(card.body || '')
      .split(/\n\n+/)
      .map((p) => `<p class="wc-onboarding__copy">${escapeHtml(p)}</p>`)
      .join('');

    return `
      <p class="wc-onboarding__progress">${escapeHtml(formatProgress(i))}</p>
      <div class="wc-onboarding__content">
        <h1 class="wc-onboarding__title">${escapeHtml(card.title)}</h1>
        ${bodyHtml}
        ${card.closing ? `<p class="wc-onboarding__closing">${escapeHtml(card.closing)}</p>` : ''}
        ${card.hint ? `<p class="wc-onboarding__hint">${escapeHtml(card.hint)}</p>` : ''}
      </div>
      <div class="wc-onboarding__logo-wrap">
        <img class="wc-onboarding__logo" src="${escapeHtml(logoSrc())}" alt="World Choir" width="1024" height="1024" decoding="async">
      </div>
    `;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function syncChrome() {
    const shell = ensureShell();
    let back = shell.querySelector('#wc-onboarding-back');
    if (index > 0) {
      if (!back) {
        back = document.createElement('button');
        back.type = 'button';
        back.className = 'wc-onboarding__back';
        back.id = 'wc-onboarding-back';
        back.setAttribute('aria-label', 'Previous');
        back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        shell.querySelector('.wc-onboarding__stage')?.appendChild(back);
        back.addEventListener('click', (e) => {
          e.stopPropagation();
          goBack();
        });
      }
      back.hidden = false;
    } else if (back) {
      back.hidden = true;
    }
  }

  function renderFrame() {
    const shell = ensureShell();
    shell.innerHTML = `
      <div class="wc-onboarding__stage" id="wc-onboarding-stage">
        <button type="button" class="wc-onboarding__tap" id="wc-onboarding-tap" aria-label="Continue">
          <div class="wc-onboarding__card is-active" data-card-index="${index}" role="group" aria-label="Introduction ${index + 1} of ${TOTAL}">
            ${renderCardInner(index)}
          </div>
        </button>
        ${mode === 'replay' ? `
          <button type="button" class="wc-onboarding__close" id="wc-onboarding-close" aria-label="Close">Close</button>
        ` : ''}
      </div>
    `;
    bindFrame();
    syncChrome();
  }

  function bindFrame() {
    document.getElementById('wc-onboarding-tap')?.addEventListener('click', (e) => {
      if (e.target.closest('#wc-onboarding-back') || e.target.closest('#wc-onboarding-close')) return;
      advance();
    });
    document.getElementById('wc-onboarding-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(false);
    });
  }

  function transitionTo(nextIndex, direction) {
    if (!open || locked) return;
    locked = true;

    const tap = document.getElementById('wc-onboarding-tap');
    const current = tap?.querySelector('.wc-onboarding__card.is-active');
    if (!tap || !current) {
      index = nextIndex;
      renderFrame();
      locked = false;
      return;
    }

    const incoming = document.createElement('div');
    incoming.className = `wc-onboarding__card is-enter is-enter-${direction}`;
    incoming.dataset.cardIndex = String(nextIndex);
    incoming.setAttribute('role', 'group');
    incoming.setAttribute('aria-label', `Introduction ${nextIndex + 1} of ${TOTAL}`);
    incoming.innerHTML = renderCardInner(nextIndex);

    // Keep both cards stacked so the stage never flashes to empty black.
    current.classList.remove('is-active');
    current.classList.add(direction === 'forward' ? 'is-exit-left' : 'is-exit-right');
    tap.appendChild(incoming);

    // Force reflow so enter transition starts cleanly.
    void incoming.offsetWidth;
    incoming.classList.add('is-active');
    incoming.classList.remove('is-enter', `is-enter-${direction}`);

    window.setTimeout(() => {
      current.remove();
      index = nextIndex;
      syncChrome();
      locked = false;
    }, TRANSITION_MS);
  }

  function advance() {
    if (!open || locked) return;
    if (index >= TOTAL - 1) {
      finish(true);
      return;
    }
    transitionTo(index + 1, 'forward');
  }

  function goBack() {
    if (!open || locked || index <= 0) return;
    transitionTo(index - 1, 'back');
  }

  async function finish(reachedEnd) {
    if (!open) return;
    open = false;
    locked = true;

    if (mode === 'firstTime' && reachedEnd) {
      try {
        if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.completeWorldChoirOnboarding) {
          await WorldChoirDB.completeWorldChoirOnboarding();
        }
      } catch (err) {
        console.error('Could not persist onboarding completion:', err);
      }
    }

    const shell = ensureShell();
    shell.classList.remove('is-open');
    shell.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-onboarding-open');
    shell.innerHTML = '';
    locked = false;

    const cb = onDone;
    onDone = null;
    if (typeof cb === 'function') cb({ mode, reachedEnd });
    if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.refreshBanner?.();
  }

  function openOnboarding(options = {}) {
    mode = options.mode === 'replay' ? 'replay' : 'firstTime';
    onDone = typeof options.onDone === 'function' ? options.onDone : null;
    index = 0;
    locked = false;
    open = true;

    const shell = ensureShell();
    renderFrame();
    shell.classList.add('is-open');
    shell.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-onboarding-open');
  }

  function maybeStartFirstTime(options = {}) {
    try {
      if (typeof WorldChoirDB === 'undefined') return false;
      if (!WorldChoirDB.needsWorldChoirOnboarding || !WorldChoirDB.needsWorldChoirOnboarding()) {
        return false;
      }
      openOnboarding({
        mode: 'firstTime',
        onDone: options.onDone,
      });
      return true;
    } catch {
      return false;
    }
  }

  function openReplay(options = {}) {
    openOnboarding({
      mode: 'replay',
      onDone: options.onDone,
    });
  }

  function isOpen() {
    return open;
  }

  return {
    maybeStartFirstTime,
    openReplay,
    isOpen,
  };
})();
