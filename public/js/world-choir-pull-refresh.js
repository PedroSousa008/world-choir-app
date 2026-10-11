/**
 * WorldChoirPullRefresh — Instagram / TikTok-style pull-to-refresh.
 *
 * Rubber-band pull from scrollTop === 0 → arm at ~72px → spinner parks →
 * force-refresh live data → spring dismiss.
 * Never transforms html/body/#nav-root (bottom tabs stay fixed).
 */
const WorldChoirPullRefresh = (() => {
  const ARM_PX = 72;
  const MAX_PULL = 128;
  const PARK_PX = 64;
  const AXIS_LOCK = 8;
  const MIN_REFRESH_MS = 700;
  const REDUCED = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let bound = false;
  let pulling = false;
  let refreshing = false;
  let armed = false;
  let gesture = null;
  let pullY = 0;
  let indicator = null;
  let contentEl = null;

  function prefersReducedMotion() {
    return REDUCED;
  }

  function scrollTop() {
    return window.scrollY
      || document.documentElement.scrollTop
      || document.body.scrollTop
      || 0;
  }

  function resolveContentEl() {
    return document.querySelector('#wc-tab-host .wc-tab-panel.is-active')
      || document.querySelector(
        'main.page, main.donate-page, main.memory-page, main.profile-page, main.passport-page, #daily-acts-page, #world-chain-page, #home-page'
      );
  }

  function ensureIndicator() {
    if (indicator && document.body.contains(indicator)) return indicator;
    indicator = document.createElement('div');
    indicator.id = 'wc-pull-refresh';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = `
      <svg class="wc-ptr__ring wc-ptr__spinner" viewBox="0 0 36 36" width="22" height="22" aria-hidden="true">
        <circle class="wc-ptr__track" cx="18" cy="18" r="10" fill="none" stroke-width="2.5"></circle>
        <circle class="wc-ptr__arc" cx="18" cy="18" r="10" fill="none" stroke-width="2.5"
          stroke-dasharray="62.8" stroke-dashoffset="62.8"></circle>
      </svg>
    `;
    document.body.appendChild(indicator);
    return indicator;
  }

  function setIndicator(progress, y, { spinning = false } = {}) {
    const el = ensureIndicator();
    const p = Math.max(0, Math.min(1, progress));
    const scale = 0.55 + p * 0.45;
    const opacity = Math.min(1, p * 1.35);
    el.classList.toggle('is-visible', opacity > 0.05 || spinning);
    el.classList.toggle('is-refreshing', !!spinning);
    el.style.transform = `translate3d(-50%, ${Math.max(0, y - 8)}px, 0) scale(${scale})`;
    el.style.opacity = String(spinning ? 1 : opacity);
    const arc = el.querySelector('.wc-ptr__arc');
    if (arc && !spinning) {
      const circ = 62.8;
      arc.setAttribute('stroke-dashoffset', String(circ * (1 - p)));
    }
  }

  function dampPull(rawDy) {
    const x = Math.max(0, rawDy);
    // Elastic resistance — never 1:1 with the finger (Instagram feel).
    return MAX_PULL * (1 - Math.exp(-x / (ARM_PX * 1.2)));
  }

  function applyPull(y) {
    pullY = y;
    contentEl = resolveContentEl();
    if (contentEl) {
      contentEl.style.willChange = 'transform';
      contentEl.style.transition = 'none';
      contentEl.style.transform = y > 0.5 ? `translate3d(0, ${y}px, 0)` : '';
    }
    const progress = Math.min(1, y / ARM_PX);
    setIndicator(progress, Math.min(y * 0.55, 28), { spinning: false });
  }

  function clearContentTransform({ animate = false } = {}) {
    contentEl = contentEl || resolveContentEl();
    if (!contentEl) return;
    if (animate && !prefersReducedMotion()) {
      contentEl.style.transition = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)';
      contentEl.style.transform = 'translate3d(0, 0, 0)';
      window.setTimeout(() => {
        if (!contentEl) return;
        contentEl.style.transition = '';
        contentEl.style.transform = '';
        contentEl.style.willChange = '';
      }, 300);
    } else {
      contentEl.style.transition = '';
      contentEl.style.transform = '';
      contentEl.style.willChange = '';
    }
  }

  function hapticArm() {
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }

  function isBlocked(target) {
    if (refreshing) return true;
    if (document.body.classList.contains('map-page')) return true;
    if (document.body.classList.contains('wc-global-live-active')) return true;
    if (document.documentElement.classList.contains('wc-booting')) return true;
    if (target?.closest?.(
      '.mem-carousel__viewport, .leaflet-container, .maplibregl-canvas, input, textarea, select, [contenteditable="true"], .modal, .overlay, .donate-modal, .df-checkout, .mem-composer, .wc-global-live'
    )) {
      return true;
    }
    if (document.querySelector(
      '.overlay:not([hidden]):not([aria-hidden="true"]), .modal.is-open, .df-checkout.is-open, .mem-composer.is-open, dialog[open]'
    )) {
      return true;
    }
    return false;
  }

  async function runRefresh() {
    refreshing = true;
    armed = false;
    const park = PARK_PX;
    contentEl = resolveContentEl();
    if (contentEl && !prefersReducedMotion()) {
      contentEl.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
      contentEl.style.transform = `translate3d(0, ${park}px, 0)`;
    } else if (contentEl) {
      contentEl.style.transform = `translate3d(0, ${park}px, 0)`;
    }
    setIndicator(1, 22, { spinning: true });

    const started = performance.now();
    try {
      const jobs = [];
      if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.forceRefreshLiveData) {
        jobs.push(WorldChoirDB.forceRefreshLiveData().catch(() => {}));
      } else if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.syncMapAggregates) {
        jobs.push(WorldChoirDB.syncMapAggregates().catch(() => {}));
      }
      if (typeof WorldChoirServerTime !== 'undefined' && WorldChoirServerTime.sync) {
        jobs.push(WorldChoirServerTime.sync(true).catch(() => {}));
      }

      const tabId = typeof WorldChoirTabs !== 'undefined' ? WorldChoirTabs.getActive?.() : null;
      const api = tabId && typeof WorldChoirTabs !== 'undefined'
        ? (
          tabId === 'home' ? (window.WorldChoirHome || null)
            : tabId === 'map' ? (window.WorldChoirMap || null)
              : tabId === 'donate' ? (window.WorldChoirDonate || null)
                : tabId === 'profile' ? (window.ProfilePage || null)
                  : tabId === 'memory' ? (window.WorldChoirMemory || null)
                    : tabId === 'passport' ? (window.PassportPage || null)
                      : tabId === 'daily-acts' ? (window.DailyActsPage || null)
                        : tabId === 'world-chain' ? (window.WorldChainPage || null)
                          : null
        )
        : null;

      if (api?.onPullRefresh) {
        jobs.push(Promise.resolve(api.onPullRefresh()).catch(() => {}));
      } else if (api?.onTabShow) {
        jobs.push(Promise.resolve(api.onTabShow()).catch(() => {}));
      } else if (api?.refresh) {
        jobs.push(Promise.resolve(api.refresh()).catch(() => {}));
      }

      try {
        window.dispatchEvent(new CustomEvent('wc-pull-refresh', { detail: { tab: tabId } }));
      } catch {
        /* ignore */
      }

      await Promise.all(jobs);
    } finally {
      const elapsed = performance.now() - started;
      if (elapsed < MIN_REFRESH_MS) {
        await new Promise((r) => setTimeout(r, MIN_REFRESH_MS - elapsed));
      }
      refreshing = false;
      pullY = 0;
      clearContentTransform({ animate: true });
      setIndicator(0, 0, { spinning: false });
      ensureIndicator().classList.remove('is-visible', 'is-refreshing');
      ensureIndicator().style.opacity = '0';
    }
  }

  function onTouchStart(ev) {
    if (refreshing || pulling) return;
    if (scrollTop() > 1) return;
    if (isBlocked(ev.target)) return;
    const t = ev.touches?.[0];
    if (!t) return;
    gesture = {
      startX: t.clientX,
      startY: t.clientY,
      axis: null,
      active: true,
    };
    contentEl = resolveContentEl();
  }

  function onTouchMove(ev) {
    const g = gesture;
    if (!g?.active || refreshing) return;
    const t = ev.touches?.[0];
    if (!t) return;

    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;

    if (!g.axis) {
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
      g.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      if (g.axis !== 'y' || dy <= 0 || scrollTop() > 1) {
        g.active = false;
        gesture = null;
        return;
      }
      pulling = true;
    }

    if (g.axis !== 'y' || !pulling) return;
    if (scrollTop() > 1) {
      cancelPull({ animate: false });
      return;
    }

    const y = dampPull(dy);
    if (y > 2) ev.preventDefault();
    applyPull(y);

    const nowArmed = y >= ARM_PX;
    if (nowArmed && !armed) {
      armed = true;
      hapticArm();
    } else if (!nowArmed) {
      armed = false;
    }
  }

  function cancelPull({ animate = true } = {}) {
    pulling = false;
    armed = false;
    gesture = null;
    pullY = 0;
    clearContentTransform({ animate });
    setIndicator(0, 0, { spinning: false });
    ensureIndicator().classList.remove('is-visible', 'is-refreshing');
    ensureIndicator().style.opacity = '0';
  }

  function onTouchEnd() {
    const g = gesture;
    gesture = null;
    if (!pulling) return;
    pulling = false;
    if (armed && !refreshing) {
      armed = false;
      void runRefresh();
      return;
    }
    cancelPull({ animate: true });
  }

  function bind() {
    if (bound) return;
    bound = true;
    ensureIndicator();
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
  }

  function init() {
    bind();
  }

  return { init, refresh: runRefresh };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => WorldChoirPullRefresh.init(), { once: true });
} else {
  WorldChoirPullRefresh.init();
}
