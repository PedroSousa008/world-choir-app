/**
 * PromiseCard — only shown after event ends with a submitted promise
 */
const PromiseCard = (() => {
  function shouldShow() {
    const eventEnded = new Date() >= WorldChoirConfig.getEventEnd();
    const promise = WorldChoirDB.getPromiseForCurrentUser();
    return eventEnded && !!promise;
  }

  function render() {
    if (!shouldShow()) return '';

    const promise = WorldChoirDB.getPromiseForCurrentUser();
    const eventTitle = WorldChoirConfig.ACTIVE_EVENT.title;

    return `
      <div class="glass-card promise-card profile-section" id="promise-card">
        <p class="promise-label">My Promise to the World</p>
        <p class="promise-text">"${escapeHtml(promise.promise_text)}"</p>
        <p class="promise-event">${escapeHtml(eventTitle)}</p>
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

  return { shouldShow, render, mount };
})();
