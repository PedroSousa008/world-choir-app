/**
 * Owner Database View — server-protected admin panel
 */
const OwnerDatabase = (() => {
  let allRows = [];
  let totals = { users: 0, participants: 0 };

  function escapeHtml(str) {
    if (str == null) return '—';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  async function requireOwnerSession() {
    const res = await fetch('/api/admin?action=session', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      window.location.replace('/profile');
      return false;
    }
    const data = await res.json();
    if (!data.authenticated || data.role !== 'owner') {
      window.location.replace('/profile');
      return false;
    }
    return true;
  }

  async function loadDatabase() {
    const res = await fetch('/api/admin?action=database', { credentials: 'include', cache: 'no-store' });
    if (res.status === 401) {
      window.location.replace('/profile');
      return;
    }
    if (!res.ok) throw new Error('Failed to load database');

    const data = await res.json();
    totals = data.totals || { users: 0, participants: 0 };
    allRows = data.rows || [];
    render();
  }

  function getFilters() {
    return {
      voice: document.getElementById('filter-voice')?.value.trim() || '',
      city: document.getElementById('filter-city')?.value.trim().toLowerCase() || '',
      country: document.getElementById('filter-country')?.value.trim().toLowerCase() || '',
      event: document.getElementById('filter-event')?.value.trim().toLowerCase() || '',
      promise: document.getElementById('filter-promise')?.value || 'all',
    };
  }

  function applyFilters(rows) {
    const f = getFilters();
    return rows.filter((row) => {
      if (f.voice && String(row.voiceNumber ?? '') !== f.voice) return false;
      if (f.city && !(row.city || '').toLowerCase().includes(f.city)) return false;
      if (f.country && !(row.country || '').toLowerCase().includes(f.country)) return false;
      if (f.event && !(row.eventId || '').toLowerCase().includes(f.event)) return false;
      if (f.promise === 'with' && !row.promiseText) return false;
      if (f.promise === 'without' && row.promiseText) return false;
      return true;
    });
  }

  function renderTable(rows) {
    const tbody = document.getElementById('owner-db-tbody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="owner-db-empty">No records match your filters.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td class="owner-db-mono">${escapeHtml(row.userId)}</td>
        <td>${row.voiceNumber ?? '—'}</td>
        <td>${escapeHtml(row.voiceName)}</td>
        <td>${escapeHtml(row.city)}</td>
        <td>${escapeHtml(row.country)}</td>
        <td><span class="owner-db-badge owner-db-badge--${row.pledgeStatus === 'pledged' ? 'yes' : 'no'}">${escapeHtml(row.pledgeStatus)}</span></td>
        <td class="owner-db-promise">${escapeHtml(row.promiseText)}</td>
        <td>${formatDate(row.promiseSubmittedAt)}</td>
        <td>${escapeHtml(row.eventId)}</td>
        <td>${formatDate(row.createdAt)}</td>
      </tr>
    `).join('');
  }

  function render() {
    const filtered = applyFilters(allRows);
    document.getElementById('owner-total-users').textContent = String(totals.users);
    document.getElementById('owner-total-participants').textContent = String(totals.participants);
    document.getElementById('owner-filtered-count').textContent = String(filtered.length);
    renderTable(filtered);
  }

  function bindFilters() {
    ['filter-voice', 'filter-city', 'filter-country', 'filter-event', 'filter-promise'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', render);
      document.getElementById(id)?.addEventListener('change', render);
    });

    document.getElementById('owner-change-password')?.addEventListener('click', openPasswordModal);
    document.getElementById('owner-password-cancel')?.addEventListener('click', closePasswordModal);
    document.getElementById('owner-password-submit')?.addEventListener('click', submitPasswordChange);
    document.getElementById('owner-password-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'owner-password-overlay') closePasswordModal();
    });

    document.getElementById('owner-refresh')?.addEventListener('click', () => {
      loadDatabase().catch((err) => {
        console.error(err);
        alert('Could not refresh database.');
      });
    });

    document.getElementById('owner-logout')?.addEventListener('click', async () => {
      await fetch('/api/admin?action=logout', { method: 'POST', credentials: 'include' });
      window.location.replace('/profile');
    });

    document.getElementById('owner-back')?.addEventListener('click', () => {
      window.location.href = '/profile';
    });
  }

  function openPasswordModal() {
    const overlay = document.getElementById('owner-password-overlay');
    document.getElementById('owner-current-password').value = '';
    document.getElementById('owner-new-password').value = '';
    document.getElementById('owner-confirm-password').value = '';
    setPasswordMessage('');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('owner-current-password')?.focus();
  }

  function closePasswordModal() {
    const overlay = document.getElementById('owner-password-overlay');
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function setPasswordMessage(text, isError = false) {
    const el = document.getElementById('owner-password-message');
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle('owner-password-message--error', isError);
    el.classList.toggle('owner-password-message--success', !isError && !!text);
  }

  async function submitPasswordChange() {
    const currentPassword = document.getElementById('owner-current-password')?.value || '';
    const newPassword = document.getElementById('owner-new-password')?.value || '';
    const confirmPassword = document.getElementById('owner-confirm-password')?.value || '';
    const btn = document.getElementById('owner-password-submit');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage('Please fill in all fields.', true);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.', true);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Updating…';
    setPasswordMessage('');

    try {
      const res = await fetch('/api/admin?action=change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPasswordMessage(data.error || 'Could not change password.', true);
        return;
      }

      setPasswordMessage('Password updated successfully.');
      document.getElementById('owner-current-password').value = '';
      document.getElementById('owner-new-password').value = '';
      document.getElementById('owner-confirm-password').value = '';
      setTimeout(closePasswordModal, 1200);
    } catch (err) {
      console.error(err);
      setPasswordMessage('Could not change password. Please try again.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  }

  async function init() {
    const ok = await requireOwnerSession();
    if (!ok) return;

    bindFilters();
    await loadDatabase();
  }

  return { init };
})();
