/**
 * DailyActsButton — opens Daily Acts of Peace
 */
const DailyActsButton = (() => {
  function render() {
    return `
      <div class="daily-acts-section profile-section" id="daily-acts-section">
        <button class="btn btn-daily-acts" id="daily-acts-btn" type="button">
          Daily Acts of Peace
        </button>
      </div>
    `;
  }

  function mount(container) {
    container.innerHTML = render();
    document.getElementById('daily-acts-btn')?.addEventListener('click', () => {
      DailyActsPeace.open();
    });
  }

  return { render, mount };
})();
