/**
 * ParticipationStatusCard — pledge status for active event
 */
const ParticipationStatusCard = (() => {
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getPledgeState() {
    if (typeof WorldChoirPledgeState !== 'undefined') {
      return WorldChoirPledgeState.getState();
    }
    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getPledgeState) {
      return WorldChoirDB.getPledgeState();
    }
    return 'loading';
  }

  function renderLoading() {
    return `
      <div class="glass-card participation-card profile-section participation-card--loading" id="participation-status-card" aria-busy="true">
        <div class="participation-card-skeleton" aria-hidden="true">
          <div class="participation-card-skeleton__line participation-card-skeleton__line--wide"></div>
          <div class="participation-card-skeleton__line participation-card-skeleton__line--btn"></div>
        </div>
      </div>
    `;
  }

  function render() {
    const pledgeState = getPledgeState();

    if (pledgeState === 'loading') {
      return renderLoading();
    }

    const pledged = pledgeState === 'pledged';
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    const eventTitle = WorldChoirConfig.ACTIVE_EVENT.title;

    if (pledged && pledge) {
      return `
        <div class="glass-card participation-card profile-section" id="participation-status-card">
          <p class="participation-status">
            You're singing from <strong>${escapeHtml(pledge.city)}, ${escapeHtml(pledge.country)}</strong>
          </p>
          <button class="btn btn-primary pledged" type="button" disabled>You're Singing</button>
        </div>
      `;
    }

    return `
      <div class="glass-card participation-card profile-section" id="participation-status-card">
        <p class="participation-status">
          You haven't joined ${escapeHtml(eventTitle)} yet.
        </p>
        <button class="btn btn-primary" id="ill-sing-btn" type="button">I'll Sing</button>
      </div>
    `;
  }

  function mount(container, { onIllSing }) {
    container.innerHTML = render();
    document.getElementById('ill-sing-btn')?.addEventListener('click', onIllSing);
  }

  return { render, mount };
})();
