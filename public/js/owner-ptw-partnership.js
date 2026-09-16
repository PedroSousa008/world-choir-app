/**
 * Owner — Pass the World → Partnership page.
 * Placeholder shell (all black) ready for future partnership tooling.
 */
const OwnerPtwPartnership = (() => {
  function ensureState(state) {
    if (!state.ptwView) state.ptwView = 'main';
    return state;
  }

  function render() {
    return `
      <section class="owner-ptw-partnership" aria-label="Partnership">
        <button type="button" class="owner-ptw-partnership__back" data-ptw-partnership-back>← Back</button>
        <div class="owner-ptw-partnership__canvas" data-ptw-partnership-root>
          <!-- Partnership content lands here -->
        </div>
      </section>
    `;
  }

  function bind(ctx) {
    const { state, render: rerender } = ctx;
    ensureState(state);
    document.querySelector('[data-ptw-partnership-back]')?.addEventListener('click', () => {
      state.ptwView = 'main';
      window.history.pushState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#pass-the-world`
      );
      rerender();
    });
  }

  function open(ctx) {
    const { state, render: rerender } = ctx;
    ensureState(state);
    state.section = 'pass-the-world';
    state.ptwView = 'partnership';
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#pass-the-world/partnership`
    );
    rerender();
  }

  return { ensureState, render, bind, open };
})();

if (typeof window !== 'undefined') window.OwnerPtwPartnership = OwnerPtwPartnership;
