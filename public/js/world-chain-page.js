/**
 * World Chain — dedicated page (Home carousel entry).
 * Matches World Choir Home visual system; consumes /api/world-chain.
 */
const WorldChainPage = (() => {
  let state = {
    loading: true,
    error: null,
    data: null,
    view: 'landing', // landing | detail
    activeChainId: null,
    busy: false,
    feedback: null,
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deviceId() {
    return typeof WorldChoirDB !== 'undefined' ? (WorldChoirDB.getDeviceId?.() || '') : '';
  }

  function eventId() {
    return typeof WorldChoirConfig !== 'undefined'
      ? (WorldChoirConfig.CURRENT_EVENT?.id || 'world-choir-2027')
      : 'world-choir-2027';
  }

  function flagCircle(country, extraClass = '') {
    const url = typeof WorldChoirFlags !== 'undefined'
      ? WorldChoirFlags.flagCircleUrl(country)
      : null;
    const cls = `wc-chain-route__flag ${extraClass}`.trim();
    if (!url) {
      return `<span class="${cls} wc-chain-route__flag--empty" title="${esc(country)}" aria-hidden="true"></span>`;
    }
    return `<span class="${cls}" title="${esc(country)}"><img src="${esc(url)}" alt="" width="20" height="20" loading="lazy" decoding="async"></span>`;
  }

  function flagDest(country) {
    const url = typeof WorldChoirFlags !== 'undefined'
      ? WorldChoirFlags.flagCircleUrl(country)
      : null;
    if (!url) {
      return `<span class="wc-chain-turn__dest-flag wc-chain-turn__dest-flag--empty" aria-hidden="true"></span>`;
    }
    return `<span class="wc-chain-turn__dest-flag" aria-hidden="true"><img src="${esc(url)}" alt="" width="44" height="44" loading="lazy" decoding="async"></span>`;
  }

  function statusDotClass(status) {
    if (status === 'STUCK') return 'wc-chain-card__dot--stuck';
    if (status === 'COMPLETED') return 'wc-chain-card__dot--completed';
    return '';
  }

  function statusLabel(status) {
    if (status === 'IN_PROGRESS') return 'IN PROGRESS';
    if (status === 'STUCK') return 'STUCK';
    if (status === 'COMPLETED') return 'COMPLETED';
    if (status === 'EXPIRED') return 'EXPIRED';
    return status || '';
  }

  function renderRoute(route = []) {
    if (!route.length) return '';
    const parts = [];
    route.forEach((step, i) => {
      const flagClass = step.status === 'connected'
        ? 'is-connected'
        : (step.status === 'active' || step.status === 'selected')
          ? 'is-active'
          : '';
      parts.push(flagCircle(step.country, flagClass));
      if (i < route.length - 1) {
        const lineClass = step.status === 'connected' ? 'is-connected' : 'is-future';
        parts.push(`<span class="wc-chain-route__line ${lineClass}" aria-hidden="true"></span>`);
      }
    });
    return `<div class="wc-chain-route" role="img" aria-label="World Chain route">${parts.join('')}</div>`;
  }

  function renderEarth() {
    return `
      <div class="wc-chain-earth" aria-hidden="true">
        <svg class="wc-chain-earth__arcs" viewBox="0 0 100 100" fill="none">
          <path d="M28 32 C 48 18, 62 22, 74 40" stroke="rgba(78,197,232,0.55)" stroke-width="1.2"/>
          <path d="M32 36 C 40 55, 55 62, 68 58" stroke="rgba(78,197,232,0.4)" stroke-width="1.1"/>
          <path d="M40 68 C 55 78, 70 70, 78 52" stroke="rgba(61,124,255,0.35)" stroke-width="1.1"/>
        </svg>
        <span class="wc-chain-earth__node wc-chain-earth__node--1"></span>
        <span class="wc-chain-earth__node wc-chain-earth__node--2"></span>
        <span class="wc-chain-earth__node wc-chain-earth__node--3"></span>
        <span class="wc-chain-earth__node wc-chain-earth__node--4"></span>
      </div>
    `;
  }

  function renderOverview(overview = {}) {
    return `
      <div class="wc-chain-overview" aria-label="Today's World Chain overview">
        <div class="wc-chain-overview__cell">
          <span class="wc-chain-overview__value">${esc(overview.chainsToday ?? 0)}</span>
          <span class="wc-chain-overview__label">Chains<br>Today</span>
        </div>
        <div class="wc-chain-overview__cell">
          <span class="wc-chain-overview__value">${esc(overview.completed ?? 0)}</span>
          <span class="wc-chain-overview__label">Completed</span>
        </div>
        <div class="wc-chain-overview__cell">
          <span class="wc-chain-overview__value">${esc(overview.inProgress ?? 0)}</span>
          <span class="wc-chain-overview__label">In Progress</span>
        </div>
        <div class="wc-chain-overview__cell">
          <span class="wc-chain-overview__value">${esc(overview.stuck ?? 0)}</span>
          <span class="wc-chain-overview__label">Stuck</span>
        </div>
      </div>
    `;
  }

  function renderCard(chain) {
    return `
      <article class="wc-chain-card" data-chain-id="${esc(chain.id)}">
        <div class="wc-chain-card__head">
          <div>
            <h3 class="wc-chain-card__title">WORLD CHAIN #${esc(chain.dailyChainNumber)}</h3>
            <p class="wc-chain-card__status">
              <span class="wc-chain-card__dot ${statusDotClass(chain.status)}" aria-hidden="true"></span>
              ${esc(statusLabel(chain.status))}
            </p>
          </div>
          <p class="wc-chain-card__timer">${esc(chain.timerLabel || '')}</p>
        </div>
        ${renderRoute(chain.route)}
        <p class="wc-chain-card__meta">
          ${esc(chain.countries)} countries · ${esc(chain.connections)} connections<br>
          ${esc(chain.routeSummary || '')}
        </p>
        <button type="button" class="wc-chain-card__cta" data-open-chain="${esc(chain.id)}">
          ${esc(chain.cta || 'WATCH LIVE')} →
        </button>
      </article>
    `;
  }

  function renderLanding() {
    const data = state.data;
    if (!data) {
      return `
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
      `;
    }

    const chains = data.chains || [];
    const limitedEmpty = data.limited && chains.length === 0;

    return `
      <header class="wc-chain-topbar">
        <a class="wc-chain-back" href="index.html" aria-label="Back to Home">←</a>
        <h1 class="wc-chain-brand">World Chain</h1>
        <span class="wc-chain-topbar__spacer" aria-hidden="true"></span>
      </header>

      <h2 class="wc-chain-headline">A more connected world<br>is a kinder world.</h2>
      <p class="wc-chain-sub">Real people. Real connections.<br>A global chain of voices.</p>

      ${renderEarth()}
      ${renderOverview(data.overview)}

      <button type="button" class="wc-chain-explore" data-scroll-chains>
        EXPLORE TODAY'S CHAINS →
      </button>

      <h2 class="wc-chain-section-title" id="wc-chain-happening">Happening Now</h2>

      ${limitedEmpty ? `
        <div class="wc-chain-empty">
          <h3 class="wc-chain-empty__title">World Chain is growing</h3>
          <p class="wc-chain-empty__copy">
            As more Voices join from more countries, today's chains will appear here.
            World Chain never invents connections — it only uses the real world that has already joined.
          </p>
        </div>
      ` : `
        <div class="wc-chain-list">
          ${chains.map(renderCard).join('')}
        </div>
      `}
    `;
  }

  function findChain(id) {
    return (state.data?.chains || []).find((c) => c.id === id) || null;
  }

  function renderTurnPanel(chain) {
    const viewer = chain.viewer || {};
    const route = chain.route || [];
    const active = route.find((s) => s.status === 'active')
      || (viewer.needsStart ? route[1] : null);
    if (!active) return '';

    if (viewer.needsStart) {
      return `
        <section class="wc-chain-turn">
          <p class="wc-chain-turn__eyebrow">You've been selected</p>
          <p class="wc-chain-turn__copy">You're starting one of today's World Chains.</p>
          <p class="wc-chain-turn__eyebrow">Your first destination is…</p>
          <p class="wc-chain-turn__dest">${flagDest(active.country)}</p>
          <p class="wc-chain-turn__country">${esc(active.country)}</p>
          <button type="button" class="wc-chain-primary" data-accept-start="${esc(chain.id)}" ${state.busy ? 'disabled' : ''}>
            START WORLD CHAIN
          </button>
        </section>
      `;
    }

    if (!viewer.isActiveTurn) return '';

    const isFinal = !!active.requiredCity;
    return `
      <section class="wc-chain-turn">
        <p class="wc-chain-turn__eyebrow">It's your turn</p>
        <p class="wc-chain-turn__copy">World Chain #${esc(chain.dailyChainNumber)} needs you.</p>
        <p class="wc-chain-turn__eyebrow">${isFinal ? 'Final connection' : 'Your next destination'}</p>
        <p class="wc-chain-turn__dest">${flagDest(active.country)}</p>
        <p class="wc-chain-turn__country">${esc(active.country)}</p>
        ${isFinal ? `<p class="wc-chain-turn__copy">📍 ${esc(active.requiredCity)}</p>` : ''}
        <p class="wc-chain-turn__copy">
          Find someone you know ${isFinal ? `in ${esc(active.requiredCity)}` : `in ${esc(active.country)}`}
          who is already an eligible World Choir Voice.
        </p>
        <form class="wc-chain-form" data-connect-form="${esc(chain.id)}">
          <label for="wc-chain-voice-input">Voice Number</label>
          <input id="wc-chain-voice-input" name="voiceNumber" inputmode="numeric" autocomplete="off" placeholder="# __________" required>
          <button type="submit" class="wc-chain-primary" ${state.busy ? 'disabled' : ''}>CONNECT VOICE</button>
        </form>
        ${state.feedback ? `
          <div class="wc-chain-feedback${state.feedback.ok ? ' wc-chain-feedback--ok' : ''}" role="status">
            <strong>${esc(state.feedback.title || '')}</strong><br>
            ${esc(state.feedback.message || '')}
            ${state.feedback.retryLabel ? `<br>${esc(state.feedback.retryLabel)}` : ''}
          </div>
        ` : ''}
        <button type="button" class="wc-chain-card__cta" style="margin-top:12px" data-share-help="${esc(chain.id)}">
          SHARE / ASK FOR HELP
        </button>
      </section>
    `;
  }

  function renderCompleted(chain) {
    if (chain.status !== 'COMPLETED') return '';
    const km = chain.totalDistanceKm != null
      ? `${Number(chain.totalDistanceKm).toLocaleString('en-US')} km across the world.`
      : 'A chain across the world.';
    return `
      <section class="wc-chain-turn">
        <p class="wc-chain-turn__eyebrow">Connection complete</p>
        <p class="wc-chain-turn__copy">
          ${esc(chain.countries)} countries.<br>
          ${esc(chain.voicesConnected)} voices.<br>
          One chain.
        </p>
        <p class="wc-chain-turn__copy">${esc(km)}</p>
        <p class="wc-chain-turn__copy">${esc(chain.timerLabel || '')}</p>
        <p class="wc-chain-turn__copy">You connected the world.</p>
      </section>
    `;
  }

  function renderHelp(chain) {
    if (chain.status !== 'STUCK') return '';
    const active = (chain.route || []).find((s) => s.status === 'active');
    if (!active) return '';
    return `
      <section class="wc-chain-turn">
        <p class="wc-chain-turn__eyebrow">The world needs someone</p>
        <p class="wc-chain-turn__copy">World Chain #${esc(chain.dailyChainNumber)} needs a Voice in:</p>
        <p class="wc-chain-turn__dest">${flagDest(active.country)}</p>
        <p class="wc-chain-turn__country">${esc(active.country)}</p>
        ${active.requiredCity ? `<p class="wc-chain-turn__copy">📍 ${esc(active.requiredCity)}</p>` : ''}
        <p class="wc-chain-turn__copy">Do you know someone? Share the challenge — don't invent a directory of Voices.</p>
        <button type="button" class="wc-chain-primary" data-share-help="${esc(chain.id)}">HELP THIS CHAIN</button>
      </section>
    `;
  }

  function renderDetail() {
    const chain = findChain(state.activeChainId);
    if (!chain) {
      return `
        <button type="button" class="wc-chain-detail__back" data-back-landing>← World Chain</button>
        <div class="wc-chain-empty">
          <h3 class="wc-chain-empty__title">Chain unavailable</h3>
          <p class="wc-chain-empty__copy">This World Chain could not be loaded.</p>
        </div>
      `;
    }

    return `
      <div class="wc-chain-detail">
        <button type="button" class="wc-chain-detail__back" data-back-landing>← World Chain</button>
        <h2 class="wc-chain-card__title">WORLD CHAIN #${esc(chain.dailyChainNumber)}</h2>
        <p class="wc-chain-card__status" style="margin:8px 0 6px">
          <span class="wc-chain-card__dot ${statusDotClass(chain.status)}" aria-hidden="true"></span>
          ${esc(statusLabel(chain.status))}
        </p>
        <p class="wc-chain-card__timer" style="margin-bottom:16px">${esc(chain.timerLabel || '')}</p>
        ${renderRoute(chain.route)}
        <p class="wc-chain-card__meta">
          ${esc(chain.progressLabel)}<br>
          ${esc(chain.routeSummary || '')}
        </p>
        ${renderTurnPanel(chain)}
        ${renderCompleted(chain)}
        ${renderHelp(chain)}
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('world-chain-root');
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = `
        <header class="wc-chain-topbar">
          <a class="wc-chain-back" href="index.html" aria-label="Back to Home">←</a>
          <h1 class="wc-chain-brand">World Chain</h1>
          <span class="wc-chain-topbar__spacer" aria-hidden="true"></span>
        </header>
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
      `;
      return;
    }

    if (state.error && !state.data) {
      root.innerHTML = `
        <header class="wc-chain-topbar">
          <a class="wc-chain-back" href="index.html" aria-label="Back to Home">←</a>
          <h1 class="wc-chain-brand">World Chain</h1>
          <span class="wc-chain-topbar__spacer" aria-hidden="true"></span>
        </header>
        <div class="wc-chain-empty">
          <h3 class="wc-chain-empty__title">Could not load World Chain</h3>
          <p class="wc-chain-empty__copy">${esc(state.error)}</p>
          <button type="button" class="wc-chain-primary" style="margin-top:16px" data-retry>Try again</button>
        </div>
      `;
      bind();
      return;
    }

    root.innerHTML = state.view === 'detail' ? renderDetail() : renderLanding();
    bind();
  }

  async function load() {
    state.loading = true;
    state.error = null;
    render();
    try {
      await WorldChoirDB.ready?.();
      const id = deviceId();
      const res = await fetch(
        `/api/world-chain?deviceId=${encodeURIComponent(id)}&eventId=${encodeURIComponent(eventId())}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load World Chain');
      }
      state.data = await res.json();
      state.loading = false;
      render();
    } catch (err) {
      state.loading = false;
      state.error = err.message || 'Could not load World Chain';
      render();
    }
  }

  async function refreshChain(chainId) {
    const id = deviceId();
    const res = await fetch(
      `/api/world-chain?deviceId=${encodeURIComponent(id)}&eventId=${encodeURIComponent(eventId())}&chainId=${encodeURIComponent(chainId)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return;
    const body = await res.json();
    if (!body.chain || !state.data) return;
    const idx = state.data.chains.findIndex((c) => c.id === chainId);
    if (idx >= 0) state.data.chains[idx] = body.chain;
    else state.data.chains.push(body.chain);
  }

  function shareHelp(chain) {
    const active = (chain.route || []).find((s) => s.status === 'active');
    const dest = active?.requiredCity
      ? `${active.requiredCity}, ${active.country}`
      : (active?.country || 'the next country');
    const text = `I need your help connecting the world.\n\nOur World Chain is trying to reach ${dest}.\n\nCan you help?`;
    const url = window.location.origin + '/world-chain';
    if (navigator.share) {
      navigator.share({ title: 'World Chain', text, url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {});
  }

  function bind() {
    document.querySelector('[data-retry]')?.addEventListener('click', () => load());
    document.querySelector('[data-scroll-chains]')?.addEventListener('click', () => {
      document.getElementById('wc-chain-happening')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
    document.querySelectorAll('[data-open-chain]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeChainId = btn.getAttribute('data-open-chain');
        state.view = 'detail';
        state.feedback = null;
        render();
        window.scrollTo(0, 0);
      });
    });
    document.querySelector('[data-back-landing]')?.addEventListener('click', () => {
      state.view = 'landing';
      state.activeChainId = null;
      state.feedback = null;
      render();
    });
    document.querySelectorAll('[data-accept-start]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const chainId = btn.getAttribute('data-accept-start');
        state.busy = true;
        render();
        try {
          const res = await fetch('/api/world-chain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'accept-start',
              deviceId: deviceId(),
              eventId: eventId(),
              chainId,
            }),
          });
          const body = await res.json();
          if (body.chain) {
            const idx = state.data.chains.findIndex((c) => c.id === chainId);
            if (idx >= 0) state.data.chains[idx] = body.chain;
          }
        } catch {
          /* keep UI */
        }
        state.busy = false;
        render();
      });
    });
    document.querySelectorAll('[data-connect-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const chainId = form.getAttribute('data-connect-form');
        const input = form.querySelector('input[name="voiceNumber"]');
        const voiceNumber = input?.value || '';
        state.busy = true;
        state.feedback = null;
        render();
        try {
          const res = await fetch('/api/world-chain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'connect',
              deviceId: deviceId(),
              eventId: eventId(),
              chainId,
              voiceNumber,
            }),
          });
          const body = await res.json();
          if (body.chain) {
            const idx = state.data.chains.findIndex((c) => c.id === chainId);
            if (idx >= 0) state.data.chains[idx] = body.chain;
          }
          state.feedback = {
            ok: !!body.ok,
            title: body.title || (body.ok ? 'CONNECTION MADE' : 'VOICE NOT FOUND'),
            message: body.message || '',
            retryLabel: body.retryLabel || '',
          };
        } catch {
          state.feedback = {
            ok: false,
            title: 'VOICE NOT FOUND',
            message: "That Voice doesn't match this destination.",
          };
        }
        state.busy = false;
        render();
      });
    });
    document.querySelectorAll('[data-share-help]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chain = findChain(btn.getAttribute('data-share-help'));
        if (chain) shareHelp(chain);
      });
    });
  }

  function init() {
    if (typeof WorldChoirNav !== 'undefined') {
      WorldChoirNav.startWatcher('world-chain');
    }
    load();
  }

  return { init };
})();

window.WorldChainPage = WorldChainPage;
