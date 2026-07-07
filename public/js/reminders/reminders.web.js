/**
 * Remind Me — web/PWA fallback (calendar alerts + copy details)
 */
const WorldChoirRemindersWeb = (() => {
  let copyResetTimer = null;

  function getEventDetailsText() {
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
            To make sure you don't miss World Choir 2027, add it to your Calendar with alerts.
          </p>
          <p class="remind-fallback-hint" id="remind-fallback-hint" hidden></p>
          <div class="remind-fallback-actions">
            <button class="btn btn-primary" id="remind-fallback-calendar" type="button">Add to Calendar</button>
            <button class="btn btn-secondary" id="remind-fallback-copy" type="button">Copy Event Details</button>
            <button class="btn btn-ghost" id="remind-fallback-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('remind-fallback-calendar')?.addEventListener('click', addToCalendarWithAlerts);
    document.getElementById('remind-fallback-copy')?.addEventListener('click', copyEventDetails);
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
    if (copyBtn) copyBtn.textContent = 'Copy Event Details';
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('remind-fallback-calendar')?.focus();
  }

  function close() {
    const overlay = document.getElementById('remind-fallback-overlay');
    overlay?.classList.remove('active');
    overlay?.setAttribute('aria-hidden', 'true');
    showHint('');
  }

  async function copyEventDetails() {
    const text = getEventDetailsText();
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
      showHint('Event details copied to your clipboard.', true);
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        if (btn) btn.textContent = 'Copy Event Details';
        showHint('');
      }, 2200);
    } catch {
      showHint('Could not copy automatically. Select and copy the text below.');
    }
  }

  async function addToCalendarWithAlerts() {
    await WorldChoirCalendar.addWithAlerts();
    close();
  }

  function init() {
    ensureFallbackModal();
  }

  return { init, open, close, copyEventDetails, addToCalendarWithAlerts, getEventDetailsText };
})();
