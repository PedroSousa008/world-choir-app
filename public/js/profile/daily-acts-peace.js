/**
 * Daily Acts of Peace — one small act per day from the official 350-act catalog
 */
const DailyActsPeace = (() => {
  let saving = false;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function ensureOverlay() {
    if (document.getElementById('daily-peace-overlay')) return;

    const html = `
      <div class="overlay daily-peace-overlay" id="daily-peace-overlay" aria-hidden="true">
        <div class="daily-peace-screen" role="dialog" aria-labelledby="daily-peace-title">
          <div class="daily-peace-screen__inner" id="daily-peace-content">
            <p class="daily-peace-loading" id="daily-peace-loading">Loading today’s act…</p>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('daily-peace-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'daily-peace-overlay') close();
    });
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

  function renderContent({ act, userDailyAct }) {
    const completed = !!userDailyAct?.completed;
    return `
      <h2 class="daily-peace-title" id="daily-peace-title">Daily Act of Peace</h2>
      <p class="daily-peace-subtitle">One small action for today.</p>

      <div class="daily-peace-card glass-card">
        <p class="daily-peace-act">“${escapeHtml(act.text)}”</p>
      </div>

      <label class="daily-peace-check${completed ? ' daily-peace-check--done' : ''}">
        <input type="checkbox" id="daily-peace-complete" ${completed ? 'checked disabled' : ''}>
        <span class="daily-peace-check__box" aria-hidden="true"></span>
        <span class="daily-peace-check__label">I did this today</span>
      </label>

      <button class="btn btn-secondary daily-peace-back" id="daily-peace-back" type="button">Back to Profile</button>
    `;
  }

  function renderError(message) {
    return `
      <h2 class="daily-peace-title" id="daily-peace-title">Daily Act of Peace</h2>
      <p class="daily-peace-error">${escapeHtml(message)}</p>
      <button class="btn btn-secondary daily-peace-back" id="daily-peace-back" type="button">Back to Profile</button>
    `;
  }

  function bindContentHandlers() {
    document.getElementById('daily-peace-back')?.addEventListener('click', close);
    document.getElementById('daily-peace-complete')?.addEventListener('change', onCompleteChange);
  }

  async function onCompleteChange(e) {
    if (saving || !e.target.checked) return;
    saving = true;

    try {
      await apiFetch('/api/daily-peace', {
        method: 'POST',
        body: JSON.stringify({ deviceId: WorldChoirDB.getDeviceId() }),
      });

      const checkbox = document.getElementById('daily-peace-complete');
      const label = checkbox?.closest('.daily-peace-check');
      if (checkbox) {
        checkbox.disabled = true;
        checkbox.checked = true;
      }
      label?.classList.add('daily-peace-check--done');
    } catch (err) {
      e.target.checked = false;
      alert(err.message || 'Could not save completion. Please try again.');
    } finally {
      saving = false;
    }
  }

  async function loadTodayAct() {
    const content = document.getElementById('daily-peace-content');
    content.innerHTML = '<p class="daily-peace-loading" id="daily-peace-loading">Loading today’s act…</p>';

    try {
      await WorldChoirDB.ready();
      const data = await apiFetch(
        `/api/daily-peace?deviceId=${encodeURIComponent(WorldChoirDB.getDeviceId())}`
      );
      content.innerHTML = renderContent(data);
      bindContentHandlers();
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
  }

  function init() {
    ensureOverlay();
  }

  return { init, open, close };
})();
