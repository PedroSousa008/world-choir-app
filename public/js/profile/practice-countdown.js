/**
 * PracticeCountdown — cinematic 3-2-1 countdown
 */
const PracticeCountdown = (() => {
  let timers = [];

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function mount(container, { onComplete }) {
    clear();
    container.innerHTML = `
      <div class="practice-countdown" id="practice-countdown">
        <span class="practice-countdown__number" id="countdown-number">3</span>
      </div>
    `;

    const numberEl = document.getElementById('countdown-number');
    let count = 3;

    function showNumber(n) {
      if (!numberEl) return;
      numberEl.textContent = String(n);
      numberEl.style.animation = 'none';
      void numberEl.offsetWidth;
      numberEl.style.animation = '';
    }

    showNumber(3);

    timers.push(
      setTimeout(() => showNumber(2), 1000),
      setTimeout(() => showNumber(1), 2000),
      setTimeout(() => {
        clear();
        onComplete?.();
      }, 3000)
    );
  }

  return { mount, clear };
})();
