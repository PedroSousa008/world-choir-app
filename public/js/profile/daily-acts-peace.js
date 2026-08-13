/**
 * Daily Acts of Peace — top banner + navigation into the Daily Acts page
 */
const DailyActsPeace = (() => {
  let state = null;
  let bannerVisible = false;
  let started = false;

  function localDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function deviceId() {
    return WorldChoirDB.getDeviceId();
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function fetchToday() {
    await WorldChoirDB.ready();
    const date = localDateString();
    const data = await apiFetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&date=${encodeURIComponent(date)}`
    );
    state = data;
    return data;
  }

  function ensureStylesheet() {
    if (document.getElementById('daily-peace-css')) return;
    const link = document.createElement('link');
    link.id = 'daily-peace-css';
    link.rel = 'stylesheet';
    link.href = 'css/daily-peace.css?v=20260810i';
    document.head.appendChild(link);
  }

  function ensureBanner() {
    if (document.getElementById('daily-peace-banner')) return;
    const el = document.createElement('div');
    el.id = 'daily-peace-banner';
    el.className = 'daily-peace-banner';
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.innerHTML = `
      <button type="button" class="daily-peace-banner__close" id="daily-peace-banner-close" aria-label="Dismiss today’s act notification">×</button>
      <button type="button" class="daily-peace-banner__body" id="daily-peace-banner-open">
        <span class="daily-peace-banner__label">TODAY'S ACT OF PEACE</span>
        <span class="daily-peace-banner__title" id="daily-peace-banner-title"></span>
      </button>
    `;
    document.body.prepend(el);

    document.getElementById('daily-peace-banner-close')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissBanner();
    });
    document.getElementById('daily-peace-banner-open')?.addEventListener('click', () => {
      open({ tab: 'today' });
    });
  }

  function setBannerVisible(visible) {
    const banner = document.getElementById('daily-peace-banner');
    if (!banner) return;
    bannerVisible = !!visible;
    if (visible) {
      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add('is-visible'));
      document.body.classList.add('has-daily-peace-banner');
    } else {
      banner.classList.remove('is-visible');
      document.body.classList.remove('has-daily-peace-banner');
      window.setTimeout(() => {
        if (!bannerVisible) banner.hidden = true;
      }, 280);
    }
  }

  function syncBannerFromState() {
    const titleEl = document.getElementById('daily-peace-banner-title');
    if (titleEl && state?.act?.text) {
      titleEl.textContent = state.act.text;
    }
    const onboardingOpen = typeof WorldChoirOnboarding !== 'undefined'
      && typeof WorldChoirOnboarding.isOpen === 'function'
      && WorldChoirOnboarding.isOpen();
    const onDailyActsPage = /daily-acts\.html/i.test(window.location.pathname || '');
    setBannerVisible(!!state?.showNotification && !onboardingOpen && !onDailyActsPage);
  }

  async function dismissBanner() {
    setBannerVisible(false);
    try {
      const data = await apiFetch('/api/daily-peace', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: deviceId(),
          date: localDateString(),
          action: 'dismiss-notification',
        }),
      });
      state = data;
    } catch (err) {
      console.warn('Could not dismiss daily act notification:', err);
      if (state) {
        state.showNotification = false;
        if (state.userDailyAct) state.userDailyAct.notificationDismissed = true;
      }
    }
  }

  function shareInvite() {
    const text =
      "I'm joining World Choir 2027. On September 21, 2027 at 16:00 UTC, the world sings together. Add your voice.";
    if (typeof InviteButton !== 'undefined' && typeof InviteButton.share === 'function') {
      InviteButton.share();
      return;
    }
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert('Invite message copied to clipboard.');
      }).catch(() => {
        prompt('Copy this message to invite someone:', text);
      });
      return;
    }
    prompt('Copy this message to invite someone:', text);
  }

  function open(opts = {}) {
    // Opening must NOT dismiss the notification.
    window.location.href = 'daily-acts.html';
  }

  function close() {
    /* page-based experience — no overlay to close */
  }

  async function refreshBanner() {
    try {
      await fetchToday();
      syncBannerFromState();
    } catch (err) {
      console.warn('Daily Act banner unavailable:', err);
      setBannerVisible(false);
    }
  }

  async function start() {
    if (started) return;
    started = true;
    ensureStylesheet();
    ensureBanner();

    try {
      await WorldChoirDB.ready();
      await refreshBanner();
    } catch (err) {
      console.warn('Daily Acts of Peace init skipped:', err);
    }
  }

  function init() {
    ensureStylesheet();
    start();
  }

  return { init, open, close, start, refreshBanner, shareInvite };
})();

if (typeof document !== 'undefined') {
  const boot = () => {
    if (typeof WorldChoirDB === 'undefined') return;
    DailyActsPeace.start();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  } else {
    setTimeout(boot, 0);
  }
}
