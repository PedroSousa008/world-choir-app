/**
 * Song We Sang — character typing engine.
 *
 * Segment → CSS class mapping drives typography.
 * Each character is appended already inside the correct styled element,
 * so fonts are correct while being typed (not changed after).
 */
const SongWeSangTypingEngine = (() => {

  // HTML tag per segment type
  const SEGMENT_TAGS = {
    greeting:  'p',
    paragraph: 'p',
    emphasis:  'p',
    line:      'p',
    closing:   'p',
    signature: 'p',
  };

  // CSS class per segment type — matches song-we-sang.css
  const SEGMENT_CLASS = {
    greeting:  'sws-letter__greeting',   // Brittany Signature 32px
    paragraph: 'sws-letter__p',          // Special Elite 15px
    emphasis:  'sws-letter__emphasis',   // Special Elite 15px bold
    line:      'sws-letter__line',       // Special Elite 15px
    closing:   'sws-letter__closing',    // Caveat 20px
    signature: 'sws-letter__signature',  // Brittany Signature 30px
  };

  /**
   * Flatten structured segments into a sequential unit list.
   * Units: open | char | close | pause
   */
  function flattenSegments(segments) {
    const units = [];
    for (const seg of segments || []) {
      if (!seg || typeof seg !== 'object') continue;
      if (seg.type === 'pause') {
        const ms = Number(seg.ms);
        if (Number.isFinite(ms) && ms > 0) units.push({ kind: 'pause', ms });
        continue;
      }
      if (typeof seg.text !== 'string' || !seg.text.length) continue;
      units.push({ kind: 'open', segment: seg });
      for (const ch of seg.text) {
        units.push({ kind: 'char', ch });
      }
      units.push({ kind: 'close' });
    }
    return units;
  }

  /**
   * Build a DOM element for a segment.
   * Returns { el, textTarget } — textTarget is where characters are appended.
   * Fonts are applied via CSS classes, so they're correct from the first character.
   */
  function createSegmentElement(segment) {
    const tag = SEGMENT_TAGS[segment.type] || 'p';
    const el = document.createElement(tag);
    el.className = SEGMENT_CLASS[segment.type] || 'sws-letter__p';

    // emphasis and signature wrap text in <em> / <span> for semantics,
    // but styling comes from the parent class.
    if (segment.type === 'emphasis') {
      const inner = document.createElement('em');
      el.appendChild(inner);
      return { el, textTarget: inner };
    }
    if (segment.type === 'signature') {
      const inner = document.createElement('span');
      el.appendChild(inner);
      return { el, textTarget: inner };
    }
    return { el, textTarget: el };
  }

  /**
   * Render the complete letter into `container` with no animation.
   * Used for: repeat visits, reduced-motion users.
   */
  function renderFull(container, content) {
    if (!container) return;
    container.textContent = '';
    for (const seg of content.segments || []) {
      if (!seg || seg.type === 'pause' || typeof seg.text !== 'string') continue;
      const { el, textTarget } = createSegmentElement(seg);
      textTarget.textContent = seg.text;
      container.appendChild(el);
    }
  }

  /**
   * Start character-by-character reveal.
   * Returns { cancel() } controller.
   *
   * Options:
   *   container   — DOM element to render into
   *   content     — LETTER_CONTENT object
   *   intervalMs  — ms per character (from LETTER_CHARACTER_INTERVAL_MS)
   *   showCaret   — whether to show the subtle caret
   *   onChar      — called after each character is added
   *   onComplete  — called when the last character has been appended
   */
  function start({ container, content, intervalMs, showCaret = true, onChar, onComplete }) {
    let cancelled = false;
    let timerId = 0;
    let unitIndex = 0;
    let textTarget = null;
    let caretEl = null;

    const units = flattenSegments(content.segments);
    const interval = Math.max(1, Number(intervalMs) || 40);

    const removeCaret = () => {
      if (caretEl?.parentNode) caretEl.parentNode.removeChild(caretEl);
      caretEl = null;
    };

    const placeCaret = () => {
      if (!showCaret || !textTarget) return;
      if (!caretEl) {
        caretEl = document.createElement('span');
        caretEl.className = 'sws-letter__caret';
        caretEl.setAttribute('aria-hidden', 'true');
      }
      textTarget.appendChild(caretEl);
    };

    const finish = () => {
      removeCaret();
      if (!cancelled && typeof onComplete === 'function') onComplete();
    };

    const step = () => {
      if (cancelled) return;

      if (unitIndex >= units.length) {
        finish();
        return;
      }

      const unit = units[unitIndex++];

      if (unit.kind === 'pause') {
        timerId = window.setTimeout(step, unit.ms);
        return;
      }

      if (unit.kind === 'open') {
        const { el, textTarget: target } = createSegmentElement(unit.segment);
        textTarget = target;
        container.appendChild(el);
        placeCaret();
        timerId = window.setTimeout(step, 0);
        return;
      }

      if (unit.kind === 'close') {
        removeCaret();
        textTarget = null;
        timerId = window.setTimeout(step, 0);
        return;
      }

      if (unit.kind === 'char' && textTarget) {
        removeCaret();
        textTarget.appendChild(document.createTextNode(unit.ch));
        placeCaret();
        if (typeof onChar === 'function') onChar(unit.ch);
      }

      timerId = window.setTimeout(step, interval);
    };

    container.textContent = '';
    timerId = window.setTimeout(step, interval);

    return {
      cancel() {
        cancelled = true;
        if (timerId) window.clearTimeout(timerId);
        timerId = 0;
        removeCaret();
      },
    };
  }

  return {
    flattenSegments,
    createSegmentElement,
    renderFull,
    start,
  };
})();
