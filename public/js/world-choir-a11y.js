/**
 * World Choir — shared accessibility helpers (focus trap, overlays, skip link).
 */
const WorldChoirA11y = (() => {
  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  let trappedOverlay = null;
  let previousFocus = null;

  function focusableIn(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => {
      if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    });
  }

  function ensureSkipLink() {
    if (document.getElementById('wc-skip-link')) return;
    const main = document.querySelector('main[id]') || document.querySelector('main');
    if (!main) return;
    if (!main.id) main.id = 'main-content';

    const link = document.createElement('a');
    link.id = 'wc-skip-link';
    link.className = 'skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Skip to content';
    document.body.insertBefore(link, document.body.firstChild);
  }

  function syncOverlayState(overlay, open) {
    if (!overlay) return;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    const dialog = overlay.querySelector('[role="dialog"]');
    if (dialog) {
      dialog.setAttribute('aria-modal', 'true');
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
    }
  }

  function trapFocus(overlay) {
    releaseTrap();
    trappedOverlay = overlay;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    syncOverlayState(overlay, true);

    const focusables = focusableIn(overlay);
    const dialog = overlay.querySelector('[role="dialog"]');
    (focusables[0] || dialog)?.focus?.();

    overlay.addEventListener('keydown', onTrapKeydown);
  }

  function releaseTrap() {
    if (!trappedOverlay) return;
    trappedOverlay.removeEventListener('keydown', onTrapKeydown);
    syncOverlayState(trappedOverlay, trappedOverlay.classList.contains('active'));
    const restore = previousFocus;
    trappedOverlay = null;
    previousFocus = null;
    if (restore && typeof restore.focus === 'function') {
      try { restore.focus(); } catch { /* ignore */ }
    }
  }

  function onTrapKeydown(event) {
    if (!trappedOverlay) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      const cancel = trappedOverlay.querySelector(
        '[data-a11y-close], [data-ptw-close], #participation-cancel, #remind-fallback-cancel, #ios-calendar-cancel, #donate-modal-cancel, .passport-info-modal .btn-secondary'
      );
      if (cancel) cancel.click();
      else {
        trappedOverlay.classList.remove('active');
        syncOverlayState(trappedOverlay, false);
        releaseTrap();
      }
      return;
    }

    if (event.key !== 'Tab') return;
    const focusables = focusableIn(trappedOverlay);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Observe .overlay elements: trap focus while .active, sync aria-hidden.
   */
  function bindOverlays(root = document) {
    root.querySelectorAll('.overlay').forEach((overlay) => {
      if (overlay.dataset.wcA11yBound === '1') return;
      overlay.dataset.wcA11yBound = '1';
      syncOverlayState(overlay, overlay.classList.contains('active'));

      const observer = new MutationObserver(() => {
        const open = overlay.classList.contains('active');
        syncOverlayState(overlay, open);
        if (open) trapFocus(overlay);
        else if (trappedOverlay === overlay) releaseTrap();
      });
      observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function init() {
    ensureSkipLink();
    bindOverlays();
  }

  return {
    init,
    ensureSkipLink,
    bindOverlays,
    trapFocus,
    releaseTrap,
    syncOverlayState,
  };
})();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WorldChoirA11y.init());
  } else {
    WorldChoirA11y.init();
  }
}
