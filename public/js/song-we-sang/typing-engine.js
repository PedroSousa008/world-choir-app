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

  const FLOURISH_PAUSE_AFTER_SIGNATURE_MS = 220;
  const FLOURISH_UNDERLINE_MS = 720;
  const FLOURISH_PAUSE_AFTER_UNDERLINE_MS = 160;
  const FLOURISH_HEART_MS = 560;

  function createFlourishSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'sws-letter__flourish');
    svg.setAttribute('viewBox', '0 0 180 36');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');

    const underline = document.createElementNS(NS, 'path');
    underline.setAttribute('class', 'sws-letter__underline');
    underline.setAttribute('fill', 'none');
    underline.setAttribute(
      'd',
      'M3 11 C 22 13.4, 41 8.8, 60 11.1 C 79 13.3, 97 8.6, 116 11.4 C 128 13, 140 10.2, 152 11.6'
    );

    const heart = document.createElementNS(NS, 'path');
    heart.setAttribute('class', 'sws-letter__heart');
    heart.setAttribute('fill', 'none');
    heart.setAttribute(
      'd',
      'M157 28 C 150.5 21.5, 150.2 16.2, 153.8 16.2 C 155.8 16.2, 157.2 17.8, 157.2 17.8 C 157.2 17.8, 158.6 16.2, 160.7 16.2 C 164.4 16.2, 164.6 21.6, 157 28'
    );

    svg.appendChild(underline);
    svg.appendChild(heart);
    return svg;
  }

  function prepareFlourishStroke(path) {
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.style.transition = 'none';
    return len;
  }

  function attachFlourish(signatureEl) {
    if (!signatureEl) return null;
    let svg = signatureEl.querySelector('.sws-letter__flourish');
    if (!svg) {
      svg = createFlourishSvg();
      signatureEl.appendChild(svg);
    }
    const span = signatureEl.querySelector('span');
    const textW = span ? span.offsetWidth : 0;
    if (textW > 0) svg.style.width = `${Math.round(textW + 22)}px`;
    const underline = svg.querySelector('.sws-letter__underline');
    const heart = svg.querySelector('.sws-letter__heart');
    if (underline) prepareFlourishStroke(underline);
    if (heart) prepareFlourishStroke(heart);
    return { svg, underline, heart };
  }

  function revealFlourishInstant(signatureEl) {
    const parts = attachFlourish(signatureEl);
    if (!parts) return;
    if (parts.underline) parts.underline.style.strokeDashoffset = '0';
    if (parts.heart) parts.heart.style.strokeDashoffset = '0';
    parts.svg.classList.add('is-drawn');
  }

  function animateFlourish(signatureEl, { onComplete } = {}) {
    const parts = attachFlourish(signatureEl);
    if (!parts) {
      if (typeof onComplete === 'function') onComplete();
      return { cancel() {} };
    }

    let cancelled = false;
    const timers = [];

    const later = (fn, ms) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    later(() => {
      if (!parts.underline) return;
      parts.underline.style.transition = `stroke-dashoffset ${FLOURISH_UNDERLINE_MS}ms ease-out`;
      parts.underline.style.strokeDashoffset = '0';

      later(() => {
        later(() => {
          if (!parts.heart) return;
          parts.heart.style.transition = `stroke-dashoffset ${FLOURISH_HEART_MS}ms ease-out`;
          parts.heart.style.strokeDashoffset = '0';

          later(() => {
            parts.svg.classList.add('is-drawn');
            if (typeof onComplete === 'function') onComplete();
          }, FLOURISH_HEART_MS + 20);
        }, FLOURISH_PAUSE_AFTER_UNDERLINE_MS);
      }, FLOURISH_UNDERLINE_MS);
    }, FLOURISH_PAUSE_AFTER_SIGNATURE_MS);

    return {
      cancel() {
        cancelled = true;
        timers.forEach((id) => window.clearTimeout(id));
      },
    };
  }

  function lastSignature(container) {
    if (!container) return null;
    const all = container.querySelectorAll('.sws-letter__signature');
    return all.length ? all[all.length - 1] : null;
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
    revealFlourishInstant(lastSignature(container));
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
    let flourishController = null;

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
      if (cancelled) return;

      const signatureEl = lastSignature(container);
      if (signatureEl) {
        flourishController = animateFlourish(signatureEl, {
          onComplete() {
            if (!cancelled && typeof onComplete === 'function') onComplete();
          },
        });
        return;
      }

      if (typeof onComplete === 'function') onComplete();
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
        if (flourishController) {
          flourishController.cancel();
          flourishController = null;
        }
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
