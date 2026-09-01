/**
 * Owner Mode — Pass the World analytics (mockup-aligned layout, real data only)
 */
const OwnerPassTheWorld = (() => {
  const RANGES = [
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: '1y', label: '1Y' },
    { id: 'all', label: 'ALL' },
  ];

  const POSSIBLE_STATES = [
    { id: 'idle', label: 'Waiting for 16:00 UTC', statuses: ['ARRIVED', 'INITIAL'] },
    { id: 'open', label: 'Invitation Window Open', statuses: ['INVITATION_OPEN'], live: true },
    { id: 'reveal', label: '10-Second Destination Reveal', statuses: ['REVEAL_PENDING'], live: true },
    { id: 'travel', label: 'Travelling', statuses: ['TRAVELLING'] },
    { id: 'waiting', label: 'Waiting for First Invitation', statuses: ['WAITING_FOR_FIRST_CALL'] },
    { id: 'arrived', label: 'Arrived', statuses: [] },
  ];

  const KPI_ICONS = {
    invitations: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    city: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm2 8h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
    stops: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    visited: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
    distance: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/></svg>',
  };

  let pollTimer = null;

  function fmt(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function fmtCompact(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.00$/, '')}M`;
    if (v >= 10000) return `${Math.round(v / 1000)}k`;
    if (v >= 1000) return `${(v / 1000).toFixed(2).replace(/\.00$/, '')}k`;
    return fmt(v);
  }

  function pct(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return `${Number(n).toFixed(1)}%`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
      });
    } catch { return '—'; }
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      return `${date} · ${time} UTC`;
    } catch { return '—'; }
  }

  function fmtDuration(seconds) {
    if (seconds == null || Number.isNaN(Number(seconds))) return '—';
    const s = Math.max(0, Math.round(Number(seconds)));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h < 48) return `${h}h ${m}m`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h ${m}m`;
  }

  function selectionLabel(method) {
    if (method === 'window') return 'Random 60-second selection';
    if (method === 'first_call') return 'First invitation after empty window';
    return '—';
  }

  function activeStateId(status) {
    const row = POSSIBLE_STATES.find((s) => s.statuses.includes(status));
    return row?.id || 'idle';
  }

  function renderLineChart(series, valueKey, label) {
    if (!series?.length) {
      return `<p class="owner-ptw-empty">No data yet.</p>`;
    }
    const w = 320;
    const h = 100;
    const pad = { l: 2, r: 2, t: 6, b: 4 };
    const values = series.map((d) => Number(d[valueKey] ?? 0));
    const max = Math.max(1, ...values);
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const coords = series.map((d, i) => {
      const x = pad.l + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
      const y = pad.t + innerH - (Number(d[valueKey] ?? 0) / max) * innerH;
      return { x, y };
    });
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const area = `${line} L${coords[coords.length - 1].x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} L${coords[0].x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;
    return `
      <svg class="owner-ptw-line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">
        <defs>
          <linearGradient id="owner-ptw-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4ec5e8" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#4ec5e8" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path class="owner-ptw-line-chart__area" d="${area}"/>
        <path class="owner-ptw-line-chart__line" d="${line}"/>
      </svg>`;
  }

  function renderDonut(outcomes) {
    const total = Number(outcomes?.total) || 0;
    if (!total) return '<p class="owner-ptw-empty">No rounds yet.</p>';
    const successful = Number(outcomes.successful) || 0;
    const empty = Number(outcomes.empty) || 0;
    const successPct = (successful / total) * 100;
    const emptyPct = (empty / total) * 100;
    const otherPct = Math.max(0, 100 - successPct - emptyPct);
    return `
      <div class="owner-ptw-donut-wrap">
        <div class="owner-ptw-donut" style="--ptw-success:${successPct.toFixed(1)}%;--ptw-empty:${emptyPct.toFixed(1)}%;--ptw-other:${otherPct.toFixed(1)}%" role="img" aria-label="Invitation outcomes"></div>
        <ul class="owner-ptw-donut-legend">
          <li><span class="owner-ptw-dot owner-ptw-dot--success"></span>Successful selections <strong>${fmt(successful)}</strong></li>
          <li><span class="owner-ptw-dot owner-ptw-dot--empty"></span>No selection / empty window <strong>${fmt(empty)}</strong></li>
          ${otherPct > 0 ? `<li><span class="owner-ptw-dot owner-ptw-dot--other"></span>In progress / other <strong>${fmt(total - successful - empty)}</strong></li>` : ''}
        </ul>
      </div>`;
  }

  function renderRangeChips(state, prefix = 'ptw-range') {
    return RANGES.map((r) => `
      <button type="button" class="owner-ptw-chip ${state.ptwRange === r.id ? 'is-active' : ''}" data-${prefix}="${r.id}">${r.label}</button>
    `).join('');
  }

  function renderKpiCard(icon, label, value, sub) {
    return `
      <article class="owner-ptw-kpi">
        <span class="owner-ptw-kpi__icon">${icon}</span>
        <p class="owner-ptw-kpi__label">${label}</p>
        <p class="owner-ptw-kpi__value">${value}</p>
        ${sub ? `<p class="owner-ptw-kpi__sub">${sub}</p>` : ''}
      </article>`;
  }

  function renderWindowBuckets(buckets) {
    if (!buckets?.length) return '<p class="owner-ptw-empty">No second-by-second data yet.</p>';
    const max = Math.max(1, ...buckets);
    return `
      <div class="owner-ptw-window-chart" role="img" aria-label="Invitations during 60 seconds">
        ${buckets.map((val, i) => {
          const h = Math.max(2, Math.round((val / max) * 100));
          return `<span class="owner-ptw-window-chart__bar" style="height:${h}%" title="${i}s: ${val}"></span>`;
        }).join('')}
      </div>
      <p class="owner-ptw-window-label">0s → 60s</p>`;
  }

  function renderRoundDetail(d, esc, state) {
    const r = d.roundDetail;
    if (!r) return '';
    return `
      <section class="owner-ptw owner-ptw-round-detail">
        <button type="button" class="owner-ptw-btn-ghost" data-ptw-back-rounds>← Invitation Rounds</button>
        <header class="owner-ptw-header">
          <div>
            <p class="owner-ptw-eyebrow">Invitation Round</p>
            <h2 class="owner-ptw-title">${fmtDate(r.date)}</h2>
            <p class="owner-ptw-sub">World started in ${esc(r.startingCity)}, ${esc(r.startingCountry)}</p>
          </div>
        </header>
        <div class="owner-ptw-kpi-row owner-ptw-kpi-row--4">
          ${renderKpiCard(KPI_ICONS.invitations, 'Total invitations', fmt(r.invitationCount))}
          ${renderKpiCard(KPI_ICONS.city, 'Unique cities', fmt(r.uniqueCities))}
          ${renderKpiCard(KPI_ICONS.globe, 'Unique countries', fmt(r.uniqueCountries))}
          ${renderKpiCard(KPI_ICONS.calendar, 'First invitation', r.firstInvitationSecondsAfterOpen != null ? `${fmt(r.firstInvitationSecondsAfterOpen)}s after 16:00` : '—')}
        </div>
        ${r.selectedCity ? `
          <article class="owner-ptw-panel">
            <h3 class="owner-ptw-panel__title">Selected destination</h3>
            <p class="owner-ptw-panel__hero">${esc(r.selectedCity)}, ${esc(r.selectedCountry)}</p>
            <p class="owner-ptw-muted">Voice #${esc(r.selectedVoiceNumber ?? '—')} · ${esc(selectionLabel(r.selectionMethod))}</p>
            <p class="owner-ptw-muted">Selected ${fmtDateTime(r.selectedAt)} · ${fmt(r.journeyDistanceKm)} km</p>
          </article>` : '<p class="owner-ptw-empty">No destination selected (empty round).</p>'}
        <article class="owner-ptw-panel">
          <h3 class="owner-ptw-panel__title">Invitations during the 60 seconds</h3>
          ${renderWindowBuckets(r.windowBuckets)}
        </article>
        <div class="owner-ptw-split">
          <article class="owner-ptw-panel">
            <h3 class="owner-ptw-panel__title">Invitations by Country</h3>
            <div class="owner-ptw-table-wrap">
              <table class="owner-ptw-table">
                <thead><tr><th>Country</th><th>Invitations</th><th>%</th><th>Cities</th></tr></thead>
                <tbody>
                  ${(r.byCountry || []).slice(0, 50).map((c) => `
                    <tr><td>${esc(c.country)}</td><td>${fmt(c.invitations)}</td><td>${pct(c.pctOfRound)}</td><td>${fmt(c.uniqueCities)}</td></tr>
                  `).join('') || '<tr><td colspan="4" class="owner-ptw-empty">No invitations.</td></tr>'}
                </tbody>
              </table>
            </div>
          </article>
          <article class="owner-ptw-panel">
            <h3 class="owner-ptw-panel__title">Invitations by City</h3>
            <div class="owner-ptw-table-wrap">
              <table class="owner-ptw-table">
                <thead><tr><th>City</th><th>Country</th><th>Invitations</th><th>Participants</th></tr></thead>
                <tbody>
                  ${(r.byCity || []).slice(0, 100).map((c) => `
                    <tr><td>${esc(c.city)}</td><td>${esc(c.country)}</td><td>${fmt(c.invitations)}</td><td>${fmt(c.uniqueParticipants)}</td></tr>
                  `).join('') || '<tr><td colspan="4" class="owner-ptw-empty">No invitations.</td></tr>'}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>`;
  }

  function paginateRows(rows, page, pageSize) {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }

  function render(state, helpers) {
    const { esc } = helpers;
    const d = state.ptwData;
    if (!d) {
      return `<section class="owner-ptw"><p class="owner-ptw-empty">Loading Pass the World analytics…</p></section>`;
    }
    if (state.ptwRoundId && d.roundDetail) {
      return renderRoundDetail(d, esc, state);
    }

    const o = d.overview || {};
    const t = d.today || {};
    const cj = d.currentJourney;
    const status = d.live?.status || 'ARRIVED';
    const activeId = activeStateId(status);
    const progressPct = cj?.progress != null ? Math.round(Number(cj.progress) * 100) : null;
    const geoTab = state.ptwGeoTab || 'countries';
    const geoRows = geoTab === 'cities'
      ? (d.byCity || []).slice(0, 8)
      : (d.byCountry || []).slice(0, 8);
    const geoMax = Math.max(1, ...geoRows.map((r) => Number(r.invitations) || 0));

    return `
      <section class="owner-ptw">
        <header class="owner-ptw-header">
          <div class="owner-ptw-header__copy">
            <p class="owner-ptw-eyebrow">Pass the World</p>
            <h2 class="owner-ptw-title">Pass the World</h2>
            <p class="owner-ptw-sub">Complete performance, engagement and history of Pass the World. <span class="owner-ptw-lock" aria-hidden="true">🔒</span> Owner Mode Only</p>
          </div>
          <div class="owner-ptw-header__actions">
            <button type="button" class="owner-ptw-btn-ghost" data-ptw-refresh aria-label="Refresh">Refresh</button>
            <div class="owner-ptw-range-select">
              ${renderRangeChips(state)}
            </div>
          </div>
        </header>

        ${d.live?.isLive ? `
          <div class="owner-ptw-live" role="status">
            <span class="owner-ptw-live__badge">${d.live.status === 'REVEAL_PENDING' ? 'SELECTING' : 'LIVE'}</span>
            <span>${esc(d.live.statusLabel)}</span>
            ${d.live.secondsRemaining != null ? `<span class="owner-ptw-live__time">${fmt(d.live.secondsRemaining)}s remaining</span>` : ''}
            <span>${fmtCompact(d.live.invitationCount)} invitations · ${fmt(d.live.uniqueCities)} cities · ${fmt(d.live.uniqueCountries)} countries</span>
          </div>` : ''}

        <div class="owner-ptw-kpi-row">
          ${renderKpiCard(KPI_ICONS.invitations, 'Total Invitations', fmtCompact(o.totalInvitations))}
          ${renderKpiCard(KPI_ICONS.users, 'Unique Participants', fmtCompact(o.uniqueParticipants))}
          ${renderKpiCard(KPI_ICONS.city, 'Cities That Have Called', fmtCompact(o.citiesThatCalled))}
          ${renderKpiCard(KPI_ICONS.globe, 'Countries That Have Called', fmtCompact(o.countriesThatCalled))}
          ${renderKpiCard(KPI_ICONS.stops, 'Journey Stops', fmt(o.journeyStops), 'Excludes starting point')}
          ${renderKpiCard(KPI_ICONS.visited, 'Countries Visited', fmt(o.countriesVisited))}
          ${renderKpiCard(KPI_ICONS.distance, 'Distance Travelled', `${fmtCompact(o.distanceTravelled)} km`)}
          ${renderKpiCard(KPI_ICONS.calendar, 'Days Active', fmt(o.daysActive), o.journeyBeganAt ? `Since ${fmtDate(o.journeyBeganAt)}` : '')}
        </div>

        <div class="owner-ptw-status-row">
          <article class="owner-ptw-panel owner-ptw-panel--today">
            <h3 class="owner-ptw-panel__title">Today</h3>
            <div class="owner-ptw-today-grid">
              <div><span class="owner-ptw-today-label">Invitations Today</span><strong>${fmtCompact(t.invitations)}</strong></div>
              <div><span class="owner-ptw-today-label">Unique Cities Calling</span><strong>${fmt(t.uniqueCities)}</strong></div>
              <div><span class="owner-ptw-today-label">Unique Countries Calling</span><strong>${fmt(t.uniqueCountries)}</strong></div>
            </div>
            <dl class="owner-ptw-meta-list">
              <div><dt>Current Location</dt><dd>${esc(t.currentCity || '—')}, ${esc(t.currentCountry || '—')}</dd></div>
              <div><dt>Next Destination</dt><dd>${t.nextDestination ? `${esc(t.nextDestination)}, ${esc(t.nextDestinationCountry || '')}` : '—'}</dd></div>
              <div><dt>Called By</dt><dd>${t.calledByVoice != null ? `Voice #${esc(t.calledByVoice)} · ${esc(t.calledByCity || '—')}, ${esc(t.calledByCountry || '—')}` : '—'}</dd></div>
            </dl>
          </article>

          <article class="owner-ptw-panel owner-ptw-panel--status">
            <h3 class="owner-ptw-panel__title">Current Pass the World Status</h3>
            <div class="owner-ptw-status-main">
              <span class="owner-ptw-status-icon">${KPI_ICONS.distance}</span>
              <div>
                <p class="owner-ptw-status-label">${esc(d.live?.statusLabel || d.currentStatus?.headline || '—')}</p>
                ${cj ? `
                  <p class="owner-ptw-route">${esc(cj.originCity)}, ${esc(cj.originCountry)} → ${esc(cj.destinationCity)}, ${esc(cj.destinationCountry)}</p>
                  <p class="owner-ptw-muted">Departure ${fmtDateTime(cj.departureAt)}</p>
                  <p class="owner-ptw-muted">Arrival ${fmtDateTime(cj.arrivalAt)} · ${fmt(cj.distanceKm)} km · Voice #${esc(cj.voiceNumber ?? '—')}</p>
                  ${progressPct != null ? `
                    <div class="owner-ptw-progress" aria-label="Journey progress ${progressPct}%">
                      <span class="owner-ptw-progress__bar" style="width:${progressPct}%"></span>
                    </div>
                    <p class="owner-ptw-progress__label">${fmt(cj.travelledKm)} / ${fmt(cj.distanceKm)} km · ${progressPct}%</p>` : ''}
                ` : d.currentStatus?.waitingFirstCall ? `
                  <p class="owner-ptw-muted">Waiting for first invitation${d.currentStatus.waitingSince ? ` since ${fmtDateTime(d.currentStatus.waitingSince)}` : ''}.</p>
                ` : d.live?.invitationOpen ? `
                  <p class="owner-ptw-muted">${fmtCompact(d.live.invitationCount)} invitations · ${fmt(d.live.uniqueCities)} cities · ${fmt(d.live.uniqueCountries)} countries</p>
                ` : `
                  <p class="owner-ptw-muted">${esc(t.currentCity || '—')}, ${esc(t.currentCountry || '—')}</p>
                `}
              </div>
            </div>
          </article>

          <article class="owner-ptw-panel owner-ptw-panel--states">
            <h3 class="owner-ptw-panel__title">Possible States</h3>
            <ul class="owner-ptw-states">
              ${POSSIBLE_STATES.map((s) => `
                <li class="owner-ptw-states__item ${activeId === s.id ? 'is-active' : ''}">
                  <span>${esc(s.label)}</span>
                  ${s.live && activeId === s.id ? '<span class="owner-ptw-states__live">LIVE</span>' : ''}
                </li>
              `).join('')}
            </ul>
          </article>
        </div>

        <div class="owner-ptw-chart-row">
          <article class="owner-ptw-panel">
            <div class="owner-ptw-panel__head">
              <h3 class="owner-ptw-panel__title">Invitations Over Time</h3>
              <div class="owner-ptw-panel__chips">${renderRangeChips(state, 'ptw-chart-range')}</div>
            </div>
            ${renderLineChart(d.charts?.invitationsOverTime, 'invitations', 'Invitations over time')}
          </article>
          <article class="owner-ptw-panel">
            <div class="owner-ptw-panel__head">
              <h3 class="owner-ptw-panel__title">Participation Rate</h3>
            </div>
            ${renderLineChart(d.charts?.participationRateOverTime, 'rate', 'Participation rate over time')}
          </article>
          <article class="owner-ptw-panel">
            <div class="owner-ptw-panel__head">
              <h3 class="owner-ptw-panel__title">Unique Participants Over Time</h3>
            </div>
            ${renderLineChart(d.charts?.uniqueParticipantsOverTime, 'participants', 'Unique participants over time')}
          </article>
          <article class="owner-ptw-panel">
            <div class="owner-ptw-panel__head">
              <h3 class="owner-ptw-panel__title">Geography Breakdown</h3>
              <div class="owner-ptw-panel__chips">
                <button type="button" class="owner-ptw-chip ${geoTab === 'countries' ? 'is-active' : ''}" data-ptw-geo="countries">Countries</button>
                <button type="button" class="owner-ptw-chip ${geoTab === 'cities' ? 'is-active' : ''}" data-ptw-geo="cities">Cities</button>
              </div>
            </div>
            <ul class="owner-ptw-geo-list">
              ${geoRows.length ? geoRows.map((row) => {
                const val = Number(row.invitations) || 0;
                const width = Math.max(4, Math.round((val / geoMax) * 100));
                const name = geoTab === 'cities' ? `${row.city}, ${row.country}` : (row.country || row.countryCode);
                const share = row.pctOfAll != null ? pct(row.pctOfAll) : '';
                return `
                  <li class="owner-ptw-geo-item">
                    <span class="owner-ptw-geo-item__name">${esc(name)}</span>
                    <span class="owner-ptw-geo-item__bar"><span style="width:${width}%"></span></span>
                    <span class="owner-ptw-geo-item__val">${share || fmtCompact(val)}</span>
                  </li>`;
              }).join('') : '<li class="owner-ptw-empty">No geography data yet.</li>'}
            </ul>
          </article>
        </div>

        <div class="owner-ptw-insight-row">
          <article class="owner-ptw-panel">
            <h3 class="owner-ptw-panel__title">Top Inviting Cities</h3>
            <ol class="owner-ptw-rank-list">
              ${(d.byCity || []).slice(0, 5).map((c, i) => `
                <li>
                  <span class="owner-ptw-rank">${i + 1}</span>
                  <span class="owner-ptw-rank__name">${esc(c.city)}, ${esc(c.country)}</span>
                  <span class="owner-ptw-rank__val">${fmtCompact(c.invitations)} calls</span>
                </li>
              `).join('') || '<li class="owner-ptw-empty">No city data yet.</li>'}
            </ol>
          </article>

          <article class="owner-ptw-panel">
            <h3 class="owner-ptw-panel__title">Journey History</h3>
            <div class="owner-ptw-table-wrap owner-ptw-table-wrap--compact">
              <table class="owner-ptw-table">
                <thead><tr><th>From</th><th>To</th><th>Date</th><th>Distance</th></tr></thead>
                <tbody>
                  ${(d.journeyHistory || []).filter((e) => !e.isSeed).slice(-6).reverse().map((e) => `
                    <tr>
                      <td>${e.originCity ? esc(e.originCity) : '—'}</td>
                      <td>${esc(e.city)}</td>
                      <td>${fmtDate(e.date)}</td>
                      <td>${e.distanceKm != null ? `${fmt(e.distanceKm)} km` : '—'}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="4" class="owner-ptw-empty">The journey has not begun.</td></tr>'}
                </tbody>
              </table>
            </div>
          </article>

          <article class="owner-ptw-panel">
            <h3 class="owner-ptw-panel__title">Invitation Outcomes</h3>
            ${renderDonut(d.invitationOutcomes)}
          </article>

          <article class="owner-ptw-panel">
            <h3 class="owner-ptw-panel__title">Wait Time Analytics</h3>
            <dl class="owner-ptw-wait-list">
              <div><dt>Average time to first invitation</dt><dd>${d.waitTime?.averageTimeToFirstInvitation != null ? `${fmt(d.waitTime.averageTimeToFirstInvitation)}s after 16:00` : '—'}</dd></div>
              <div><dt>Median time to first invitation</dt><dd>${d.waitTime?.medianTimeToFirstInvitation != null ? `${fmt(d.waitTime.medianTimeToFirstInvitation)}s` : '—'}</dd></div>
              <div><dt>Average time to destination</dt><dd>${d.waitTime?.averageTimeToDestination != null ? `${fmt(d.waitTime.averageTimeToDestination)}s` : '—'}</dd></div>
              <div><dt>Current wait time</dt><dd>${d.waitTime?.currentWaitSeconds != null ? fmtDuration(d.waitTime.currentWaitSeconds) : '—'}</dd></div>
            </dl>
          </article>
        </div>

        <div class="owner-ptw-deep">
          <div class="owner-ptw-deep__head">
            <h3 class="owner-ptw-section-title">Detailed Analytics</h3>
            <div class="owner-ptw-deep__actions">
              <button type="button" class="owner-ptw-btn-ghost" data-ptw-export="rounds">Export Rounds</button>
              <button type="button" class="owner-ptw-btn-ghost" data-ptw-export="journey">Export Journey</button>
              <button type="button" class="owner-ptw-btn-ghost" data-ptw-export="countries">Export Countries</button>
              <button type="button" class="owner-ptw-btn-ghost" data-ptw-export="cities">Export Cities</button>
            </div>
          </div>

          <article class="owner-ptw-panel">
            <h4 class="owner-ptw-panel__title">World Participation Map</h4>
            <div class="owner-ptw-panel__chips" style="margin-bottom:10px">
              <button type="button" class="owner-ptw-chip ${state.ptwMapMode === 'invitations' ? 'is-active' : ''}" data-ptw-map-mode="invitations">Invitations</button>
              <button type="button" class="owner-ptw-chip ${state.ptwMapMode === 'journey' ? 'is-active' : ''}" data-ptw-map-mode="journey">Official Journey</button>
            </div>
            <div id="owner-ptw-map" class="owner-ptw-map" role="img" aria-label="Pass the World participation map"></div>
          </article>

          <div class="owner-ptw-split">
            <article class="owner-ptw-panel">
              <h4 class="owner-ptw-panel__title">New vs Returning</h4>
              <div class="owner-ptw-mini-metrics">
                <div><span>First-time callers</span><strong>${fmt(d.newVsReturning?.firstTime)}</strong></div>
                <div><span>Returning callers</span><strong>${fmt(d.newVsReturning?.returning)}</strong></div>
              </div>
            </article>
            <article class="owner-ptw-panel">
              <h4 class="owner-ptw-panel__title">Unique Participants</h4>
              <div class="owner-ptw-mini-metrics">
                <div><span>Today</span><strong>${fmt(d.uniqueParticipants?.today)}</strong></div>
                <div><span>7 days</span><strong>${fmt(d.uniqueParticipants?.d7)}</strong></div>
                <div><span>30 days</span><strong>${fmt(d.uniqueParticipants?.d30)}</strong></div>
                <div><span>Lifetime</span><strong>${fmt(d.uniqueParticipants?.lifetime)}</strong></div>
              </div>
            </article>
            <article class="owner-ptw-panel">
              <h4 class="owner-ptw-panel__title">Retention</h4>
              <div class="owner-ptw-mini-metrics">
                <div><span>1 day</span><strong>${fmt(d.retention?.participated1Day)}</strong></div>
                <div><span>2+ days</span><strong>${fmt(d.retention?.participated2Plus)}</strong></div>
                <div><span>5+ days</span><strong>${fmt(d.retention?.participated5Plus)}</strong></div>
                <div><span>10+ days</span><strong>${fmt(d.retention?.participated10Plus)}</strong></div>
              </div>
            </article>
            <article class="owner-ptw-panel">
              <h4 class="owner-ptw-panel__title">System Health</h4>
              <p class="owner-ptw-panel__hero ${d.health?.healthy ? 'is-ok' : 'is-warn'}">${d.health?.healthy ? 'All systems healthy' : `${fmt(d.health?.issueCount)} issue(s) detected`}</p>
            </article>
          </div>

          <article class="owner-ptw-panel">
            <h4 class="owner-ptw-panel__title">Invitation Rounds</h4>
            <div class="owner-ptw-table-wrap">
              <table class="owner-ptw-table owner-ptw-table--clickable">
                <thead>
                  <tr><th>Date</th><th>From</th><th>Invitations</th><th>Cities</th><th>Countries</th><th>Destination</th><th>Voice</th><th>Method</th><th>Distance</th></tr>
                </thead>
                <tbody>
                  ${(d.rounds || []).map((r) => `
                    <tr data-ptw-round="${esc(r.roundId)}" tabindex="0" role="button">
                      <td>${fmtDate(r.date)}</td>
                      <td>${esc(r.startingCity)}, ${esc(r.startingCountry)}</td>
                      <td>${fmt(r.invitationCount)}</td>
                      <td>${fmt(r.uniqueCities)}</td>
                      <td>${fmt(r.uniqueCountries)}</td>
                      <td>${r.selectedCity ? `${esc(r.selectedCity)}, ${esc(r.selectedCountry)}` : (r.wasEmpty ? 'Empty' : '—')}</td>
                      <td>${r.selectedVoiceNumber != null ? `#${esc(r.selectedVoiceNumber)}` : '—'}</td>
                      <td>${esc(selectionLabel(r.selectionMethod))}</td>
                      <td>${r.journeyDistanceKm != null ? `${fmt(r.journeyDistanceKm)} km` : '—'}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="9" class="owner-ptw-empty">No invitation rounds recorded yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </article>

          <article class="owner-ptw-panel">
            <h4 class="owner-ptw-panel__title">Invitations by City</h4>
            <input class="owner-ptw-input" type="search" placeholder="Search city…" value="${esc(state.ptwCityQuery || '')}" data-ptw-city-search>
            <div class="owner-ptw-table-wrap">
              <table class="owner-ptw-table">
                <thead><tr><th>City</th><th>Country</th><th>Invitations</th><th>Participants</th><th>Days</th><th>Visited</th></tr></thead>
                <tbody>
                  ${paginateRows(
                    (d.byCity || []).filter((c) => {
                      const q = String(state.ptwCityQuery || '').toLowerCase();
                      return !q || `${c.city} ${c.country}`.toLowerCase().includes(q);
                    }),
                    state.ptwCityPage || 1,
                    50
                  ).map((c) => `
                    <tr>
                      <td>${esc(c.city)}</td><td>${esc(c.country)}</td><td>${fmt(c.invitations)}</td>
                      <td>${fmt(c.uniqueParticipants)}</td><td>${fmt(c.daysCalled)}</td><td>${c.visitedByJourney ? 'Yes' : '—'}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="6" class="owner-ptw-empty">No city data yet.</td></tr>'}
                </tbody>
              </table>
            </div>
            <div class="owner-ptw-pager">
              <button type="button" class="owner-ptw-btn-ghost" data-ptw-city-page="prev" ${(state.ptwCityPage || 1) <= 1 ? 'disabled' : ''}>Previous</button>
              <span class="owner-ptw-muted">Page ${state.ptwCityPage || 1}</span>
              <button type="button" class="owner-ptw-btn-ghost" data-ptw-city-page="next">Next</button>
            </div>
          </article>
        </div>

        <footer class="owner-ptw-footer">
          All times in UTC · Historical data stored permanently for long-term ownership continuity.
        </footer>
      </section>`;
  }

  function mountMap(data, mode = 'invitations') {
    if (typeof L === 'undefined' || typeof OwnerMap === 'undefined') return;
    const points = mode === 'journey' ? (data?.map?.journey || []) : (data?.map?.invitations || []);
    const cities = points.map((p) => ({
      city: p.city,
      country: p.country,
      latitude: p.latitude,
      longitude: p.longitude,
      count: p.count || 1,
    }));
    OwnerMap.mount('owner-ptw-map', cities);
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function schedulePoll(state, loadFn) {
    stopPolling();
    if (!state.ptwData?.live?.isLive || state.section !== 'pass-the-world') return;
    pollTimer = setTimeout(() => loadFn(true), 2000);
  }

  function bind(root, state, helpers, { onRender, loadData }) {
    stopPolling();

    const bindRange = (attr, reload = true) => {
      root.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
        btn.addEventListener('click', async () => {
          state.ptwRange = btn.getAttribute(`data-${attr}`);
          if (reload) await loadData();
          else onRender();
        });
      });
    };

    bindRange('ptw-range');
    bindRange('ptw-chart-range');

    root.querySelector('[data-ptw-back-rounds]')?.addEventListener('click', () => {
      state.ptwRoundId = null;
      onRender();
    });

    root.querySelectorAll('[data-ptw-geo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.ptwGeoTab = btn.getAttribute('data-ptw-geo');
        onRender();
      });
    });

    root.querySelectorAll('[data-ptw-map-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.ptwMapMode = btn.getAttribute('data-ptw-map-mode');
        mountMap(state.ptwData, state.ptwMapMode);
      });
    });

    root.querySelector('[data-ptw-refresh]')?.addEventListener('click', () => loadData());

    root.querySelectorAll('[data-ptw-export]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-ptw-export');
        window.open(`/api/admin?action=pass-the-world-export&kind=${encodeURIComponent(kind)}&range=${encodeURIComponent(state.ptwRange || 'all')}`, '_blank');
      });
    });

    root.querySelector('[data-ptw-city-search]')?.addEventListener('input', (e) => {
      state.ptwCityQuery = e.target.value;
      state.ptwCityPage = 1;
      onRender();
    });

    root.querySelector('[data-ptw-city-page="prev"]')?.addEventListener('click', () => {
      state.ptwCityPage = Math.max(1, (state.ptwCityPage || 1) - 1);
      onRender();
    });
    root.querySelector('[data-ptw-city-page="next"]')?.addEventListener('click', () => {
      state.ptwCityPage = (state.ptwCityPage || 1) + 1;
      onRender();
    });

    root.querySelectorAll('[data-ptw-round]').forEach((row) => {
      const open = async () => {
        state.ptwRoundId = row.getAttribute('data-ptw-round');
        await loadData();
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });

    if (state.ptwData && !state.ptwRoundId) {
      requestAnimationFrame(() => mountMap(state.ptwData, state.ptwMapMode || 'invitations'));
    }

    schedulePoll(state, loadData);
  }

  return { render, bind, stopPolling };
})();
