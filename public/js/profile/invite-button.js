/**
 * InviteButton — native share invite
 */
const InviteButton = (() => {
  const SHARE_TEXT =
    "I'm joining World Choir 2027. On July 1, 2027 at 16:00 UTC, the world sings together. Add your voice.";

  function render() {
    return `
      <div class="invite-section profile-section" id="invite-section">
        <button class="btn btn-invite" id="invite-btn" type="button">
          Invite someone to sing
        </button>
      </div>
    `;
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: SHARE_TEXT });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      alert('Invite message copied to clipboard.');
    } catch {
      prompt('Copy this message to invite someone:', SHARE_TEXT);
    }
  }

  function mount(container) {
    container.innerHTML = render();
    document.getElementById('invite-btn')?.addEventListener('click', share);
  }

  return { render, mount, share };
})();
