/**
 * UserIdentityCard — premium identity card
 */
const UserIdentityCard = (() => {
  function render(user) {
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    const voiceName = pledge?.voiceName || pledge?.display_name || user.display_name;
    const hasLocation = user.city && user.country;
    const locationHtml = hasLocation
      ? `${escapeHtml(user.city)}, ${escapeHtml(user.country)}`
      : '<span class="identity-location--empty">Location not set</span>';

    return `
      <div class="glass-card identity-card profile-section" id="user-identity-card">
        ${voiceName ? `<h1 class="identity-name">${escapeHtml(voiceName)}</h1>` : ''}
        <p class="identity-location">${locationHtml}</p>
        <button class="btn btn-ghost" id="change-location-btn" type="button">
          Change Participation Location
        </button>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function mount(container, { onChangeLocation }) {
    container.innerHTML = render(WorldChoirDB.getCurrentUser());
    document.getElementById('change-location-btn')?.addEventListener('click', onChangeLocation);
  }

  return { render, mount };
})();
