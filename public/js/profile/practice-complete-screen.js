/**
 * PracticeCompleteScreen — shown when song ends
 */
const PracticeCompleteScreen = (() => {
  function mount(container, { onReplay, onReturn }) {
    container.innerHTML = `
      <div class="practice-complete" id="practice-complete">
        <h2 class="practice-complete__title">Practice Complete</h2>
        <p class="practice-complete__copy">You're ready to sing with the world.</p>
        <div class="actions-row">
          <button class="btn btn-primary" id="practice-replay-btn" type="button">Replay</button>
          <button class="btn btn-secondary" id="practice-return-btn" type="button">Return to Profile</button>
        </div>
      </div>
    `;

    document.getElementById('practice-replay-btn')?.addEventListener('click', onReplay);
    document.getElementById('practice-return-btn')?.addEventListener('click', onReturn);
  }

  return { mount };
})();
