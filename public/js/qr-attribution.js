/**
 * QR acquisition attribution + 3-minute global Share World Choir experience.
 * Persists eligibility across navigations via localStorage (enteredAt).
 *
 * Attribution rules (client):
 * - First-touch campaignId / referredByToken in wc_qr_attr is never overwritten here.
 * - Share invite only for QR first-touch visitors (campaignId present).
 * - enteredAt survives tab/page changes; timer does not restart on navigation.
 */
const WorldChoirQrAttribution = (() => {
  const ATTR_KEY = 'wc_qr_attr';
  const ANON_KEY = 'wc_qr_anon';
  const SHARE_MS = 3 * 60 * 1000;
  const DAY_MS = 86400000;
  const EVENT = {
    APP_OPEN: 'qr_app_open',
    ILL_SING: 'ill_sing_clicked',
    VOICE_CREATED: 'voice_created',
    SHARE_ELIGIBLE: 'share_prompt_eligible',
    SHARE_OPENED: 'share_prompt_opened',
    SHARE_CLICKED: 'share_clicked',
    OPENED_MAP: 'opened_map',
    PRACTICED_SONG: 'practiced_song',
    DAILY_ACT: 'completed_daily_act',
    WORLD_CHAIN: 'used_world_chain',
    RETURN_D1: 'returned_day_1',
    RETURN_D7: 'returned_day_7',
    RETURN_D30: 'returned_day_30',
  };

  let bootstrapped = false;
  let shareTimer = null;
  let uiMounted = false;

  function readAttr() {
    try {
      return JSON.parse(localStorage.getItem(ATTR_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function writeAttr(patch) {
    const cur = readAttr() || {};
    const next = { ...cur, ...patch };
    try {
      localStorage.setItem(ATTR_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    return next;
  }

  function anonId() {
    try {
      let id = localStorage.getItem(ANON_KEY);
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) || `a_${Date.now()}`;
        localStorage.setItem(ANON_KEY, id);
      }
      return id;
    } catch {
      return `a_${Date.now()}`;
    }
  }

  function deviceId() {
    try {
      return (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getDeviceId?.()) || '';
    } catch {
      return '';
    }
  }

  function hasAttribution() {
    const a = readAttr();
    return !!(a && (a.campaignId || a.referredByToken));
  }

  async function postEvent(type, extra = {}) {
    if (!hasAttribution() && !extra.campaignId) return;
    const a = readAttr() || {};
    try {
      await fetch('/api/qr?action=event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          visitorKey: a.visitorKey || null,
          deviceId: deviceId(),
          anonId: anonId(),
          campaignId: a.campaignId || extra.campaignId || null,
          ...extra,
        }),
        keepalive: true,
      });
    } catch { /* best-effort */ }
  }

  function ensureShareUi() {
    if (document.getElementById('wc-qr-share-fab')) return;
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'wc-qr-share-fab';
    fab.className = 'wc-qr-share-fab';
    fab.hidden = true;
    fab.setAttribute('aria-label', 'Share World Choir');
    fab.innerHTML = `<span class="wc-qr-share-fab__glow" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/>
        <path d="M8.2 13.1 15.7 17M15.8 7 8.3 10.9"/>
      </svg>`;
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.id = 'wc-qr-share-overlay';
    overlay.className = 'wc-qr-share-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="wc-qr-share-sheet" role="dialog" aria-modal="true" aria-labelledby="wc-qr-share-title">
        <h2 id="wc-qr-share-title" class="wc-qr-share-sheet__title">Connect someone to this moment.</h2>
        <p class="wc-qr-share-sheet__body">World Choir becomes more powerful with every person who joins. Share it with your friends and family and help connect the world for one moment of peace.</p>
        <div class="wc-qr-share-sheet__actions">
          <button type="button" class="btn btn-primary" data-wc-qr-share>Share World Choir</button>
          <button type="button" class="btn btn-secondary" data-wc-qr-dismiss>Not now</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    fab.addEventListener('click', () => openShareSheet());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeShareSheet(false);
    });
    overlay.querySelector('[data-wc-qr-dismiss]')?.addEventListener('click', () => closeShareSheet(true));
    overlay.querySelector('[data-wc-qr-share]')?.addEventListener('click', () => void shareNow());
    uiMounted = true;
  }

  function showFab(animate) {
    ensureShareUi();
    const fab = document.getElementById('wc-qr-share-fab');
    if (!fab) return;
    fab.hidden = false;
    fab.classList.add('is-visible');
    if (animate) {
      fab.classList.remove('is-attention');
      void fab.offsetWidth;
      fab.classList.add('is-attention');
      setTimeout(() => fab.classList.remove('is-attention'), 4800);
    }
  }

  function hideFab() {
    const fab = document.getElementById('wc-qr-share-fab');
    if (fab) {
      fab.classList.remove('is-visible', 'is-attention');
      fab.hidden = true;
    }
  }

  async function openShareSheet() {
    ensureShareUi();
    const overlay = document.getElementById('wc-qr-share-overlay');
    if (overlay) overlay.hidden = false;
    await postEvent(EVENT.SHARE_OPENED);
  }

  function closeShareSheet(dismiss) {
    const overlay = document.getElementById('wc-qr-share-overlay');
    if (overlay) overlay.hidden = true;
    if (dismiss) {
      writeAttr({ shareDismissedSession: true });
      hideFab();
    }
  }

  async function shareNow() {
    const a = readAttr() || {};
    let shareUrl = `${window.location.origin}/`;
    try {
      const res = await fetch('/api/qr?action=share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorKey: a.visitorKey || null,
          deviceId: deviceId(),
          anonId: anonId(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) shareUrl = body.url;
      else if (res.ok && body.urlPath) shareUrl = `${window.location.origin}${body.urlPath}`;
    } catch { /* fallback home */ }

    const text = 'I\'m joining World Choir 2027. Once a year, the entire world sings together. Add your voice.';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'World Choir', text, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      }
    } catch { /* user cancelled */ }
    await postEvent(EVENT.SHARE_CLICKED);
    closeShareSheet(true);
  }

  function scheduleShareEligibility() {
    if (shareTimer) clearTimeout(shareTimer);
    const a = readAttr();
    if (!a?.campaignId) return;
    if (a.shareDismissedSession) return;

    const enteredAt = Number(a.enteredAt) || Date.now();
    if (!a.enteredAt) writeAttr({ enteredAt });
    const due = enteredAt + SHARE_MS;
    const wait = Math.max(0, due - Date.now());

    const reveal = async () => {
      const latest = readAttr();
      if (!latest?.campaignId || latest.shareDismissedSession) return;
      if (!latest.shareEligibleAt) {
        writeAttr({ shareEligibleAt: new Date().toISOString() });
        await postEvent(EVENT.SHARE_ELIGIBLE);
      }
      showFab(true);
    };

    if (wait <= 0) reveal();
    else shareTimer = setTimeout(reveal, wait);
  }

  function trackIllSing() {
    void postEvent(EVENT.ILL_SING);
  }

  function trackPageEngagement() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('map')) void postEvent(EVENT.OPENED_MAP);
    if (path.includes('world-chain')) void postEvent(EVENT.WORLD_CHAIN);
    if (path.includes('daily-act')) void postEvent(EVENT.DAILY_ACT);
  }

  function onCustomEngagement(e) {
    const type = e?.detail?.type;
    if (type === 'practiced_song') void postEvent(EVENT.PRACTICED_SONG);
    if (type === 'daily_act') void postEvent(EVENT.DAILY_ACT);
    if (type === 'world_chain') void postEvent(EVENT.WORLD_CHAIN);
    if (type === 'opened_map') void postEvent(EVENT.OPENED_MAP);
  }

  function ensureVoiceCreatedAt() {
    const a = readAttr();
    if (a?.voiceCreatedAt) return Number(a.voiceCreatedAt);
    try {
      const pledge = typeof WorldChoirDB !== 'undefined'
        ? (WorldChoirDB.getMyPledge?.() || WorldChoirDB.getCurrentPledge?.())
        : null;
      const raw = pledge?.created_at || pledge?.createdAt || pledge?.joinedAt;
      if (raw) {
        const ms = Date.parse(raw);
        if (Number.isFinite(ms)) {
          writeAttr({ voiceCreatedAt: ms });
          return ms;
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  function checkReturns() {
    if (!hasAttribution()) return;
    const a = readAttr();
    if (!a?.campaignId && !a?.referredByToken) return;
    const created = ensureVoiceCreatedAt();
    if (!created) return;
    const age = Date.now() - Number(created);
    if (age >= DAY_MS && !a.returnD1Sent) {
      writeAttr({ returnD1Sent: true });
      void postEvent(EVENT.RETURN_D1);
    }
    if (age >= 7 * DAY_MS && !a.returnD7Sent) {
      writeAttr({ returnD7Sent: true });
      void postEvent(EVENT.RETURN_D7);
    }
    if (age >= 30 * DAY_MS && !a.returnD30Sent) {
      writeAttr({ returnD30Sent: true });
      void postEvent(EVENT.RETURN_D30);
    }
  }

  function bindIllSingHooks() {
    document.addEventListener('click', (e) => {
      const t = e.target?.closest?.(
        '#ill-sing-btn, [data-ill-sing], .ill-sing-btn, .btn-hero, #map-empty-btn, [data-action="ill-sing"]'
      );
      if (!t) return;
      const label = `${t.textContent || ''} ${t.getAttribute('aria-label') || ''}`.toLowerCase();
      if (t.id === 'ill-sing-btn' || t.hasAttribute('data-ill-sing') || t.classList.contains('ill-sing-btn')
        || t.id === 'map-empty-btn' || /i.?ll sing|ill sing/.test(label) || t.classList.contains('btn-hero')) {
        trackIllSing();
      }
    }, true);
    window.addEventListener('wc-ill-sing-clicked', trackIllSing);
    window.addEventListener('wc-qr-engagement', onCustomEngagement);
    window.addEventListener('wc-pledge-added', (e) => {
      const created = Date.parse(e?.detail?.created_at || e?.detail?.createdAt || '') || Date.now();
      writeAttr({ voiceCreatedAt: created });
      // Server attributes on /api/join; client only stores local retention clock.
      checkReturns();
    });

    document.addEventListener('click', (e) => {
      if (e.target?.closest?.('#practice-song-btn, [data-practice-song], .btn-practice')) {
        void postEvent(EVENT.PRACTICED_SONG);
      }
    }, true);
  }

  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    if (!hasAttribution()) return;

    const a = readAttr();
    if (!a.enteredAt) writeAttr({ enteredAt: Date.now() });

    await postEvent(EVENT.APP_OPEN);
    bindIllSingHooks();
    trackPageEngagement();
    checkReturns();
    scheduleShareEligibility();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkReturns();
        scheduleShareEligibility();
      }
    });
  }

  function init() {
    const run = () => { void bootstrap(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
    window.addEventListener('wc-tab-show', () => {
      trackPageEngagement();
      checkReturns();
      scheduleShareEligibility();
    });
  }

  return {
    init,
    trackIllSing,
    postEvent,
    hasAttribution,
    readAttr,
    EVENT,
  };
})();

WorldChoirQrAttribution.init();
