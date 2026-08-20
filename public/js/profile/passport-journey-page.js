/**
 * PassportJourneyPage — real milestones from Passport data (no invented stats)
 */
const PassportJourneyPage = (() => {
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function item(label, value) {
    if (value == null || value === '' || value === '—') return '';
    return `
      <div class="passport-journey-item">
        <p class="passport-journey-item__label">${esc(label)}</p>
        <p class="passport-journey-item__value">${esc(value)}</p>
      </div>
    `;
  }

  function render(data) {
    const voice = WorldChoirPassport.formatVoiceNumber(data.voiceNumber);
    const since = WorldChoirPassport.formatMemberSince(data.memberSince);
    const location = [data.city, data.country].filter(Boolean).join(', ') || null;

    const rows = [
      item('Voice Number', voice === '—' ? null : voice),
      item('Member Since', since === '—' ? null : since),
      item('Location', location),
      item('Events Joined', String(data.eventsJoined ?? 0)),
      item('Daily Acts Completed', String(data.dailyActsCompleted ?? 0)),
    ].join('');

    return `
      <header class="passport-header">
        <div>
          <button type="button" class="passport-header__back" id="journey-back" aria-label="Back to Passport">← Passport</button>
          <h1 class="passport-header__title">Your Journey</h1>
          <p class="passport-header__subtitle">Impact and milestones from your World Choir story.</p>
        </div>
      </header>
      <div class="passport-journey-list">
        ${rows || '<p class="passport-journey-empty">Your journey begins when you join World Choir and complete your first Daily Act of Peace.</p>'}
      </div>
    `;
  }

  async function mount() {
    const root = document.getElementById('passport-journey-root');
    if (!root) return;

    root.innerHTML = `
      <header class="passport-header">
        <div>
          <button type="button" class="passport-header__back" id="journey-back" aria-label="Back to Passport">← Passport</button>
          <h1 class="passport-header__title">Your Journey</h1>
          <p class="passport-header__subtitle">Loading your milestones…</p>
        </div>
      </header>
    `;
    document.getElementById('journey-back')?.addEventListener('click', () => {
      window.location.href = 'passport.html';
    });

    try {
      await WorldChoirDB.ready();
      const data = await WorldChoirPassport.loadPassportData();
      root.innerHTML = render(data);
      document.getElementById('journey-back')?.addEventListener('click', () => {
        window.location.href = 'passport.html';
      });
    } catch (err) {
      console.error(err);
      root.innerHTML = `
        <header class="passport-header">
          <div>
            <button type="button" class="passport-header__back" id="journey-back" aria-label="Back to Passport">← Passport</button>
            <h1 class="passport-header__title">Your Journey</h1>
          </div>
        </header>
        <p class="passport-journey-empty">Could not load your journey right now. Please try again.</p>
      `;
      document.getElementById('journey-back')?.addEventListener('click', () => {
        window.location.href = 'passport.html';
      });
    }
  }

  function init() {
    WorldChoirNav.startWatcher('profile');
    mount();
  }

  return { init };
})();
