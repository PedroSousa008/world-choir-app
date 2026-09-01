/**
 * Owner Mode — Post Event Promise Memory (real submitted promises only)
 */
const OwnerPromiseMemory = (() => {
  const SORTS = [
    { id: 'newest', label: 'Newest First' },
    { id: 'oldest', label: 'Oldest First' },
    { id: 'longest', label: 'Longest Promise' },
    { id: 'shortest', label: 'Shortest Promise' },
  ];

  let pollTimer = null;
  let searchDebounce = null;

  function fmt(n) {
    if (n == null || Number.isNaN(Number(n))) return '0';
    return Number(n).toLocaleString('en-US');
  }

  function flagEmoji(code) {
    if (!code || String(code).length !== 2) return '';
    return String.fromCodePoint(
      ...[...String(code).toUpperCase()].map((c) => 0x1F1E6 - 65 + c.charCodeAt(0))
    );
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const date = d.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      });
      const time = d.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
      });
      return `${date} · ${time} UTC`;
    } catch { return '—'; }
  }

  function resultsLabel(state, data) {
    const total = data?.promises?.total ?? 0;
    const f = data?.filters || {};
    if (f.folderId) {
      const folder = (data?.folders || []).find((x) => x.id === f.folderId);
      if (folder) return `${fmt(total)} Promises in “${folder.name}”`;
    }
    if (f.city) return `${fmt(total)} Promises from ${f.city}`;
    if (f.country) return `${fmt(total)} Promises from ${f.country}`;
    if (f.eventId && f.eventId !== 'all') {
      const ev = (data?.events || []).find((e) => e.id === f.eventId);
      return `${fmt(total)} Promises · ${ev?.title || f.eventId}`;
    }
    if (f.q) return `${fmt(total)} Promises matching “${f.q}”`;
    return `${fmt(total)} Promises`;
  }

  function renderLineChart(series) {
    if (!series?.length) return '<p class="owner-pm-empty">No promises submitted yet.</p>';
    const w = 320;
    const h = 100;
    const pad = { l: 2, r: 2, t: 6, b: 4 };
    const values = series.map((d) => Number(d.count ?? 0));
    const max = Math.max(1, ...values);
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const coords = series.map((d, i) => {
      const x = pad.l + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
      const y = pad.t + innerH - (Number(d.count ?? 0) / max) * innerH;
      return { x, y };
    });
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} L${coords[0].x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;
    return `
      <svg class="owner-pm-line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Promises over time">
        <defs>
          <linearGradient id="owner-pm-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4ec5e8" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#4ec5e8" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path class="owner-pm-line-chart__area" d="${area}"/>
        <path class="owner-pm-line-chart__line" d="${line}"/>
      </svg>`;
  }

  function renderOverview(data, esc) {
    const ov = data?.overview || {};
    const viewing = ov.viewingEvent;
    const eventLabel = viewing
      ? viewing.title
      : (data?.filters?.eventId && data.filters.eventId !== 'all'
        ? (data.events || []).find((e) => e.id === data.filters.eventId)?.title
        : 'All Events');
    return `
      <div class="owner-pm-kpi-row">
        <div class="owner-pm-kpi">
          <span class="owner-pm-kpi__label">Total Promises</span>
          <span class="owner-pm-kpi__value">${fmt(ov.totalPromises)}</span>
        </div>
        <div class="owner-pm-kpi">
          <span class="owner-pm-kpi__label">Countries</span>
          <span class="owner-pm-kpi__value">${fmt(ov.countries)}</span>
        </div>
        <div class="owner-pm-kpi">
          <span class="owner-pm-kpi__label">Cities</span>
          <span class="owner-pm-kpi__value">${fmt(ov.cities)}</span>
        </div>
        <div class="owner-pm-kpi">
          <span class="owner-pm-kpi__label">Voices</span>
          <span class="owner-pm-kpi__value">${fmt(ov.voices)}</span>
        </div>
      </div>
      ${viewing ? `
        <div class="owner-pm-event-banner">
          <span class="owner-pm-event-banner__label">Viewing</span>
          <strong>${esc(viewing.title)}</strong>
          <span class="owner-pm-muted">${fmt(viewing.totalPromises)} promises · ${fmt(viewing.countries)} countries · ${fmt(viewing.cities)} cities · ${fmt(viewing.voices)} voices</span>
        </div>` : `
        <p class="owner-pm-viewing">${esc(eventLabel)}</p>`}
    `;
  }

  function renderFilters(state, data, esc) {
    const f = data?.filters || {};
    const countries = data?.countriesFilter || [];
    const cities = data?.citiesFilter || [];
    const folders = data?.folders || [];
    const events = data?.events || [];

    return `
      <div class="owner-pm-filters">
        <div class="owner-pm-search-wrap">
          <input type="search" class="owner-pm-search" data-pm-search placeholder="Search promises, cities, countries, Voice numbers…" value="${esc(state.pmQuery || '')}" autocomplete="off">
        </div>
        <div class="owner-pm-filter-row">
          <label class="owner-pm-filter">
            <span>Event</span>
            <select data-pm-event>
              <option value="all" ${f.eventId === 'all' ? 'selected' : ''}>All Events</option>
              ${events.map((ev) => `<option value="${esc(ev.id)}" ${f.eventId === ev.id ? 'selected' : ''}>${esc(ev.title)}</option>`).join('')}
            </select>
          </label>
          <label class="owner-pm-filter">
            <span>Country</span>
            <select data-pm-country>
              <option value="">All Countries</option>
              ${countries.map((c) => `<option value="${esc(c.country)}" ${f.country === c.country ? 'selected' : ''}>${esc(c.country)} (${fmt(c.count)})</option>`).join('')}
            </select>
          </label>
          <label class="owner-pm-filter">
            <span>City</span>
            <select data-pm-city ${!f.country ? 'disabled' : ''}>
              <option value="">All Cities</option>
              ${cities.map((c) => `<option value="${esc(c.city)}" ${f.city === c.city ? 'selected' : ''}>${esc(c.city)} (${fmt(c.count)})</option>`).join('')}
            </select>
          </label>
          <label class="owner-pm-filter">
            <span>From</span>
            <input type="date" data-pm-date-from value="${esc(f.dateFrom || '')}">
          </label>
          <label class="owner-pm-filter">
            <span>To</span>
            <input type="date" data-pm-date-to value="${esc(f.dateTo || '')}">
          </label>
          <label class="owner-pm-filter">
            <span>Folder</span>
            <select data-pm-folder>
              <option value="">All Promises</option>
              ${folders.map((fd) => `<option value="${esc(fd.id)}" ${f.folderId === fd.id ? 'selected' : ''}>${esc(fd.name)} (${fmt(fd.promiseCount)})</option>`).join('')}
            </select>
          </label>
          <label class="owner-pm-filter">
            <span>Sort</span>
            <select data-pm-sort>
              ${SORTS.map((s) => `<option value="${s.id}" ${f.sort === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>`;
  }

  function renderPromiseList(state, data, esc) {
    const promises = data?.promises?.items || [];
    const total = data?.promises?.total ?? 0;
    const page = data?.promises?.page ?? 1;
    const totalPages = data?.promises?.totalPages ?? 1;
    const selected = new Set(state.pmSelectedIds || []);
    const allVisibleSelected = promises.length > 0 && promises.every((p) => selected.has(p.id));

    if (!total && !data?.promises) {
      return '<p class="owner-pm-empty">Loading promises…</p>';
    }
    if (!total) {
      const f = data?.filters || {};
      if (f.folderId) return '<p class="owner-pm-empty">This folder doesn\'t contain any promises yet.</p>';
      if (f.q || f.country || f.city || f.dateFrom || f.dateTo) {
        return '<p class="owner-pm-empty">No promises match these filters.</p>';
      }
      return '<p class="owner-pm-empty">No promises have been received yet.</p>';
    }

    return `
      <div class="owner-pm-list-toolbar">
        <p class="owner-pm-results">${esc(resultsLabel(state, data))}</p>
        <div class="owner-pm-list-actions">
          <label class="owner-pm-check-all">
            <input type="checkbox" data-pm-select-all ${allVisibleSelected ? 'checked' : ''}>
            Select visible
          </label>
          ${selected.size ? `<span class="owner-pm-selected-count">${fmt(selected.size)} selected</span>` : ''}
        </div>
      </div>
      <ul class="owner-pm-list">
        ${promises.map((p) => `
          <li class="owner-pm-item ${selected.has(p.id) ? 'is-selected' : ''}" data-pm-promise-id="${esc(p.id)}">
            <label class="owner-pm-item__check" onclick="event.stopPropagation()">
              <input type="checkbox" data-pm-select="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''}>
            </label>
            <div class="owner-pm-item__body">
              <div class="owner-pm-item__meta">
                <strong>Voice #${esc(p.voiceNumber ?? '—')}</strong>
                <span>${esc(p.city || '—')}, ${esc(p.country || '—')} ${flagEmoji(p.countryCode)}</span>
              </div>
              <blockquote class="owner-pm-item__text">"${esc(p.promiseText || '')}"</blockquote>
              <div class="owner-pm-item__foot">
                <time>${esc(fmtDateTime(p.submittedAt))}</time>
                ${p.eventTitle ? `<span class="owner-pm-item__event">${esc(p.eventTitle)}</span>` : ''}
              </div>
            </div>
          </li>
        `).join('')}
      </ul>
      ${totalPages > 1 ? `
        <div class="owner-pm-pagination">
          <button type="button" class="owner-pm-btn-ghost" data-pm-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button>
          <span>Page ${page} of ${totalPages}</span>
          <button type="button" class="owner-pm-btn-ghost" data-pm-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
        </div>` : ''}
    `;
  }

  function renderFolders(state, data, esc) {
    const folders = data?.folders || [];
    return `
      <div class="owner-pm-panel">
        <div class="owner-pm-panel__head">
          <h3>Folders</h3>
          <button type="button" class="owner-pm-btn-ghost" data-pm-create-folder>Create Folder</button>
        </div>
        ${folders.length ? `
          <table class="owner-pm-table">
            <thead><tr><th>Folder Name</th><th>Promises</th><th>Created</th><th></th></tr></thead>
            <tbody>
              ${folders.map((f) => `
                <tr class="${data?.filters?.folderId === f.id ? 'is-active' : ''}">
                  <td><button type="button" class="owner-pm-link" data-pm-open-folder="${esc(f.id)}">${esc(f.name)}</button></td>
                  <td>${fmt(f.promiseCount)}</td>
                  <td>${esc(fmtDateTime(f.createdAt).split(' · ')[0])}</td>
                  <td class="owner-pm-table__actions">
                    <button type="button" class="owner-pm-btn-ghost" data-pm-rename-folder="${esc(f.id)}" title="Rename">Rename</button>
                    <button type="button" class="owner-pm-btn-ghost owner-pm-btn-ghost--danger" data-pm-delete-folder="${esc(f.id)}" title="Delete folder">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>` : '<p class="owner-pm-empty">No folders yet. Create one to organize promises.</p>'}
      </div>`;
  }

  function renderCountryOverview(data, esc) {
    const rows = data?.countryOverview || [];
    if (!rows.length) return '<p class="owner-pm-empty">No country data yet.</p>';
    const max = Math.max(1, ...rows.map((r) => r.count));
    return `
      <ul class="owner-pm-geo-list">
        ${rows.map((r) => `
          <li>
            <button type="button" class="owner-pm-geo-row" data-pm-filter-country="${esc(r.country)}">
              <span class="owner-pm-geo-row__name">${esc(r.country)} ${flagEmoji(r.countryCode)}</span>
              <span class="owner-pm-geo-row__bar"><span style="width:${((r.count / max) * 100).toFixed(1)}%"></span></span>
              <span class="owner-pm-geo-row__stat">${fmt(r.count)} · ${Number(r.pctOfTotal).toFixed(1)}% · ${fmt(r.uniqueCities)} cities</span>
            </button>
          </li>
        `).join('')}
      </ul>`;
  }

  function renderCityOverview(state, data, esc) {
    const rows = data?.cityOverview?.items || [];
    const totalPages = data?.cityOverview?.totalPages ?? 1;
    const page = data?.cityOverview?.page ?? 1;
    if (!rows.length) return '<p class="owner-pm-empty">No city data yet.</p>';
    return `
      <input type="search" class="owner-pm-search owner-pm-search--sm" data-pm-city-search placeholder="Search cities…" value="${esc(state.pmCityQuery || '')}">
      <ul class="owner-pm-geo-list owner-pm-geo-list--compact">
        ${rows.map((r) => `
          <li>
            <button type="button" class="owner-pm-geo-row" data-pm-filter-city="${esc(r.city)}" data-pm-filter-city-country="${esc(r.country)}">
              <span class="owner-pm-geo-row__name">${esc(r.city)}, ${esc(r.country)}</span>
              <span class="owner-pm-geo-row__stat">${fmt(r.count)}</span>
            </button>
          </li>
        `).join('')}
      </ul>
      ${totalPages > 1 ? `
        <div class="owner-pm-pagination owner-pm-pagination--sm">
          <button type="button" class="owner-pm-btn-ghost" data-pm-city-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>←</button>
          <span>${page}/${totalPages}</span>
          <button type="button" class="owner-pm-btn-ghost" data-pm-city-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>→</button>
        </div>` : ''}
    `;
  }

  function renderBulkBar(state, data) {
    const n = (state.pmSelectedIds || []).length;
    if (!n) return '';
    const inFolder = data?.filters?.folderId;
    return `
      <div class="owner-pm-bulk">
        <span>${fmt(n)} selected</span>
        <button type="button" class="owner-pm-btn-ghost" data-pm-bulk-folder>Add to Folder</button>
        ${inFolder ? '<button type="button" class="owner-pm-btn-ghost" data-pm-bulk-remove-folder>Remove from Folder</button>' : ''}
        <button type="button" class="owner-pm-btn-ghost" data-pm-export-selected>Export</button>
        <button type="button" class="owner-pm-btn-ghost" data-pm-doc-selected>Create Document</button>
        <button type="button" class="owner-pm-btn-ghost" data-pm-clear-selection>Clear</button>
      </div>`;
  }

  function renderExportPanel(data, esc) {
    return `
      <div class="owner-pm-panel">
        <h3>Export / Create Document</h3>
        <p class="owner-pm-muted">Large exports are split into multiple parts automatically.</p>
        <div class="owner-pm-export-grid">
          <div class="owner-pm-export-group">
            <h4>Current view</h4>
            <button type="button" class="owner-pm-btn-ghost" data-pm-export="filtered" data-pm-format="csv">Export CSV</button>
            <button type="button" class="owner-pm-btn-ghost" data-pm-export="filtered" data-pm-format="json">Export JSON</button>
            <button type="button" class="owner-pm-btn-ghost" data-pm-export="filtered" data-pm-format="document">Create Document</button>
          </div>
          <div class="owner-pm-export-group">
            <h4>All promises</h4>
            <button type="button" class="owner-pm-btn-ghost" data-pm-export="all" data-pm-format="csv">Export CSV</button>
            <button type="button" class="owner-pm-btn-ghost" data-pm-export="all" data-pm-format="json">Export JSON</button>
            <button type="button" class="owner-pm-btn-ghost" data-pm-export="all" data-pm-format="document">Create Document</button>
          </div>
          ${data?.filters?.folderId ? `
            <div class="owner-pm-export-group">
              <h4>Current folder</h4>
              <button type="button" class="owner-pm-btn-ghost" data-pm-export="folder" data-pm-format="csv">Export CSV</button>
              <button type="button" class="owner-pm-btn-ghost" data-pm-export="folder" data-pm-format="document">Create Document</button>
            </div>` : ''}
        </div>
      </div>`;
  }

  function renderDetailModal(state, esc) {
    const d = state.pmDetail;
    if (!d) return '';
    return `
      <div class="owner-pm-modal" data-pm-modal>
        <div class="owner-pm-modal__backdrop" data-pm-close-detail></div>
        <div class="owner-pm-modal__card" role="dialog" aria-labelledby="pm-detail-title">
          <button type="button" class="owner-pm-modal__close" data-pm-close-detail aria-label="Close">×</button>
          <h3 id="pm-detail-title">Voice #${esc(d.voiceNumber ?? '—')}</h3>
          <p class="owner-pm-detail__loc">${esc(d.city || '—')}, ${esc(d.country || '—')} ${d.flag || flagEmoji(d.countryCode)}</p>
          <blockquote class="owner-pm-detail__text">"${esc(d.promiseText || '')}"</blockquote>
          <dl class="owner-pm-detail__meta">
            <div><dt>Submitted</dt><dd>${esc(fmtDateTime(d.submittedAt))}</dd></div>
            <div><dt>Event</dt><dd>${esc(d.eventTitle || d.eventId || '—')}</dd></div>
            <div><dt>Folders</dt><dd>${d.folders?.length ? d.folders.map((f) => esc(f.name)).join(', ') : '—'}</dd></div>
          </dl>
          <div class="owner-pm-modal__actions">
            <button type="button" class="owner-pm-btn-ghost" data-pm-detail-add-folder>Add to Folder</button>
          </div>
        </div>
      </div>`;
  }

  function renderFolderModal(state, data, esc) {
    const m = state.pmFolderModal;
    if (!m) return '';
    const folders = data?.folders || [];
    const title = m.mode === 'create' ? 'Create Folder'
      : m.mode === 'rename' ? 'Rename Folder'
      : 'Add to Folder';
    return `
      <div class="owner-pm-modal" data-pm-folder-modal>
        <div class="owner-pm-modal__backdrop" data-pm-close-folder-modal></div>
        <div class="owner-pm-modal__card owner-pm-modal__card--sm" role="dialog">
          <button type="button" class="owner-pm-modal__close" data-pm-close-folder-modal aria-label="Close">×</button>
          <h3>${title}</h3>
          ${m.mode === 'add' ? `
            <label class="owner-pm-filter">
              <span>Choose folder</span>
              <select data-pm-folder-pick>
                <option value="">Select…</option>
                ${folders.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}
              </select>
            </label>
            <button type="button" class="owner-pm-btn-ghost" data-pm-folder-new-inline>Create New Folder</button>
          ` : ''}
          ${m.mode !== 'add' || m.showNameInput ? `
            <label class="owner-pm-filter">
              <span>Folder name</span>
              <input type="text" data-pm-folder-name value="${esc(m.name || '')}" placeholder="Folder name">
            </label>
          ` : ''}
          <div class="owner-pm-modal__actions">
            <button type="button" class="owner-pm-btn-ghost" data-pm-close-folder-modal>Cancel</button>
            <button type="button" class="owner-pm-btn" data-pm-folder-submit>${m.mode === 'add' && !m.showNameInput ? 'Add' : 'Save'}</button>
          </div>
        </div>
      </div>`;
  }

  function render(state, helpers) {
    const { esc } = helpers;
    const data = state.pmData;
    if (!data && state.pmBusy) {
      return `<section class="owner-section owner-pm"><p class="owner-muted">Loading Promise Memory…</p></section>`;
    }

    return `
      <section class="owner-section owner-pm">
        <header class="owner-pm-header">
          <div>
            <p class="owner-pm-eyebrow">Owner Mode Only</p>
            <h2 class="owner-pm-title">Post Event Promise Memory</h2>
            <p class="owner-pm-sub">Permanent archive of every Promise to the World submitted after World Choir events.</p>
          </div>
          <div class="owner-pm-header__actions">
            ${data?.live ? '<span class="owner-pm-live"><span class="owner-pm-live__badge">LIVE</span> Submissions open</span>' : ''}
            <button type="button" class="owner-pm-btn-ghost" data-pm-refresh ${state.pmBusy ? 'disabled' : ''}>Refresh</button>
          </div>
        </header>

        ${renderOverview(data, esc)}
        ${renderFilters(state, data, esc)}
        ${renderBulkBar(state, data)}

        <div class="owner-pm-main">
          <div class="owner-pm-promises-col">
            <h3 class="owner-pm-section-title">Promises</h3>
            ${renderPromiseList(state, data, esc)}
          </div>
        </div>

        <div class="owner-pm-secondary">
          ${renderFolders(state, data, esc)}
          <div class="owner-pm-panel-row">
            <div class="owner-pm-panel">
              <h3>Promises by Country</h3>
              ${renderCountryOverview(data, esc)}
            </div>
            <div class="owner-pm-panel">
              <h3>Promises by City</h3>
              ${renderCityOverview(state, data, esc)}
            </div>
            <div class="owner-pm-panel">
              <h3>Promises Over Time</h3>
              ${renderLineChart(data?.charts?.promisesOverTime)}
            </div>
          </div>
          ${renderExportPanel(data, esc)}
        </div>

        <footer class="owner-pm-footer">
          <p>All times in UTC · Original promise text is preserved exactly as submitted · Folders are Owner organization only.</p>
        </footer>

        ${renderDetailModal(state, esc)}
        ${renderFolderModal(state, data, esc)}
      </section>`;
  }

  function buildQuery(state) {
    const q = new URLSearchParams();
    if (state.pmEvent && state.pmEvent !== 'all') q.set('eventId', state.pmEvent);
    if (state.pmCountry) q.set('country', state.pmCountry);
    if (state.pmCity) q.set('city', state.pmCity);
    if (state.pmDateFrom) q.set('dateFrom', state.pmDateFrom);
    if (state.pmDateTo) q.set('dateTo', state.pmDateTo);
    if (state.pmQuery) q.set('q', state.pmQuery);
    if (state.pmSort) q.set('sort', state.pmSort);
    if (state.pmFolder) q.set('folderId', state.pmFolder);
    q.set('page', String(state.pmPage || 1));
    q.set('pageSize', '50');
    if (state.pmCityQuery) q.set('cityQuery', state.pmCityQuery);
    if (state.pmCityPage) q.set('cityPage', String(state.pmCityPage));
    return q.toString();
  }

  function buildExportUrl(state, { scope, format, part = 1 }) {
    const q = new URLSearchParams();
    q.set('scope', scope);
    q.set('format', format);
    q.set('part', String(part));
    if (scope === 'selected' && state.pmSelectedIds?.length) {
      q.set('ids', state.pmSelectedIds.join(','));
    }
    if (state.pmEvent && state.pmEvent !== 'all') q.set('eventId', state.pmEvent);
    if (state.pmCountry) q.set('country', state.pmCountry);
    if (state.pmCity) q.set('city', state.pmCity);
    if (state.pmDateFrom) q.set('dateFrom', state.pmDateFrom);
    if (state.pmDateTo) q.set('dateTo', state.pmDateTo);
    if (state.pmQuery) q.set('q', state.pmQuery);
    if (state.pmSort) q.set('sort', state.pmSort);
    if (state.pmFolder) q.set('folderId', state.pmFolder);
    return `/api/admin?action=promise-memory-export&${q.toString()}`;
  }

  function bind(root, state, helpers, ctx) {
    const { esc } = helpers;
    const { api, onRender, loadData } = ctx;

    stopPolling();
    if (state.pmData?.live) {
      pollTimer = setInterval(() => loadData(true), 30000);
    }

    root.querySelector('[data-pm-refresh]')?.addEventListener('click', () => loadData(false));

    const searchInput = root.querySelector('[data-pm-search]');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          state.pmQuery = searchInput.value;
          state.pmPage = 1;
          loadData(false);
        }, 350);
      });
    }

    const applyFilters = () => {
      state.pmEvent = root.querySelector('[data-pm-event]')?.value || 'all';
      state.pmCountry = root.querySelector('[data-pm-country]')?.value || '';
      state.pmCity = root.querySelector('[data-pm-city]')?.value || '';
      state.pmDateFrom = root.querySelector('[data-pm-date-from]')?.value || '';
      state.pmDateTo = root.querySelector('[data-pm-date-to]')?.value || '';
      state.pmFolder = root.querySelector('[data-pm-folder]')?.value || '';
      state.pmSort = root.querySelector('[data-pm-sort]')?.value || 'newest';
      state.pmPage = 1;
      loadData(false);
    };

    root.querySelector('[data-pm-country]')?.addEventListener('change', () => {
      state.pmCity = '';
      applyFilters();
    });
    ['[data-pm-event]', '[data-pm-city]', '[data-pm-date-from]', '[data-pm-date-to]', '[data-pm-folder]', '[data-pm-sort]'].forEach((sel) => {
      root.querySelector(sel)?.addEventListener('change', applyFilters);
    });

    root.querySelector('[data-pm-city-search]')?.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.pmCityQuery = e.target.value;
        state.pmCityPage = 1;
        loadData(true);
      }, 350);
    });

    root.querySelectorAll('[data-pm-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = Number(btn.getAttribute('data-pm-page'));
        if (p >= 1) {
          state.pmPage = p;
          loadData(false);
        }
      });
    });

    root.querySelectorAll('[data-pm-city-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = Number(btn.getAttribute('data-pm-city-page'));
        if (p >= 1) {
          state.pmCityPage = p;
          loadData(true);
        }
      });
    });

    root.querySelectorAll('[data-pm-filter-country]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pmCountry = btn.getAttribute('data-pm-filter-country') || '';
        state.pmCity = '';
        state.pmPage = 1;
        loadData(false);
      });
    });

    root.querySelectorAll('[data-pm-filter-city]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pmCountry = btn.getAttribute('data-pm-filter-city-country') || state.pmCountry;
        state.pmCity = btn.getAttribute('data-pm-filter-city') || '';
        state.pmPage = 1;
        loadData(false);
      });
    });

    root.querySelectorAll('[data-pm-select]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-pm-select');
        const set = new Set(state.pmSelectedIds || []);
        if (cb.checked) set.add(id);
        else set.delete(id);
        state.pmSelectedIds = [...set];
        onRender();
      });
    });

    root.querySelector('[data-pm-select-all]')?.addEventListener('change', (e) => {
      const items = state.pmData?.promises?.items || [];
      const set = new Set(state.pmSelectedIds || []);
      if (e.target.checked) items.forEach((p) => set.add(p.id));
      else items.forEach((p) => set.delete(p.id));
      state.pmSelectedIds = [...set];
      onRender();
    });

    root.querySelector('[data-pm-clear-selection]')?.addEventListener('click', () => {
      state.pmSelectedIds = [];
      onRender();
    });

    root.querySelector('[data-pm-create-folder]')?.addEventListener('click', () => {
      state.pmFolderModal = { mode: 'create', name: '' };
      onRender();
    });

    root.querySelectorAll('[data-pm-rename-folder]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pm-rename-folder');
        const folder = (state.pmData?.folders || []).find((f) => f.id === id);
        state.pmFolderModal = { mode: 'rename', folderId: id, name: folder?.name || '' };
        onRender();
      });
    });

    root.querySelectorAll('[data-pm-delete-folder]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-pm-delete-folder');
        const folder = (state.pmData?.folders || []).find((f) => f.id === id);
        if (!window.confirm(`Delete folder “${folder?.name || 'this folder'}”? Promises will remain in the archive.`)) return;
        try {
          await api('promise-memory-folder', {
            method: 'POST',
            body: { op: 'delete', folderId: id },
          });
          if (state.pmFolder === id) state.pmFolder = '';
          ctx.setFlash?.('Folder deleted. Promises remain in the archive.', 'ok');
          await loadData(false);
        } catch (err) {
          ctx.setFlash?.(err.message || 'Could not delete folder.', 'err');
          onRender();
        }
      });
    });

    root.querySelectorAll('[data-pm-open-folder]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pmFolder = btn.getAttribute('data-pm-open-folder') || '';
        state.pmPage = 1;
        loadData(false);
      });
    });

    async function submitFolderModal() {
      const m = state.pmFolderModal;
      if (!m) return;
      const name = root.querySelector('[data-pm-folder-name]')?.value?.trim();
      const pick = root.querySelector('[data-pm-folder-pick]')?.value;
      try {
        if (m.mode === 'create') {
          if (!name) throw new Error('Folder name is required');
          await api('promise-memory-folder', { method: 'POST', body: { op: 'create', name } });
          ctx.setFlash?.('Folder created.', 'ok');
        } else if (m.mode === 'rename') {
          if (!name) throw new Error('Folder name is required');
          await api('promise-memory-folder', { method: 'POST', body: { op: 'rename', folderId: m.folderId, name } });
          ctx.setFlash?.('Folder renamed.', 'ok');
        } else if (m.mode === 'add') {
          let folderId = m.showNameInput ? null : pick;
          if (m.showNameInput) {
            if (!name) throw new Error('Folder name is required');
            const res = await api('promise-memory-folder', { method: 'POST', body: { op: 'create', name } });
            folderId = res.folder?.id;
          }
          if (!folderId) throw new Error('Choose a folder');
          const ids = m.promiseIds || state.pmSelectedIds || [];
          await api('promise-memory-folder', { method: 'POST', body: { op: 'add', folderId, promiseIds: ids } });
          ctx.setFlash?.(`Added ${ids.length} promise(s) to folder.`, 'ok');
          state.pmSelectedIds = [];
        }
        state.pmFolderModal = null;
        await loadData(false);
      } catch (err) {
        ctx.setFlash?.(err.message || 'Folder action failed.', 'err');
        onRender();
      }
    }

    root.querySelector('[data-pm-folder-submit]')?.addEventListener('click', submitFolderModal);
    root.querySelector('[data-pm-folder-new-inline]')?.addEventListener('click', () => {
      state.pmFolderModal = { ...state.pmFolderModal, showNameInput: true };
      onRender();
    });
    root.querySelectorAll('[data-pm-close-folder-modal]').forEach((el) => {
      el.addEventListener('click', () => {
        state.pmFolderModal = null;
        onRender();
      });
    });

    function openAddToFolder(promiseIds) {
      state.pmFolderModal = { mode: 'add', promiseIds };
      onRender();
    }

    root.querySelector('[data-pm-bulk-folder]')?.addEventListener('click', () => openAddToFolder(state.pmSelectedIds));

    root.querySelector('[data-pm-bulk-remove-folder]')?.addEventListener('click', async () => {
      const folderId = state.pmFolder;
      const ids = state.pmSelectedIds || [];
      if (!folderId || !ids.length) return;
      try {
        await api('promise-memory-folder', { method: 'POST', body: { op: 'remove', folderId, promiseIds: ids } });
        ctx.setFlash?.('Removed from folder. Promises remain in the archive.', 'ok');
        state.pmSelectedIds = [];
        await loadData(false);
      } catch (err) {
        ctx.setFlash?.(err.message || 'Could not remove from folder.', 'err');
        onRender();
      }
    });
    root.querySelector('[data-pm-detail-add-folder]')?.addEventListener('click', () => {
      if (state.pmDetail?.id) openAddToFolder([state.pmDetail.id]);
    });

    root.querySelectorAll('[data-pm-promise-id]').forEach((row) => {
      row.addEventListener('click', async (e) => {
        if (e.target.closest('input, label, button')) return;
        const id = row.getAttribute('data-pm-promise-id');
        try {
          state.pmDetail = await api('promise-memory-detail', { query: `&id=${encodeURIComponent(id)}` });
          onRender();
        } catch (err) {
          ctx.setFlash?.(err.message || 'Could not load promise.', 'err');
        }
      });
    });

    root.querySelectorAll('[data-pm-close-detail]').forEach((el) => {
      el.addEventListener('click', () => {
        state.pmDetail = null;
        onRender();
      });
    });

    async function triggerExport(scope, format) {
      const url = buildExportUrl(state, { scope, format, part: 1 });
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Export failed');
        const totalParts = Number(res.headers.get('X-Export-Total-Parts') || 1);
        const blob = await res.blob();
        const disp = res.headers.get('Content-Disposition') || '';
        const match = disp.match(/filename="([^"]+)"/);
        const filename = match ? match[1] : `promises-export.${format === 'json' ? 'json' : format === 'document' ? 'txt' : 'csv'}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        if (totalParts > 1) {
          ctx.setFlash?.(`Part 1 of ${totalParts} downloaded. Use Export again with part=2… or download remaining parts from the API.`, 'ok');
          onRender();
        }
      } catch (err) {
        ctx.setFlash?.(err.message || 'Export failed.', 'err');
        onRender();
      }
    }

    root.querySelectorAll('[data-pm-export]').forEach((btn) => {
      btn.addEventListener('click', () => {
        triggerExport(btn.getAttribute('data-pm-export'), btn.getAttribute('data-pm-format'));
      });
    });
    root.querySelector('[data-pm-export-selected]')?.addEventListener('click', () => {
      if (!state.pmSelectedIds?.length) return;
      triggerExport('selected', 'csv');
    });
    root.querySelector('[data-pm-doc-selected]')?.addEventListener('click', () => {
      if (!state.pmSelectedIds?.length) return;
      triggerExport('selected', 'document');
    });
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  return { render, bind, stopPolling, buildQuery };
})();
