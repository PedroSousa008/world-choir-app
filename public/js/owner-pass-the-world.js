/**
 * Owner Mode — Pass the World analytics & history
 */
const OwnerPassTheWorld = (() => {
  const RANGES = [
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: '1y', label: '1Y' },
    { id: 'all', label: 'ALL' },
  ];

  let pollTimer = null;
  let mapInstance = null;

  function fmt(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-US');
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
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
      }) + ' UTC';
    } catch { return '—'; }
  }

  function selectionLabel(method) {
    if (method === 'window') return 'Random 60-second selection';
    if (method === 'first_call') return 'First invitation after empty window';
    return '—';
  }

  function renderSpark(series, key = 'invitations', label = 'Invitations') {
    if (!series?.length) return '<p class="owner-muted">No data yet.</p>';
    const max = Math.max(1, ...series.map((d) => Number(d[key] ?? d.value ?? 0)));
    return `
      <div class="owner-chart owner-ptw-chart" role="img" aria-label="${label} over time">
        ${series.map((d) => {
          const val = Number(d[key] ?? d.value ?? 0);
          const h = Math.max(4, Math.round((val / max) * 100));
          return `<span class="owner-chart__bar" style="height:${h}%" title="${d.date}: ${val}"></span>`;
        }).join('')}
      </div>`;
  }

  function renderWindowBuckets(buckets) {
    if (!buckets?.length) return '<p class="owner-muted">No second-by-second data yet.</p>';
    const max = Math.max(1, ...buckets);
    return `
      <div class="owner-chart owner-ptw-window" role="img" aria-label="Invitations during 60 seconds">
        ${buckets.map((val, i) => {
          const h = Math.max(2, Math.round((val / max) * 100));
          return `<span class="owner-chart__bar" style="height:${h}%" title="${i}s: ${val}"></span>`;
        }).join('')}
      </div>
      <p class="owner-muted owner-ptw-window-label">0s → 60s</p>`;
  }

  function renderMetricsGrid(items) {
    return `
      <div class="owner-groups owner-ptw-metrics">
        ${items.map(([label, value, sub]) => `
          <div class="owner-group">
            <p class="owner-group__title">${label}</p>
            <p class="owner-metric__value">${value}</p>
            ${sub ? `<p class="owner-muted">${sub}</p>` : ''}
          </div>
        `).join('')}
      </div>`;
  }

  function renderLiveBanner(d, esc) {
    if (!d?.live?.isLive) return '';
    const live = d.live;
    const label = live.status === 'REVEAL_PENDING'
      ? 'SELECTING NEXT DESTINATION'
      : 'LIVE';
    return `
      <div class="owner-ptw-live" role="status">
        <span class="owner-ptw-live__badge">${esc(label)}</span>
        <span>${esc(live.statusLabel)}</span>
        ${live.secondsRemaining != null ? `<span class="owner-ptw-live__time">${fmt(live.secondsRemaining)}s remaining</span>` : ''}
        <span>${fmt(live.invitationCount)} invitations · ${fmt(live.uniqueCities)} cities · ${fmt(live.uniqueCountries)} countries</span>
      </div>`;
  }

  function renderCurrentStatus(d, esc) {
    const cj = d.currentJourney;
    const cs = d.currentStatus || {};
    let body = '';
    if (cj) {
      body = `
        <p class="owner-ptw-route">${esc(cj.originCity)}, ${esc(cj.originCountry)} → ${esc(cj.destinationCity)}, ${esc(cj.destinationCountry)}</p>
        <p class="owner-muted">Departure ${fmtDateTime(cj.departureAt)} · Arrival ${fmtDateTime(cj.arrivalAt)}</p>
        <p class="owner-muted">${fmt(cj.travelledKm)} / ${fmt(cj.distanceKm)} km · Called by Voice #${esc(cj.voiceNumber ?? '—')}</p>`;
    } else if (cs.waitingFirstCall) {
      body = `<p class="owner-muted">Waiting for first invitation${cs.waitingSince ? ` since ${fmtDateTime(cs.waitingSince)}` : ''}.</p>`;
    } else if (d.live?.invitationOpen) {
      body = `<p class="owner-muted">${fmt(d.live.invitationCount)} invitations so far · ${fmt(d.live.uniqueCities)} cities · ${fmt(d.live.uniqueCountries)} countries</p>`;
    } else {
      body = `<p class="owner-muted">${esc(cs.headline || 'Pass the World status')}</p>`;
    }
    return `
      <div class="owner-group owner-ptw-status">
        <p class="owner-group__title">Current Status</p>
        <p class="owner-ptw-status__headline">${esc(d.live?.statusLabel || cs.headline || '—')}</p>
        ${body}
      </div>`;
  }

  function renderRoundDetail(d, esc) {
    const r = d.roundDetail;
    if (!r) return '';
    return `
      <section class="owner-section owner-ptw-round-detail">
        <button type="button" class="owner-btn-ghost" data-ptw-back-rounds>← Invitation Rounds</button>
        <p class="owner-section__label">${fmtDate(r.date)}</p>
        <h2 class="owner-h1">Invitation Round</h2>
        <p class="owner-sub">World started in ${esc(r.startingCity)}, ${esc(r.startingCountry)}</p>
        ${renderMetricsGrid([
          ['Total invitations', fmt(r.invitationCount)],
          ['Unique cities', fmt(r.uniqueCities)],
          ['Unique countries', fmt(r.uniqueCountries)],
          ['First invitation', r.firstInvitationSecondsAfterOpen != null ? `${fmt(r.firstInvitationSecondsAfterOpen)}s after 16:00` : '—'],
        ])}
        ${r.selectedCity ? `
          <div class="owner-group">
            <p class="owner-group__title">Selected destination</p>
            <p class="owner-metric__value">${esc(r.selectedCity)}, ${esc(r.selectedCountry)}</p>
            <p class="owner-muted">Voice #${esc(r.selectedVoiceNumber ?? '—')} · ${esc(selectionLabel(r.selectionMethod))}</p>
            <p class="owner-muted">Selected ${fmtDateTime(r.selectedAt)} · ${fmt(r.journeyDistanceKm)} km</p>
          </div>` : '<p class="owner-muted">No destination selected (empty round).</p>'}
        <h3 class="owner-h2">Invitations during the 60 seconds</h3>
        ${renderWindowBuckets(r.windowBuckets)}
        <h3 class="owner-h2">Invitations by Country</h3>
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead><tr><th>Country</th><th>Invitations</th><th>%</th><th>Cities</th></tr></thead>
            <tbody>
              ${(r.byCountry || []).slice(0, 50).map((c) => `
                <tr>
                  <td>${esc(c.country)}</td>
                  <td>${fmt(c.invitations)}</td>
                  <td>${pct(c.pctOfRound)}</td>
                  <td>${fmt(c.uniqueCities)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="owner-muted">No invitations.</td></tr>'}
            </tbody>
          </table>
        </div>
        <h3 class="owner-h2">Invitations by City</h3>
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead><tr><th>City</th><th>Country</th><th>Invitations</th><th>Participants</th></tr></thead>
            <tbody>
              ${(r.byCity || []).slice(0, 100).map((c) => `
                <tr>
                  <td>${esc(c.city)}</td>
                  <td>${esc(c.country)}</td>
                  <td>${fmt(c.invitations)}</td>
                  <td>${fmt(c.uniqueParticipants)}</td>
                </tr>`).join('') || '<tr><td colspan="4" class="owner-muted">No invitations.</td></tr>'}
            </tbody>
          </table>
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
      return `<section class="owner-section"><p class="owner-muted">Loading Pass the World analytics…</p></section>`;
    }

    if (state.ptwRoundId && d.roundDetail) {
      return renderRoundDetail(d, esc);
    }

    const o = d.overview || {};
    const t = d.today || {};
    const cj = d.currentJourney;

    return `
      ${renderLiveBanner(d, esc)}

      <section class="owner-section owner-ptw">
        <p class="owner-section__label">Pass the World</p>
        <h2 class="owner-h1">Pass the World</h2>
        <p class="owner-sub">Analytics and permanent history for the global journey — Owner Mode only.</p>

        <div class="owner-ptw-top">
          ${renderCurrentStatus(d, esc)}
          ${cj ? `
            <div class="owner-group owner-ptw-journey-compact">
              <p class="owner-group__title">Current Journey</p>
              <p class="owner-ptw-route">${esc(cj.originCity)}, ${esc(cj.originCountry)} → ${esc(cj.destinationCity)}, ${esc(cj.destinationCountry)}</p>
              <p class="owner-muted">Voice #${esc(cj.voiceNumber ?? '—')} · ${fmt(cj.distanceKm)} km</p>
              <p class="owner-muted">${fmt(cj.travelledKm)} km travelled · Arrives ${fmtDateTime(cj.arrivalAt)}</p>
            </div>` : ''}
        </div>

        <h3 class="owner-h2">Lifetime Overview</h3>
        ${renderMetricsGrid([
          ['Total Invitations', fmt(o.totalInvitations)],
          ['Unique Participants', fmt(o.uniqueParticipants)],
          ['Cities That Have Called', fmt(o.citiesThatCalled)],
          ['Countries That Have Called', fmt(o.countriesThatCalled)],
          ['Journey Stops', fmt(o.journeyStops)],
          ['Countries Visited', fmt(o.countriesVisited)],
          ['Distance Travelled', `${fmt(o.distanceTravelled)} km`],
          ['Days Active', fmt(o.daysActive)],
        ])}

        <h3 class="owner-h2">Today</h3>
        ${renderMetricsGrid([
          ['Invitations Today', fmt(t.invitations)],
          ['Participation Rate Today', pct(t.participationRate)],
          ['Unique Cities Calling', fmt(t.uniqueCities)],
          ['Unique Countries Calling', fmt(t.uniqueCountries)],
          ['Current Location', `${esc(t.currentCity || '—')}, ${esc(t.currentCountry || '—')}`],
          ['Next Destination', t.nextDestination ? `${esc(t.nextDestination)}, ${esc(t.nextDestinationCountry || '')}` : esc(d.currentStatus?.headline || '—')],
        ])}

        <div class="owner-ptw-toolbar">
          <div class="owner-chips">
            ${RANGES.map((r) => `
              <button type="button" class="owner-chip ${state.ptwRange === r.id ? 'is-active' : ''}" data-ptw-range="${r.id}">${r.label}</button>
            `).join('')}
          </div>
          <div class="owner-ptw-toolbar__actions">
            <button type="button" class="owner-btn-ghost" data-ptw-export="rounds">Export Rounds</button>
            <button type="button" class="owner-btn-ghost" data-ptw-export="journey">Export Journey</button>
            <button type="button" class="owner-btn-ghost" data-ptw-refresh>Refresh</button>
          </div>
        </div>

        <h3 class="owner-h2">Invitations Over Time</h3>
        ${renderSpark(d.charts?.invitationsOverTime, 'invitations', 'Invitations over time')}

        <h3 class="owner-h2">Participation Rate</h3>
        <p class="owner-muted">Eligible users who invited during each round — separates growth from engagement.</p>
        ${renderSpark(d.charts?.participationRateOverTime, 'rate', 'Participation rate')}

        <h3 class="owner-h2">Unique Participants</h3>
        ${renderMetricsGrid([
          ['Today', fmt(d.uniqueParticipants?.today)],
          ['7 Days', fmt(d.uniqueParticipants?.d7)],
          ['30 Days', fmt(d.uniqueParticipants?.d30)],
          ['Lifetime', fmt(d.uniqueParticipants?.lifetime)],
        ])}

        <h3 class="owner-h2">New vs Returning</h3>
        ${renderMetricsGrid([
          ['First-time callers', fmt(d.newVsReturning?.firstTime)],
          ['Returning callers', fmt(d.newVsReturning?.returning)],
        ])}

        <h3 class="owner-h2">World Participation Map</h3>
        <div class="owner-chips" style="margin-bottom:10px">
          <button type="button" class="owner-chip ${state.ptwMapMode === 'invitations' ? 'is-active' : ''}" data-ptw-map-mode="invitations">Invitations</button>
          <button type="button" class="owner-chip ${state.ptwMapMode === 'journey' ? 'is-active' : ''}" data-ptw-map-mode="journey">Official Journey</button>
        </div>
        <div id="owner-ptw-map" class="owner-ptw-map" role="img" aria-label="Pass the World participation map"></div>

        <h3 class="owner-h2">Invitations by Country</h3>
        <input class="owner-input" type="search" placeholder="Search country…" value="${esc(state.ptwCountryQuery || '')}" data-ptw-country-search style="margin-bottom:10px">
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead><tr><th>Country</th><th>Invitations</th><th>Participants</th><th>% of all</th><th>Participation rate</th></tr></thead>
            <tbody>
              ${(d.byCountry || [])
                .filter((c) => !state.ptwCountryQuery || String(c.countryCode || c.country || '').toLowerCase().includes(state.ptwCountryQuery.toLowerCase()))
                .slice(0, 100)
                .map((c) => `
                <tr>
                  <td>${esc(c.country || c.countryCode)}</td>
                  <td>${fmt(c.invitations)}</td>
                  <td>${fmt(c.uniqueParticipants)}</td>
                  <td>${pct(c.pctOfAll)}</td>
                  <td>${c.participationRate != null ? pct(c.participationRate) : '—'}</td>
                </tr>`).join('') || '<tr><td colspan="5" class="owner-muted">No country data yet.</td></tr>'}
            </tbody>
          </table>
        </div>

        <h3 class="owner-h2">Invitations by City</h3>
        <input class="owner-input" type="search" placeholder="Search city…" value="${esc(state.ptwCityQuery || '')}" data-ptw-city-search style="margin-bottom:10px">
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead><tr><th>City</th><th>Country</th><th>Invitations</th><th>Participants</th><th>Days called</th><th>Visited</th></tr></thead>
            <tbody>
              ${paginateRows(
                (d.byCity || []).filter((c) => {
                  const q = String(state.ptwCityQuery || '').toLowerCase();
                  if (!q) return true;
                  return `${c.city} ${c.country}`.toLowerCase().includes(q);
                }),
                state.ptwCityPage || 1,
                50
              ).map((c) => `
                <tr>
                  <td>${esc(c.city)}</td>
                  <td>${esc(c.country)}</td>
                  <td>${fmt(c.invitations)}</td>
                  <td>${fmt(c.uniqueParticipants)}</td>
                  <td>${fmt(c.daysCalled)}</td>
                  <td>${c.visitedByJourney ? 'Yes' : '—'}</td>
                </tr>`).join('') || '<tr><td colspan="6" class="owner-muted">No city data yet.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="owner-ptw-pager">
          <button type="button" class="owner-btn-ghost" data-ptw-city-page="prev" ${(state.ptwCityPage || 1) <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="owner-muted">Page ${state.ptwCityPage || 1}</span>
          <button type="button" class="owner-btn-ghost" data-ptw-city-page="next">Next</button>
        </div>

        <h3 class="owner-h2">Invitation Rounds</h3>
        <div class="owner-table-wrap">
          <table class="owner-table owner-table--clickable">
            <thead>
              <tr>
                <th>Date</th><th>From</th><th>Invitations</th><th>Cities</th><th>Countries</th>
                <th>Destination</th><th>Voice</th><th>Method</th><th>Distance</th>
              </tr>
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
                </tr>`).join('') || '<tr><td colspan="9" class="owner-muted">No invitation rounds recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>

        <h3 class="owner-h2">Journey History</h3>
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead>
              <tr><th>Day</th><th>Date</th><th>Origin</th><th>Destination</th><th>Voice</th><th>Distance</th><th>Departed</th><th>Arrived</th></tr>
            </thead>
            <tbody>
              ${(d.journeyHistory || []).map((e) => `
                <tr>
                  <td>${esc(e.sequence)}</td>
                  <td>${fmtDate(e.date)}</td>
                  <td>${e.originCity ? `${esc(e.originCity)}, ${esc(e.originCountry)}` : '—'}</td>
                  <td>${esc(e.city)}, ${esc(e.country)}</td>
                  <td>${e.voiceNumber != null ? `#${esc(e.voiceNumber)}` : '—'}</td>
                  <td>${e.distanceKm != null ? `${fmt(e.distanceKm)} km` : '—'}</td>
                  <td>${fmtDateTime(e.departedAt)}</td>
                  <td>${fmtDateTime(e.arrivedAt)}</td>
                </tr>`).join('') || '<tr><td colspan="8" class="owner-muted">The journey has not begun.</td></tr>'}
            </tbody>
          </table>
        </div>

        <h3 class="owner-h2">Journey Totals</h3>
        ${renderMetricsGrid([
          ['Total Distance', `${fmt(d.journeyTotals?.totalDistance)} km`],
          ['Total Cities', fmt(d.journeyTotals?.totalCities)],
          ['Unique Countries', fmt(d.journeyTotals?.uniqueCountries)],
          ['Journey Legs', fmt(d.journeyTotals?.totalLegs)],
          ['People Who Changed the Journey', fmt(d.journeyTotals?.peopleWhoChangedPath)],
          ['Average Distance', `${fmt(d.journeyTotals?.avgDistance)} km`],
          ['Longest Journey', `${fmt(d.journeyTotals?.longestDistance)} km`],
          ['Shortest Journey', `${fmt(d.journeyTotals?.shortestDistance)} km`],
        ])}

        <h3 class="owner-h2">Pass the World Retention</h3>
        ${renderMetricsGrid([
          ['Participated 1 day', fmt(d.retention?.participated1Day)],
          ['Participated 2+ days', fmt(d.retention?.participated2Plus)],
          ['Participated 5+ days', fmt(d.retention?.participated5Plus)],
          ['Participated 10+ days', fmt(d.retention?.participated10Plus)],
          ['Participated 30+ days', fmt(d.retention?.participated30Plus)],
          ['Avg invitation days / user', fmt(d.retention?.avgInvitationDaysPerUser)],
        ])}

        <h3 class="owner-h2">Empty Invitation Rounds</h3>
        ${renderMetricsGrid([
          ['Lifetime empty rounds', fmt(d.emptyRounds?.count)],
          ['Percentage of all rounds', pct(d.emptyRounds?.pct)],
          ['Most recent', fmtDate(d.emptyRounds?.mostRecent)],
        ])}

        <h3 class="owner-h2">Timing</h3>
        ${renderMetricsGrid([
          ['Time to first invitation (avg)', d.timing?.timeToFirstInvitation?.average != null ? `${fmt(d.timing.timeToFirstInvitation.average)}s` : '—'],
          ['Time to first invitation (median)', d.timing?.timeToFirstInvitation?.median != null ? `${fmt(d.timing.timeToFirstInvitation.median)}s` : '—'],
          ['Time to destination (avg)', d.timing?.timeToDestination?.average != null ? `${fmt(d.timing.timeToDestination.average)}s` : '—'],
        ])}

        <h3 class="owner-h2">System Health</h3>
        <div class="owner-group">
          <p class="owner-group__title">${d.health?.healthy ? 'All systems healthy' : `${fmt(d.health?.issueCount)} issue(s) detected`}</p>
          ${!d.health?.healthy && d.health?.issues?.length ? `
            <ul class="owner-ptw-health-list">
              ${d.health.issues.map((i) => `<li>${esc(i.type)}${i.roundId ? ` · ${esc(i.roundId)}` : ''}</li>`).join('')}
            </ul>` : '<p class="owner-muted">Invitation records, coordinates, and journey entries look complete.</p>'}
        </div>
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
    mapInstance = true;
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function schedulePoll(state, loadFn) {
    stopPolling();
    const live = state.ptwData?.live?.isLive;
    if (!live || state.section !== 'pass-the-world') return;
    pollTimer = setTimeout(async () => {
      await loadFn(true);
    }, 2000);
  }

  function bind(root, state, helpers, { api, onRender, loadData }) {
    stopPolling();

    root.querySelector('[data-ptw-back-rounds]')?.addEventListener('click', () => {
      state.ptwRoundId = null;
      onRender();
    });

    root.querySelectorAll('[data-ptw-range]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.ptwRange = btn.getAttribute('data-ptw-range');
        await loadData();
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

    root.querySelector('[data-ptw-country-search]')?.addEventListener('input', (e) => {
      state.ptwCountryQuery = e.target.value;
      onRender();
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
      requestAnimationFrame(() => {
        mountMap(state.ptwData, state.ptwMapMode || 'invitations');
      });
    }

    schedulePoll(state, loadData);
  }

  return {
    render,
    bind,
    stopPolling,
  };
})();
