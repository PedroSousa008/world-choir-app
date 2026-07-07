/**
 * Remind Me — web/PWA fallback (calendar alerts when native reminders unavailable)
 */
const WorldChoirRemindersWeb = (() => {
  let copyResetTimer = null;

  function getReminderDetailsText() {
    return [
      'World Choir 2027',
      'July 1, 2027 · 16:00 UTC',
      'Song: Imagine — John Lennon',
      '',
      'Once a year, the world sings the same song at the exact same time.',
    ].join('\n');
  }

  function ensureFallbackModal() {
    if (document.getElementById('remind-fallback-overlay')) return;

    const html = `
      <div class="overlay" id="remind-fallback-overlay" aria-hidden="true">
        <div class="modal remind-fallback-modal" role="dialog" aria-labelledby="remind-fallback-title">
          <h2 class="modal-title" id="remind-fallback-title">Remind Me</h2>
          <p class="modal-copy remind-fallback-copy">
            To make sure you don't miss World Choir 2027, add it to your device reminders.
          </p>
          <p class="remind-fallback-note">
            Reminders aren't available from the browser, so we'll create calendar alerts instead.
          </p>
          <p class="remind-fallback-hint" id="remind-fallback-hint" hidden></p>
          <div class="remind-fallback-actions">
            <button class="btn btn-primary" id="remind-fallback-add" type="button">Add to Reminders</button>
            <button class="btn btn-secondary" id="remind-fallback-copy" type="button">Copy Reminder Details</button>
            <button class="btn btn-ghost" id="remind-fallback-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('remind-fallback-add')?.addEventListener('click', addToReminders);
    document.getElementById('remind-fallback-copy')?.addEventListener('click', copyReminderDetails);
    document.getElementById('remind-fallback-cancel')?.addEventListener('click', close);
    document.getElementById('remind-fallback-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'remind-fallback-overlay') close();
    });
  }

  function showHint(text, isSuccess = false) {
    const el = document.getElementById('remind-fallback-hint');
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle('remind-fallback-hint--success', isSuccess);
  }

  function open() {
    ensureFallbackModal();
    showHint('');
    const overlay = document.getElementById('remind-fallback-overlay');
    const copyBtn = document.getElementById('remind-fallback-copy');
    if (copyBtn) copyBtn.textContent = 'Copy Reminder Details';
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('remind-fallback-add')?.focus();
  }

  function close() {
    const overlay = document.getElementById('remind-fallback-overlay');
    overlay?.classList.remove('active');
    overlay?.setAttribute('aria-hidden', 'true');
    showHint('');
  }

  async function copyReminderDetails() {
    const text = getReminderDetailsText();
    const btn = document.getElementById('remind-fallback-copy');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      if (btn) btn.textContent = 'Copied!';
      showHint('Reminder details copied to your clipboard.', true);
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        if (btn) btn.textContent = 'Copy Reminder Details';
        showHint('');
      }, 2200);
    } catch {
      showHint('Could not copy automatically. Select and copy the text below.');
    }
  }

  async function addToReminders() {
    const result = await WorldChoirCalendar.addWithAlerts();
    if (!result.ok && result.error) {
      showHint(result.error);
      return;
    }
    close();
  }

  function init() {
    ensureFallbackModal();
  }

  return { init, open, close, copyReminderDetails, addToReminders, getReminderDetailsText };
})();
