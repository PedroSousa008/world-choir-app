/**
 * Owner QR Code Analytics — campaigns + acquisition funnel.
 * Data: /api/admin?action=qr-* (real only; empty when no campaigns).
 */
const OwnerQrAnalytics = (() => {
  const RANGES = [
    { id: 'all', label: 'ALL' },
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: '1y', label: '1Y' },
  ];
  const CHART_METRICS = [
    { id: 'scans', label: 'Scans' },
    { id: 'uniqueScans', label: 'Unique Scans' },
    { id: 'appOpens', label: 'App Opens' },
    { id: 'illSing', label: "I'll Sing Clicks" },
    { id: 'voices', label: 'Voices Created' },
    { id: 'shares', label: 'Shares' },
  ];
  const TYPES = ['Flyer', 'Poster', 'Event', 'Partner', 'Other'];

  function pctLabel(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    return `${Number(v).toFixed(1)}%`;
  }

  function moneyEur(v, currency = 'EUR') {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    try {
      return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(v));
    } catch {
      return `€${Number(v).toFixed(2)}`;
    }
  }

  function kpiCard(icon, label, value, sub, esc, num) {
    return `
      <article class="owner-qr-kpi">
        <div class="owner-qr-kpi__icon" aria-hidden="true">${icon}</div>
        <p class="owner-qr-kpi__label">${esc(label)}</p>
        <p class="owner-qr-kpi__value">${esc(typeof value === 'number' ? num(value) : (value ?? '—'))}</p>
        <p class="owner-qr-kpi__sub">${esc(sub || '')}</p>
      </article>`;
  }

  function icons() {
    return {
      qr: '▦',
      phone: '▣',
      click: '➤',
      people: '◉',
      retain: '◎',
      cal: '▤',
      share: '⎘',
    };
  }

  function funnelHtml(funnel, esc, num) {
    const rows = Array.isArray(funnel) ? funnel : [];
    const max = Math.max(1, ...rows.map((r) => Number(r.count) || 0));
    return `
      <section class="owner-qr-panel">
        <header class="owner-qr-panel__head"><h3>Conversion Funnel</h3></header>
        <div class="owner-qr-funnel">
          ${rows.map((r) => {
            const w = Math.max(4, Math.round(((Number(r.count) || 0) / max) * 100));
            return `
              <div class="owner-qr-funnel__row">
                <div class="owner-qr-funnel__meta">
                  <span>${esc(r.label)}</span>
                  <strong>${esc(num(r.count || 0))}</strong>
                </div>
                <div class="owner-qr-funnel__track"><span style="width:${w}%"></span></div>
                <div class="owner-qr-funnel__pct">${esc(r.pct == null ? '—' : `${Number(r.pct).toFixed(1)}%`)}</div>
              </div>`;
          }).join('') || '<p class="owner-muted">No funnel data yet.</p>'}
        </div>
      </section>`;
  }

  function chartHtml(series, metric, esc, num) {
    const pts = (Array.isArray(series) ? series : []).map((p) => ({
      date: p.date,
      value: Number(p[metric]) || 0,
    }));
    const W = 560;
    const H = 220;
    const pad = { t: 16, r: 12, b: 28, l: 36 };
    const max = Math.max(1, ...pts.map((p) => p.value));
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    let path = '';
    pts.forEach((p, i) => {
      const x = pad.l + (pts.length <= 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
      const y = pad.t + innerH - (p.value / max) * innerH;
      path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
    });
    const xLabels = pts.length
      ? [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]].filter(Boolean)
      : [];
    return `
      <section class="owner-qr-panel">
        <header class="owner-qr-panel__head">
          <h3>Scans Over Time</h3>
          <label class="owner-qr-select-wrap">
            <select data-qr-chart-metric aria-label="Chart metric">
              ${CHART_METRICS.map((m) => `<option value="${m.id}" ${m.id === metric ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
            </select>
          </label>
        </header>
        ${pts.length ? `
          <svg class="owner-qr-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Time series">
            <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" stroke="rgba(255,255,255,0.08)"/>
            <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" stroke="rgba(255,255,255,0.08)"/>
            <path d="${path.trim()}" fill="none" stroke="#4ec5e8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            ${xLabels.map((p, i) => {
              const idx = i === 0 ? 0 : (i === 1 ? Math.floor(pts.length / 2) : pts.length - 1);
              const x = pad.l + (pts.length <= 1 ? innerW / 2 : (idx / (pts.length - 1)) * innerW);
              return `<text x="${x}" y="${H - 8}" text-anchor="middle" fill="#8a8e9a" font-size="10">${esc(String(p.date).slice(5))}</text>`;
            }).join('')}
          </svg>` : '<p class="owner-muted owner-qr-chart-empty">No time-series data in this range.</p>'}
      </section>`;
  }

  function emptyState(esc) {
    return `
      <section class="owner-section owner-qr">
        <div class="owner-qr-empty">
          <p class="owner-section__label">QR Code Analytics</p>
          <h2 class="owner-section__title owner-h1">No QR campaigns yet</h2>
          <p class="owner-muted">Create your first campaign to generate a trackable QR code and start measuring scans through Voices.</p>
          <button type="button" class="owner-btn" data-qr-new>Create First Campaign</button>
        </div>
      </section>`;
  }

  function modalHtml(state, esc) {
    if (!state.qrModalOpen) return '';
    const f = state.qrForm || {};
    const editing = !!f.id;
    return `
      <div class="owner-qr-modal" data-qr-modal role="dialog" aria-modal="true" aria-labelledby="owner-qr-modal-title">
        <div class="owner-qr-modal__card">
          <header class="owner-qr-modal__head">
            <h3 id="owner-qr-modal-title">${editing ? 'Edit Campaign' : 'New Campaign'}</h3>
            <button type="button" class="owner-btn-ghost" data-qr-modal-close aria-label="Close">✕</button>
          </header>
          <form class="owner-qr-form" data-qr-form>
            ${editing ? `<input type="hidden" name="id" value="${esc(f.id)}">` : ''}
            <label>Campaign Name *
              <input name="name" required value="${esc(f.name || '')}" placeholder="Braga — October 2027">
            </label>
            <label>Campaign Type *
              <select name="type" required>
                ${TYPES.map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            <label>Location
              <input name="location" value="${esc(f.location || '')}" placeholder="Braga, Portugal">
            </label>
            <label>Distribution Date
              <input name="distributionDate" value="${esc(f.distributionDate || '')}" placeholder="October 2027">
            </label>
            <div class="owner-qr-form__row">
              <label>Number of Flyers / Units
                <input name="units" inputmode="numeric" value="${esc(f.units ?? '')}" placeholder="1000">
              </label>
              <label>Campaign Cost (€)
                <input name="cost" inputmode="decimal" value="${esc(f.cost ?? '')}" placeholder="60">
              </label>
            </div>
            <label>Notes
              <textarea name="notes" rows="3" placeholder="Where and how flyers were distributed">${esc(f.notes || '')}</textarea>
            </label>
            <div class="owner-qr-form__actions">
              <button type="button" class="owner-btn-ghost" data-qr-modal-close>Cancel</button>
              <button type="submit" class="owner-btn" ${state.qrBusy ? 'disabled' : ''}>${editing ? 'Save Changes' : 'Create Campaign'}</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  function renderDashboard(state, { esc, num, money }) {
    const data = state.qrAnalytics;
    const a = data?.analytics || {};
    const k = a.kpis || {};
    const ic = icons();
    const campaigns = data?.campaigns || a.campaigns || [];
    if ((a.campaignCount === 0 || campaigns.length === 0) && !state.qrCampaignFilter) {
      return emptyState(esc) + modalHtml(state, esc);
    }

    return `
      <section class="owner-section owner-qr">
        <div class="owner-qr-page-head">
          <div>
            <p class="owner-section__label">QR Code Analytics</p>
            <h2 class="owner-section__title owner-h1">QR Code Analytics</h2>
            <p class="owner-muted owner-sub">Track the impact of your QR code campaigns and see how they turn into real World Choir participants.</p>
          </div>
          <button type="button" class="owner-btn" data-qr-new>+ New Campaign</button>
        </div>

        <div class="owner-qr-toolbar">
          <label class="owner-qr-select-wrap">
            <select data-qr-campaign-filter aria-label="Campaign filter">
              <option value="">All Campaigns</option>
              ${campaigns.map((c) => `<option value="${esc(c.id)}" ${state.qrCampaignFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
          </label>
          <div class="owner-qr-pills" role="group" aria-label="Date range">
            ${RANGES.map((r) => `
              <button type="button" class="owner-qr-pill ${state.qrRange === r.id ? 'is-active' : ''}" data-qr-range="${r.id}">${r.label}</button>
            `).join('')}
          </div>
        </div>

        <div class="owner-qr-kpis owner-qr-kpis--primary">
          ${kpiCard(ic.qr, 'QR Scans', k.scans || 0, `${num(k.uniqueScans || 0)} unique scans`, esc, num)}
          ${kpiCard(ic.phone, 'App Opens', k.appOpens || 0, `${pctLabel(k.appOpensPctOfScans)} of scans`, esc, num)}
          ${kpiCard(ic.click, "I'll Sing Clicks", k.illSing || 0, `${pctLabel(k.illSingPctOfOpens)} of app opens`, esc, num)}
          ${kpiCard(ic.people, 'Voices Created', k.voices || 0, `${pctLabel(k.voicesPctOfClicks)} of clicks`, esc, num)}
        </div>

        <div class="owner-qr-kpis owner-qr-kpis--secondary">
          ${kpiCard(ic.retain, 'Day 1 Retention', k.day1Retention == null ? '—' : `${k.day1Retention}%`, `${num(k.day1Retained || 0)} of ${num(k.day1Eligible || 0)}`, esc, num)}
          ${kpiCard(ic.cal, 'Day 7 Retention', k.day7Retention == null ? '—' : `${k.day7Retention}%`, `${num(k.day7Retained || 0)} of ${num(k.day7Eligible || 0)}`, esc, num)}
          ${kpiCard(ic.cal, 'Day 30 Retention', k.day30Retention == null ? '—' : `${k.day30Retention}%`, `${num(k.day30Retained || 0)} of ${num(k.day30Eligible || 0)}`, esc, num)}
          ${kpiCard(ic.share, 'Shares', k.shares || 0, `${pctLabel(k.sharesPctOfVoices)} of joined users`, esc, num)}
          ${kpiCard(ic.people, 'Voices from Shares', k.voicesFromShares || 0, `${pctLabel(k.shareConversion)} of shares`, esc, num)}
        </div>

        <div class="owner-qr-grid-2">
          ${funnelHtml(a.funnel, esc, num)}
          ${chartHtml(a.series, state.qrChartMetric || 'scans', esc, num)}
        </div>

        <div class="owner-qr-grid-3">
          <section class="owner-qr-panel">
            <header class="owner-qr-panel__head">
              <h3>Campaigns</h3>
              <button type="button" class="owner-link" data-qr-view-all-campaigns>View All</button>
            </header>
            <div class="owner-table-wrap">
              <table class="owner-table owner-qr-table">
                <thead><tr><th>Campaign</th><th>Scans</th><th>Voices</th><th>Conv.</th></tr></thead>
                <tbody>
                  ${(a.campaigns || []).slice(0, state.qrShowAllCampaigns ? 500 : 8).map((c) => `
                    <tr data-qr-open="${esc(c.id)}" tabindex="0">
                      <td>${esc(c.name)}</td>
                      <td>${esc(num(c.scans || 0))}</td>
                      <td>${esc(num(c.voices || 0))}</td>
                      <td>${esc(pctLabel(c.conversion))}</td>
                    </tr>`).join('') || '<tr><td colspan="4" class="owner-muted">No campaigns.</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>

          <section class="owner-qr-panel">
            <header class="owner-qr-panel__head">
              <h3>User Journey</h3>
              <span class="owner-muted">From scan to engagement</span>
            </header>
            <div class="owner-table-wrap">
              <table class="owner-table owner-qr-table">
                <thead><tr><th>Action</th><th>Users</th><th>% Voices</th></tr></thead>
                <tbody>
                  ${(a.journey || []).map((j) => `
                    <tr>
                      <td>${esc(j.action)}</td>
                      <td>${esc(num(j.users || 0))}</td>
                      <td>${esc(pctLabel(j.pctOfVoices))}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <section class="owner-qr-panel">
            <header class="owner-qr-panel__head"><h3>Campaign Performance</h3></header>
            <div class="owner-table-wrap">
              <table class="owner-table owner-qr-table">
                <thead><tr><th>Campaign</th><th>Cost</th><th>Cost / Voice</th></tr></thead>
                <tbody>
                  ${(a.performance || []).map((c) => `
                    <tr data-qr-open="${esc(c.id)}" tabindex="0">
                      <td>${esc(c.name)}</td>
                      <td>${esc(moneyEur(c.cost, c.currency))}</td>
                      <td>${esc(c.costPerVoice == null ? '—' : moneyEur(c.costPerVoice, c.currency))}</td>
                    </tr>`).join('') || '<tr><td colspan="3" class="owner-muted">No cost data.</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      ${modalHtml(state, esc)}`;
  }

  function renderDetail(state, { esc, num }) {
    const d = state.qrDetail;
    if (!d?.campaign) {
      return `<section class="owner-section"><p class="owner-muted">Loading campaign…</p></section>`;
    }
    const c = d.campaign;
    const k = d.analytics?.kpis || {};
    const link = d.link || '';
    return `
      <section class="owner-section owner-qr">
        <button type="button" class="owner-btn-ghost" data-qr-back>← Back to analytics</button>
        <div class="owner-qr-detail-head">
          <div>
            <p class="owner-section__label">${esc(c.type || 'Campaign')}</p>
            <h2 class="owner-section__title owner-h1">${esc(c.name)}</h2>
            <p class="owner-muted">ID ${esc(c.id)} · ${esc(c.status || 'active')}${c.location ? ` · ${esc(c.location)}` : ''}</p>
          </div>
          <div class="owner-qr-detail-actions">
            <button type="button" class="owner-btn-ghost" data-qr-edit="${esc(c.id)}">Edit</button>
            <button type="button" class="owner-btn-ghost" data-qr-archive="${esc(c.id)}">${c.status === 'archived' ? 'Reactivate' : 'Archive'}</button>
            <button type="button" class="owner-btn" data-qr-copy-link="${esc(link)}">Copy Link</button>
            <a class="owner-btn" href="/api/admin?action=qr-campaign-svg&id=${encodeURIComponent(c.id)}" download="${esc(c.id)}.svg">Download QR</a>
          </div>
        </div>
        <div class="owner-qr-detail-grid">
          <div class="owner-qr-panel owner-qr-qrbox">
            <img alt="Campaign QR code" src="/api/admin?action=qr-campaign-svg&id=${encodeURIComponent(c.id)}" width="240" height="240">
            <p class="owner-muted owner-qr-link">${esc(link)}</p>
          </div>
          <div class="owner-qr-kpis owner-qr-kpis--primary">
            ${kpiCard('▦', 'QR Scans', k.scans || 0, `${num(k.uniqueScans || 0)} unique`, esc, num)}
            ${kpiCard('▣', 'App Opens', k.appOpens || 0, pctLabel(k.appOpensPctOfScans), esc, num)}
            ${kpiCard('➤', "I'll Sing", k.illSing || 0, pctLabel(k.illSingPctOfOpens), esc, num)}
            ${kpiCard('◉', 'Voices', k.voices || 0, pctLabel(k.voicesPctOfClicks), esc, num)}
          </div>
        </div>
        <div class="owner-qr-grid-2">
          ${funnelHtml(d.analytics?.funnel, esc, num)}
          ${chartHtml(d.analytics?.series, state.qrChartMetric || 'scans', esc, num)}
        </div>
        <div class="owner-qr-panel">
          <header class="owner-qr-panel__head"><h3>Campaign details</h3></header>
          <dl class="owner-qr-dl">
            <div><dt>Distribution</dt><dd>${esc(c.distributionDate || '—')}</dd></div>
            <div><dt>Units</dt><dd>${esc(c.units == null ? '—' : num(c.units))}</dd></div>
            <div><dt>Cost</dt><dd>${esc(moneyEur(c.cost, c.currency))}</dd></div>
            <div><dt>Cost / Voice</dt><dd>${esc(k.voices ? moneyEur((Number(c.cost) || 0) / k.voices, c.currency) : '—')}</dd></div>
            <div><dt>Created</dt><dd>${esc((c.createdAt || '').slice(0, 10) || '—')}</dd></div>
            <div><dt>Notes</dt><dd>${esc(c.notes || '—')}</dd></div>
          </dl>
        </div>
      </section>
      ${modalHtml(state, esc)}`;
  }

  function render(state, helpers) {
    if (state.qrLoading && !state.qrAnalytics) {
      return `<section class="owner-section"><p class="owner-muted">Loading QR Code Analytics…</p></section>`;
    }
    if (state.qrView === 'detail') return renderDetail(state, helpers);
    return renderDashboard(state, helpers);
  }

  function bind(rootEl, state, helpers, ctx) {
    if (!rootEl) return;

    rootEl.querySelectorAll('[data-qr-range]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.qrRange = btn.getAttribute('data-qr-range');
        await ctx.loadData?.(false);
        ctx.onRender?.();
      });
    });

    rootEl.querySelector('[data-qr-campaign-filter]')?.addEventListener('change', async (e) => {
      state.qrCampaignFilter = e.target.value || '';
      await ctx.loadData?.(false);
      ctx.onRender?.();
    });

    rootEl.querySelector('[data-qr-chart-metric]')?.addEventListener('change', (e) => {
      state.qrChartMetric = e.target.value || 'scans';
      ctx.onRender?.();
    });

    rootEl.querySelectorAll('[data-qr-new]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.qrModalOpen = true;
        state.qrForm = { type: 'Flyer', name: '', location: '', distributionDate: '', units: '', cost: '', notes: '' };
        ctx.onRender?.();
      });
    });

    rootEl.querySelector('[data-qr-view-all-campaigns]')?.addEventListener('click', () => {
      state.qrShowAllCampaigns = true;
      ctx.onRender?.();
    });

    rootEl.querySelectorAll('[data-qr-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.qrModalOpen = false;
        ctx.onRender?.();
      });
    });

    rootEl.querySelector('[data-qr-modal]')?.addEventListener('click', (e) => {
      if (e.target?.hasAttribute?.('data-qr-modal')) {
        state.qrModalOpen = false;
        ctx.onRender?.();
      }
    });

    rootEl.querySelector('[data-qr-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      state.qrBusy = true;
      ctx.onRender?.();
      try {
        if (body.id) {
          await ctx.api('qr-campaign-update', { method: 'POST', body });
          ctx.setFlash?.('Campaign updated.', 'ok');
        } else {
          const created = await ctx.api('qr-campaign-create', { method: 'POST', body });
          ctx.setFlash?.(`Campaign created · ${created.campaign?.id || ''}`, 'ok');
          if (created.campaign?.id) {
            state.qrView = 'detail';
            state.qrDetailId = created.campaign.id;
          }
        }
        state.qrModalOpen = false;
        await ctx.loadData?.(false);
        if (state.qrView === 'detail' && state.qrDetailId) {
          state.qrDetail = await ctx.api('qr-campaign', { query: `&id=${encodeURIComponent(state.qrDetailId)}&range=${encodeURIComponent(state.qrRange || 'all')}` });
        }
      } catch (err) {
        ctx.setFlash?.(err.message || 'Could not save campaign', 'err');
      }
      state.qrBusy = false;
      ctx.onRender?.();
    });

    rootEl.querySelectorAll('[data-qr-open]').forEach((row) => {
      const open = async () => {
        const id = row.getAttribute('data-qr-open');
        state.qrView = 'detail';
        state.qrDetailId = id;
        state.qrDetail = null;
        ctx.onRender?.();
        try {
          state.qrDetail = await ctx.api('qr-campaign', {
            query: `&id=${encodeURIComponent(id)}&range=${encodeURIComponent(state.qrRange || 'all')}`,
          });
        } catch (err) {
          ctx.setFlash?.(err.message || 'Could not load campaign', 'err');
          state.qrView = 'dashboard';
        }
        ctx.onRender?.();
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    rootEl.querySelector('[data-qr-back]')?.addEventListener('click', () => {
      state.qrView = 'dashboard';
      state.qrDetailId = null;
      state.qrDetail = null;
      ctx.onRender?.();
    });

    rootEl.querySelector('[data-qr-edit]')?.addEventListener('click', (e) => {
      const c = state.qrDetail?.campaign;
      if (!c) return;
      state.qrModalOpen = true;
      state.qrForm = { ...c };
      ctx.onRender?.();
    });

    rootEl.querySelector('[data-qr-archive]')?.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-qr-archive');
      const c = state.qrDetail?.campaign;
      const next = c?.status === 'archived' ? 'active' : 'archived';
      try {
        await ctx.api('qr-campaign-status', { method: 'POST', body: { id, status: next } });
        ctx.setFlash?.(next === 'archived' ? 'Campaign archived.' : 'Campaign reactivated.', 'ok');
        state.qrDetail = await ctx.api('qr-campaign', {
          query: `&id=${encodeURIComponent(id)}&range=${encodeURIComponent(state.qrRange || 'all')}`,
        });
        await ctx.loadData?.(false);
      } catch (err) {
        ctx.setFlash?.(err.message || 'Could not update status', 'err');
      }
      ctx.onRender?.();
    });

    rootEl.querySelector('[data-qr-copy-link]')?.addEventListener('click', async (e) => {
      const link = e.currentTarget.getAttribute('data-qr-copy-link') || '';
      try {
        await navigator.clipboard.writeText(link);
        ctx.setFlash?.('Link copied.', 'ok');
      } catch {
        ctx.setFlash?.('Could not copy link', 'err');
      }
    });
  }

  let pollTimer = null;

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling(ctx) {
    stopPolling();
    if (!ctx?.loadData) return;
    // Live refresh while Owner is on QR Analytics (Refresh remains a manual complement)
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      Promise.resolve(ctx.loadData()).catch(() => {});
    }, 8000);
  }

  return { render, bind, startPolling, stopPolling };
})();
