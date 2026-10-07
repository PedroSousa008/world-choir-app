/**
 * QR Day-1 Daily Act — after Voice creation, present today's existing Daily Act
 * centered once. Uses the normal Daily Acts completion API. Share timer is independent.
 */
const WorldChoirQrFirstDailyAct = (() => {
  const ATTR_KEY = 'wc_qr_attr';
  const EVENT = {
    PRESENTED: 'qr_first_daily_act_presented',
    COMPLETED: 'qr_first_daily_act_completed',
    DISMISSED: 'qr_first_daily_act_dismissed',
  };

  let presenting = false;
  let open = false;
  let pendingAfterConsent = false;

  function localDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

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

  function isQrFirstTouch() {
    const a = readAttr();
    return !!(a && a.campaignId);
  }

  /** Day-1 = same local calendar day as Voice creation (Daily Acts date convention). */
  function isQrOnboardingDay1() {
    if (!isQrFirstTouch()) return false;
    const a = readAttr();
    const day = a?.voiceCreatedLocalDate;
    if (!day) return false;
    return day === localDateString();
  }

  function alreadyHandledPresentation() {
    const a = readAttr();
    return !!(a && (a.firstDailyActPresentedAt || a.firstDailyActDismissedAt || a.firstDailyActCompletedAt));
  }

  function consentBlocking() {
    try {
      if (typeof WorldChoirPrivacy !== 'undefined') {
        if (WorldChoirPrivacy.hasDecision && !WorldChoirPrivacy.hasDecision()) return true;
      }
      const overlay = document.getElementById('wc-privacy-overlay');
      if (overlay && !overlay.hidden) return true;
    } catch { /* ignore */ }
    return false;
  }

  function deviceId() {
    try {
      return (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getDeviceId?.())
        || localStorage.getItem('wc_anonymous_device_id')
        || '';
    } catch {
      return '';
    }
  }

  function anonId() {
    try {
      return localStorage.getItem('wc_qr_anon') || '';
    } catch {
      return '';
    }
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function postQrEvent(type, meta = {}) {
    if (typeof WorldChoirQrAttribution !== 'undefined' && WorldChoirQrAttribution.postEvent) {
      await WorldChoirQrAttribution.postEvent(type, { meta });
      return;
    }
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
          campaignId: a.campaignId || null,
          meta,
        }),
        keepalive: true,
      });
    } catch { /* best-effort */ }
  }

  async function fetchTodayAct() {
    await WorldChoirDB?.readyIdentity?.();
    const date = localDateString();
    const res = await fetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&date=${encodeURIComponent(date)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Daily Act unavailable');
    return data;
  }

  function ensureStyles() {
    if (document.getElementById('wc-qr-fda-css')) return;
    // Reuse Daily Acts sheet styles when available
    if (!document.getElementById('daily-acts-page-css')) {
      const link = document.createElement('link');
      link.id = 'daily-acts-page-css';
      link.rel = 'stylesheet';
      link.href = 'css/daily-acts-page.css?v=20261007fda1';
      document.head.appendChild(link);
    }
    const style = document.createElement('style');
    style.id = 'wc-qr-fda-css';
    style.textContent = `
      .wc-qr-fda-overlay {
        position: fixed;
        inset: 0;
        z-index: 72;
        display: grid;
        place-items: center;
        padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
        background: rgba(0, 0, 0, 0.62);
        opacity: 0;
        transition: opacity 0.45s ease;
        pointer-events: none;
      }
      .wc-qr-fda-overlay.is-visible {
        opacity: 1;
        pointer-events: auto;
      }
      .wc-qr-fda-overlay[hidden] { display: none !important; }
      .wc-qr-fda-card {
        width: min(440px, 100%);
        max-height: min(86vh, 720px);
        overflow: auto;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 18px;
        background: #0c0c0e;
        padding: 22px 20px 18px;
        color: #f2efe8;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
        transform: translateY(10px) scale(0.985);
        opacity: 0;
        transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease;
      }
      .wc-qr-fda-overlay.is-visible .wc-qr-fda-card {
        transform: translateY(0) scale(1);
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .wc-qr-fda-overlay,
        .wc-qr-fda-card { transition: none; }
        .wc-qr-fda-card { transform: none; }
      }
      .wc-qr-fda-kicker {
        margin: 0 0 8px;
        font-size: 0.68rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #4ec5e8;
      }
      .wc-qr-fda-title {
        margin: 0 0 12px;
        font-size: 1.35rem;
        letter-spacing: -0.02em;
        line-height: 1.25;
      }
      .wc-qr-fda-body {
        margin: 0 0 18px;
        color: #a8abb4;
        line-height: 1.5;
        font-size: 0.95rem;
      }
      .wc-qr-fda-actions {
        display: grid;
        gap: 8px;
      }
      .wc-qr-fda-close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        color: #c5c7ce;
        font-size: 1.2rem;
        cursor: pointer;
      }
      .wc-qr-fda-card-wrap { position: relative; width: min(440px, 100%); }
      .wc-qr-fda-moment {
        text-align: center;
        padding: 28px 8px 18px;
      }
      .wc-qr-fda-moment__check {
        display: inline-grid;
        place-items: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 2px solid #4ec5e8;
        color: #4ec5e8;
        font-size: 1.4rem;
        margin-bottom: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  function removeOverlay() {
    const el = document.getElementById('wc-qr-fda-overlay');
    if (!el) return;
    el.classList.remove('is-visible');
    open = false;
    window.setTimeout(() => el.remove(), 480);
  }

  async function dismiss(reason) {
    if (!open && reason !== 'already') return;
    const a = readAttr();
    if (!a?.firstDailyActDismissedAt && !a?.firstDailyActCompletedAt) {
      writeAttr({ firstDailyActDismissedAt: new Date().toISOString() });
      await postQrEvent(EVENT.DISMISSED, {
        actId: a?.firstDailyActId || null,
        actDate: a?.firstDailyActDate || localDateString(),
      });
    }
    removeOverlay();
  }

  async function complete(assignmentDate, actId) {
    const btn = document.getElementById('wc-qr-fda-complete');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Completing…';
    }
    try {
      const res = await fetch('/api/daily-peace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: deviceId(),
          date: localDateString(),
          assignmentDate,
          action: 'complete',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not complete Daily Act');

      writeAttr({
        firstDailyActCompletedAt: new Date().toISOString(),
        firstDailyActId: actId || readAttr()?.firstDailyActId || null,
        firstDailyActDate: assignmentDate || localDateString(),
      });
      await postQrEvent(EVENT.COMPLETED, {
        actId: actId || null,
        actDate: assignmentDate || localDateString(),
      });

      try {
        window.dispatchEvent(new CustomEvent('wc-qr-engagement', { detail: { type: 'daily_act' } }));
      } catch { /* ignore */ }

      if (typeof DailyActsPeace !== 'undefined') {
        DailyActsPeace.refreshBanner?.();
      }

      const wrap = document.querySelector('.wc-qr-fda-card');
      if (wrap) {
        wrap.innerHTML = `
          <div class="wc-qr-fda-moment">
            <div class="wc-qr-fda-moment__check" aria-hidden="true">✓</div>
            <p class="wc-qr-fda-kicker">Act completed</p>
            <p class="wc-qr-fda-body">Thank you for creating a little more peace.</p>
          </div>`;
      }
      window.setTimeout(() => removeOverlay(), 1600);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Complete act';
      }
      alert(err.message || 'Could not save completion.');
    }
  }

  function paintOverlay(payload) {
    ensureStyles();
    const existing = document.getElementById('wc-qr-fda-overlay');
    if (existing) existing.remove();

    const act = payload.act || {};
    const uda = payload.userDailyAct || {};
    const assignmentDate = uda.date || localDateString();
    const actId = act.id || uda.actId || null;

    const overlay = document.createElement('div');
    overlay.id = 'wc-qr-fda-overlay';
    overlay.className = 'wc-qr-fda-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <div class="wc-qr-fda-card-wrap">
        <div class="wc-qr-fda-card" role="dialog" aria-modal="true" aria-labelledby="wc-qr-fda-title">
          <button type="button" class="wc-qr-fda-close" id="wc-qr-fda-dismiss" aria-label="Close">×</button>
          <p class="wc-qr-fda-kicker">Today's Daily Act of Peace</p>
          ${act.categoryLabel ? `<p class="wc-qr-fda-body" style="margin-bottom:6px;font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase">${esc(act.categoryLabel)}</p>` : ''}
          <h2 class="wc-qr-fda-title" id="wc-qr-fda-title">${esc(act.text || 'Today\'s Act of Peace')}</h2>
          ${act.explanation ? `<p class="wc-qr-fda-body">${esc(act.explanation)}</p>` : '<p class="wc-qr-fda-body">A small action for a little more peace.</p>'}
          <div class="wc-qr-fda-actions">
            <button type="button" class="btn btn-primary" id="wc-qr-fda-complete" data-assignment-date="${esc(assignmentDate)}" data-act-id="${esc(actId || '')}">Complete act</button>
            <button type="button" class="btn btn-secondary" id="wc-qr-fda-not-now">Not now</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    open = true;

    requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) void dismiss('backdrop');
    });
    document.getElementById('wc-qr-fda-dismiss')?.addEventListener('click', () => void dismiss('close'));
    document.getElementById('wc-qr-fda-not-now')?.addEventListener('click', () => void dismiss('not-now'));
    document.getElementById('wc-qr-fda-complete')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      void complete(btn.getAttribute('data-assignment-date'), btn.getAttribute('data-act-id'));
    });
  }

  async function presentIfEligible() {
    if (presenting || open) return;
    if (!isQrFirstTouch()) return;
    if (!isQrOnboardingDay1()) return;
    if (alreadyHandledPresentation()) return;

    if (consentBlocking()) {
      pendingAfterConsent = true;
      return;
    }

    presenting = true;
    try {
      const data = await fetchTodayAct();
      const uda = data?.userDailyAct;
      const act = data?.act;
      if (!uda || !act?.text) {
        presenting = false;
        return;
      }
      if (uda.completed) {
        // Already completed today — mark presented+completed without reopening UI
        writeAttr({
          firstDailyActPresentedAt: new Date().toISOString(),
          firstDailyActCompletedAt: uda.completedAt || new Date().toISOString(),
          firstDailyActId: act.id || null,
          firstDailyActDate: uda.date || localDateString(),
        });
        await postQrEvent(EVENT.PRESENTED, { actId: act.id || null, actDate: uda.date || localDateString(), alreadyCompleted: true });
        await postQrEvent(EVENT.COMPLETED, { actId: act.id || null, actDate: uda.date || localDateString(), alreadyCompleted: true });
        presenting = false;
        return;
      }

      writeAttr({
        firstDailyActPresentedAt: new Date().toISOString(),
        firstDailyActId: act.id || null,
        firstDailyActDate: uda.date || localDateString(),
      });
      await postQrEvent(EVENT.PRESENTED, {
        actId: act.id || null,
        actDate: uda.date || localDateString(),
      });

      // Suppress top banner for Day 1 (also dismiss server-side if shown)
      try {
        if (typeof DailyActsPeace !== 'undefined') {
          localStorage.setItem(`wc_daily_peace_banner_dismiss_${localDateString()}`, '1');
          DailyActsPeace.refreshBanner?.();
        }
      } catch { /* ignore */ }

      paintOverlay(data);
    } catch (err) {
      console.warn('QR first Daily Act presentation skipped:', err?.message || err);
    } finally {
      presenting = false;
    }
  }

  function onVoiceCreated() {
    if (!isQrFirstTouch()) return;
    const a = readAttr();
    if (!a?.voiceCreatedLocalDate) {
      writeAttr({
        voiceCreatedAt: a?.voiceCreatedAt || Date.now(),
        voiceCreatedLocalDate: localDateString(),
      });
    }
    // Slight delay so Voice success UI / navigation can settle; never blocks voice.
    window.setTimeout(() => void presentIfEligible(), 700);
  }

  function init() {
    window.addEventListener('wc-pledge-added', onVoiceCreated);
    window.addEventListener('wc-privacy-consent', () => {
      if (pendingAfterConsent) {
        pendingAfterConsent = false;
        window.setTimeout(() => void presentIfEligible(), 400);
      }
    });
    // Soft-tab navigations: do not re-open; only suppress banner via DailyActsPeace
  }

  return {
    init,
    presentIfEligible,
    isQrOnboardingDay1,
    isQrFirstTouch,
  };
})();

WorldChoirQrFirstDailyAct.init();
