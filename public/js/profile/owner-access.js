/**
 * OwnerAccess — hidden profile trigger + secure owner login modal
 */
const OwnerAccess = (() => {
  let overlayEl = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function ensureModal() {
    if (document.getElementById('owner-login-overlay')) return;

    const html = `
      <div class="overlay" id="owner-login-overlay" aria-hidden="true">
        <div class="modal owner-login-modal" role="dialog" aria-labelledby="owner-login-title">
          <h2 class="modal-title" id="owner-login-title">Owner Access</h2>
          <p class="modal-copy">Sign in with your authorized owner credentials.</p>

          <div class="form-group">
            <label class="form-label" for="owner-email">Email</label>
            <input class="form-input" id="owner-email" type="email" autocomplete="username" placeholder="Owner email">
          </div>
          <div class="form-group">
            <label class="form-label" for="owner-password">Password</label>
            <input class="form-input" id="owner-password" type="password" autocomplete="current-password" placeholder="Password">
          </div>
          <div class="form-group">
            <label class="form-label" for="owner-relationship-date">Relationship date</label>
            <input class="form-input" id="owner-relationship-date" type="text" inputmode="numeric" placeholder="DD.MM.YYYY" autocomplete="off">
          </div>

          <p class="owner-login-error" id="owner-login-error" hidden></p>

          <div class="actions-row">
            <button class="btn btn-primary" id="owner-login-submit" type="button">Sign In</button>
            <button class="btn btn-secondary" id="owner-login-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    overlayEl = document.getElementById('owner-login-overlay');

    document.getElementById('owner-login-cancel')?.addEventListener('click', close);
    document.getElementById('owner-login-submit')?.addEventListener('click', submit);
    overlayEl?.addEventListener('click', (e) => {
      if (e.target.id === 'owner-login-overlay') close();
    });
    document.getElementById('owner-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  function open() {
    ensureModal();
    document.getElementById('owner-login-error').hidden = true;
    document.getElementById('owner-email').value = '';
    document.getElementById('owner-password').value = '';
    document.getElementById('owner-relationship-date').value = '';
    overlayEl.classList.add('active');
    overlayEl.setAttribute('aria-hidden', 'false');
    document.getElementById('owner-email')?.focus();
  }

  function close() {
    overlayEl?.classList.remove('active');
    overlayEl?.setAttribute('aria-hidden', 'true');
  }

  function showError(message) {
    const el = document.getElementById('owner-login-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  async function submit() {
    const email = document.getElementById('owner-email')?.value.trim();
    const password = document.getElementById('owner-password')?.value;
    const relationshipDate = document.getElementById('owner-relationship-date')?.value.trim();
    const btn = document.getElementById('owner-login-submit');

    if (!email || !password || !relationshipDate) {
      showError('Please fill in all fields.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in…';
    showError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, relationshipDate }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showError(data.error || 'Invalid owner credentials.');
        return;
      }

      close();
      window.location.href = '/owner-database';
    } catch (err) {
      console.error(err);
      showError('Could not sign in. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  function mountTrigger() {
    if (document.getElementById('owner-access-trigger')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'owner-access-trigger';
    btn.className = 'owner-access-trigger';
    btn.setAttribute('aria-label', 'Owner access');
    btn.title = '';
    btn.addEventListener('click', open);
    document.body.appendChild(btn);
  }

  function init() {
    ensureModal();
    mountTrigger();
  }

  return { init, open, close };
})();
