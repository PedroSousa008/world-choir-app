/**
 * World Chain — dedicated page (Home carousel entry).
 * Matches World Choir Home visual system; consumes /api/world-chain.
 */
const WorldChainPage = (() => {
  let state = {
    loading: true,
    error: null,
    data: null,
    view: 'landing', // landing | detail | completed | photo-book
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
        <button type="button" class="wc-chain-help" data-wc-help aria-label="About World Chain" title="About World Chain">
          <svg class="wc-chain-help__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 10.5v5.5M12 7.75h.01"/>
          </svg>
        </button>
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

  function renderDetailTopbar(backAttr) {
    return `
      <header class="wc-chain-topbar">
        <button type="button" class="wc-chain-back" ${backAttr} aria-label="Back">←</button>
        <h1 class="wc-chain-brand">World Chain</h1>
        <button type="button" class="wc-chain-help" data-wc-help aria-label="About World Chain" title="About World Chain">
          <svg class="wc-chain-help__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 10.5v5.5M12 7.75h.01"/>
          </svg>
        </button>
      </header>
    `;
  }

  function formatVoiceNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return '—';
    return `#${num.toLocaleString('en-US')}`;
  }

  function formatRelativeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  }

  function formatFollowing(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('en-US');
  }

  function countryCode(country) {
    if (typeof WorldChoirFlags !== 'undefined' && WorldChoirFlags.iso3ForCountry) {
      return WorldChoirFlags.iso3ForCountry(country) || '';
    }
    return String(country || '').slice(0, 3).toUpperCase();
  }

  /**
   * Viewer progress rows:
   * - Completed: prior connected countries
   * - In Progress: country of the active selected Voice (actor)
   * - Not Yet Connected: remaining destinations (including the one being sought)
   */
  function progressRows(chain) {
    const route = chain.route || [];
    const allDone = chain.status === 'COMPLETED'
      || (route.length > 0 && route.every((s) => s.status === 'connected'));
    const activeIdx = route.findIndex((s) => s.status === 'active');
    const selectedIdx = route.findIndex((s) => s.status === 'selected');

    let actorIdx = -1;
    if (!allDone) {
      if (activeIdx > 0) actorIdx = activeIdx - 1;
      else if (selectedIdx >= 0) actorIdx = selectedIdx;
      else if (activeIdx === 0) actorIdx = 0;
    }

    const lastIdx = route.length - 1;

    return route.map((step, i) => {
      const base = {
        index: i + 1,
        country: step.country,
        requiredCity: step.requiredCity || null,
        voiceNumber: step.assignedVoiceNumber || null,
        city: step.assignedCity || null,
        connectedAt: step.connectedAt || null,
      };

      if (allDone || (step.status === 'connected' && i !== actorIdx)) {
        return {
          ...base,
          uiStatus: 'completed',
          statusLabel: 'Completed',
          statusDetail: formatRelativeAgo(step.connectedAt) || 'Connected',
        };
      }

      if (i === actorIdx) {
        return {
          ...base,
          voiceNumber: step.assignedVoiceNumber || chain.activeSelectedVoiceNumber || null,
          city: step.assignedCity || null,
          uiStatus: 'active',
          statusLabel: 'In Progress',
          statusDetail: 'Waiting for next connection...',
        };
      }

      return {
        ...base,
        voiceNumber: null,
        city: null,
        uiStatus: 'waiting',
        statusLabel: 'Not Yet Connected',
        statusDetail: i === lastIdx ? 'Final voice needed' : 'Waiting for connection...',
      };
    });
  }

  function renderViewerRouteStrip(chain) {
    const rows = progressRows(chain);
    if (!rows.length) return '';
    const parts = [];
    rows.forEach((row, i) => {
      let nodeClass = 'is-pending';
      let lineClass = 'is-pending';
      if (row.uiStatus === 'completed') {
        nodeClass = 'is-done';
        lineClass = 'is-done';
      } else if (row.uiStatus === 'active') {
        nodeClass = 'is-live';
        lineClass = 'is-live';
      }
      parts.push(`
        <div class="wc-viewer-strip__node ${nodeClass}">
          ${flagCircle(row.country, `wc-viewer-strip__flag ${nodeClass}`)}
          <span class="wc-viewer-strip__code">${esc(countryCode(row.country))}</span>
        </div>
      `);
      if (i < rows.length - 1) {
        parts.push(`<span class="wc-viewer-strip__line ${lineClass}" aria-hidden="true"></span>`);
      }
    });
    return `<div class="wc-viewer-strip" role="img" aria-label="Chain route">${parts.join('')}</div>`;
  }

  function renderProgressStatusCell(row) {
    if (row.uiStatus === 'completed') {
      return `
        <div class="wc-viewer-status wc-viewer-status--done">
          <span class="wc-viewer-status__icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
              <circle cx="10" cy="10" r="8.25" stroke="currentColor" stroke-width="1.5"/>
              <path d="M6.2 10.2l2.4 2.4 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <div class="wc-viewer-status__text">
            <span class="wc-viewer-status__label">Completed</span>
            <span class="wc-viewer-status__detail">${esc(row.statusDetail)}</span>
          </div>
        </div>
      `;
    }
    if (row.uiStatus === 'active') {
      return `
        <div class="wc-viewer-status wc-viewer-status--active">
          <span class="wc-viewer-status__icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
              <circle cx="10" cy="10" r="8.25" stroke="currentColor" stroke-width="1.5"/>
              <circle class="wc-viewer-status__pulse" cx="10" cy="10" r="3.2" fill="currentColor"/>
            </svg>
          </span>
          <div class="wc-viewer-status__text">
            <span class="wc-viewer-status__label">In Progress</span>
            <span class="wc-viewer-status__detail">${esc(row.statusDetail)}</span>
          </div>
        </div>
      `;
    }
    return `
      <div class="wc-viewer-status wc-viewer-status--wait">
        <span class="wc-viewer-status__icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <circle cx="10" cy="10" r="8.25" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </span>
        <div class="wc-viewer-status__text">
          <span class="wc-viewer-status__label">Not Yet Connected</span>
          <span class="wc-viewer-status__detail">${esc(row.statusDetail)}</span>
        </div>
      </div>
    `;
  }

  function renderViewerDetail(chain) {
    const backAttr = state.detailReturnView === 'completed' ? 'data-back-completed' : 'data-back-landing';
    const rows = progressRows(chain);
    const startLabel = chain.startCountry || '—';
    const destLabel = chain.finalCity || chain.finalCountry || '—';

    return `
      <div class="wc-viewer">
        ${renderDetailTopbar(backAttr)}

        <section class="wc-viewer-hero">
          <h2 class="wc-viewer-hero__title">World Chain #${esc(chain.dailyChainNumber)}</h2>
          <p class="wc-viewer-hero__meta">${esc(chain.countries)} countries · ${esc(chain.connections)} connections</p>
          <p class="wc-viewer-hero__route">${esc(startLabel)} → ${esc(destLabel)}</p>
          <p class="wc-viewer-hero__line">Real people. Real connections.<br>A more connected world.</p>
        </section>

        <section class="wc-viewer-stats" aria-label="Chain summary">
          <div class="wc-viewer-stats__cell">
            <span class="wc-viewer-stats__num">${esc(chain.countries)}</span>
            <span class="wc-viewer-stats__label">Countries</span>
          </div>
          <div class="wc-viewer-stats__cell">
            <span class="wc-viewer-stats__num">${esc(chain.connections)}</span>
            <span class="wc-viewer-stats__label">Connections</span>
          </div>
          <div class="wc-viewer-stats__cell">
            <span class="wc-viewer-stats__num">${esc(chain.timeLeftLabel || String(chain.timerLabel || '—').replace(/\s*left$/i, '').trim() || '—')}</span>
            <span class="wc-viewer-stats__label">Left</span>
          </div>
          <div class="wc-viewer-stats__cell">
            <span class="wc-viewer-stats__num">${esc(formatFollowing(chain.followingCount))}</span>
            <span class="wc-viewer-stats__label">Following</span>
          </div>
        </section>

        ${renderViewerRouteStrip(chain)}

        <section class="wc-viewer-progress">
          <div class="wc-viewer-progress__head">
            <h3 class="wc-viewer-progress__title">Country Progress</h3>
            <p class="wc-viewer-progress__aside">Different places. A brighter tomorrow.</p>
          </div>

          <div class="wc-viewer-table" role="table" aria-label="Country progress">
            <div class="wc-viewer-table__head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Country</span>
              <span role="columnheader">Voice</span>
              <span role="columnheader">Status</span>
            </div>
            ${rows.map((row) => `
              <div class="wc-viewer-table__row wc-viewer-table__row--${esc(row.uiStatus)}" role="row">
                <span class="wc-viewer-table__idx" role="cell">${esc(row.index)}</span>
                <div class="wc-viewer-table__country" role="cell">
                  ${flagCircle(row.country, 'wc-viewer-table__flag')}
                  <span class="wc-viewer-table__country-name">${esc(row.country)}</span>
                </div>
                <div class="wc-viewer-table__voice" role="cell">
                  ${row.voiceNumber
                    ? `<span class="wc-viewer-table__voice-num">${esc(formatVoiceNumber(row.voiceNumber))}</span>
                       <span class="wc-viewer-table__voice-city">${esc(row.city || '—')}</span>`
                    : `<span class="wc-viewer-table__voice-num wc-viewer-table__voice-num--empty">—</span>`}
                </div>
                <div class="wc-viewer-table__status" role="cell">
                  ${renderProgressStatusCell(row)}
                </div>
              </div>
            `).join('')}
          </div>

          <button type="button" class="wc-viewer-photobook" data-open-photo-book="${esc(chain.id)}">
            <span class="wc-viewer-photobook__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 0 5 22V4.5z"/>
                <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19"/>
                <path d="M9 10h6M9 14h4"/>
              </svg>
            </span>
            <span class="wc-viewer-photobook__copy">
              <span class="wc-viewer-photobook__title">Open Photo Book</span>
              <span class="wc-viewer-photobook__sub">See the people behind this chain.</span>
            </span>
            <span class="wc-viewer-photobook__chevron" aria-hidden="true">›</span>
          </button>
        </section>

        <blockquote class="wc-viewer-quote">
          <span class="wc-viewer-quote__mark" aria-hidden="true">“</span>
          <p class="wc-viewer-quote__text">A chain of voices is a chain of hope.</p>
          <footer class="wc-viewer-quote__attr">— World Choir</footer>
        </blockquote>

        <button type="button" class="wc-viewer-share" data-share-chain="${esc(chain.id)}">
          Share This Chain →
        </button>
      </div>
    `;
  }

  function renderPhotoBook(chain) {
    const backAttr = 'data-back-detail';
    return `
      <div class="wc-viewer">
        ${renderDetailTopbar(backAttr)}
        <section class="wc-viewer-hero">
          <h2 class="wc-viewer-hero__title">Photo Book</h2>
          <p class="wc-viewer-hero__meta">World Chain #${esc(chain?.dailyChainNumber || '')}</p>
          <p class="wc-viewer-hero__line">The human side of this chain.</p>
        </section>
        <div class="wc-photobook-empty">
          <p class="wc-photobook-empty__title">Moments will appear here</p>
          <p class="wc-photobook-empty__copy">
            As Voices connect across this chain, their shared moments will gather in this Photo Book —
            a lasting record of the people behind each step.
          </p>
        </div>
      </div>
    `;
  }

  function renderSelectedVoiceDetail(chain) {
    const backAttr = state.detailReturnView === 'completed' ? 'data-back-completed' : 'data-back-landing';
    /* Selected-Voice primary experience ships next; keep the existing turn flow for now. */
    return `
      <div class="wc-chain-detail wc-chain-detail--selected-voice">
        ${renderDetailTopbar(backAttr)}
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
    const backAttr = state.detailReturnView === 'completed' ? 'data-back-completed' : 'data-back-landing';
    if (!chain) {
      return `
        <div class="wc-viewer">
          ${renderDetailTopbar(backAttr)}
          <div class="wc-chain-empty">
            <h3 class="wc-chain-empty__title">Chain unavailable</h3>
            <p class="wc-chain-empty__copy">This World Chain could not be loaded.</p>
          </div>
        </div>
      `;
    }

    const isSelectedVoice = !!(
      chain.viewer?.isCurrentUserSelectedVoice
      || chain.viewer?.isActiveTurn
    );

    if (isSelectedVoice && chain.status !== 'COMPLETED') {
      return renderSelectedVoiceDetail(chain);
    }

    return renderViewerDetail(chain);
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

    if (state.view === 'photo-book') {
      root.innerHTML = renderPhotoBook(findChain(state.activeChainId));
    } else if (state.view === 'detail') {
      root.innerHTML = renderDetail();
    } else if (state.view === 'completed') {
      root.innerHTML = renderCompletedList();
    } else {
      root.innerHTML = renderLanding();
    }
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
    if (!body.chain) return;
    if (state.data) {
      const idx = state.data.chains.findIndex((c) => c.id === chainId);
      if (idx >= 0) state.data.chains[idx] = body.chain;
      else state.data.chains.push(body.chain);
    }
    if (state.completed) {
      const cidx = state.completed.findIndex((c) => c.id === chainId);
      if (cidx >= 0) state.completed[cidx] = body.chain;
    }
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

  function shareChain(chain) {
    const text = `Follow World Chain #${chain.dailyChainNumber} — ${chain.routeSummary || 'real people, real connections'}.\n\nA more connected world.`;
    const url = `${window.location.origin}/world-chain?chain=${encodeURIComponent(chain.id)}`;
    if (navigator.share) {
      navigator.share({ title: `World Chain #${chain.dailyChainNumber}`, text, url }).catch(() => {});
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
      btn.addEventListener('click', async () => {
        state.detailReturnView = state.view === 'completed' ? 'completed' : 'landing';
        state.activeChainId = btn.getAttribute('data-open-chain');
        state.view = 'detail';
        state.feedback = null;
        render();
        window.scrollTo(0, 0);
        try {
          await refreshChain(state.activeChainId);
          render();
        } catch {
          /* keep cached chain */
        }
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
    document.querySelector('[data-back-detail]')?.addEventListener('click', () => {
      state.view = 'detail';
      state.feedback = null;
      render();
      window.scrollTo(0, 0);
    });
    document.querySelectorAll('[data-open-photo-book]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeChainId = btn.getAttribute('data-open-photo-book') || state.activeChainId;
        state.view = 'photo-book';
        render();
        window.scrollTo(0, 0);
      });
    });
    document.querySelectorAll('[data-share-chain]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chain = findChain(btn.getAttribute('data-share-chain'));
        if (chain) shareChain(chain);
      });
    });
    document.querySelectorAll('[data-wc-help]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const msg = 'World Chain connects real Voices across countries — one person, one place, one connection at a time.';
        if (typeof window.alert === 'function') window.alert(msg);
      });
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
    const params = new URLSearchParams(window.location.search);
    const deepChain = params.get('chain');
    load().then(() => {
      if (deepChain) {
        state.activeChainId = deepChain;
        state.view = 'detail';
        state.detailReturnView = 'landing';
        render();
        refreshChain(deepChain).then(() => render()).catch(() => {});
      }
    });
  }

  return { init };
})();

window.WorldChainPage = WorldChainPage;
