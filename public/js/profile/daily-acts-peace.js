/**
 * Daily Acts of Peace — personal daily ritual
 * Banner entry point + full act screen (also opened from Profile)
 */
const DailyActsPeace = (() => {
  let saving = false;
  let state = null;
  let bannerVisible = false;
  let started = false;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

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
    link.href = 'css/daily-peace.css?v=20260810e';
    document.head.appendChild(link);
  }

  function ensureOverlay() {
    if (document.getElementById('daily-peace-overlay')) return;

    const html = `
      <div class="overlay daily-peace-overlay" id="daily-peace-overlay" aria-hidden="true">
        <div class="daily-peace-screen" role="dialog" aria-labelledby="daily-peace-title">
          <div class="daily-peace-screen__inner" id="daily-peace-content">
            <p class="daily-peace-loading">Loading today’s act…</p>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('daily-peace-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'daily-peace-overlay') close();
    });
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
      open();
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
    setBannerVisible(!!state?.showNotification && !onboardingOpen);
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
      // Keep dismissed locally for this session even if sync fails.
      if (state) {
        state.showNotification = false;
        if (state.userDailyAct) state.userDailyAct.notificationDismissed = true;
      }
    }
  }

  function renderNavButton(nav) {
    if (!nav?.type || !nav?.label) return '';
    return `
      <button class="btn btn-primary daily-peace-nav" id="daily-peace-nav" type="button" data-nav-type="${escapeHtml(nav.type)}" data-nav-cause="${escapeHtml(nav.cause || '')}">
        ${escapeHtml(nav.label)}
      </button>
    `;
  }

  function renderCompletedMoment() {
    return `
      <div class="daily-peace-complete-moment">
        <p class="daily-peace-complete-moment__eyebrow">ACT OF PEACE COMPLETED</p>
        <p class="daily-peace-complete-moment__heart" aria-hidden="true">🤍</p>
        <p class="daily-peace-complete-moment__copy">One small action can create a bigger ripple.</p>
        <button class="btn btn-secondary daily-peace-back" id="daily-peace-back" type="button">Continue</button>
      </div>
    `;
  }

  function renderContent({ act, userDailyAct }, { justCompleted = false } = {}) {
    if (justCompleted || userDailyAct?.completed) {
      if (justCompleted) return renderCompletedMoment();
      return `
        <p class="daily-peace-kicker">TODAY'S ACT OF PEACE</p>
        <h2 class="daily-peace-title" id="daily-peace-title">${escapeHtml(act.text)}</h2>
        <p class="daily-peace-explain">${escapeHtml(act.explanation || 'A small opportunity to make the world around you better today.')}</p>
        <div class="daily-peace-done-badge">Completed today</div>
        <button class="btn btn-secondary daily-peace-back" id="daily-peace-back" type="button">Close</button>
      `;
    }

    return `
      <p class="daily-peace-kicker">TODAY'S ACT OF PEACE</p>
      <h2 class="daily-peace-title" id="daily-peace-title">${escapeHtml(act.text)}</h2>
      <p class="daily-peace-explain">${escapeHtml(act.explanation || 'A small opportunity to make the world around you better today.')}</p>

      ${renderNavButton(act.nav)}

      <button class="btn ${act.nav ? 'btn-secondary' : 'btn-primary'} daily-peace-complete-btn" id="daily-peace-complete-btn" type="button">
        I COMPLETED THIS ACT
      </button>

      <button class="btn btn-ghost daily-peace-back" id="daily-peace-back" type="button">Not now</button>
    `;
  }

  function renderError(message) {
    return `
      <p class="daily-peace-kicker">TODAY'S ACT OF PEACE</p>
      <h2 class="daily-peace-title" id="daily-peace-title">Daily Act of Peace</h2>
      <p class="daily-peace-error">${escapeHtml(message)}</p>
      <button class="btn btn-secondary daily-peace-back" id="daily-peace-back" type="button">Close</button>
    `;
  }

  function shareInvite() {
    const text =
      "I'm joining World Choir 2027. On July 1, 2027 at 16:00 UTC, the world sings together. Add your voice.";
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

  function handleNav(type, cause) {
    if (type === 'practice') {
      close();
      if (typeof PracticeMode !== 'undefined') {
        PracticeMode.open({ onExit: () => {} });
        return;
      }
      window.location.href = 'profile.html?practice=1';
      return;
    }

    if (type === 'map') {
      window.location.href = 'map.html';
      return;
    }

    if (type === 'donate') {
      const params = new URLSearchParams();
      if (cause) params.set('cause', cause);
      const qs = params.toString();
      window.location.href = qs ? `donate.html?${qs}` : 'donate.html';
      return;
    }

    if (type === 'invite') {
      close();
      shareInvite();
      return;
    }

    if (type === 'profile') {
      close();
      if (document.getElementById('profile-identity-root')) {
        document.getElementById('profile-identity-root').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.href = 'profile.html';
      }
    }
  }

  function bindContentHandlers({ justCompleted = false } = {}) {
    document.getElementById('daily-peace-back')?.addEventListener('click', close);
    document.getElementById('daily-peace-complete-btn')?.addEventListener('click', onComplete);
    document.getElementById('daily-peace-nav')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      handleNav(btn.getAttribute('data-nav-type'), btn.getAttribute('data-nav-cause') || '');
    });
    if (justCompleted) {
      // celebration already bound via back button
    }
  }

  async function onComplete() {
    if (saving) return;
    saving = true;
    const btn = document.getElementById('daily-peace-complete-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }

    try {
      const data = await apiFetch('/api/daily-peace', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: deviceId(),
          date: localDateString(),
          action: 'complete',
        }),
      });
      state = data;
      setBannerVisible(false);
      const content = document.getElementById('daily-peace-content');
      content.innerHTML = renderContent(data, { justCompleted: true });
      bindContentHandlers({ justCompleted: true });
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'I COMPLETED THIS ACT';
      }
      alert(err.message || 'Could not save completion. Please try again.');
    } finally {
      saving = false;
    }
  }

  async function loadTodayAct() {
    const content = document.getElementById('daily-peace-content');
    content.innerHTML = '<p class="daily-peace-loading">Loading today’s act…</p>';

    try {
      const data = await fetchToday();
      content.innerHTML = renderContent(data);
      bindContentHandlers();
      syncBannerFromState();
    } catch (err) {
      content.innerHTML = renderError(err.message || 'Could not load today’s act. Please try again.');
      document.getElementById('daily-peace-back')?.addEventListener('click', close);
    }
  }

  function open() {
    ensureOverlay();
    const overlay = document.getElementById('daily-peace-overlay');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    loadTodayAct();
  }

  function close() {
    const overlay = document.getElementById('daily-peace-overlay');
    overlay?.classList.remove('active');
    overlay?.setAttribute('aria-hidden', 'true');
    // Opening does not dismiss the banner — re-sync from state.
    syncBannerFromState();
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
    ensureOverlay();

    try {
      await WorldChoirDB.ready();
      await refreshBanner();
    } catch (err) {
      console.warn('Daily Acts of Peace init skipped:', err);
    }
  }

  function init() {
    ensureStylesheet();
    ensureOverlay();
    start();
  }

  return { init, open, close, start, refreshBanner };
})();

// Auto-start on main app pages once DOM + DB scripts are present.
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
