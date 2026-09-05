/**
 * Owner Control Center — World Chain Photo Book moderation.
 * Lists chains, inspects participant selfies/notes, removes content independently.
 */
const OwnerWorldChainPhotoBook = (() => {
  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'photos', label: 'With Photos' },
    { id: 'descriptions', label: 'With Descriptions' },
    { id: 'missing', label: 'Missing Content' },
  ];

  const SORTS = [
    { id: 'chain', label: 'Chain Order' },
    { id: 'newest', label: 'Newest Submission' },
    { id: 'oldest', label: 'Oldest Submission' },
    { id: 'country', label: 'Country' },
    { id: 'voice', label: 'Voice Number' },
  ];

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    } catch {
      return String(iso).slice(0, 10);
    }
  }

  function fmtDateTime(iso) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false,
      });
    } catch {
      return String(iso);
    }
  }

  function flagHtml(country, esc) {
    const url = typeof WorldChoirFlags !== 'undefined'
      ? WorldChoirFlags.flagCircleUrl(country)
      : null;
    if (!url) {
      return `<span class="owner-wcpb-flag owner-wcpb-flag--empty" aria-hidden="true"></span>`;
    }
    return `<span class="owner-wcpb-flag" aria-hidden="true"><img src="${esc(url)}" alt="" width="16" height="16"></span>`;
  }

  function formatVoice(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return `#${Number(n)}`;
  }

  function filterParticipants(list, filter, query) {
    let rows = Array.isArray(list) ? [...list] : [];
    if (filter === 'photos') rows = rows.filter((p) => p.hasPhoto);
    else if (filter === 'descriptions') rows = rows.filter((p) => p.hasDescription);
    else if (filter === 'missing') rows = rows.filter((p) => !p.hasPhoto || !p.hasDescription);

    const q = String(query || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) => {
        const voice = String(p.voiceNumber ?? '');
        const country = String(p.country || '').toLowerCase();
        const city = String(p.city || '').toLowerCase();
        return voice.includes(q.replace(/^#/, ''))
          || country.includes(q)
          || city.includes(q);
      });
    }
    return rows;
  }

  function sortParticipants(list, sort) {
    const rows = [...list];
    if (sort === 'newest') {
      rows.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    } else if (sort === 'oldest') {
      rows.sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')));
    } else if (sort === 'country') {
      rows.sort((a, b) => String(a.country || '').localeCompare(String(b.country || '')));
    } else if (sort === 'voice') {
      rows.sort((a, b) => (Number(a.voiceNumber) || 0) - (Number(b.voiceNumber) || 0));
    } else {
      rows.sort((a, b) => (Number(a.chainPosition) || 0) - (Number(b.chainPosition) || 0));
    }
    return rows;
  }

  function filterCounts(participants) {
    const all = participants || [];
    return {
      all: all.length,
      photos: all.filter((p) => p.hasPhoto).length,
      descriptions: all.filter((p) => p.hasDescription).length,
      missing: all.filter((p) => !p.hasPhoto || !p.hasDescription).length,
    };
  }

  function statusDot(p) {
    if (p.hasContribution) return 'is-ok';
    return 'is-empty';
  }

  function renderCard(p, chainNum, esc, busyId) {
    const pos = Number.isFinite(Number(p.chainPosition)) ? Number(p.chainPosition) + 1 : '—';
    const voiceLabel = formatVoice(p.voiceNumber);
    const alt = `Photo Book submission from Voice ${voiceLabel}${p.city ? `, ${p.city}` : ''}${p.country ? `, ${p.country}` : ''}`;
    const busy = busyId === p.entryId;
    const photoTime = fmtDateTime(p.photoSubmittedAt);
    const noteTime = fmtDateTime(p.descriptionSubmittedAt);
    const submitted = fmtDateTime(p.submittedAt);

    return `
      <article class="owner-wcpb-card" data-entry-id="${esc(p.entryId || '')}">
        <header class="owner-wcpb-card__head">
          <span class="owner-wcpb-card__pos">${esc(pos)}</span>
          <span class="owner-wcpb-card__dot ${statusDot(p)}" title="${p.hasContribution ? 'Has Photo Book content' : 'No Photo Book content'}" aria-hidden="true"></span>
        </header>
        <div class="owner-wcpb-card__photo${p.hasPhoto ? '' : ' is-empty'}">
          ${p.hasPhoto
            ? `<img src="${esc(p.photoUrl)}" alt="${esc(alt)}" loading="lazy" decoding="async">`
            : `<span class="owner-wcpb-card__photo-fill" aria-hidden="true"></span>`}
        </div>
        <div class="owner-wcpb-card__identity">
          <p class="owner-wcpb-card__country">
            ${flagHtml(p.country, esc)}
            <span>${esc(p.country || '—')}</span>
          </p>
          ${p.city ? `
            <p class="owner-wcpb-card__city">
              <span aria-hidden="true">⌖</span>
              <span>${esc(p.city)}</span>
            </p>
          ` : ''}
          <p class="owner-wcpb-card__voice">Voice ${esc(voiceLabel)}</p>
        </div>
        <div class="owner-wcpb-card__note">
          ${p.hasDescription
            ? `<p class="owner-wcpb-card__note-text">${esc(p.note)}</p>`
            : `<p class="owner-wcpb-card__note-empty">No description submitted</p>`}
        </div>
        <div class="owner-wcpb-card__meta">
          ${photoTime ? `<p>Photo submitted ${esc(photoTime)}</p>` : ''}
          ${noteTime && noteTime !== photoTime ? `<p>Description submitted ${esc(noteTime)}</p>` : ''}
          ${!photoTime && !noteTime && submitted ? `<p>Submitted ${esc(submitted)}</p>` : ''}
          ${!photoTime && !noteTime && !submitted ? `<p class="owner-muted">No submission yet</p>` : ''}
        </div>
        <div class="owner-wcpb-card__actions">
          ${p.hasPhoto && p.entryId ? `
            <button
              type="button"
              class="owner-wcpb-danger"
              data-wcpb-remove-photo="${esc(p.entryId)}"
              ${busy ? 'disabled' : ''}
            >
              ${busy ? 'Removing…' : 'Remove Photo'}
            </button>
          ` : ''}
          ${p.hasDescription && p.entryId ? `
            <button
              type="button"
              class="owner-wcpb-danger"
              data-wcpb-remove-desc="${esc(p.entryId)}"
              ${busy ? 'disabled' : ''}
            >
              ${busy ? 'Removing…' : 'Remove Description'}
            </button>
          ` : ''}
        </div>
      </article>
    `;
  }

  function render(state, helpers) {
    const { esc } = helpers;
    const overview = state.wcpbOverview;
    const detail = state.wcpbDetail;
    const busy = !!state.wcpbBusy;
    const chains = overview?.chains || [];
    const selectedId = state.wcpbSelectedChainId;
    const filter = state.wcpbFilter || 'all';
    const sort = state.wcpbSort || 'chain';
    const query = state.wcpbQuery || '';
    const counts = filterCounts(detail?.participants || []);
    const visible = sortParticipants(
      filterParticipants(detail?.participants || [], filter, query),
      sort
    );

    return `
      <section class="owner-section owner-wcpb">
        <header class="owner-wcpb__page-head">
          <div>
            <p class="owner-section__label">World Choir</p>
            <h2 class="owner-h1" style="font-size:1.35rem;margin-bottom:8px">World Chain Photo Book</h2>
            <p class="owner-sub">
              Manage photos and descriptions submitted by participants in every World Chain.
            </p>
            <p class="owner-muted" style="margin-top:6px">
              Remove content when necessary. Changes update the public Photo Book immediately.
            </p>
          </div>
          <button type="button" class="owner-btn-ghost" data-wcpb-refresh ${busy ? 'disabled' : ''}>
            ${busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <div class="owner-wcpb__layout">
          <aside class="owner-wcpb-chains">
            <div class="owner-wcpb-chains__head">
              <h3 class="owner-wcpb-panel__title">World Chains</h3>
              <p class="owner-muted">Select a chain to manage its Photo Book.</p>
            </div>
            <div class="owner-wcpb-chains__list" role="list">
              ${busy && !chains.length ? `
                <div class="owner-wcpb-skel" aria-hidden="true"></div>
                <div class="owner-wcpb-skel" aria-hidden="true"></div>
                <div class="owner-wcpb-skel" aria-hidden="true"></div>
              ` : ''}
              ${!busy && !chains.length ? `
                <p class="owner-empty">No World Chains yet.</p>
              ` : ''}
              ${chains.map((c) => {
                const active = c.chainId === selectedId;
                const cov = `${c.counts?.withContribution || 0} / ${c.counts?.participants || 0} participants`;
                return `
                  <button
                    type="button"
                    class="owner-wcpb-chain${active ? ' is-active' : ''}"
                    role="listitem"
                    data-wcpb-select="${esc(c.chainId)}"
                  >
                    <span class="owner-wcpb-chain__main">
                      <span class="owner-wcpb-chain__title">World Chain #${esc(c.dailyChainNumber ?? '—')}</span>
                      <span class="owner-wcpb-chain__meta">${esc(fmtDate(c.dateLabel || c.dayKey || c.completedAt || c.startsAt))}</span>
                    </span>
                    <span class="owner-wcpb-chain__cov">${esc(cov)}</span>
                    <span class="owner-wcpb-chain__chev" aria-hidden="true">›</span>
                  </button>
                `;
              }).join('')}
            </div>
          </aside>

          <div class="owner-wcpb-detail">
            ${!selectedId ? `
              <div class="owner-wcpb-detail__empty">
                <p class="owner-empty">Select a World Chain to moderate its Photo Book.</p>
              </div>
            ` : busy && !detail ? `
              <div class="owner-wcpb-detail__empty">
                <div class="owner-wcpb-skel owner-wcpb-skel--wide" aria-hidden="true"></div>
                <div class="owner-wcpb-skel owner-wcpb-skel--wide" aria-hidden="true"></div>
              </div>
            ` : detail ? `
              <header class="owner-wcpb-detail__head">
                <div>
                  <h3 class="owner-wcpb-panel__title">World Chain #${esc(detail.dailyChainNumber ?? '—')}</h3>
                  <p class="owner-wcpb-detail__route">${esc(detail.routeSummary || '—')}</p>
                  <p class="owner-muted">
                    ${esc(detail.counts?.participants || 0)} participants
                    · ${esc(detail.counts?.photos || 0)} photos
                    · ${esc(detail.counts?.descriptions || 0)} descriptions
                  </p>
                </div>
                <a
                  class="owner-btn-ghost owner-wcpb-public"
                  href="${esc(detail.publicUrl || '#')}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Public Photo Book ↗
                </a>
              </header>

              <div class="owner-wcpb-toolbar">
                <div class="owner-wcpb-filters" role="tablist" aria-label="Filter participants">
                  ${FILTERS.map((f) => `
                    <button
                      type="button"
                      class="owner-wcpb-filter${filter === f.id ? ' is-active' : ''}"
                      data-wcpb-filter="${f.id}"
                      role="tab"
                      aria-selected="${filter === f.id ? 'true' : 'false'}"
                    >
                      ${esc(f.label)} (${esc(counts[f.id] ?? 0)})
                    </button>
                  `).join('')}
                </div>
                <div class="owner-wcpb-toolbar__right">
                  <label class="owner-wcpb-search">
                    <span class="owner-cf-search__icon" aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      class="owner-cf-search__input"
                      data-wcpb-search
                      placeholder="Search Voice, country or city..."
                      value="${esc(query)}"
                    >
                  </label>
                  <label class="owner-wcpb-sort">
                    <span class="owner-muted">Sort by</span>
                    <select class="owner-cf-select" data-wcpb-sort aria-label="Sort participants">
                      ${SORTS.map((s) => `
                        <option value="${s.id}" ${sort === s.id ? 'selected' : ''}>${esc(s.label)}</option>
                      `).join('')}
                    </select>
                  </label>
                </div>
              </div>

              ${!(detail.participants || []).length ? `
                <p class="owner-empty">No participants available for this Photo Book yet.</p>
              ` : !visible.length ? `
                <p class="owner-empty">No participants match this filter.</p>
              ` : `
                <div class="owner-wcpb-grid">
                  ${visible.map((p) => renderCard(p, detail.dailyChainNumber, esc, state.wcpbActionBusy)).join('')}
                </div>
              `}
            ` : `
              <div class="owner-wcpb-detail__empty">
                <p class="owner-empty">Could not load this chain.</p>
              </div>
            `}
          </div>
        </div>
      </section>
    `;
  }

  function bind(root, state, helpers, ctx) {
    const { api, onRender, setFlash, loadData } = ctx;

    root.querySelector('[data-wcpb-refresh]')?.addEventListener('click', () => {
      loadData(false);
    });

    root.querySelectorAll('[data-wcpb-select]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-wcpb-select');
        if (!id || id === state.wcpbSelectedChainId) return;
        state.wcpbSelectedChainId = id;
        state.wcpbFilter = 'all';
        state.wcpbQuery = '';
        state.wcpbDetail = null;
        onRender();
        await loadData(true);
      });
    });

    root.querySelectorAll('[data-wcpb-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.wcpbFilter = btn.getAttribute('data-wcpb-filter') || 'all';
        onRender();
      });
    });

    root.querySelector('[data-wcpb-sort]')?.addEventListener('change', (e) => {
      state.wcpbSort = e.target.value || 'chain';
      onRender();
    });

    const search = root.querySelector('[data-wcpb-search]');
    search?.addEventListener('input', () => {
      state.wcpbQuery = search.value || '';
      onRender();
    });

    async function removeContent(kind, entryId) {
      if (!entryId || !state.wcpbSelectedChainId || state.wcpbActionBusy) return;
      const chainNum = state.wcpbDetail?.dailyChainNumber ?? '—';
      const isPhoto = kind === 'photo';
      const ok = window.confirm(
        isPhoto
          ? `Remove this photo?\n\nThis will remove the participant's photo from World Chain #${chainNum}. Their Photo Book card will remain, but the public photo area will appear as the standard gray placeholder.`
          : `Remove this description?\n\nThis will remove the participant's description from World Chain #${chainNum}. Their participant card and photo, if present, will remain.`
      );
      if (!ok) return;

      state.wcpbActionBusy = entryId;
      onRender();
      try {
        await api(
          isPhoto ? 'world-chain-photo-book-remove-photo' : 'world-chain-photo-book-remove-description',
          {
            method: 'POST',
            body: {
              chainId: state.wcpbSelectedChainId,
              entryId,
            },
          }
        );
        setFlash(isPhoto ? 'Photo removed from the public Photo Book.' : 'Description removed from the public Photo Book.');
        await loadData(true);
      } catch (err) {
        setFlash(err.message || (isPhoto ? 'Could not remove photo. Please try again.' : 'Could not remove description. Please try again.'), 'err');
      } finally {
        state.wcpbActionBusy = null;
        onRender();
      }
    }

    root.querySelectorAll('[data-wcpb-remove-photo]').forEach((btn) => {
      btn.addEventListener('click', () => removeContent('photo', btn.getAttribute('data-wcpb-remove-photo')));
    });
    root.querySelectorAll('[data-wcpb-remove-desc]').forEach((btn) => {
      btn.addEventListener('click', () => removeContent('description', btn.getAttribute('data-wcpb-remove-desc')));
    });
  }

  return { render, bind };
})();

if (typeof window !== 'undefined') {
  window.OwnerWorldChainPhotoBook = OwnerWorldChainPhotoBook;
}
