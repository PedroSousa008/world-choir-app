/**
 * FoundationPublicCard — the exact Foundation card shown to regular users
 * on the Donate tab. Also used as the Foundation Control Center live preview
 * so both stay in sync.
 */
const FoundationPublicCard = (() => {
  const CAUSES = [
    'Food & Hunger',
    'Health',
    'Education',
    'Humanitarian Aid',
    'Environment',
  ];

  const CAUSE_ALIASES = {
    'humanity help': 'Humanitarian Aid',
    humanitarian: 'Humanitarian Aid',
    'humanitarian aid': 'Humanitarian Aid',
    food: 'Food & Hunger',
    hunger: 'Food & Hunger',
    'food & hunger': 'Food & Hunger',
    'food and hunger': 'Food & Hunger',
    health: 'Health',
    education: 'Education',
    environment: 'Environment',
    climate: 'Environment',
    nature: 'Environment',
  };

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function formatMoney(amount, currency = 'EUR') {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      }).format(n);
    } catch {
      return `€${n % 1 === 0 ? n : n.toFixed(2)}`;
    }
  }

  function initials(name) {
    return (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  function identityGlyph(foundation) {
    const words = String(foundation.foundationName || foundation.creatorName || '')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return initials(foundation.foundationName || foundation.creatorName).slice(0, 2);
  }

  function normalizeCause(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (CAUSE_ALIASES[lower]) return CAUSE_ALIASES[lower];
    return CAUSES.find((c) => c.toLowerCase() === lower) || '';
  }

  function visualUrl(foundation) {
    return String(foundation.coverImage || foundation.profileImage || '').trim();
  }

  function shortMission(foundation, maxLen = 160) {
    const text = String(foundation.mission || '').trim();
    if (!text) return '';
    const match = text.match(/^[\s\S]{1,200}?[.!?](?=\s|$)/);
    const sentence = (match && match[0]) || text;
    if (sentence.length <= maxLen) return sentence.trim();
    return `${sentence.slice(0, maxLen - 1).trim()}…`;
  }

  function causeTags(foundation) {
    const tags = [];
    const primary = foundation.primaryCategory;
    if (primary) tags.push(primary);
    (foundation.categories || []).forEach((c) => {
      const n = normalizeCause(c) || c;
      if (n && !tags.includes(n) && CAUSES.includes(n)) tags.push(n);
    });
    return tags.slice(0, 3);
  }

  function arrowSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }

  function statusLine(foundation, currency) {
    const amount = Number(foundation.totalRaised) || 0;
    return `Total Raised: ${formatMoney(amount, currency || foundation.currency || 'EUR')}`;
  }

  function metaLine(foundation) {
    return [foundation.creatorName, foundation.country]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' · ');
  }

  function render(foundation = {}, opts = {}) {
    const interactive = opts.interactive !== false;
    const img = visualUrl(foundation);
    const tags = causeTags(foundation);
    const mission = shortMission(foundation, 160);
    const meta = metaLine(foundation);
    const name = foundation.foundationName || '';
    const cls = `df-fcard${interactive ? '' : ' df-fcard--preview'}`;
    const openAttrs = interactive
      ? `type="button" data-open-foundation="${esc(foundation.id || '')}" aria-label="${esc([name, foundation.creatorName].filter(Boolean).join(' — ') || 'Open foundation')}"`
      : '';
    const tag = interactive ? 'button' : 'div';

    return `
      <${tag} ${openAttrs} class="${cls}">
        <span class="df-fcard__media ${img ? 'has-image' : ''}" aria-hidden="true">
          ${img
            ? `<img src="${esc(img)}" alt="">`
            : `<span class="df-fcard__glyph">${esc(identityGlyph(foundation))}</span>`}
        </span>
        <span class="df-fcard__body" aria-hidden="${interactive ? 'true' : 'false'}">
          <h3 class="df-fcard__name">${esc(name)}</h3>
          ${meta ? `<p class="df-fcard__meta">${esc(meta)}</p>` : ''}
          ${mission ? `<p class="df-fcard__mission">${esc(mission)}</p>` : ''}
          ${tags.length ? `
            <span class="df-fcard__tags">
              ${tags.map((t) => `<span class="df-fcard__tag">${esc(t)}</span>`).join('')}
            </span>
          ` : ''}
          <span class="df-fcard__foot">
            <span class="df-fcard__status">${esc(statusLine(foundation, opts.currency))}</span>
            <span class="df-fcard__arrow" aria-hidden="true">${arrowSvg()}</span>
          </span>
        </span>
      </${tag}>
    `;
  }

  return {
    CAUSES,
    render,
    visualUrl,
    shortMission,
    causeTags,
    normalizeCause,
    formatMoney,
  };
})();
