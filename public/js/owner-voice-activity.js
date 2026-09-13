/**
 * Owner — Voice Activity page (dense Voice matrix + live presence).
 * Data: /api/admin?action=voice-activity*|voice-activity-detail (real only).
 */
const OwnerVoiceActivity = (() => {
  const POLL_MS = 4000;
  let pollTimer = null;
  let requestSeq = 0;

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function num(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  }

  function pct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0%';
    return `${n.toFixed(1)}%`;
  }

  function ownerTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  function localDateKey(d = new Date()) {
    const tz = ownerTimeZone();
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find((p) => p.type === 'year')?.value;
      const m = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;
      if (y && m && day) return `${y}-${m}-${day}`;
    } catch { /* fall through */ }
    return d.toISOString().slice(0, 10);
  }

  function formatDisplayDate(dateKey) {
    const m = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dateKey || '—';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    } catch {
      return dateKey;
    }
  }

  function formatSyncedAt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZone: 'UTC',
      }).format(d) + ' UTC';
    } catch {
      return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    }
  }

  function statusLabel(s) {
    if (s === 'live') return 'Live Now';
    if (s === 'active') return 'Active';
    return 'Not Active';
  }

  function ensureState(state) {
    if (!state.va) {
      state.va = {
        date: localDateKey(),
        offset: 0,
        limit: 2000,
        country: '',
        city: '',
        activity: 'all',
        search: '',
        jump: '',
        data: null,
        detail: null,
        selectedVoice: null,
        busy: false,
        error: null,
        syncState: 'idle',
        highlightVoice: null,
      };
    }
    return state.va;
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling(ctx) {
    stopPolling();
    pollTimer = setInterval(() => {
      const va = ctx.state.va;
      if (!va || ctx.state.communityView !== 'voice-activity') {
        stopPolling();
        return;
      }
      if (document.hidden || va.busy) return;
      if (va.date !== localDateKey()) return; // only live-poll today
      load(ctx, { quiet: true });
    }, POLL_MS);
  }

  async function load(ctx, { quiet = false } = {}) {
    const { state, api, render } = ctx;
    const va = ensureState(state);
    const seq = ++requestSeq;
    if (!quiet) {
      va.busy = true;
      va.error = null;
      va.syncState = 'loading';
      render();
    } else {
      va.syncState = 'syncing';
    }
    try {
      const params = new URLSearchParams({
        timeZone: ownerTimeZone(),
        date: va.date,
        offset: String(va.offset),
        limit: String(va.limit),
        activity: va.activity || 'all',
      });
      if (va.country) params.set('country', va.country);
      if (va.city) params.set('city', va.city);
      if (va.search) params.set('search', va.search);

      const data = await api('voice-activity', { query: `&${params.toString()}` });
      if (seq !== requestSeq) return;
      va.data = data;
      va.syncState = 'live';
      va.busy = false;
      va.error = null;

      if (va.selectedVoice) {
        refreshDetail(ctx, va.selectedVoice, { quiet: true }).catch(() => {});
      }
      if (!quiet) render();
      else render();
      if (data.isToday) startPolling(ctx);
      else stopPolling();
    } catch (err) {
      if (seq !== requestSeq) return;
      va.busy = false;
      va.syncState = 'error';
      va.error = err.message || 'Could not load Voice Activity';
      render();
    }
  }

  async function refreshDetail(ctx, voiceNumber, { quiet = false } = {}) {
    const { state, api, render } = ctx;
    const va = ensureState(state);
    try {
      const params = new URLSearchParams({
        timeZone: ownerTimeZone(),
        date: va.date,
        voiceNumber: String(voiceNumber),
      });
      const detail = await api('voice-activity-detail', { query: `&${params.toString()}` });
      va.detail = detail;
      va.selectedVoice = Number(voiceNumber);
      if (!quiet) render();
      else render();
    } catch (err) {
      if (!quiet) {
        va.detail = null;
        render();
      }
    }
  }

  function kpiCard(label, value, sub) {
    return `
      <div class="owner-va-kpi">
        <p class="owner-va-kpi__label">${esc(label)}</p>
        <p class="owner-va-kpi__value">${esc(value)}</p>
        ${sub ? `<p class="owner-va-kpi__sub">${esc(sub)}</p>` : ''}
      </div>
    `;
  }

  function renderMatrix(va) {
    const data = va.data;
    if (!data) {
      return `<div class="owner-va-matrix owner-va-matrix--empty"><p class="owner-muted">Loading Voices…</p></div>`;
    }
    const cells = data.grid?.cells || [];
    if (!cells.length) {
      return `<div class="owner-va-matrix owner-va-matrix--empty"><p class="owner-muted">No Voices match these filters.</p></div>`;
    }

    const cols = Math.max(50, Math.min(100, Number(data.grid.columnsHint) || 100));
    const rows = [];
    for (let i = 0; i < cells.length; i += cols) {
      rows.push(cells.slice(i, i + cols));
    }

    return `
      <div class="owner-va-matrix" style="--va-cols:${cols}">
        ${rows.map((row, rowIdx) => {
          const startVn = row[0]?.v || 1;
          return `
            <div class="owner-va-matrix__row">
              <div class="owner-va-matrix__label" aria-hidden="true">${esc(startVn)}</div>
              <div class="owner-va-matrix__cells">
                ${row.map((cell) => {
                  const selected = va.selectedVoice === cell.v ? ' is-selected' : '';
                  const highlight = va.highlightVoice === cell.v ? ' is-highlight' : '';
                  return `
                    <button
                      type="button"
                      class="owner-va-cell is-${esc(cell.s)}${selected}${highlight}"
                      data-va-voice="${esc(cell.v)}"
                      aria-label="Voice ${esc(cell.v)}, ${esc(statusLabel(cell.s))}"
                      title="Voice #${esc(cell.v)} · ${esc(statusLabel(cell.s))}"
                    ><span class="owner-va-dot" aria-hidden="true"></span></button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderDetail(va) {
    const d = va.detail;
    if (!d) {
      return `
        <div class="owner-va-panel">
          <div class="owner-va-panel__head">
            <p class="owner-section__label">Voice Details</p>
          </div>
          <p class="owner-muted">Select a Voice in the matrix to inspect activity.</p>
        </div>
      `;
    }
    const statusClass = d.status === 'live' ? 'is-live' : d.status === 'active' ? 'is-active' : 'is-inactive';
    return `
      <div class="owner-va-panel">
        <div class="owner-va-panel__head">
          <p class="owner-section__label">Voice Details</p>
          <button type="button" class="owner-icon-btn owner-va-close" data-va-close-detail aria-label="Close">×</button>
        </div>
        <h3 class="owner-va-voice-title">Voice #${esc(d.voiceNumber)}</h3>
        <p class="owner-va-status ${statusClass}"><span class="owner-va-status__dot"></span> ${esc(d.statusLabel)}</p>
        <dl class="owner-va-dl">
          <div><dt>Country</dt><dd>${esc(d.country || '—')}</dd></div>
          <div><dt>City</dt><dd>${esc(d.city || '—')}</dd></div>
        </dl>
        <hr class="owner-va-rule">
        <dl class="owner-va-dl">
          <div><dt>Joined</dt><dd>${esc(d.joinedLabel || '—')}</dd></div>
          <div><dt>Last Active</dt><dd>${esc(d.lastActiveLabel || '—')}</dd></div>
          <div><dt>${d.isToday ? 'Activity Today' : 'Activity on date'}</dt><dd>${esc(d.activityOnDateLabel || 'No activity')}</dd></div>
        </dl>
      </div>
    `;
  }

  function renderSummary(va) {
    const s = va.data?.summary;
    const k = va.data?.kpis;
    if (!s || !k) {
      return `
        <div class="owner-va-panel">
          <p class="owner-section__label">Activity Summary</p>
          <p class="owner-muted">Waiting for data…</p>
        </div>
      `;
    }
    return `
      <div class="owner-va-panel">
        <p class="owner-section__label">Activity Summary</p>
        <dl class="owner-va-summary">
          <div><dt>Total Eligible Voices</dt><dd>${esc(num(s.totalEligible))}</dd></div>
          <div>
            <dt>Active</dt>
            <dd>${esc(num(s.active))}<span class="owner-va-summary__pct">${esc(pct(s.activePct))}</span></dd>
          </div>
          <div>
            <dt>Live Now${k.liveNowIsCurrent ? ' (current)' : ''}</dt>
            <dd>${esc(num(s.liveNow))}<span class="owner-va-summary__pct">${esc(pct(s.liveNowPct))}</span></dd>
          </div>
          <div>
            <dt>Not Active</dt>
            <dd>${esc(num(s.inactive))}<span class="owner-va-summary__pct">${esc(pct(s.inactivePct))}</span></dd>
          </div>
        </dl>
      </div>
    `;
  }

  function render(ctx) {
    const { state } = ctx;
    const va = ensureState(state);
    const data = va.data;
    const k = data?.kpis;
    const isToday = va.date === localDateKey();
    const syncText = va.syncState === 'error'
      ? 'Connection issue — retrying…'
      : va.syncState === 'loading'
        ? 'Synchronizing…'
        : va.syncState === 'syncing'
          ? 'Updating…'
          : 'Live synchronization active';
    const syncClass = va.syncState === 'error' ? 'is-warn' : va.syncState === 'live' ? '' : 'is-pending';

    const countries = data?.filters?.countries || [];
    const cities = data?.filters?.cities || [];
    const activityOptions = isToday
      ? [
        ['all', 'All Activity'],
        ['live', 'Live Now'],
        ['active', 'Active'],
        ['inactive', 'Not Active'],
      ]
      : [
        ['all', 'All Activity'],
        ['active', 'Active'],
        ['inactive', 'Not Active'],
      ];

    const activeLabel = isToday ? 'Active Today' : `Active ${formatDisplayDate(va.date)}`;

    return `
      <section class="owner-section owner-va">
        <button type="button" class="owner-va-back" data-va-back>← Back</button>
        <div class="owner-va-hero">
          <div>
            <p class="owner-kicker">World Choir</p>
            <h2 class="owner-h1">Voice Activity</h2>
            <p class="owner-sub">Live activity across every pledged Voice.</p>
            <p class="owner-va-sync ${syncClass}"><span class="owner-status__dot ${va.syncState === 'error' ? 'is-warn' : ''}"></span> ${esc(syncText)}</p>
          </div>
          <div class="owner-va-hero__meta">
            <p class="owner-muted">Last updated: ${esc(formatSyncedAt(data?.syncedAt))}</p>
            <p class="owner-va-live-pill"><span class="owner-status__dot"></span> Live</p>
          </div>
        </div>

        ${va.error ? `<div class="owner-flash is-err">${esc(va.error)}</div>` : ''}

        <div class="owner-va-kpi-row">
          ${kpiCard('Total Voices', k ? num(k.totalVoices) : '—')}
          ${kpiCard(activeLabel, k ? num(k.active) : '—')}
          ${kpiCard('Live Now', k ? num(k.liveNow) : '—', k?.liveNowIsCurrent ? 'Current realtime' : null)}
          ${kpiCard('Activity Rate', k ? pct(k.activityRate) : '—')}
        </div>

        <div class="owner-va-filters">
          <input class="owner-input" type="search" placeholder="Search Voice #…" value="${esc(va.search)}" data-va-search>
          <select class="owner-input" data-va-country>
            <option value="">All Countries</option>
            ${countries.map((c) => `<option value="${esc(c)}" ${va.country === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          <select class="owner-input" data-va-city>
            <option value="">All Cities</option>
            ${cities.map((c) => `<option value="${esc(c)}" ${va.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          <select class="owner-input" data-va-activity>
            ${activityOptions.map(([id, label]) => `
              <option value="${esc(id)}" ${va.activity === id ? 'selected' : ''}>${esc(label)}</option>
            `).join('')}
          </select>
          <div class="owner-va-date">
            <input class="owner-input" type="date" data-va-date value="${esc(va.date)}" max="${esc(localDateKey())}" aria-label="Activity date">
            <button type="button" class="owner-btn-ghost" data-va-today ${isToday ? 'disabled' : ''}>Today</button>
          </div>
          <div class="owner-va-jump">
            <input class="owner-input" type="text" inputmode="numeric" placeholder="Jump to Voice #…" value="${esc(va.jump)}" data-va-jump>
            <button type="button" class="owner-btn-ghost" data-va-jump-go aria-label="Jump to Voice">→</button>
          </div>
        </div>
        <p class="owner-va-date-label">Selected date: <strong>${esc(formatDisplayDate(va.date))}</strong>${isToday ? ' (Today)' : ''}</p>

        <div class="owner-va-layout">
          <div class="owner-va-main">
            <div class="owner-va-legend">
              <span><i class="owner-va-legend__swatch is-live"></i> Live Now</span>
              <span><i class="owner-va-legend__swatch is-active"></i> Active</span>
              <span><i class="owner-va-legend__swatch is-inactive"></i> Not Active</span>
              <span class="owner-va-legend__count">Showing ${esc(num(data?.grid?.total || 0))} Voices</span>
            </div>
            ${va.busy && !data ? '<p class="owner-muted">Loading matrix…</p>' : renderMatrix(va)}
            <div class="owner-va-pager">
              <p class="owner-muted">Showing Voices #${esc(num(data?.grid?.showingFrom || 0))} – #${esc(num(data?.grid?.showingTo || 0))}</p>
              <div class="owner-va-pager__controls">
                <button type="button" class="owner-btn-ghost" data-va-page="-1" ${!data || data.grid.offset <= 0 ? 'disabled' : ''}>‹</button>
                <button type="button" class="owner-btn-ghost" data-va-page="1" ${!data || data.grid.showingTo >= data.grid.total ? 'disabled' : ''}>›</button>
                <label class="owner-va-pager__size">
                  Voices per page
                  <select class="owner-input" data-va-limit>
                    ${[500, 1000, 2000, 5000].map((n) => `
                      <option value="${n}" ${va.limit === n ? 'selected' : ''}>${n.toLocaleString('en-US')}</option>
                    `).join('')}
                  </select>
                </label>
              </div>
            </div>
          </div>
          <aside class="owner-va-aside">
            ${renderDetail(va)}
            ${renderSummary(va)}
          </aside>
        </div>
      </section>
    `;
  }

  function bind(ctx) {
    const { state, render } = ctx;
    const va = ensureState(state);
    const root = document.getElementById('owner-root');
    if (!root) return;

    root.querySelector('[data-va-back]')?.addEventListener('click', () => {
      stopPolling();
      if (window.history.length > 1) {
        const before = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.history.back();
        setTimeout(() => {
          const after = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (after === before) {
            state.communityView = 'main';
            state.section = 'community';
            render();
          }
        }, 80);
        return;
      }
      state.communityView = 'main';
      state.section = 'community';
      render();
    });

    const applyFilters = (patch) => {
      Object.assign(va, patch);
      va.offset = 0;
      load(ctx);
    };

    root.querySelector('[data-va-search]')?.addEventListener('change', (e) => {
      applyFilters({ search: String(e.target.value || '').trim() });
    });
    root.querySelector('[data-va-country]')?.addEventListener('change', (e) => {
      applyFilters({ country: e.target.value || '', city: '' });
    });
    root.querySelector('[data-va-city]')?.addEventListener('change', (e) => {
      applyFilters({ city: e.target.value || '' });
    });
    root.querySelector('[data-va-activity]')?.addEventListener('change', (e) => {
      applyFilters({ activity: e.target.value || 'all' });
    });
    root.querySelector('[data-va-date]')?.addEventListener('change', (e) => {
      const next = String(e.target.value || '');
      const max = localDateKey();
      if (!next || next > max) return;
      // Historical dates can't use live filter
      const activity = next !== max && va.activity === 'live' ? 'all' : va.activity;
      applyFilters({ date: next, activity });
    });
    root.querySelector('[data-va-today]')?.addEventListener('click', () => {
      applyFilters({ date: localDateKey() });
    });
    root.querySelector('[data-va-limit]')?.addEventListener('change', (e) => {
      applyFilters({ limit: Number(e.target.value) || 2000 });
    });
    root.querySelectorAll('[data-va-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.getAttribute('data-va-page')) || 0;
        const next = Math.max(0, va.offset + dir * va.limit);
        va.offset = next;
        load(ctx);
      });
    });

    const jumpGo = () => {
      const raw = String(root.querySelector('[data-va-jump]')?.value || va.jump || '').replace(/[^\d]/g, '');
      va.jump = raw;
      if (!raw) return;
      const target = Number(raw);
      if (!Number.isFinite(target) || target < 1) return;

      // Clear filters if needed so the voice is findable
      const clearAndFind = async () => {
        va.search = String(target);
        va.country = '';
        va.city = '';
        va.activity = 'all';
        va.offset = 0;
        await load(ctx);
        const cells = va.data?.grid?.cells || [];
        const hit = cells.find((c) => c.v === target);
        if (!hit) {
          state.flash = { type: 'err', message: `Voice #${target} is not in the eligible set for this date.` };
          render();
          return;
        }
        va.highlightVoice = target;
        va.selectedVoice = target;
        await refreshDetail(ctx, target);
        requestAnimationFrame(() => {
          root.querySelector(`[data-va-voice="${target}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
        setTimeout(() => {
          va.highlightVoice = null;
          render();
        }, 2500);
      };
      clearAndFind();
    };
    root.querySelector('[data-va-jump-go]')?.addEventListener('click', jumpGo);
    root.querySelector('[data-va-jump]')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        jumpGo();
      }
    });

    root.querySelectorAll('[data-va-voice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vn = Number(btn.getAttribute('data-va-voice'));
        if (!vn) return;
        va.selectedVoice = vn;
        refreshDetail(ctx, vn);
      });
    });
    root.querySelector('[data-va-close-detail]')?.addEventListener('click', () => {
      va.selectedVoice = null;
      va.detail = null;
      render();
    });
  }

  function open(ctx) {
    const { state, render } = ctx;
    const va = ensureState(state);
    state.section = 'community';
    state.communityView = 'voice-activity';
    if (!va.date) va.date = localDateKey();
    render();
    load(ctx);
  }

  function onRefresh(ctx) {
    if (ctx.state.communityView !== 'voice-activity') return false;
    load(ctx);
    return true;
  }

  return {
    ensureState,
    render,
    bind,
    open,
    load,
    stopPolling,
    onRefresh,
    localDateKey,
    ownerTimeZone,
  };
})();

if (typeof window !== 'undefined') window.OwnerVoiceActivity = OwnerVoiceActivity;
