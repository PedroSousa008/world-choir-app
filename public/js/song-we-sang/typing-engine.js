/**
 * Song We Sang — character typing engine.
 * Constant interval; supports future pause units without rewriting callers.
 */
const SongWeSangTypingEngine = (() => {
  const SEGMENT_TAGS = {
    greeting: 'p',
    paragraph: 'p',
    emphasis: 'p',
    line: 'p',
    closing: 'p',
    signature: 'p',
  };

  const SEGMENT_CLASS = {
    greeting: 'sws-letter__greeting',
    paragraph: 'sws-letter__p',
    emphasis: 'sws-letter__emphasis',
    line: 'sws-letter__line',
    closing: 'sws-letter__closing',
    signature: 'sws-letter__signature',
  };

  function flattenSegments(segments) {
    const units = [];
    for (const seg of segments || []) {
      if (!seg || typeof seg !== 'object') continue;
      if (seg.type === 'pause') {
        const ms = Number(seg.ms);
        if (Number.isFinite(ms) && ms > 0) {
          units.push({ kind: 'pause', ms });
        }
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

  function createSegmentElement(segment) {
    const tag = SEGMENT_TAGS[segment.type] || 'p';
    const el = document.createElement(tag);
    el.className = SEGMENT_CLASS[segment.type] || 'sws-letter__p';
    if (segment.type === 'emphasis') {
      const strong = document.createElement('strong');
      el.appendChild(strong);
      return { el, textTarget: strong };
    }
    if (segment.type === 'signature') {
      const strong = document.createElement('strong');
      el.appendChild(strong);
      return { el, textTarget: strong };
    }
    return { el, textTarget: el };
  }

  /**
   * Render the complete letter into `container` (no animation).
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
   * Start character-by-character reveal into `container`.
   * Returns a controller with cancel().
   */
  function start({
    container,
    content,
    intervalMs,
    showCaret = true,
    onChar,
    onComplete,
  }) {
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
    renderFull,
    start,
    createSegmentElement,
  };
})();
