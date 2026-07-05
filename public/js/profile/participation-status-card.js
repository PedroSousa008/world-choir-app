/**
 * ParticipationStatusCard — pledge status for active event
 */
const ParticipationStatusCard = (() => {
  function render() {
    const pledged = WorldChoirDB.hasPledged();
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function mount(container, { onIllSing }) {
    container.innerHTML = render();
    document.getElementById('ill-sing-btn')?.addEventListener('click', onIllSing);
  }

  return { render, mount };
})();
