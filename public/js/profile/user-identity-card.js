/**
 * UserIdentityCard — premium identity card
 */
const UserIdentityCard = (() => {
  function isPostEvent() {
    if (typeof WorldChoirConfig === 'undefined') return false;
    const state = WorldChoirConfig.getGlobalEventState?.();
    return state === WorldChoirConfig.EventState?.COMPLETED;
  }

  function render(user) {
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    const voiceName = pledge?.voiceName || pledge?.display_name || user.display_name;
    const hasLocation = user.city && user.country;
    const locationHtml = hasLocation
      ? `${escapeHtml(user.city)}, ${escapeHtml(user.country)}`
      : '<span class="identity-location--empty">Location not set</span>';
    const showWorldChain = isPostEvent();

    return `
      <div class="glass-card identity-card profile-section" id="user-identity-card">
        ${voiceName ? `<h1 class="identity-name">${escapeHtml(voiceName)}</h1>` : ''}
        <p class="identity-location">${locationHtml}</p>
        <div class="identity-actions">
          <button class="btn btn-ghost" id="change-location-btn" type="button">
            Change Participation Location
          </button>
          <button class="btn btn-ghost" id="open-passport-btn" type="button">
            Open your Passport
          </button>
          ${showWorldChain ? `
          <button class="btn btn-ghost" id="open-world-chain-btn" type="button">
            Open World Chain
          </button>` : ''}
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function mount(container, { onChangeLocation, onOpenPassport, onOpenWorldChain }) {
    container.innerHTML = render(WorldChoirDB.getCurrentUser());
    document.getElementById('change-location-btn')?.addEventListener('click', onChangeLocation);
    document.getElementById('open-passport-btn')?.addEventListener('click', () => {
      if (typeof onOpenPassport === 'function') onOpenPassport();
    });
    document.getElementById('open-world-chain-btn')?.addEventListener('click', () => {
      if (typeof onOpenWorldChain === 'function') onOpenWorldChain();
      else window.location.href = 'world-chain.html';
    });
  }

  return { render, mount };
})();
