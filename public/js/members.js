/**
 * World Choir — Members portal (Owner + Influencer)
 * Secret URL: /members — not linked in public navigation.
 */
(function () {
  const API = '/api/members';
  const root = () => document.getElementById('members-root');

  let state = {
    role: null,
    email: null,
    influencer: null,
    overview: null,
    influencers: [],
    panel: 'overview',
    loginRole: 'owner',
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

  function money(amount, currency = 'EUR') {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency}`;
    }
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

  /* ─── Login ─── */

  function renderLogin() {
    const isOwner = state.loginRole === 'owner';
    root().innerHTML = `
      <div class="members-login-shell">
        <div class="members-brand">
          <img class="members-brand__logo" src="images/world-choir-logo.png?v=20270706" alt="World Choir">
          <p class="members-kicker">Private space</p>
          <h1 class="members-brand__title">Members</h1>
          <p class="members-brand__sub">Sign in as Owner or Influencer to manage foundations and your page.</p>
        </div>

        <div class="members-card">
          <div class="members-tabs" role="tablist">
            <button type="button" class="members-tab ${isOwner ? 'is-active' : ''}" data-login-role="owner">Owner</button>
            <button type="button" class="members-tab ${!isOwner ? 'is-active' : ''}" data-login-role="influencer">Influencer</button>
          </div>

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

    root().querySelectorAll('[data-login-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.loginRole = btn.getAttribute('data-login-role');
        state.error = null;
        render();
      });
    });

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
          body: {
            email,
            password,
            roleHint: state.loginRole,
          },
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
    if (data.role === 'owner') {
      state.role = 'owner';
      state.email = data.email || null;
      state.influencer = null;
      state.panel = 'overview';
    } else {
      state.role = 'influencer';
      state.influencer = data.influencer || null;
      state.email = data.influencer?.email || null;
      state.panel = 'profile';
    }
  }

  async function loadDashboard() {
    state.busy = true;
    try {
      if (state.role === 'owner') {
        const data = await api('overview');
        state.overview = data.overview;
        state.influencers = data.influencers || [];
      } else if (state.role === 'influencer') {
        const data = await api('influencer-profile');
        state.influencer = data.influencer;
        state.email = data.influencer?.email || state.email;
      }
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
    state.overview = null;
    state.influencers = [];
    state.panel = 'overview';
    state.busy = false;
  }

  /* ─── Owner ─── */

  function renderOwner() {
    const o = state.overview || {};
    const panels = {
      overview: renderOwnerOverview(o),
      influencers: renderOwnerInfluencers(),
      create: renderOwnerCreate(),
      account: renderOwnerAccount(),
    };

    root().innerHTML = `
      <div class="members-topbar">
        <div>
          <p class="members-kicker">Owner space</p>
          <h1 class="members-brand__title" style="margin-bottom:6px">Overview</h1>
          <p class="members-topbar__meta">Signed in as ${esc(state.email || 'owner')}</p>
        </div>
        <div class="members-actions">
          <button type="button" class="members-btn members-btn--secondary" id="members-logout">Sign out</button>
        </div>
      </div>

      <nav class="members-nav" aria-label="Owner sections">
        <button type="button" class="members-nav__btn ${state.panel === 'overview' ? 'is-active' : ''}" data-panel="overview">Overview</button>
        <button type="button" class="members-nav__btn ${state.panel === 'influencers' ? 'is-active' : ''}" data-panel="influencers">Influencers</button>
        <button type="button" class="members-nav__btn ${state.panel === 'create' ? 'is-active' : ''}" data-panel="create">Create influencer</button>
        <button type="button" class="members-nav__btn ${state.panel === 'account' ? 'is-active' : ''}" data-panel="account">Account</button>
      </nav>

      ${flashHtml()}
      ${errorHtml(state.error)}

      <div class="members-panel">${panels[state.panel] || panels.overview}</div>
    `;

    bindOwnerEvents();
  }

  function renderOwnerOverview(o) {
    return `
      <div class="members-card">
        <h2 class="members-card__title">Operations</h2>
        <p class="members-card__hint">
          ${esc(o.platformFeePercent || 10)}% of each verified donation goes toward app operating costs.
        </p>
        <div class="members-stats">
          <div class="members-stat">
            <div class="members-stat__label">Operations share</div>
            <div class="members-stat__value">${esc(money(o.operationsShare || 0, o.currency || 'EUR'))}</div>
          </div>
          <div class="members-stat">
            <div class="members-stat__label">Verified donations</div>
            <div class="members-stat__value">${esc(String(o.totalSuccessfulDonations || 0))}</div>
          </div>
          <div class="members-stat">
            <div class="members-stat__label">Donation total</div>
            <div class="members-stat__value">${esc(money(o.totalDonationsAmount || 0, o.currency || 'EUR'))}</div>
          </div>
          <div class="members-stat">
            <div class="members-stat__label">Influencers</div>
            <div class="members-stat__value">${esc(String(o.influencerCount || 0))}</div>
            <div class="members-stat__note">${esc(String(o.activeInfluencerCount || 0))} active</div>
          </div>
        </div>
        ${o.note ? `<p class="members-stat__note" style="margin-top:16px">${esc(o.note)}</p>` : ''}
      </div>
    `;
  }

  function renderOwnerInfluencers() {
    const rows = state.influencers || [];
    if (!rows.length) {
      return `
        <div class="members-card">
          <h2 class="members-card__title">Influencers</h2>
          <p class="members-empty">No influencers yet. Create the first profile to get started.</p>
        </div>
      `;
    }

    const body = rows.map((inf) => `
      <tr>
        <td>
          <strong>${esc(inf.displayName || '—')}</strong><br>
          <span style="color:var(--text-muted)">${esc(inf.email || '')}</span>
        </td>
        <td>${esc(inf.foundationName || '—')}</td>
        <td>${esc(inf.country || '—')}</td>
        <td>
          <span class="members-badge ${inf.active ? 'members-badge--on' : 'members-badge--off'}">
            ${inf.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          <span class="members-badge ${inf.published ? 'members-badge--on' : 'members-badge--off'}">
            ${inf.published ? 'Published' : 'Draft'}
          </span>
        </td>
        <td>
          <button type="button" class="members-btn members-btn--ghost" data-edit-influencer="${esc(inf.id)}" style="padding:6px 10px;font-size:0.8rem">
            Edit
          </button>
        </td>
      </tr>
    `).join('');

    return `
      <div class="members-card">
        <h2 class="members-card__title">Influencer overview</h2>
        <p class="members-card__hint">Full table of influencer accounts and foundation pages. More columns can be added later.</p>
        <div class="members-table-wrap">
          <table class="members-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Foundation</th>
                <th>Country</th>
                <th>Status</th>
                <th>Page</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div id="members-edit-slot"></div>
      </div>
    `;
  }

  function renderOwnerCreate() {
    return `
      <div class="members-card">
        <h2 class="members-card__title">Create influencer profile</h2>
        <p class="members-card__hint">
          Set their login and starting page content. They appear on the Donate tab right away.
          They can change email, password, and page details later.
        </p>
        <form class="members-form two-col" id="members-create-form">
          <div class="members-field">
            <label for="ci-email">Email</label>
            <input id="ci-email" name="email" type="email" required>
          </div>
          <div class="members-field">
            <label for="ci-password">Temporary password</label>
            <input id="ci-password" name="password" type="text" required minlength="8" autocomplete="off">
          </div>
          <div class="members-field">
            <label for="ci-display">Display name</label>
            <input id="ci-display" name="displayName" type="text" required>
          </div>
          <div class="members-field">
            <label for="ci-foundation">Foundation name</label>
            <input id="ci-foundation" name="foundationName" type="text">
          </div>
          <div class="members-field">
            <label for="ci-country">Country</label>
            <input id="ci-country" name="country" type="text">
          </div>
          <div class="members-field">
            <label for="ci-category">Primary category</label>
            <input id="ci-category" name="primaryCategory" type="text" placeholder="e.g. Education">
          </div>
          <div class="members-field members-field--full">
            <label for="ci-mission">Mission</label>
            <textarea id="ci-mission" name="mission"></textarea>
          </div>
          <div class="members-field members-field--full">
            <label for="ci-bio">Biography</label>
            <textarea id="ci-bio" name="biography"></textarea>
          </div>
          <div class="members-field members-field--full">
            <label for="ci-why">Why they started</label>
            <textarea id="ci-why" name="whyStarted"></textarea>
          </div>
          <div class="members-field members-field--full">
            <label for="ci-how">How it works</label>
            <textarea id="ci-how" name="howItWorks"></textarea>
          </div>
          <div class="members-actions members-field--full">
            <button class="members-btn members-btn--primary" type="submit" ${state.busy ? 'disabled' : ''}>
              ${state.busy ? 'Creating…' : 'Create profile'}
            </button>
          </div>
        </form>
      </div>
    `;
  }

  function renderOwnerAccount() {
    return `
      <div class="members-card">
        <h2 class="members-card__title">Change email</h2>
        <p class="members-card__hint">Current: ${esc(state.email || '—')}</p>
        <form class="members-form" id="owner-email-form">
          <div class="members-field">
            <label for="oe-new">New email</label>
            <input id="oe-new" name="newEmail" type="email" required>
          </div>
          <div class="members-field">
            <label for="oe-confirm">Confirm email</label>
            <input id="oe-confirm" name="confirmEmail" type="email" required>
          </div>
          <div class="members-field">
            <label for="oe-pass">Current password</label>
            <input id="oe-pass" name="currentPassword" type="password" required autocomplete="current-password">
          </div>
          <div class="members-actions">
            <button class="members-btn members-btn--primary" type="submit">Update email</button>
          </div>
        </form>
      </div>

      <div class="members-card">
        <h2 class="members-card__title">Change password</h2>
        <form class="members-form" id="owner-password-form">
          <div class="members-field">
            <label for="op-current">Current password</label>
            <input id="op-current" name="currentPassword" type="password" required autocomplete="current-password">
          </div>
          <div class="members-field">
            <label for="op-new">New password</label>
            <input id="op-new" name="newPassword" type="password" required minlength="8" autocomplete="new-password">
          </div>
          <div class="members-field">
            <label for="op-confirm">Confirm new password</label>
            <input id="op-confirm" name="confirmPassword" type="password" required minlength="8" autocomplete="new-password">
          </div>
          <div class="members-actions">
            <button class="members-btn members-btn--primary" type="submit">Update password</button>
          </div>
        </form>
      </div>
    `;
  }

  function bindOwnerEvents() {
    document.getElementById('members-logout')?.addEventListener('click', logout);

    root().querySelectorAll('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.panel = btn.getAttribute('data-panel');
        state.error = null;
        setFlash(null);
        render();
      });
    });

    document.getElementById('members-create-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.busy = true;
      state.error = null;
      render();
      try {
        await api('create-influencer', {
          method: 'POST',
          body: Object.fromEntries(fd.entries()),
        });
        setFlash('Influencer profile created.');
        state.panel = 'influencers';
        await loadDashboard();
      } catch (err) {
        state.error = err.message;
        state.busy = false;
        render();
      }
    });

    document.getElementById('owner-email-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const data = await api('owner-change-email', {
          method: 'POST',
          body: Object.fromEntries(fd.entries()),
        });
        state.email = data.email || state.email;
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

    document.getElementById('owner-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('owner-change-password', {
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

    root().querySelectorAll('[data-edit-influencer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-influencer');
        const inf = state.influencers.find((row) => row.id === id);
        if (!inf) return;
        openOwnerEdit(inf);
      });
    });
  }

  function openOwnerEdit(inf) {
    const slot = document.getElementById('members-edit-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="members-card" style="margin-top:18px">
        <h2 class="members-card__title">Edit ${esc(inf.displayName || 'influencer')}</h2>
        <form class="members-form two-col" id="members-edit-form">
          <input type="hidden" name="id" value="${esc(inf.id)}">
          <div class="members-field">
            <label>Email</label>
            <input name="email" type="email" value="${esc(inf.email || '')}" required>
          </div>
          <div class="members-field">
            <label>Reset password (optional)</label>
            <input name="password" type="text" minlength="8" placeholder="Leave blank to keep" autocomplete="off">
          </div>
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
            <label>Why started</label>
            <textarea name="whyStarted">${esc(inf.whyStarted || '')}</textarea>
          </div>
          <div class="members-field members-field--full">
            <label>How it works</label>
            <textarea name="howItWorks">${esc(inf.howItWorks || '')}</textarea>
          </div>
          <div class="members-field">
            <label>Active</label>
            <select name="active">
              <option value="true" ${inf.active ? 'selected' : ''}>Yes</option>
              <option value="false" ${!inf.active ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="members-actions members-field--full">
            <button class="members-btn members-btn--primary" type="submit">Save changes</button>
            <button class="members-btn members-btn--ghost" type="button" id="members-edit-cancel">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('members-edit-cancel')?.addEventListener('click', () => {
      slot.innerHTML = '';
    });

    document.getElementById('members-edit-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.active = body.active === 'true';
      if (!body.password) delete body.password;
      try {
        await api('update-influencer', { method: 'POST', body });
        setFlash('Influencer updated.');
        await loadDashboard();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });
  }

  /* ─── Influencer ─── */

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
          Update what appears on your foundation page. Public publishing comes later — for now this is your private draft.
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
    if (state.role === 'owner') {
      renderOwner();
      return;
    }
    renderInfluencer();
  }

  async function init() {
    try {
      const session = await api('session');
      if (session.authenticated) {
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
