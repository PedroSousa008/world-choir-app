/**
 * World Chain — dedicated page (Home carousel entry).
 * Matches World Choir Home visual system; consumes /api/world-chain.
 */
const WorldChainPage = (() => {
  let state = {
    loading: true,
    error: null,
    data: null,
    view: 'landing', // landing | detail | completed
    activeChainId: null,
    detailReturnView: 'landing',
    busy: false,
    feedback: null,
    completed: null,
    completedLoading: false,
    completedError: null,
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
    if (status === 'COMPLETED') return 'wc-chain-card__dot--completed';
    return 'wc-chain-card__dot--progress';
  }

  function statusLabel(status) {
    if (status === 'COMPLETED') return 'COMPLETED';
    return 'IN PROGRESS';
  }

  function statusToneClass(status) {
    if (status === 'COMPLETED') return 'wc-chain-card__status--completed';
    return 'wc-chain-card__status--progress';
  }

  /**
   * Visual route states:
   * - done (green): connection completed
   * - current (blue): this Voice's turn
   * - pending (grey): destination / not yet reached
   */
  function routeNodeStates(route = []) {
    const activeIdx = route.findIndex((s) => s.status === 'active');
    const selectedIdx = route.findIndex((s) => s.status === 'selected');
    const allDone = route.length > 0 && route.every((s) => s.status === 'connected');

    let actorIdx = -1;
    if (!allDone) {
      if (activeIdx > 0) actorIdx = activeIdx - 1;
      else if (activeIdx === 0) actorIdx = 0;
      else if (selectedIdx >= 0) actorIdx = selectedIdx;
    }

    return route.map((step, i) => {
      let node = 'is-pending';
      if (allDone || step.status === 'connected') node = 'is-done';
      else if (i === actorIdx) node = 'is-current';

      let line = null;
      if (i < route.length - 1) {
        if (allDone || step.status === 'connected') line = 'is-done';
        else if (i === actorIdx) line = 'is-current';
        else line = 'is-pending';
      }
      return { node, line };
    });
  }

  function renderRoute(route = []) {
    if (!route.length) return '';
    const states = routeNodeStates(route);
    const parts = [];
    route.forEach((step, i) => {
      parts.push(flagCircle(step.country, states[i].node));
      if (states[i].line) {
        parts.push(`<span class="wc-chain-route__line ${states[i].line}" aria-hidden="true"></span>`);
      }
    });
    return `<div class="wc-chain-route" role="img" aria-label="World Chain route">${parts.join('')}</div>`;
  }

  function renderHero() {
    return `
      <header class="wc-chain-topbar">
        <a class="wc-chain-back" href="index.html" aria-label="Back to Home">←</a>
        <h1 class="wc-chain-brand">World Chain</h1>
        <span class="wc-chain-topbar__spacer" aria-hidden="true"></span>
      </header>
      <div class="wc-chain-hero">
        <img
          class="wc-chain-hero__img"
          src="images/chain-header.png?v=20260905h"
          alt=""
          width="1619"
          height="971"
          decoding="async"
          fetchpriority="high"
        >
        <div class="wc-chain-hero__copy">
          <h2 class="wc-chain-headline">A more connected world<br>is a kinder world.</h2>
          <button type="button" class="wc-chain-explore" data-open-completed>
            Completed Chains →
          </button>
        </div>
      </div>
    `;
  }

  function renderCard(chain) {
    const named = !!chain.viewer?.isNamed;
    return `
      <article class="wc-chain-card${named ? ' wc-chain-card--named' : ''}" data-chain-id="${esc(chain.id)}">
        <div class="wc-chain-card__head">
          <h3 class="wc-chain-card__title">WORLD CHAIN #${esc(chain.dailyChainNumber)}</h3>
          <p class="wc-chain-card__status ${statusToneClass(chain.status)}">
            <span class="wc-chain-card__dot ${statusDotClass(chain.status)}" aria-hidden="true"></span>
            ${esc(statusLabel(chain.status))}
          </p>
          <p class="wc-chain-card__timer">${esc(chain.timerLabel || '')}</p>
        </div>
        ${renderRoute(chain.route)}
        <div class="wc-chain-card__footer">
          <p class="wc-chain-card__meta">
            ${esc(chain.countries)} countries · ${esc(chain.connections)} connections<br>
            ${esc(chain.routeSummary || '')}
          </p>
          <button type="button" class="wc-chain-card__cta" data-open-chain="${esc(chain.id)}">
            ${esc(chain.cta || 'WATCH LIVE')} →
          </button>
        </div>
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
      ${renderHero()}

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

  function renderCompletedList() {
    if (state.completedLoading && !state.completed) {
      return `
        <div class="wc-chain-detail">
          <button type="button" class="wc-chain-detail__back" data-back-landing>← World Chain</button>
          <h2 class="wc-chain-section-title" style="text-align:left;margin-top:8px">Completed Chains</h2>
          <div class="wc-chain-skel" aria-hidden="true"></div>
          <div class="wc-chain-skel" aria-hidden="true"></div>
        </div>
      `;
    }

    if (state.completedError && !state.completed) {
      return `
        <div class="wc-chain-detail">
          <button type="button" class="wc-chain-detail__back" data-back-landing>← World Chain</button>
          <div class="wc-chain-empty">
            <h3 class="wc-chain-empty__title">Could not load completed chains</h3>
            <p class="wc-chain-empty__copy">${esc(state.completedError)}</p>
            <button type="button" class="wc-chain-primary" style="margin-top:16px" data-open-completed>Try again</button>
          </div>
        </div>
      `;
    }

    const chains = state.completed || [];
    return `
      <div class="wc-chain-detail">
        <button type="button" class="wc-chain-detail__back" data-back-landing>← World Chain</button>
        <h2 class="wc-chain-section-title" style="text-align:left;margin-top:8px">Completed Chains</h2>
        ${chains.length === 0 ? `
          <div class="wc-chain-empty">
            <h3 class="wc-chain-empty__title">No completed chains yet</h3>
            <p class="wc-chain-empty__copy">
              When a World Chain reaches its final Voice, it will appear here — a lasting record of real connections across the world.
            </p>
          </div>
        ` : `
          <div class="wc-chain-list">
            ${chains.map(renderCard).join('')}
          </div>
        `}
      </div>
    `;
  }

  function findChain(id) {
    return (state.data?.chains || []).find((c) => c.id === id)
      || (state.completed || []).find((c) => c.id === id)
      || null;
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

  function renderHelp() {
    return '';
  }

  function renderDetail() {
    const chain = findChain(state.activeChainId);
    const backLabel = state.detailReturnView === 'completed' ? '← Completed Chains' : '← World Chain';
    const backAttr = state.detailReturnView === 'completed' ? 'data-back-completed' : 'data-back-landing';
    if (!chain) {
      return `
        <button type="button" class="wc-chain-detail__back" ${backAttr}>${backLabel}</button>
        <div class="wc-chain-empty">
          <h3 class="wc-chain-empty__title">Chain unavailable</h3>
          <p class="wc-chain-empty__copy">This World Chain could not be loaded.</p>
        </div>
      `;
    }

    return `
      <div class="wc-chain-detail">
        <button type="button" class="wc-chain-detail__back" ${backAttr}>${backLabel}</button>
        <div class="wc-chain-card__head wc-chain-card__head--detail">
          <h2 class="wc-chain-card__title">WORLD CHAIN #${esc(chain.dailyChainNumber)}</h2>
          <p class="wc-chain-card__status ${statusToneClass(chain.status)}">
            <span class="wc-chain-card__dot ${statusDotClass(chain.status)}" aria-hidden="true"></span>
            ${esc(statusLabel(chain.status))}
          </p>
          <p class="wc-chain-card__timer">${esc(chain.timerLabel || '')}</p>
        </div>
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
        ${renderHero()}
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
      `;
      return;
    }

    if (state.error && !state.data) {
      root.innerHTML = `
        ${renderHero()}
        <div class="wc-chain-empty">
          <h3 class="wc-chain-empty__title">Could not load World Chain</h3>
          <p class="wc-chain-empty__copy">${esc(state.error)}</p>
          <button type="button" class="wc-chain-primary" style="margin-top:16px" data-retry>Try again</button>
        </div>
      `;
      bind();
      return;
    }

    if (state.view === 'detail') root.innerHTML = renderDetail();
    else if (state.view === 'completed') root.innerHTML = renderCompletedList();
    else root.innerHTML = renderLanding();
    bind();
  }

  async function loadCompleted() {
    state.view = 'completed';
    state.activeChainId = null;
    state.feedback = null;
    state.completedLoading = true;
    state.completedError = null;
    render();
    window.scrollTo(0, 0);
    try {
      await WorldChoirDB.ready?.();
      const res = await fetch(
        `/api/world-chain?deviceId=${encodeURIComponent(deviceId())}&eventId=${encodeURIComponent(eventId())}&view=completed`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load completed chains');
      }
      const body = await res.json();
      state.completed = body.chains || [];
      state.completedLoading = false;
      render();
    } catch (err) {
      state.completedLoading = false;
      state.completedError = err.message || 'Could not load completed chains';
      render();
    }
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
    document.querySelectorAll('[data-open-completed]').forEach((btn) => {
      btn.addEventListener('click', () => loadCompleted());
    });
    document.querySelectorAll('[data-open-chain]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.detailReturnView = state.view === 'completed' ? 'completed' : 'landing';
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
      state.detailReturnView = 'landing';
      state.feedback = null;
      render();
    });
    document.querySelector('[data-back-completed]')?.addEventListener('click', () => {
      state.view = 'completed';
      state.activeChainId = null;
      state.feedback = null;
      render();
      window.scrollTo(0, 0);
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
            if (body.code === 'CHAIN_COMPLETE') {
              state.completed = null;
            }
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
