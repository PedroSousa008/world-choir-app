/**
 * DailyActsButton — opens Daily Acts of Peace + How World Choir Works
 */
const DailyActsButton = (() => {
  function render() {
    return `
      <div class="daily-acts-section profile-section" id="daily-acts-section">
        <button class="btn btn-daily-acts" id="daily-acts-btn" type="button">
          Daily Acts of Peace
        </button>
        <button class="btn btn-daily-acts" id="how-world-choir-works-btn" type="button">
          How World Choir Works
        </button>
      </div>
    `;
  }

  function mount(container) {
    container.innerHTML = render();
    document.getElementById('daily-acts-btn')?.addEventListener('click', () => {
      DailyActsPeace.open();
    });
    document.getElementById('how-world-choir-works-btn')?.addEventListener('click', () => {
      if (typeof WorldChoirOnboarding === 'undefined') return;
      WorldChoirOnboarding.openReplay({
        onDone: () => {
          /* Stay on Profile — do not alter onboarding completion. */
        },
      });
    });
  }

  return { render, mount };
})();
