/**
 * Foundation Donation Analytics UI — renders real analytics payload only.
 * Never invents metrics. Empty states when data is absent.
 */
const FoundationDonationAnalyticsUI = (() => {
  const RANGES = [
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: '90d', label: 'Last 90 days' },
    { id: '1y', label: 'This year' },
    { id: 'all', label: 'All time' },
    { id: 'custom', label: 'Custom range' },
  ];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(amount, currency = 'EUR') {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'EUR',
        maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      }).format(n);
    } catch {
      return `${n} ${currency || 'EUR'}`;
    }
  }

  function num(n) {
    if (n == null || !Number.isFinite(Number(n))) return '0';
    return Number(n).toLocaleString('en-US');
  }

  function pctLabel(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return `${Number(n)}%`;
  }

  function when(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch {
      return String(iso);
    }
  }

  function icon(kind) {
    const c = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const map = {
      trend: `<svg ${c}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg>`,
      wallet: `<svg ${c}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14h2"/></svg>`,
      foundation: `<svg ${c}><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></svg>`,
      globe: `<svg ${c}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      heart: `<svg ${c}><path d="M12 21s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 11c0 5.5-7 10-7 10z"/></svg>`,
      bars: `<svg ${c}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-3"/><path d="M12 15V8"/><path d="M16 15v-5"/></svg>`,
      median: `<svg ${c}><path d="M5 12h14"/></svg>`,
      people: `<svg ${c}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      person: `<svg ${c}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
      info: `<svg ${c}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      pin: `<svg ${c}><path d="M12 21s-7-4.5-7-10a7 7 0 0114 0c0 5.5-7 10-7 10z"/><circle cx="12" cy="11" r="2.5"/></svg>`,
      project: `<svg ${c}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
      clock: `<svg ${c}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
      flag: `<svg ${c}><path d="M4 21V4"/><path d="M4 4h11l-1.5 4L15 12H4"/></svg>`,
      close: `<svg ${c}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    };
    return map[kind] || map.info;
  }

  function changeHtml(pct) {
    if (pct == null || !Number.isFinite(Number(pct))) {
      return `<span class="fda-change is-muted">—</span>`;
    }
    const n = Number(pct);
    const cls = n > 0 ? 'is-up' : (n < 0 ? 'is-down' : 'is-flat');
    const arrow = n > 0 ? '↑' : (n < 0 ? '↓' : '→');
    return `<span class="fda-change ${cls}">${arrow} ${esc(Math.abs(n))}%</span><span class="fda-change__note">vs previous period</span>`;
  }

  function emptyBlock(message) {
    return `<div class="fda-empty"><p>${esc(message)}</p></div>`;
  }

  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function chartFrame(innerHtml, caption) {
    return `
      <div class="fda-chart-frame ${caption ? 'is-empty' : ''}">
        ${innerHtml}
        ${caption ? `<p class="fda-chart-frame__caption">${esc(caption)}</p>` : ''}
      </div>
    `;
  }

  function compactAxisLabel(label) {
    const raw = String(label || '').trim();
    // "Oct 2025" → "Oct ’25" so wide ranges stay readable at any width
    const monthYear = raw.match(/^([A-Za-z]{3})\s+(20\d{2})$/);
    if (monthYear) return `${monthYear[1]} ’${monthYear[2].slice(2)}`;
    return raw;
  }

  function pickXLabelIndexes(count) {
    if (count <= 0) return [];
    if (count === 1) return [0];
    const maxLabels = 7;
    const step = Math.max(1, Math.ceil((count - 1) / (maxLabels - 1)));
    const idxs = [];
    for (let i = 0; i < count; i += step) idxs.push(i);
    const last = count - 1;
    if (idxs[idxs.length - 1] !== last) {
      // Drop previous tick if it would crowd the final label
      if (idxs.length >= 2 && last - idxs[idxs.length - 1] < Math.max(1, Math.floor(step * 0.55))) {
        idxs.pop();
      }
      idxs.push(last);
    }
    return idxs;
  }

  function areaChart(points, valueKey, currency, caption) {
    const series = points.length
      ? points
      : MONTH_SHORT.map((label) => ({
        label,
        grossRaised: 0,
        netRaised: 0,
        donations: 0,
        averageDonation: 0,
      }));
    // Plot-only viewBox — axis labels live in HTML so they never stretch.
    const w = 1000;
    const h = 200;
    const pad = { t: 12, r: 8, b: 12, l: 8 };
    const values = series.map((p) => Number(p[valueKey] || 0));
    const max = Math.max(...values, 0);
    const emptyScale = max <= 0;
    const span = emptyScale ? 100 : max;
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const coords = series.map((p, i) => {
      const x = pad.l + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
      const y = pad.t + innerH - ((Number(p[valueKey] || 0) / span) * innerH);
      const pct = series.length === 1 ? 50 : (i / (series.length - 1)) * 100;
      return { x, y, pct, p };
    });
    const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${(pad.t + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;
    const yTicks = [1, 0.5, 0].map((t) => {
      const val = emptyScale ? 0 : span * t;
      const topPct = ((1 - t) * 100);
      const label = valueKey === 'donations'
        ? num(Math.round(val))
        : money(val, currency).replace(/\.00$/, '');
      return { topPct, label };
    });
    const xLabelIdx = new Set(pickXLabelIndexes(coords.length));

    return chartFrame(`
      <div class="fda-chart" role="img" aria-label="Donation revenue over time">
        <div class="fda-chart__plot">
          <div class="fda-chart__y" aria-hidden="true">
            ${yTicks.map((t) => `
              <span class="fda-chart__ylabel" style="top:${t.topPct}%">${esc(t.label)}</span>
            `).join('')}
          </div>
          <div class="fda-chart__canvas">
            <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" focusable="false">
              ${yTicks.map((t) => {
                const y = pad.t + (t.topPct / 100) * innerH;
                return `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" class="fda-chart__grid"></line>`;
              }).join('')}
              <path d="${area}" class="fda-chart__area"></path>
              <path d="${line}" class="fda-chart__line"></path>
              ${coords.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="3.2" class="fda-chart__dot">
                <title>${esc(c.p.label)}: ${esc(valueKey === 'donations' ? num(c.p.donations || 0) : money(c.p[valueKey] || 0, currency))}</title>
              </circle>`).join('')}
            </svg>
          </div>
        </div>
        <div class="fda-chart__x" aria-hidden="true">
          ${coords.map((c, i) => {
            if (!xLabelIdx.has(i)) return '';
            const edge = i === 0 ? 'is-first' : (i === coords.length - 1 ? 'is-last' : '');
            return `<span class="fda-chart__xlabel ${edge}" style="left:${c.pct}%">${esc(compactAxisLabel(c.p.label))}</span>`;
          }).join('')}
        </div>
      </div>
    `, caption);
  }

  function barChart(rows, valueKey = 'donations', caption) {
    const list = rows.length ? rows : [
      { label: 'Mon', donations: 0 }, { label: 'Tue', donations: 0 }, { label: 'Wed', donations: 0 },
      { label: 'Thu', donations: 0 }, { label: 'Fri', donations: 0 }, { label: 'Sat', donations: 0 },
      { label: 'Sun', donations: 0 },
    ];
    const max = Math.max(...list.map((r) => Number(r[valueKey] || 0)), 1);
    return chartFrame(`
      <div class="fda-bars" role="img" aria-label="Donation timing chart">
        ${list.map((r) => {
          const v = Number(r[valueKey] || 0);
          const h = Math.max(4, Math.round((v / max) * 120));
          return `
            <div class="fda-bars__col">
              <div class="fda-bars__bar ${v <= 0 ? 'is-zero' : ''}" style="height:${h}px" title="${esc(r.label)}: ${esc(num(v))}"></div>
              <span class="fda-bars__label">${esc(r.label)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `, caption);
  }

  function hBars(ranges, caption) {
    const list = (ranges && ranges.length) ? ranges : [
      { label: '€1–€10', count: 0, percent: null },
      { label: '€11–€25', count: 0, percent: null },
      { label: '€26–€50', count: 0, percent: null },
      { label: '€51–€100', count: 0, percent: null },
      { label: '€100+', count: 0, percent: null },
    ];
    const max = Math.max(...list.map((r) => r.count || 0), 1);
    return chartFrame(`
      <div class="fda-hbars">
        ${list.map((r) => `
          <div class="fda-hbar">
            <span class="fda-hbar__label">${esc(r.label)}</span>
            <div class="fda-hbar__track">
              <div class="fda-hbar__fill ${!(r.count > 0) ? 'is-zero' : ''}" style="width:${Math.round(((r.count || 0) / max) * 100)}%"></div>
            </div>
            <span class="fda-hbar__meta">${esc(num(r.count || 0))} · ${esc(pctLabel(r.percent))}</span>
          </div>
        `).join('')}
      </div>
    `, caption);
  }

  function kpiCard({ iconKind, label, value, sub, change }) {
    return `
      <article class="fda-kpi">
        <span class="fda-kpi__icon" aria-hidden="true">${icon(iconKind)}</span>
        <p class="fda-kpi__value">${esc(value)}</p>
        <p class="fda-kpi__label">${esc(label)}</p>
        ${sub ? `<p class="fda-kpi__sub">${esc(sub)}</p>` : ''}
        ${change != null ? `<div class="fda-kpi__change">${changeHtml(change)}</div>` : ''}
      </article>
    `;
  }

  function segControl(name, options, active) {
    return `
      <div class="fda-seg" role="tablist" aria-label="${esc(name)}">
        ${options.map((opt) => `
          <button type="button" class="fda-seg__btn ${active === opt.id ? 'is-active' : ''}"
            role="tab" aria-selected="${active === opt.id ? 'true' : 'false'}"
            data-analytics-seg="${esc(name)}" data-seg-value="${esc(opt.id)}">${esc(opt.label)}</button>
        `).join('')}
      </div>
    `;
  }

  function renderFinancial(data, currency) {
    const f = data.financial || {};
    const c = f.comparison || {};
    const showChange = !!c.available;
    return `
      <section class="fda-section">
        <header class="fda-section__head">
          <div>
            <h3>1. Financial Performance</h3>
            <p>Key metrics at a glance.</p>
          </div>
        </header>
        <div class="fda-kpi-grid">
          ${kpiCard({
            iconKind: 'wallet',
            label: 'Gross Raised',
            value: money(f.grossRaised || 0, currency),
            change: showChange ? c.grossRaised : null,
          })}
          ${kpiCard({
            iconKind: 'foundation',
            label: 'Net to Foundation',
            value: money(f.netToFoundation || 0, currency),
            change: showChange ? c.netToFoundation : null,
          })}
          ${kpiCard({
            iconKind: 'globe',
            label: 'World Choir Fee',
            value: money(f.worldChoirFee || 0, currency),
            sub: `${data.platformFeePercent ?? '—'}%`,
          })}
          ${kpiCard({
            iconKind: 'heart',
            label: 'Donations',
            value: num(f.donations || 0),
            change: showChange ? c.donations : null,
          })}
          ${kpiCard({
            iconKind: 'bars',
            label: 'Average Donation',
            value: f.averageDonation != null ? money(f.averageDonation, currency) : '—',
            change: showChange ? c.averageDonation : null,
          })}
          ${kpiCard({
            iconKind: 'median',
            label: 'Median Donation',
            value: f.medianDonation != null ? money(f.medianDonation, currency) : '—',
            change: showChange ? c.medianDonation : null,
          })}
        </div>
      </section>
    `;
  }

  function renderRevenue(data, ui, currency) {
    const series = data.revenueOverTime || { empty: true, points: [] };
    const metric = ui.revenueMetric || 'grossRaised';
    const metricMap = {
      grossRaised: 'grossRaised',
      netRaised: 'netRaised',
      donations: 'donations',
      averageDonation: 'averageDonation',
    };
    return `
      <section class="fda-section fda-card">
        <header class="fda-section__head">
          <div>
            <h3>Donation Revenue Over Time</h3>
            <p>Track your donation performance across different metrics.</p>
          </div>
          ${segControl('revenue', [
            { id: 'grossRaised', label: 'Gross Raised' },
            { id: 'netRaised', label: 'Net Raised' },
            { id: 'donations', label: 'Donations' },
            { id: 'averageDonation', label: 'Average Donation' },
          ], metric)}
        </header>
        ${areaChart(
          series.points || [],
          metricMap[metric] || 'grossRaised',
          currency,
          series.empty ? 'No donation data for this period yet.' : ''
        )}
      </section>
    `;
  }

  function renderDonors(data, currency) {
    const d = data.donors || { empty: true };
    return `
      <section class="fda-section fda-card">
        <header class="fda-section__head">
          <div>
            <h3>2. New vs Returning Donors</h3>
            <p>Understand your supporter base and loyalty.</p>
          </div>
        </header>
        <div class="fda-donor-grid">
          <article class="fda-mini">
            <span class="fda-kpi__icon" aria-hidden="true">${icon('person')}</span>
            <p class="fda-kpi__value">${esc(num(d.newDonors || 0))}</p>
            <p class="fda-kpi__label">New Donors</p>
            <p class="fda-kpi__sub">${esc(d.empty ? '—' : pctLabel(d.newDonorPercent))} of donors</p>
          </article>
          <article class="fda-mini">
            <span class="fda-kpi__icon" aria-hidden="true">${icon('people')}</span>
            <p class="fda-kpi__value">${esc(num(d.returningDonors || 0))}</p>
            <p class="fda-kpi__label">Returning Donors</p>
            <p class="fda-kpi__sub">${esc(d.empty ? '—' : pctLabel(d.returningDonorPercent))} of donors</p>
          </article>
          <article class="fda-mini">
            <span class="fda-kpi__icon" aria-hidden="true">${icon('wallet')}</span>
            <p class="fda-kpi__value">${esc(money(d.revenueFromNew || 0, currency))}</p>
            <p class="fda-kpi__label">Revenue from New Donors</p>
            <p class="fda-kpi__sub">${esc(d.empty ? '—' : pctLabel(d.revenueFromNewPercent))} of revenue</p>
          </article>
          <article class="fda-mini">
            <span class="fda-kpi__icon" aria-hidden="true">${icon('foundation')}</span>
            <p class="fda-kpi__value">${esc(money(d.revenueFromReturning || 0, currency))}</p>
            <p class="fda-kpi__label">Revenue from Returning Donors</p>
            <p class="fda-kpi__sub">${esc(d.empty ? '—' : pctLabel(d.revenueFromReturningPercent))} of revenue</p>
          </article>
        </div>
        <div class="fda-stat-row">
          <div class="fda-stat"><span>Avg. Donation — New</span><strong>${esc(d.avgDonationNew != null ? money(d.avgDonationNew, currency) : '—')}</strong></div>
          <div class="fda-stat"><span>Avg. Donation — Returning</span><strong>${esc(d.avgDonationReturning != null ? money(d.avgDonationReturning, currency) : '—')}</strong></div>
          <div class="fda-stat"><span>Donations per Returning Donor</span><strong>${esc(d.donationsPerReturningDonor != null ? num(d.donationsPerReturningDonor) : '—')}</strong></div>
          <div class="fda-stat"><span>Repeat Donation Rate</span><strong>${esc(pctLabel(d.repeatDonationRate))}</strong></div>
          <div class="fda-stat"><span>Returning Donor Revenue %</span><strong>${esc(pctLabel(d.returningDonorRevenuePercent))}</strong></div>
        </div>
        ${d.empty ? `<p class="fda-section-note">No donor activity for this period yet.</p>` : ''}
      </section>
    `;
  }

  function renderValue(data, currency) {
    const v = data.valueAnalysis || { empty: true };
    return `
      <section class="fda-section fda-card">
        <header class="fda-section__head">
          <div>
            <h3>3. Donation Value Analysis</h3>
            <p>Breakdown of donation amounts and key insights.</p>
          </div>
        </header>
        <div class="fda-value-grid">
          ${hBars(
            v.ranges || [],
            v.empty ? 'Donation value insights will appear after your Foundation receives donations.' : ''
          )}
          <dl class="fda-kv">
            <div><dt>Largest Donation</dt><dd>${esc(v.largest != null ? money(v.largest, currency) : '—')}</dd></div>
            <div><dt>Smallest Donation</dt><dd>${esc(v.smallest != null ? money(v.smallest, currency) : '—')}</dd></div>
            <div><dt>Most Common Range</dt><dd>${esc(v.mostCommonRange || '—')}</dd></div>
            <div><dt>Average Donation</dt><dd>${esc(v.averageDonation != null ? money(v.averageDonation, currency) : '—')}</dd></div>
            <div><dt>Median Donation</dt><dd>${esc(v.medianDonation != null ? money(v.medianDonation, currency) : '—')}</dd></div>
          </dl>
        </div>
        <div class="fda-insight">
          <span aria-hidden="true">${icon('info')}</span>
          <p>${esc(v.insight || 'More donation activity is needed to generate this insight.')}</p>
        </div>
      </section>
    `;
  }

  function renderGeography(data, ui, currency) {
    const g = data.geography || { empty: true };
    const mode = ui.geoMode || 'countries';
    const rows = mode === 'cities' ? (g.cities || []) : (g.countries || []);
    return `
      <section class="fda-section fda-card">
        <header class="fda-section__head">
          <div>
            <h3>4. Geography Performance</h3>
            <p>See where your support comes from.</p>
          </div>
          ${segControl('geo', [
            { id: 'countries', label: 'Countries' },
            { id: 'cities', label: 'Cities' },
          ], mode)}
        </header>
        ${g.empty || !rows.length
          ? `<div class="fda-table-wrap"><table class="fda-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>${mode === 'cities' ? 'City' : 'Country'}</th>
                  ${mode === 'cities' ? '<th>Country</th>' : ''}
                  <th class="num">Raised</th>
                  <th class="num">Donations</th>
                  <th class="num">Donors</th>
                  <th class="num">Avg.</th>
                  <th class="num">% of Total</th>
                </tr>
              </thead>
              <tbody>
                <tr class="fda-table__empty">
                  <td colspan="${mode === 'cities' ? 8 : 7}">No geographic donation data available yet.</td>
                </tr>
              </tbody>
            </table></div>`
          : `<div class="fda-table-wrap"><table class="fda-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>${mode === 'cities' ? 'City' : 'Country'}</th>
                  ${mode === 'cities' ? '<th>Country</th>' : ''}
                  <th class="num">Raised</th>
                  <th class="num">Donations</th>
                  <th class="num">Donors</th>
                  <th class="num">Avg.</th>
                  <th class="num">% of Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows.slice(0, 25).map((r) => `
                  <tr>
                    <td>${esc(r.rank)}</td>
                    <td>${esc(mode === 'cities' ? r.city : r.country)}</td>
                    ${mode === 'cities' ? `<td>${esc(r.country)}</td>` : ''}
                    <td class="num">${esc(money(r.raised, currency))}</td>
                    <td class="num">${esc(num(r.donations))}</td>
                    <td class="num">${esc(num(r.donors))}</td>
                    <td class="num">${esc(r.averageDonation != null ? money(r.averageDonation, currency) : '—')}</td>
                    <td class="num">${esc(pctLabel(r.percentOfTotal))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`}
      </section>
    `;
  }

  function renderProjects(data, currency) {
    const p = data.projects || { empty: true, rows: [] };
    return `
      <section class="fda-section fda-card">
        <header class="fda-section__head">
          <div>
            <h3>5. Project / Cause Performance</h3>
            <p>Compare performance across your foundation’s projects.</p>
          </div>
        </header>
        ${p.empty
          ? `<div class="fda-table-wrap"><table class="fda-table">
              <thead>
                <tr>
                  <th>#</th><th>Project</th><th class="num">Raised</th><th class="num">Donors</th>
                  <th class="num">Avg.</th><th>Goal Progress</th>
                </tr>
              </thead>
              <tbody>
                <tr class="fda-table__empty">
                  <td colspan="6">${esc(p.note || 'No project donation data available yet.')}</td>
                </tr>
              </tbody>
            </table></div>`
          : `<div class="fda-table-wrap"><table class="fda-table">
              <thead>
                <tr>
                  <th>#</th><th>Project</th><th class="num">Raised</th><th class="num">Donors</th>
                  <th class="num">Avg.</th><th>Goal Progress</th>
                </tr>
              </thead>
              <tbody>
                ${p.rows.map((r) => `
                  <tr>
                    <td>${esc(r.rank)}</td>
                    <td><span class="fda-project">${icon('project')}<span>${esc(r.name)}</span></span></td>
                    <td class="num">${esc(money(r.raised, currency))}</td>
                    <td class="num">${esc(num(r.donors))}</td>
                    <td class="num">${esc(r.averageDonation != null ? money(r.averageDonation, currency) : '—')}</td>
                    <td>
                      ${r.hasGoal ? `
                        <div class="fda-progress">
                          <div class="fda-progress__track"><div class="fda-progress__fill" style="width:${Math.min(100, r.goalProgressPercent || 0)}%"></div></div>
                          <span>${esc(pctLabel(r.goalProgressPercent))}</span>
                        </div>
                      ` : '<span class="fda-muted">No goal</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`}
      </section>
    `;
  }

  function renderTiming(data, ui) {
    const t = data.timing || { empty: true };
    const mode = ui.timingMode || 'day';
    const rows = mode === 'hour' ? (t.byHour || []) : (mode === 'month' ? (t.byMonth || []) : (t.byDay || []));
    const chartRows = mode === 'day'
      ? [...(t.byDay || [])].slice(1).concat((t.byDay || []).slice(0, 1))
      : rows;
    return `
      <section class="fda-section fda-card">
        <header class="fda-section__head">
          <div>
            <h3>6. Donation Timing</h3>
            <p>Discover when people support your foundation.</p>
          </div>
          ${segControl('timing', [
            { id: 'day', label: 'By Day' },
            { id: 'hour', label: 'By Hour' },
            { id: 'month', label: 'By Month' },
          ], mode)}
        </header>
        ${t.empty ? `
          <div class="fda-timing-grid">
            ${barChart(chartRows, 'donations', 'Donation timing insights will appear as donations are received.')}
            <dl class="fda-kv">
              <div><dt>Highest Donation Day</dt><dd>—</dd></div>
              <div><dt>Highest Revenue Day</dt><dd>—</dd></div>
              <div><dt>Highest Donation Hour</dt><dd>—</dd></div>
              <div><dt>Avg. Daily Donations</dt><dd>—</dd></div>
              <div><dt>Avg. Weekly Donations</dt><dd>—</dd></div>
              <div><dt>Avg. Monthly Donations</dt><dd>—</dd></div>
            </dl>
          </div>
        ` : `
          <div class="fda-timing-grid">
            ${barChart(chartRows, 'donations')}
            <dl class="fda-kv">
              <div><dt>Highest Donation Day</dt><dd>${esc(t.highestDonationDay || '—')}</dd></div>
              <div><dt>Highest Revenue Day</dt><dd>${esc(t.highestRevenueDay || '—')}</dd></div>
              <div><dt>Highest Donation Hour</dt><dd>${esc(t.highestDonationHour || '—')}</dd></div>
              <div><dt>Avg. Daily Donations</dt><dd>${esc(t.avgDailyDonations != null ? num(t.avgDailyDonations) : '—')}</dd></div>
              <div><dt>Avg. Weekly Donations</dt><dd>${esc(t.avgWeeklyDonations != null ? num(t.avgWeeklyDonations) : '—')}</dd></div>
              <div><dt>Avg. Monthly Donations</dt><dd>${esc(t.avgMonthlyDonations != null ? num(t.avgMonthlyDonations) : '—')}</dd></div>
            </dl>
          </div>
        `}
      </section>
    `;
  }

  function renderMilestones(data) {
    const m = data.milestones || { empty: true, achieved: [] };
    return `
      <section class="fda-section fda-card">
        <header class="fda-section__head">
          <div>
            <h3>Donation Milestones</h3>
            <p>Real achievements from your Foundation’s donation history.</p>
          </div>
        </header>
        ${m.empty
          ? emptyBlock(m.note || 'Your Foundation’s donation milestones will appear here.')
          : `
            <ul class="fda-milestones">
              ${m.achieved.map((item) => `
                <li>
                  <span class="fda-milestones__icon" aria-hidden="true">${icon('flag')}</span>
                  <div>
                    <strong>${esc(item.label)}</strong>
                    <span>${esc(when(item.at))}</span>
                  </div>
                </li>
              `).join('')}
            </ul>
            ${m.next ? `
              <div class="fda-next-milestone">
                <p>Next target: <strong>${esc(m.next.label)}</strong></p>
                <div class="fda-progress">
                  <div class="fda-progress__track"><div class="fda-progress__fill" style="width:${Math.min(100, m.next.progressPercent || 0)}%"></div></div>
                  <span>${esc(pctLabel(m.next.progressPercent))}</span>
                </div>
              </div>
            ` : ''}
          `}
      </section>
    `;
  }

  function toDateInputValue(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }

  function renderFoundationCategories(data, ui) {
    const list = (ui.foundations || data.foundations || []).filter(Boolean);
    if (!list.length) return '';
    const active = ui.foundationId || data.selectedFoundationId || 'all';
    return `
      <section class="fda-foundation-cats" aria-label="Foundation categories">
        <p class="fda-foundation-cats__label">Categories</p>
        <div class="fda-foundation-cats__bar" role="tablist" aria-label="Filter by foundation">
          ${list.map((f) => `
            <button
              type="button"
              class="fda-foundation-cats__btn ${active === f.id ? 'is-active' : ''}"
              role="tab"
              aria-selected="${active === f.id ? 'true' : 'false'}"
              data-analytics-foundation="${esc(f.id)}"
            >${esc(f.name)}</button>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderShell(data, ui) {
    if (!data) {
      return `<div class="fda-loading" role="status">Loading donation analytics…</div>`;
    }
    if (data.restricted) {
      return `<div class="fda-empty"><p>${esc(data.note || 'Donation analytics access is restricted.')}</p></div>`;
    }
    if (data.error) {
      return `<div class="fda-empty is-err"><p>${esc(data.error)}</p></div>`;
    }

    const currency = data.currency || 'EUR';
    const rangeKey = ui.range || data.range?.key || 'all';
    const showFoundationCats = !!(ui.foundations || data.foundations || []).length;
    return `
      <div class="fda">
        ${rangeKey === 'custom' ? `
          <div class="fda-custom is-open" data-analytics-custom>
            <input type="date" aria-label="From date" data-analytics-from value="${esc(ui.customFrom || toDateInputValue(data.range?.from))}">
            <input type="date" aria-label="To date" data-analytics-to value="${esc(ui.customTo || toDateInputValue(data.range?.to))}">
            <button type="button" class="fcc-btn-ghost fcc-top-chip" data-analytics-apply-custom>Apply</button>
          </div>
        ` : ''}
        ${showFoundationCats ? renderFoundationCategories(data, ui) : ''}
        ${renderFinancial(data, currency)}
        ${renderRevenue(data, ui, currency)}
        <div class="fda-two">
          ${renderDonors(data, currency)}
          ${renderValue(data, currency)}
        </div>
        <div class="fda-two">
          ${renderGeography(data, ui, currency)}
          ${renderProjects(data, currency)}
        </div>
        ${renderTiming(data, ui)}
        ${renderMilestones(data)}
      </div>
    `;
  }

  function renderHeader(ui = {}) {
    const rangeKey = ui.range || 'all';
    const subtitle = ui.ownerMode
      ? 'In-depth insights into Creator Foundations donations and supporters.'
      : 'In-depth insights into your foundation’s donations and supporters.';
    return `
      <div class="fcc-analytics__title-row">
        <span class="fcc-analytics__title-icon" aria-hidden="true">${icon('trend')}</span>
        <div>
          <h2 id="fcc-analytics-title">Donation Analytics</h2>
          <p class="fcc-analytics__subtitle">${esc(subtitle)}</p>
        </div>
      </div>
      <div class="fcc-analytics__head-actions">
        <label class="sr-only" for="fda-range">Date range</label>
        <select id="fda-range" class="fcc-range fda-range" data-analytics-range aria-label="Analytics date range">
          ${RANGES.map((r) => `
            <option value="${esc(r.id)}" ${rangeKey === r.id ? 'selected' : ''}>${esc(r.label)}</option>
          `).join('')}
        </select>
        <button type="button" class="fcc-icon-btn" data-action="close-analytics" aria-label="Close analytics">
          ${icon('close')}
        </button>
      </div>
    `;
  }

  return {
    RANGES,
    renderShell,
    renderHeader,
    esc,
    money,
    num,
  };
})();

if (typeof window !== 'undefined') {
  window.FoundationDonationAnalyticsUI = FoundationDonationAnalyticsUI;
}
