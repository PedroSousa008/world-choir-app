/**
 * World Choir — Influencer Members portal
 * Secret URL: /members — Influencer login only (Owner uses /owner).
 * Credentials are the email + password set when the Owner creates their Creator Foundation.
 */
(function () {
  const API = '/api/members';
  const root = () => document.getElementById('members-root');

  let state = {
    role: null,
    email: null,
    influencer: null,
    panel: 'profile',
    flash: null,
    error: null,
    busy: false,
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function api(action, { method = 'GET', body } = {}) {
    const opts = {
      method,
      credentials: 'include',
      headers: {},
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}?action=${encodeURIComponent(action)}`, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function setFlash(message, type = 'success') {
    state.flash = message ? { message, type } : null;
  }

  function flashHtml() {
    if (!state.flash) return '';
    const cls = state.flash.type === 'error' ? 'members-error' : 'members-success';
    return `<div class="${cls}">${esc(state.flash.message)}</div>`;
  }

  function errorHtml(msg) {
    if (!msg) return '';
    return `<div class="members-error">${esc(msg)}</div>`;
  }

  /* ─── Login (Influencer only) ─── */

  function renderLogin() {
    root().innerHTML = `
      <div class="members-login-shell">
        <div class="members-brand">
          <img class="members-brand__logo" src="images/world-choir-logo.png?v=20270706" alt="World Choir">
          <p class="members-kicker">Creator Foundations</p>
          <h1 class="members-brand__title">Influencer login</h1>
          <p class="members-brand__sub">
            Sign in with the email and password your Owner set when creating your Creator Foundation.
            Manage your page and account here.
          </p>
        </div>

        <div class="members-card">
          ${errorHtml(state.error)}
          ${flashHtml()}

          <form class="members-form" id="members-login-form" autocomplete="on">
            <div class="members-field">
              <label for="members-email">Email</label>
              <input id="members-email" name="email" type="email" required autocomplete="username">
            </div>
            <div class="members-field">
              <label for="members-password">Password</label>
              <input id="members-password" name="password" type="password" required autocomplete="current-password">
            </div>
            <div class="members-actions">
              <button class="members-btn members-btn--primary" type="submit" ${state.busy ? 'disabled' : ''}>
                ${state.busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('members-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const email = form.email.value.trim();
      const password = form.password.value;

      state.busy = true;
      state.error = null;
      render();

      try {
        const data = await api('login', {
          method: 'POST',
          body: { email, password },
        });
        applySession(data);
        setFlash(null);
        await loadDashboard();
      } catch (err) {
        state.error = err.message || 'Sign in failed';
        state.busy = false;
        render();
      }
    });
  }

  function applySession(data) {
    state.busy = false;
    state.error = null;
    state.role = 'influencer';
    state.influencer = data.influencer || null;
    state.email = data.influencer?.email || null;
    state.panel = 'profile';
  }

  async function loadDashboard() {
    state.busy = true;
    try {
      const data = await api('influencer-profile');
      state.influencer = data.influencer;
      state.email = data.influencer?.email || state.email;
    } catch (err) {
      if (err.status === 401) {
        resetToLogin();
        state.error = 'Session expired. Please sign in again.';
        render();
        return;
      }
      state.error = err.message || 'Failed to load';
    } finally {
      state.busy = false;
      render();
    }
  }

  function resetToLogin() {
    state.role = null;
    state.email = null;
    state.influencer = null;
    state.panel = 'profile';
    state.busy = false;
  }

  /* ─── Influencer dashboard ─── */

  function renderInfluencer() {
    const inf = state.influencer || {};
    const panels = {
      profile: renderInfluencerProfile(inf),
      account: renderInfluencerAccount(inf),
    };

    root().innerHTML = `
      <div class="members-topbar">
        <div>
          <p class="members-kicker">Influencer space</p>
          <h1 class="members-brand__title" style="margin-bottom:6px">${esc(inf.displayName || 'Your page')}</h1>
          <p class="members-topbar__meta">${esc(inf.email || state.email || '')}</p>
        </div>
        <div class="members-actions">
          <button type="button" class="members-btn members-btn--secondary" id="members-logout">Sign out</button>
        </div>
      </div>

      <nav class="members-nav" aria-label="Influencer sections">
        <button type="button" class="members-nav__btn ${state.panel === 'profile' ? 'is-active' : ''}" data-panel="profile">My page</button>
        <button type="button" class="members-nav__btn ${state.panel === 'account' ? 'is-active' : ''}" data-panel="account">Account</button>
      </nav>

      ${flashHtml()}
      ${errorHtml(state.error)}

      <div class="members-panel">${panels[state.panel] || panels.profile}</div>
    `;

    bindInfluencerEvents();
  }

  function renderInfluencerProfile(inf) {
    return `
      <div class="members-card">
        <h2 class="members-card__title">Page content</h2>
        <p class="members-card__hint">
          Update what appears on your Creator Foundation in Donate. Changes save to your live profile.
        </p>
        <form class="members-form two-col" id="inf-profile-form">
          <div class="members-field">
            <label>Display name</label>
            <input name="displayName" type="text" value="${esc(inf.displayName || '')}" required>
          </div>
          <div class="members-field">
            <label>Foundation name</label>
            <input name="foundationName" type="text" value="${esc(inf.foundationName || '')}">
          </div>
          <div class="members-field">
            <label>Country</label>
            <input name="country" type="text" value="${esc(inf.country || '')}">
          </div>
          <div class="members-field">
            <label>Primary category</label>
            <input name="primaryCategory" type="text" value="${esc(inf.primaryCategory || '')}">
          </div>
          <div class="members-field members-field--full">
            <label>Mission</label>
            <textarea name="mission">${esc(inf.mission || '')}</textarea>
          </div>
          <div class="members-field members-field--full">
            <label>Biography</label>
            <textarea name="biography">${esc(inf.biography || '')}</textarea>
          </div>
          <div class="members-field members-field--full">
            <label>Why you started</label>
            <textarea name="whyStarted">${esc(inf.whyStarted || '')}</textarea>
          </div>
          <div class="members-field members-field--full">
            <label>How it works</label>
            <textarea name="howItWorks">${esc(inf.howItWorks || '')}</textarea>
          </div>
          <div class="members-actions members-field--full">
            <button class="members-btn members-btn--primary" type="submit">Save page</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderInfluencerAccount(inf) {
    return `
      <div class="members-card">
        <h2 class="members-card__title">Change email</h2>
        <p class="members-card__hint">Current: ${esc(inf.email || '—')}</p>
        <form class="members-form" id="inf-email-form">
          <div class="members-field">
            <label>New email</label>
            <input name="newEmail" type="email" required>
          </div>
          <div class="members-field">
            <label>Confirm email</label>
            <input name="confirmEmail" type="email" required>
          </div>
          <div class="members-field">
            <label>Current password</label>
            <input name="currentPassword" type="password" required autocomplete="current-password">
          </div>
          <div class="members-actions">
            <button class="members-btn members-btn--primary" type="submit">Update email</button>
          </div>
        </form>
      </div>

      <div class="members-card">
        <h2 class="members-card__title">Change password</h2>
        <form class="members-form" id="inf-password-form">
          <div class="members-field">
            <label>Current password</label>
            <input name="currentPassword" type="password" required autocomplete="current-password">
          </div>
          <div class="members-field">
            <label>New password</label>
            <input name="newPassword" type="password" required minlength="8" autocomplete="new-password">
          </div>
          <div class="members-field">
            <label>Confirm new password</label>
            <input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password">
          </div>
          <div class="members-actions">
            <button class="members-btn members-btn--primary" type="submit">Update password</button>
          </div>
        </form>
      </div>
    `;
  }

  function bindInfluencerEvents() {
    document.getElementById('members-logout')?.addEventListener('click', logout);

    root().querySelectorAll('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.panel = btn.getAttribute('data-panel');
        state.error = null;
        setFlash(null);
        render();
      });
    });

    document.getElementById('inf-profile-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const data = await api('influencer-update-profile', {
          method: 'POST',
          body: Object.fromEntries(fd.entries()),
        });
        state.influencer = data.influencer;
        setFlash('Page saved.');
        state.error = null;
        render();
      } catch (err) {
        state.error = err.message;
        setFlash(null);
        render();
      }
    });

    document.getElementById('inf-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const data = await api('influencer-change-email', {
          method: 'POST',
          body: Object.fromEntries(fd.entries()),
        });
        if (state.influencer) state.influencer.email = data.email;
        state.email = data.email;
        setFlash('Email updated.');
        state.error = null;
        e.target.reset();
        render();
      } catch (err) {
        state.error = err.message;
        setFlash(null);
        render();
      }
    });

    document.getElementById('inf-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('influencer-change-password', {
          method: 'POST',
          body: Object.fromEntries(fd.entries()),
        });
        setFlash('Password updated.');
        state.error = null;
        e.target.reset();
        render();
      } catch (err) {
        state.error = err.message;
        setFlash(null);
        render();
      }
    });
  }

  async function logout() {
    try {
      await api('logout', { method: 'POST', body: {} });
    } catch {
      /* ignore */
    }
    resetToLogin();
    setFlash('Signed out.');
    render();
  }

  function render() {
    if (!state.role) {
      renderLogin();
      return;
    }
    renderInfluencer();
  }

  async function init() {
    try {
      const session = await api('session');
      if (session.authenticated && session.role === 'influencer') {
        applySession(session);
        await loadDashboard();
        return;
      }
    } catch {
      /* not signed in */
    }
    renderLogin();
  }

  window.WorldChoirMembers = { init };
})();
