/**
 * WorldChoirHistory — personal memory archive
 */
const WorldChoirHistory = (() => {
  function render() {
    const history = WorldChoirDB.getParticipationHistory();
    const pledged = WorldChoirDB.hasPledged();
    const eventDate = WorldChoirConfig.formatEventDate();

    let body = '';

    if (history.length === 0 && !pledged) {
      body = `
        <p class="history-empty">Your history begins on ${eventDate}.</p>
      `;
    } else if (history.length === 0 && pledged) {
      body = renderEntry({
        event: { title: WorldChoirConfig.ACTIVE_EVENT.title, song_name: WorldChoirConfig.ACTIVE_EVENT.songName },
        pledge: WorldChoirDB.getPledgeForCurrentUser(),
        promise: WorldChoirDB.getPromiseForCurrentUser(),
      });
    } else {
      body = history.map(renderEntry).join('');
    }

    return `
      <div class="glass-card history-card profile-section" id="world-choir-history">
        <p class="history-section-label">My World Choir History</p>
        ${body}
      </div>
    `;
  }

  function renderEntry({ event, pledge, promise }) {
    const title = event?.title || WorldChoirConfig.ACTIVE_EVENT.title;
    const song = event?.song_name || WorldChoirConfig.ACTIVE_EVENT.songName;
    const location = pledge ? `${pledge.city}, ${pledge.country}` : '—';
    const eventEnded = new Date() >= WorldChoirConfig.getEventEnd();
    const promiseHtml =
      eventEnded && promise
        ? `<p class="history-promise">Promise: "${escapeHtml(promise.promise_text)}"</p>`
        : '';

    return `
      <div class="history-entry">
        <p class="history-entry-title">${escapeHtml(title)}</p>
        <div class="history-detail">
          <span class="history-detail-label">Song</span>
          <span class="history-detail-value">${escapeHtml(song)}</span>
        </div>
        <div class="history-detail">
          <span class="history-detail-label">Location</span>
          <span class="history-detail-value">${escapeHtml(location)}</span>
        </div>
        ${promiseHtml}
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function mount(container) {
    container.innerHTML = render();
  }

  return { render, mount };
})();
