/**
 * World Chain — dedicated page (Home carousel entry).
 * Matches World Choir Home visual system; consumes /api/world-chain.
 */
const WorldChainPage = (() => {
  const TODAY_CACHE_KEY = 'wc_world_chain_today_v1';
  const CHAIN_CACHE_PREFIX = 'wc_world_chain_one_v1:';
  const COMPLETED_CACHE_KEY = 'wc_world_chain_completed_v1';
  const PHOTO_BOOK_PENDING_KEY = 'wc_photo_book_pending_v1';
  const PHOTO_BOOK_MAX_CHARS = 80;

  let state = {
    loading: true,
    error: null,
    data: null,
    view: 'landing', // landing | detail | completed | photo-book
    activeChainId: null,
    detailReturnView: 'landing',
    busy: false,
    feedback: null,
    turnSheetOpen: false,
    photoBookOffer: null,
    photoBookDraft: {
      dataUrl: null,
      message: '',
      error: null,
      busy: false,
    },
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

  function readJsonCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJsonCache(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / private mode */
    }
  }

  function cacheTodayPayload(payload) {
    if (!payload) return;
    writeJsonCache(TODAY_CACHE_KEY, { savedAt: Date.now(), payload });
  }

  function readTodayPayload() {
    return readJsonCache(TODAY_CACHE_KEY)?.payload || null;
  }

  function cacheChain(chain) {
    if (!chain?.id) return;
    writeJsonCache(CHAIN_CACHE_PREFIX + chain.id, { savedAt: Date.now(), chain });
  }

  function readCachedChain(chainId) {
    if (!chainId) return null;
    return readJsonCache(CHAIN_CACHE_PREFIX + chainId)?.chain || null;
  }

  function cacheCompleted(chains) {
    writeJsonCache(COMPLETED_CACHE_KEY, { savedAt: Date.now(), chains: chains || [] });
  }

  function readCachedCompleted() {
    return readJsonCache(COMPLETED_CACHE_KEY)?.chains || null;
  }

  function savePendingPhotoBook(offer) {
    if (!offer?.connectionId) return;
    writeJsonCache(PHOTO_BOOK_PENDING_KEY, { savedAt: Date.now(), offer });
  }

  function clearPendingPhotoBook() {
    try {
      sessionStorage.removeItem(PHOTO_BOOK_PENDING_KEY);
    } catch {
      /* ignore */
    }
  }

  function readPendingPhotoBook() {
    return readJsonCache(PHOTO_BOOK_PENDING_KEY)?.offer || null;
  }

  function resetPhotoBookDraft() {
    state.photoBookDraft = {
      dataUrl: null,
      message: '',
      error: null,
      busy: false,
    };
  }

  function finishPhotoBookStep() {
    clearPendingPhotoBook();
    state.photoBookOffer = null;
    resetPhotoBookDraft();
    state.turnSheetOpen = false;
    state.view = 'detail';
    syncUrl({ replace: true });
    render();
    window.scrollTo(0, 0);
  }

  function openPhotoBookContribute(offer) {
    if (!offer?.chainId || !offer?.connectionId) {
      finishPhotoBookStep();
      return;
    }
    state.photoBookOffer = offer;
    savePendingPhotoBook(offer);
    state.activeChainId = offer.chainId;
    state.turnSheetOpen = false;
    state.feedback = null;
    resetPhotoBookDraft();
    state.view = 'photo-book-contribute';
    syncUrl({ replace: true });
    render();
    window.scrollTo(0, 0);
  }

  function compressSelfieFile(file, maxSide = 1280, quality = 0.82) {
    // Prefer createImageBitmap with imageOrientation: 'none' so phone EXIF
    // does not rotate/flip the selfie away from how it was taken.
    const drawBitmap = (bitmap) => {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close?.();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();
      return canvas.toDataURL('image/jpeg', quality);
    };

    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'none' })
        .then((bitmap) => {
          const out = drawBitmap(bitmap);
          if (out) return out;
          throw new Error('Could not compress selfie');
        })
        .catch(() => compressSelfieDataUrlFromFile(file, maxSide, quality));
    }
    return compressSelfieDataUrlFromFile(file, maxSide, quality);
  }

  function compressSelfieDataUrlFromFile(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        compressSelfieDataUrl(String(reader.result || ''), maxSide, quality)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = () => reject(new Error('Could not read photo'));
      reader.readAsDataURL(file);
    });
  }

  function compressSelfieDataUrl(dataUrl, maxSide = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read selfie'));
      img.src = dataUrl;
    });
  }

  function mergeChainIntoState(chain) {
    if (!chain?.id) return;
    cacheChain(chain);
    if (!state.data) {
      state.data = { chains: [chain], overview: {}, limited: false };
      return;
    }
    if (!Array.isArray(state.data.chains)) state.data.chains = [];
    const idx = state.data.chains.findIndex((c) => c.id === chain.id);
    if (idx >= 0) state.data.chains[idx] = chain;
    else state.data.chains.push(chain);
    if (state.completed) {
      const cidx = state.completed.findIndex((c) => c.id === chain.id);
      if (cidx >= 0) state.completed[cidx] = chain;
    }
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

  function renderDetailTopbar(backAttr, opts = {}) {
    const chainId = opts.photoBookChainId || null;
    const rightAction = chainId
      ? `<button type="button" class="wc-chain-help" data-open-photo-book="${esc(chainId)}" aria-label="Open Photo Book" title="Open Photo Book">
          <svg class="wc-chain-help__icon" viewBox="0 0 24 24" width="18" height="18" focusable="false" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round">
            <path d="M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"/>
            <path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"/>
            <path d="M12 4v16" stroke-linecap="round"/>
          </svg>
        </button>`
      : `<span class="wc-chain-topbar__spacer" aria-hidden="true"></span>`;

    return `
      <header class="wc-chain-topbar">
        <button type="button" class="wc-chain-back" ${backAttr} aria-label="Back">←</button>
        <h1 class="wc-chain-brand">World Chain</h1>
        ${rightAction}
      </header>
    `;
  }

  function renderLandingSkeleton() {
    return `
      <div class="wc-chain-boot wc-chain-boot--landing" aria-busy="true">
        <header class="wc-chain-topbar">
          <a class="wc-chain-back" href="index.html" aria-label="Back to Home">←</a>
          <h1 class="wc-chain-brand">World Chain</h1>
          <span class="wc-chain-topbar__spacer" aria-hidden="true"></span>
        </header>
        <div class="wc-chain-hero wc-chain-hero--skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
      </div>
    `;
  }

  function renderDetailSkeleton() {
    const backAttr = state.detailReturnView === 'completed' ? 'data-back-completed' : 'data-back-landing';
    const chainId = state.activeChainId;
    return `
      <div class="wc-viewer wc-chain-boot wc-chain-boot--detail" aria-busy="true">
        ${renderDetailTopbar(backAttr, chainId ? { photoBookChainId: chainId } : {})}
        <div class="wc-viewer-skel-title" aria-hidden="true"></div>
        <div class="wc-viewer-skel-route" aria-hidden="true"></div>
        <div class="wc-viewer-skel-stats" aria-hidden="true"></div>
        <div class="wc-chain-skel wc-chain-skel--strip" aria-hidden="true"></div>
        <div class="wc-viewer-skel-card" aria-hidden="true">
          <div class="wc-chain-skel" aria-hidden="true"></div>
          <div class="wc-chain-skel" aria-hidden="true"></div>
          <div class="wc-chain-skel" aria-hidden="true"></div>
        </div>
        <div class="wc-chain-skel wc-chain-skel--cta" aria-hidden="true"></div>
      </div>
    `;
  }

  function renderCompletedSkeleton() {
    return `
      <div class="wc-chain-boot wc-chain-boot--completed" aria-busy="true">
        ${renderDetailTopbar('data-back-landing')}
        <div class="wc-viewer-skel-title wc-viewer-skel-title--sm" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
        <div class="wc-chain-skel" aria-hidden="true"></div>
      </div>
    `;
  }

  function renderBootSkeleton() {
    if (state.view === 'detail' || state.view === 'photo-book' || state.view === 'photo-book-contribute') {
      return renderDetailSkeleton();
    }
    if (state.view === 'completed') return renderCompletedSkeleton();
    return renderLandingSkeleton();
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
   * - In Progress / Keep the Chain Alive: country of the active selected Voice (actor)
   * - Not Yet Connected: remaining destinations (including the one being sought)
   */
  function progressRows(chain) {
    const route = chain.route || [];
    const allDone = chain.status === 'COMPLETED'
      || (route.length > 0 && route.every((s) => s.status === 'connected'));
    const activeIdx = route.findIndex((s) => s.status === 'active');
    const selectedIdx = route.findIndex((s) => s.status === 'selected');
    const myVoice = Number(chain.viewer?.voiceNumber);
    const isMyTurn = !!(
      chain.viewer?.isCurrentUserSelectedVoice
      || chain.viewer?.isActiveTurn
      || chain.viewer?.needsStart
    );

    let actorIdx = -1;
    if (!allDone) {
      if (activeIdx > 0) actorIdx = activeIdx - 1;
      else if (selectedIdx >= 0) actorIdx = selectedIdx;
      else if (activeIdx === 0) actorIdx = 0;
    }

    const lastIdx = route.length - 1;

    return route.map((step, i) => {
      const voiceNumber = step.assignedVoiceNumber || null;
      const isMyCompletedStep = Number.isFinite(myVoice)
        && myVoice > 0
        && Number(voiceNumber) === myVoice;

      const base = {
        index: i + 1,
        country: step.country,
        requiredCity: step.requiredCity || null,
        voiceNumber,
        city: step.assignedCity || null,
        connectedAt: step.connectedAt || null,
        isYou: false,
        isKeepAlive: false,
      };

      if (allDone || (step.status === 'connected' && i !== actorIdx)) {
        return {
          ...base,
          // Highlight the viewer's own completed contribution ("Your Chain").
          isYou: isMyCompletedStep,
          uiStatus: 'completed',
          statusLabel: 'Completed',
          statusDetail: formatRelativeAgo(step.connectedAt) || 'Connected',
        };
      }

      if (i === actorIdx) {
        const activeVoice = step.assignedVoiceNumber || chain.activeSelectedVoiceNumber || null;
        const keepAlive = isMyTurn;
        return {
          ...base,
          voiceNumber: activeVoice,
          city: step.assignedCity || null,
          isKeepAlive: keepAlive,
          uiStatus: keepAlive ? 'keep-alive' : 'active',
          statusLabel: keepAlive ? 'Keep the Chain Alive' : 'In Progress',
          statusDetail: keepAlive
            ? 'Find someone from the next country to continue the chain.'
            : 'Waiting for next connection...',
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
      } else if (row.uiStatus === 'active' || row.uiStatus === 'keep-alive') {
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
            <span class="wc-viewer-status__label">${esc(row.statusLabel)}</span>
            <span class="wc-viewer-status__detail">${esc(row.statusDetail)}</span>
          </div>
        </div>
      `;
    }
    if (row.uiStatus === 'keep-alive' || row.uiStatus === 'active') {
      const tone = row.uiStatus === 'keep-alive' ? 'keep' : 'active';
      return `
        <div class="wc-viewer-status wc-viewer-status--${tone}">
          <span class="wc-viewer-status__icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
              <circle cx="10" cy="10" r="8.25" stroke="currentColor" stroke-width="1.5"/>
              <circle class="wc-viewer-status__pulse" cx="10" cy="10" r="3.2" fill="currentColor"/>
            </svg>
          </span>
          <div class="wc-viewer-status__text">
            <span class="wc-viewer-status__label">${esc(row.statusLabel)}</span>
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
          <span class="wc-viewer-status__label">${esc(row.statusLabel)}</span>
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
        ${renderDetailTopbar(backAttr, { photoBookChainId: chain.id })}

        <section class="wc-viewer-hero">
          <h2 class="wc-viewer-hero__title">World Chain #${esc(chain.dailyChainNumber)}</h2>
          <p class="wc-viewer-hero__route">${esc(startLabel)} → ${esc(destLabel)}</p>
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
          <div class="wc-viewer-table" role="table" aria-label="Country progress">
            <div class="wc-viewer-table__head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Country</span>
              <span role="columnheader">Voice</span>
              <span role="columnheader">Status</span>
            </div>
            ${rows.map((row) => {
              const keepAlive = !!row.isKeepAlive;
              const rowClass = [
                'wc-viewer-table__row',
                `wc-viewer-table__row--${row.uiStatus}`,
                row.isYou ? 'wc-viewer-table__row--you' : '',
                keepAlive ? 'wc-viewer-table__row--keep-alive' : '',
              ].filter(Boolean).join(' ');
              const openAttrs = keepAlive
                ? ` role="button" tabindex="0" data-open-turn-sheet="${esc(chain.id)}" aria-label="Keep the Chain Alive"`
                : ' role="row"';
              return `
              <div class="${rowClass}"${openAttrs}>
                <span class="wc-viewer-table__idx" role="cell">${esc(row.index)}</span>
                <div class="wc-viewer-table__country" role="cell">
                  ${flagCircle(row.country, 'wc-viewer-table__flag')}
                  <span class="wc-viewer-table__country-name">${esc(row.country)}</span>
                </div>
                <div class="wc-viewer-table__voice" role="cell">
                  ${row.voiceNumber
                    ? `<span class="wc-viewer-table__voice-num${row.isYou || keepAlive ? ' wc-viewer-table__voice-num--you' : ''}">${esc(formatVoiceNumber(row.voiceNumber))}</span>
                       <span class="wc-viewer-table__voice-city">${esc(row.city || '—')}</span>`
                    : `<span class="wc-viewer-table__voice-num wc-viewer-table__voice-num--empty">—</span>`}
                </div>
                <div class="wc-viewer-table__status" role="cell">
                  ${renderProgressStatusCell(row)}
                </div>
              </div>
            `;
            }).join('')}
          </div>
        </section>

        <button type="button" class="wc-viewer-share" data-share-chain="${esc(chain.id)}">
          Share This Chain →
        </button>

        ${state.turnSheetOpen ? `
          <div class="wc-turn-sheet" role="dialog" aria-modal="true" aria-label="Keep the Chain Alive">
            <div class="wc-turn-sheet__backdrop" data-close-turn-sheet aria-hidden="true"></div>
            <div class="wc-turn-sheet__panel">
              <button type="button" class="wc-turn-sheet__close" data-close-turn-sheet aria-label="Close">←</button>
              ${renderTurnPanel(chain)}
            </div>
          </div>
        ` : ''}
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

  function renderPhotoBookContribute() {
    const offer = state.photoBookOffer || readPendingPhotoBook();
    const draft = state.photoBookDraft || {};
    const message = String(draft.message || '');
    const count = [...message].length;
    const hasSelfie = !!draft.dataUrl;
    const canSubmit = hasSelfie && !draft.busy;
    const chainNum = offer?.dailyChainNumber != null ? offer.dailyChainNumber : '';

    return `
      <div class="wc-viewer wc-photobook-contribute">
        <header class="wc-chain-topbar">
          <button type="button" class="wc-chain-back" data-skip-photo-book aria-label="Back">←</button>
          <h1 class="wc-chain-brand">World Chain</h1>
          <span class="wc-chain-topbar__spacer" aria-hidden="true"></span>
        </header>

        <section class="wc-photobook-contribute__card">
          <p class="wc-photobook-contribute__eyebrow">Share yourself</p>
          <h2 class="wc-photobook-contribute__title">
            Take a selfie and leave a short message for the World Chain.
          </h2>

          <div class="wc-photobook-info">
            <span class="wc-photobook-info__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8A1.5 1.5 0 0 1 10.9 3.5h2.2a1.5 1.5 0 0 1 1.2.7L15.5 6H17.5A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9Z"/>
                <circle cx="12" cy="13" r="3.25"/>
              </svg>
            </span>
            <div class="wc-photobook-info__copy">
              <p class="wc-photobook-info__main">
                Your selfie will be part of the
                <span class="wc-photobook-info__accent">Photo Book of the Chain</span>.
              </p>
              <p class="wc-photobook-info__sub">A global collection of the people who connected the world.</p>
            </div>
          </div>

          <input type="file" accept="image/*" capture="user" class="wc-photobook-file" data-selfie-input hidden>

          ${hasSelfie ? `
            <div class="wc-photobook-selfie wc-photobook-selfie--preview">
              <img src="${esc(draft.dataUrl)}" alt="Your selfie preview">
              <button type="button" class="wc-photobook-retake" data-retake-selfie ${draft.busy ? 'disabled' : ''}>Retake</button>
            </div>
          ` : `
            <button type="button" class="wc-photobook-selfie" data-open-selfie ${draft.busy ? 'disabled' : ''}>
              <span class="wc-photobook-selfie__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                  <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8A1.5 1.5 0 0 1 10.9 3.5h2.2a1.5 1.5 0 0 1 1.2.7L15.5 6H17.5A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9Z"/>
                  <circle cx="12" cy="13" r="3.25"/>
                </svg>
              </span>
              <span class="wc-photobook-selfie__title">Take a Selfie</span>
              <span class="wc-photobook-selfie__hint">Tap to open camera</span>
            </button>
          `}

          <div class="wc-photobook-message-head">
            <label for="wc-photobook-message" class="wc-photobook-message-label">Your Message</label>
            <span class="wc-photobook-message-count" data-message-count>${esc(count)}/${PHOTO_BOOK_MAX_CHARS}</span>
          </div>
          <textarea
            id="wc-photobook-message"
            class="wc-photobook-message"
            data-photo-book-message
            maxlength="${PHOTO_BOOK_MAX_CHARS}"
            rows="2"
            placeholder="Write a message for the World Chain…"
            ${draft.busy ? 'disabled' : ''}
          >${esc(message)}</textarea>

          ${draft.error ? `
            <p class="wc-photobook-error" role="alert">${esc(draft.error)}</p>
          ` : ''}

          <button
            type="button"
            class="wc-chain-primary wc-photobook-submit"
            data-submit-photo-book
            ${canSubmit ? '' : 'disabled'}
          >
            ${draft.busy ? 'Adding…' : 'Add to Photo Book'}
          </button>

          <button type="button" class="wc-photobook-skip" data-skip-photo-book ${draft.busy ? 'disabled' : ''}>
            Skip for now
          </button>

          ${chainNum !== '' ? `
            <p class="wc-photobook-contribute__foot">World Chain #${esc(chainNum)}</p>
          ` : ''}
        </section>
      </div>
    `;
  }

  function renderSelectedVoiceDetail(chain) {
    const backAttr = state.detailReturnView === 'completed' ? 'data-back-completed' : 'data-back-landing';
    /* Selected-Voice primary experience ships next; keep the existing turn flow for now. */
    return `
      <div class="wc-chain-detail wc-chain-detail--selected-voice">
        ${renderDetailTopbar(backAttr, { photoBookChainId: chain.id })}
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

  function isConnectOnCooldown(viewer) {
    if (!viewer) return false;
    if (viewer.connectOnCooldown) {
      const until = viewer.connectCooldownUntil ? new Date(viewer.connectCooldownUntil).getTime() : 0;
      if (Number.isFinite(until) && until > Date.now()) return true;
      // Stale flag from cache — treat as expired.
      if (!viewer.connectCooldownUntil) return true;
      return false;
    }
    const until = viewer.connectCooldownUntil ? new Date(viewer.connectCooldownUntil).getTime() : 0;
    return Number.isFinite(until) && until > Date.now();
  }

  function applyConnectCooldownToChain(chainId, body) {
    if (!body?.cooldownUntil) return;
    const chain = findChain(chainId);
    if (!chain) return;
    chain.viewer = chain.viewer || {};
    chain.viewer.connectOnCooldown = true;
    chain.viewer.connectCooldownUntil = body.cooldownUntil;
    chain.viewer.connectCooldownMs = body.cooldownMs || 0;
    chain.viewer.connectCooldownLabel = body.cooldownLabel || '';
    cacheChain(chain);
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
    const onCooldown = isConnectOnCooldown(viewer);
    const cooldownLabel = viewer.connectCooldownLabel
      || (state.feedback?.retryLabel ? String(state.feedback.retryLabel).replace(/^You can try again in:\s*/i, '') : '');
    const locked = state.busy || onCooldown;
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
          <input id="wc-chain-voice-input" name="voiceNumber" inputmode="numeric" autocomplete="off" placeholder="# __________" required ${locked ? 'disabled' : ''}>
          <button type="submit" class="wc-chain-primary" ${locked ? 'disabled' : ''}>CONNECT VOICE</button>
        </form>
        ${onCooldown ? `
          <div class="wc-chain-feedback" role="status">
            <strong>VOICE NOT FOUND</strong><br>
            That Voice doesn't match this destination.<br>
            You can try again in: ${esc(cooldownLabel || 'a few minutes')}
          </div>
        ` : state.feedback ? `
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

    // Selected Voices see the same viewer table; turn flow opens from their row.
    return renderViewerDetail(chain);
  }

  function render() {
    const root = document.getElementById('world-chain-root');
    if (!root) return;

    if (state.loading && !state.data) {
      root.innerHTML = renderBootSkeleton();
      bind();
      return;
    }

    if (state.error && !state.data) {
      root.innerHTML = `
        ${renderLandingSkeleton()}
        <div class="wc-chain-empty">
          <h3 class="wc-chain-empty__title">Could not load World Chain</h3>
          <p class="wc-chain-empty__copy">${esc(state.error)}</p>
          <button type="button" class="wc-chain-primary" style="margin-top:16px" data-retry>Try again</button>
        </div>
      `;
      bind();
      return;
    }

    if ((state.view === 'detail' || state.view === 'photo-book') && !findChain(state.activeChainId)) {
      root.innerHTML = renderDetailSkeleton();
      bind();
      return;
    }

    if (state.view === 'photo-book-contribute') {
      root.innerHTML = renderPhotoBookContribute();
    } else if (state.view === 'photo-book') {
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

  async function loadCompleted(opts = {}) {
    const skipUrl = !!opts.skipUrl;
    const keepDetail = !!opts.keepDetail;

    if (!keepDetail) {
      state.view = 'completed';
      state.activeChainId = null;
      state.feedback = null;
      const cached = readCachedCompleted();
      if (cached) {
        state.completed = cached;
        state.completedLoading = false;
      } else {
        state.completedLoading = true;
      }
      state.completedError = null;
      if (!skipUrl) syncUrl();
      render();
      window.scrollTo(0, 0);
    }
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
      cacheCompleted(state.completed);
      state.completedLoading = false;
      if (!keepDetail) render();
    } catch (err) {
      state.completedLoading = false;
      state.completedError = err.message || 'Could not load completed chains';
      if (!keepDetail) render();
      if (keepDetail) throw err;
    }
  }

  async function load() {
    const hadCache = !!state.data;
    if (!hadCache) {
      state.loading = true;
      render();
    }
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
      cacheTodayPayload(state.data);
      (state.data.chains || []).forEach(cacheChain);
      state.loading = false;
      state.error = null;
      applyUrlState();
      if (state.activeChainId) {
        const single = readCachedChain(state.activeChainId);
        if (single) mergeChainIntoState(single);
      }
      render();
    } catch (err) {
      state.loading = false;
      if (!state.data) {
        state.error = err.message || 'Could not load World Chain';
        render();
      }
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
    mergeChainIntoState(body.chain);
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

  function currentLocationKey() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function buildWorldChainUrl({ view = 'landing', chainId = null, from = null } = {}) {
    const url = new URL(window.location.href);
    url.searchParams.delete('chain');
    url.searchParams.delete('view');
    url.searchParams.delete('from');

    if (view === 'completed') {
      url.searchParams.set('view', 'completed');
    } else if (view === 'photo-book' && chainId) {
      url.searchParams.set('chain', chainId);
      url.searchParams.set('view', 'photo-book');
      if (from === 'completed') url.searchParams.set('from', 'completed');
    } else if (view === 'photo-book-contribute' && chainId) {
      url.searchParams.set('chain', chainId);
      url.searchParams.set('view', 'photo-book-contribute');
    } else if ((view === 'detail' || view === 'selected') && chainId) {
      url.searchParams.set('chain', chainId);
      if (from === 'completed') url.searchParams.set('from', 'completed');
    }

    return `${url.pathname}${url.search}${url.hash}`;
  }

  function syncUrl({ replace = false } = {}) {
    const next = buildWorldChainUrl({
      view: state.view,
      chainId: state.activeChainId,
      from: state.detailReturnView === 'completed' ? 'completed' : null,
    });
    if (currentLocationKey() === next) return;
    const payload = {
      wcView: state.view,
      chainId: state.activeChainId,
      from: state.detailReturnView,
    };
    if (replace) history.replaceState(payload, '', next);
    else history.pushState(payload, '', next);
  }

  function applyUrlState() {
    const params = new URLSearchParams(window.location.search);
    const chainId = params.get('chain');
    const view = params.get('view');
    const from = params.get('from');

    if (view === 'photo-book-contribute' && chainId) {
      state.view = 'photo-book-contribute';
      state.activeChainId = chainId;
      state.detailReturnView = 'landing';
      if (!state.photoBookOffer) {
        state.photoBookOffer = readPendingPhotoBook();
      }
      return 'photo-book-contribute';
    }
    if (view === 'photo-book' && chainId) {
      state.view = 'photo-book';
      state.activeChainId = chainId;
      state.detailReturnView = from === 'completed' ? 'completed' : 'landing';
      return 'photo-book';
    }
    if (chainId) {
      state.view = 'detail';
      state.activeChainId = chainId;
      state.detailReturnView = from === 'completed' ? 'completed' : 'landing';
      return 'detail';
    }
    if (view === 'completed') {
      state.view = 'completed';
      state.activeChainId = null;
      state.detailReturnView = 'landing';
      return 'completed';
    }
    state.view = 'landing';
    state.activeChainId = null;
    state.detailReturnView = 'landing';
    return 'landing';
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
        state.turnSheetOpen = false;
        const existing = findChain(state.activeChainId);
        if (existing) cacheChain(existing);
        syncUrl();
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
      syncUrl();
      render();
    });
    document.querySelector('[data-back-completed]')?.addEventListener('click', () => {
      state.view = 'completed';
      state.activeChainId = null;
      state.feedback = null;
      syncUrl();
      render();
      window.scrollTo(0, 0);
    });
    document.querySelector('[data-back-detail]')?.addEventListener('click', () => {
      state.view = 'detail';
      state.feedback = null;
      syncUrl();
      render();
      window.scrollTo(0, 0);
    });
    document.querySelectorAll('[data-open-turn-sheet]').forEach((el) => {
      const open = async () => {
        state.activeChainId = el.getAttribute('data-open-turn-sheet') || state.activeChainId;
        state.turnSheetOpen = true;
        state.feedback = null;
        render();
        window.scrollTo(0, 0);
        // Re-fetch so a prior wrong attempt still locks input after leave/reopen.
        try {
          await refreshChain(state.activeChainId);
          const chain = findChain(state.activeChainId);
          if (isConnectOnCooldown(chain?.viewer)) {
            state.feedback = {
              ok: false,
              title: 'VOICE NOT FOUND',
              message: "That Voice doesn't match this destination.",
              retryLabel: chain.viewer.connectCooldownLabel
                ? `You can try again in: ${chain.viewer.connectCooldownLabel}`
                : '',
            };
          }
          render();
        } catch {
          /* keep cached chain */
        }
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
    document.querySelectorAll('[data-close-turn-sheet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.turnSheetOpen = false;
        state.feedback = null;
        render();
      });
    });
    document.querySelectorAll('[data-open-photo-book]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeChainId = btn.getAttribute('data-open-photo-book') || state.activeChainId;
        state.view = 'photo-book';
        syncUrl();
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
            mergeChainIntoState(body.chain);
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
        const chainNow = findChain(chainId);
        if (isConnectOnCooldown(chainNow?.viewer)) {
          state.feedback = {
            ok: false,
            title: 'VOICE NOT FOUND',
            message: "That Voice doesn't match this destination.",
            retryLabel: chainNow.viewer.connectCooldownLabel
              ? `You can try again in: ${chainNow.viewer.connectCooldownLabel}`
              : (state.feedback?.retryLabel || ''),
          };
          render();
          return;
        }
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
          if (body.ok && body.chain) {
            mergeChainIntoState(body.chain);
            state.busy = false;
            state.feedback = null;
            // Connection already persisted — optional Photo Book step next.
            if (body.photoBookOffer) {
              openPhotoBookContribute(body.photoBookOffer);
              return;
            }
            state.turnSheetOpen = false;
            render();
            return;
          }
          if (body.chain) {
            mergeChainIntoState(body.chain);
            if (body.code === 'CHAIN_COMPLETE'
              || (!body.chain.viewer?.isActiveTurn && !body.chain.viewer?.needsStart)) {
              state.turnSheetOpen = false;
            }
          } else {
            applyConnectCooldownToChain(chainId, body);
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

    const selfieInput = document.querySelector('[data-selfie-input]');
    document.querySelectorAll('[data-open-selfie], [data-retake-selfie]').forEach((btn) => {
      btn.addEventListener('click', () => selfieInput?.click());
    });
    selfieInput?.addEventListener('change', async () => {
      const file = selfieInput.files?.[0];
      selfieInput.value = '';
      if (!file) return;
      try {
        const dataUrl = await compressSelfieFile(file);
        state.photoBookDraft = {
          ...state.photoBookDraft,
          dataUrl,
          error: null,
        };
        render();
      } catch {
        state.photoBookDraft = {
          ...state.photoBookDraft,
          error: 'Couldn’t use that photo. Try again or skip for now.',
        };
        render();
      }
    });

    document.querySelector('[data-photo-book-message]')?.addEventListener('input', (e) => {
      const el = e.target;
      let value = String(el.value || '');
      const chars = [...value];
      if (chars.length > PHOTO_BOOK_MAX_CHARS) {
        value = chars.slice(0, PHOTO_BOOK_MAX_CHARS).join('');
        el.value = value;
      }
      state.photoBookDraft = {
        ...state.photoBookDraft,
        message: value,
        error: null,
      };
      const counter = document.querySelector('[data-message-count]');
      if (counter) counter.textContent = `${[...value].length}/${PHOTO_BOOK_MAX_CHARS}`;
      const submit = document.querySelector('[data-submit-photo-book]');
      if (submit) {
        submit.disabled = !state.photoBookDraft.dataUrl || !!state.photoBookDraft.busy;
      }
    });

    document.querySelectorAll('[data-skip-photo-book]').forEach((btn) => {
      btn.addEventListener('click', () => finishPhotoBookStep());
    });

    document.querySelector('[data-submit-photo-book]')?.addEventListener('click', async () => {
      const offer = state.photoBookOffer || readPendingPhotoBook();
      if (!offer?.chainId || !offer?.connectionId || !state.photoBookDraft.dataUrl) return;
      if (state.photoBookDraft.busy) return;
      state.photoBookDraft = {
        ...state.photoBookDraft,
        busy: true,
        error: null,
      };
      render();
      try {
        const res = await fetch('/api/world-chain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add-photo-book',
            deviceId: deviceId(),
            eventId: eventId(),
            chainId: offer.chainId,
            connectionId: offer.connectionId,
            dataUrl: state.photoBookDraft.dataUrl,
            message: state.photoBookDraft.message || '',
            fileName: 'selfie.jpg',
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          throw new Error(body.error || 'Couldn’t add this to the Photo Book. Try again or skip for now.');
        }
        finishPhotoBookStep();
      } catch (err) {
        state.photoBookDraft = {
          ...state.photoBookDraft,
          busy: false,
          error: err.message || 'Couldn’t add this to the Photo Book. Try again or skip for now.',
        };
        render();
      }
    });
  }

  async function restoreFromUrl() {
    const restored = applyUrlState();
    if (restored === 'landing') {
      render();
      return;
    }

    if (restored === 'completed') {
      await loadCompleted({ skipUrl: true });
      return;
    }

    if (restored === 'photo-book-contribute') {
      if (!state.photoBookOffer) state.photoBookOffer = readPendingPhotoBook();
      if (!state.photoBookOffer) {
        state.view = 'detail';
        syncUrl({ replace: true });
      }
      render();
      if (state.activeChainId) {
        try { await refreshChain(state.activeChainId); } catch { /* keep */ }
        render();
      }
      return;
    }

    // detail / photo-book — stay on this chain after refresh
    render();
    if (!state.activeChainId) return;

    try {
      await refreshChain(state.activeChainId);
    } catch {
      /* keep cached */
    }
    if (!findChain(state.activeChainId)) {
      try {
        await loadCompleted({ skipUrl: true, keepDetail: true });
      } catch {
        /* ignore */
      }
    }
    render();
  }

  function hydrateFromCache() {
    applyUrlState();
    const today = readTodayPayload();
    if (today) {
      state.data = today;
      state.loading = false;
    }
    if (state.view === 'completed') {
      const completed = readCachedCompleted();
      if (completed) {
        state.completed = completed;
        state.completedLoading = false;
      }
    }
    if (state.activeChainId) {
      const single = readCachedChain(state.activeChainId);
      if (single) {
        mergeChainIntoState(single);
        state.loading = false;
      }
    }
    const pending = readPendingPhotoBook();
    if (pending?.chainId) {
      if (!state.activeChainId || state.activeChainId === pending.chainId) {
        state.photoBookOffer = pending;
        state.activeChainId = pending.chainId;
        state.view = 'photo-book-contribute';
        state.loading = false;
      }
    }
  }

  function init() {
    if (typeof WorldChoirNav !== 'undefined') {
      WorldChoirNav.startWatcher('world-chain');
    }
    window.addEventListener('popstate', () => {
      restoreFromUrl();
    });

    // Instant paint from URL + session cache (never flash the wrong page).
    hydrateFromCache();
    render();

    load().then(async () => {
      if (state.view === 'completed') {
        await loadCompleted({ skipUrl: true });
        return;
      }
      if ((state.view === 'detail' || state.view === 'photo-book') && state.activeChainId) {
        try {
          await refreshChain(state.activeChainId);
        } catch {
          /* keep cached */
        }
        if (!findChain(state.activeChainId)) {
          try {
            await loadCompleted({ skipUrl: true, keepDetail: true });
          } catch {
            /* ignore */
          }
        }
        render();
      }
    });
  }

  return { init };
})();

window.WorldChainPage = WorldChainPage;
