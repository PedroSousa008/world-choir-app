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
  const STAMP_PAUSE_AFTER_HEART_MS = 140;
  const STAMP_ANIM_MS = 400;

  function getStampEl() {
    return document.getElementById('sws-stamp');
  }

  function resetStamp() {
    const stamp = getStampEl();
    if (!stamp) return;
    stamp.classList.remove('is-stamping', 'is-stamped');
  }

  function revealStampInstant() {
    const stamp = getStampEl();
    if (!stamp) return;
    stamp.classList.remove('is-stamping');
    stamp.classList.add('is-stamped');
  }

  function animateStamp({ onComplete } = {}) {
    const stamp = getStampEl();
    if (!stamp) {
      if (typeof onComplete === 'function') onComplete();
      return { cancel() {} };
    }

    let cancelled = false;
    let settleId = 0;

    stamp.classList.remove('is-stamped', 'is-stamping');
    // Force reflow so the press animation restarts cleanly on replay.
    void stamp.offsetWidth;
    stamp.classList.add('is-stamping');

    settleId = window.setTimeout(() => {
      if (cancelled) return;
      stamp.classList.remove('is-stamping');
      stamp.classList.add('is-stamped');
      if (typeof onComplete === 'function') onComplete();
    }, STAMP_ANIM_MS);

    return {
      cancel() {
        cancelled = true;
        if (settleId) window.clearTimeout(settleId);
        settleId = 0;
      },
    };
  }

  function createFlourishSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'sws-letter__flourish');
    // Wider than the text so the stroke can continue past "In".
    svg.setAttribute('viewBox', '0 0 180 26');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');

    const underline = document.createElementNS(NS, 'path');
    underline.setAttribute('class', 'sws-letter__underline');
    underline.setAttribute('fill', 'none');
    // Starts under "e" in The; continues through and past "In".
    underline.setAttribute(
      'd',
      'M22 3.2 C 42 3.8, 62 2.6, 82 3.4 C 102 4.1, 122 2.7, 142 3.5 C 155 3.9, 165 3.1, 174 3.4'
    );

    const heart = document.createElementNS(NS, 'path');
    heart.setAttribute('class', 'sws-letter__heart');
    heart.setAttribute('fill', 'none');
    // Small quick outline heart near the right end of the underline, slightly below.
    heart.setAttribute(
      'd',
      'M171 18.5 C 167.4 14.6, 167.2 11.6, 169.3 11.6 C 170.5 11.6, 171.2 12.5, 171.2 12.5 C 171.2 12.5, 171.9 11.6, 173.1 11.6 C 175.3 11.6, 175.4 14.7, 171 18.5'
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
    // Wider than the signature so the underline can continue past "In".
    if (textW > 0) svg.style.width = `${Math.round(textW + 28)}px`;
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
    revealStampInstant();
  }

  function animateFlourish(signatureEl, { onComplete } = {}) {
    const parts = attachFlourish(signatureEl);
    if (!parts) {
      if (typeof onComplete === 'function') onComplete();
      return { cancel() {} };
    }

    let cancelled = false;
    const timers = [];
    let stampController = null;

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
            // Tiny pause after heart, then stamp presses onto the paper.
            later(() => {
              stampController = animateStamp({
                onComplete() {
                  if (!cancelled && typeof onComplete === 'function') onComplete();
                },
              });
            }, STAMP_PAUSE_AFTER_HEART_MS);
          }, FLOURISH_HEART_MS + 20);
        }, FLOURISH_PAUSE_AFTER_UNDERLINE_MS);
      }, FLOURISH_UNDERLINE_MS);
    }, FLOURISH_PAUSE_AFTER_SIGNATURE_MS);

    return {
      cancel() {
        cancelled = true;
        timers.forEach((id) => window.clearTimeout(id));
        if (stampController) {
          stampController.cancel();
          stampController = null;
        }
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
    resetStamp();

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
