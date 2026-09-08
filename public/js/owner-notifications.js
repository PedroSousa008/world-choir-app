/**
 * Owner Control Center — Notifications command center.
 * Visual language matches Pass the World / Sponsor Analytics (owner-ptw / sa-*).
 */
const OwnerNotifications = (() => {
  const RANGES = [
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: '1y', label: '1Y' },
    { id: 'all', label: 'ALL' },
  ];

  const LIST_STATUS = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Drafts' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'sent', label: 'Sent' },
    { id: 'automated', label: 'Automated' },
    { id: 'archived', label: 'Archived' },
    { id: 'failed', label: 'Failed' },
  ];

  const ICONS = {
    sent: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 2L11 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>',
    click: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4l7.5 16 1.8-6.7L20 11.5 4 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    actions: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.6"/></svg>',
    health: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="1.6"/></svg>',
    clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.6"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="1.6"/></svg>',
  };

  function fmt(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return `${Number(n).toFixed(1)}%`;
  }

  function fmtDelta(d) {
    if (d == null || Number.isNaN(Number(d))) return { text: 'No prior period', cls: 'is-flat' };
    const v = Number(d);
    if (v > 0) return { text: `+${v.toFixed(1)}% vs prior`, cls: 'is-up' };
    if (v < 0) return { text: `${v.toFixed(1)}% vs prior`, cls: 'is-down' };
    return { text: '0% vs prior', cls: 'is-flat' };
  }

  function fmtWhen(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false,
      }) + ' UTC';
    } catch {
      return String(iso);
    }
  }

  function fmtShortDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    } catch {
      return '—';
    }
  }

  function fmtShortTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) + ' UTC';
    } catch {
      return '';
    }
  }

  function emptyComposer(constants) {
    const topic = constants?.topics?.[0]?.key || 'daily_acts';
    const meta = (constants?.topics || []).find((t) => t.key === topic) || {};
    return {
      id: null,
      topic,
      title: '',
      message: '',
      destination_type: meta.defaultDestination || 'home',
      destination_payload: {},
      sound_key: meta.defaultSound || 'default',
      priority: 'normal',
      channel: 'push',
      timezone_mode: 'global_utc',
      delivery: 'now',
      scheduled_date: '',
      scheduled_time: '',
      audience: { mode: 'everyone', filters: {} },
      estimated_audience: null,
      fatigue: null,
      previewTab: 'ios',
      step: 'edit',
      confirmToken: '',
      error: null,
      busy: false,
    };
  }

  function renderRangeChips(state) {
    const active = state.notifRange || '30d';
    return `
      <div class="owner-chips owner-notif-chips" role="group" aria-label="Time range">
        ${RANGES.map((r) => `
          <button type="button" class="owner-chip ${active === r.id ? 'is-active' : ''}" data-notif-range="${r.id}">${r.label}</button>
        `).join('')}
      </div>`;
  }

  function renderKpi(icon, label, value, delta) {
    const d = fmtDelta(delta);
    return `
      <article class="owner-notif-kpi">
        <div class="owner-notif-kpi__top">
          <p class="owner-notif-kpi__label">${label}</p>
          <span class="owner-notif-kpi__icon" aria-hidden="true">${icon}</span>
        </div>
        <p class="owner-notif-kpi__value">${value}</p>
        <p class="owner-notif-kpi__delta ${d.cls}">${d.text}</p>
      </article>`;
  }

  function donutSvg(segments, total, esc) {
    const palette = ['#4ec5e8', '#5dca8a', '#6b8cff', '#8a9bb8', '#3aa8c9', '#7bc9a6', '#5a7a9a', '#9bb0c8', '#6a6f7c'];
    const r = 54;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const arcs = (segments || []).filter((s) => s.sent > 0).map((s, i) => {
      const len = (s.sent / Math.max(total, 1)) * c;
      const dash = `${len} ${c - len}`;
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="14" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"></circle>`;
      offset += len;
      return el;
    }).join('');
    return `
      <div class="owner-notif-donut">
        <svg viewBox="0 0 140 140" width="148" height="148" role="img" aria-label="Topic distribution, ${esc(fmt(total))} sent">
          <circle cx="70" cy="70" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="14"></circle>
          ${arcs}
          <text x="70" y="66" text-anchor="middle" fill="#f2efe8" font-size="15" font-weight="600">${esc(fmt(total))}</text>
          <text x="70" y="84" text-anchor="middle" fill="#8a8d97" font-size="9" letter-spacing="0.1em">SENT</text>
        </svg>
        <ul class="owner-notif-legend">
          ${(segments || []).map((s, i) => `
            <li>
              <span class="owner-notif-legend__swatch" style="background:${palette[i % palette.length]}"></span>
              <span>${esc(s.label)}</span>
              <strong>${total > 0 ? `${Number(s.pct).toFixed(1)}%` : '—'}</strong>
            </li>`).join('')}
        </ul>
      </div>`;
  }

  function badgeClass(perf) {
    const p = String(perf || '').toLowerCase();
    if (p === 'excellent') return 'is-excellent';
    if (p === 'good') return 'is-good';
    if (p === 'low') return 'is-low';
    return 'is-average';
  }

  function topicBar(rateVal, maxRate) {
    if (rateVal == null && !(maxRate > 0)) {
      return `<span class="owner-notif-bar owner-notif-bar--empty" aria-hidden="true"><span style="width:0%"></span></span>`;
    }
    const v = rateVal == null ? 0 : Number(rateVal);
    const max = Math.max(maxRate || 1, 1);
    const pct = v > 0 ? Math.max(6, Math.round((v / max) * 100)) : 0;
    return `<span class="owner-notif-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
  }

  function renderOverview(state, helpers) {
    const { esc } = helpers;
    const d = state.notifData;
    if (!d) {
      return `<section class="owner-section owner-notif"><p class="owner-muted">Loading notifications…</p></section>`;
    }

    const k = d.kpis || {};
    const topics = d.topicPerformance || [];
    const maxAction = Math.max(1, ...topics.map((t) => t.actionRate || 0));
    const dist = d.topicDistribution || { totalSent: 0, segments: [] };
    const recent = d.recent || [];
    const upcoming = d.upcoming || [];
    const audience = d.audience || {};
    const health = d.systemHealth || {};
    const best = d.bestTime || {};
    const menuId = state.notifMenuId;

    return `
      <section class="owner-section owner-notif">
        <header class="owner-notif-header">
          <div class="owner-notif-header__copy">
            <p class="owner-section__label">Notifications</p>
            <h2 class="owner-notif-title">Notifications</h2>
            <p class="owner-muted owner-notif-sub">Manage, schedule and understand World Choir notifications.</p>
          </div>
          <div class="owner-notif-header__actions">
            ${renderRangeChips(state)}
            <button type="button" class="owner-btn-ghost" data-notif-enable-test>Enable test pushes</button>
            <button type="button" class="owner-btn-ghost" data-notif-process-queue>Process queue</button>
            <button type="button" class="owner-btn" data-notif-create>+ Create Notification</button>
          </div>
        </header>

        <div class="owner-notif-kpi-row" role="list" aria-label="Notification performance">
          ${renderKpi(ICONS.sent, 'Notifications Sent', fmt(k.sent?.value), k.sent?.deltaPct)}
          ${renderKpi(ICONS.eye, 'Open Rate', fmtPct(k.openRate?.value), k.openRate?.deltaPct)}
          ${renderKpi(ICONS.click, 'Clicks', fmt(k.clicks?.value), k.clicks?.deltaPct)}
          ${renderKpi(ICONS.actions, 'Actions Completed', fmt(k.actionsCompleted?.value), k.actionsCompleted?.deltaPct)}
        </div>

        <div class="owner-notif-grid-2 owner-notif-row">
          <article class="owner-notif-panel">
            <div class="owner-notif-panel__head">
              <h3 class="owner-notif-panel__title">Performance by Topic</h3>
            </div>
            <div class="owner-table-wrap">
              <table class="owner-table owner-notif-topic-table">
                <thead>
                  <tr><th>#</th><th>Topic</th><th>Sent</th><th>Open Rate</th><th>Click Rate</th><th>Action Rate</th></tr>
                </thead>
                <tbody>
                  ${topics.length ? topics.map((t, i) => `
                    <tr class="owner-notif-topic-row" data-notif-topic-filter="${esc(t.topic)}" tabindex="0" role="button" aria-label="Filter history for ${esc(t.label)}">
                      <td>${i + 1}</td>
                      <td>
                        <div class="owner-notif-topic-cell">
                          <strong>${esc(t.label)}</strong>
                          ${topicBar(t.actionRate ?? (t.sent ? 0 : null), maxAction)}
                        </div>
                      </td>
                      <td>${fmt(t.sent)}</td>
                      <td>${fmtPct(t.openRate)}</td>
                      <td>${fmtPct(t.clickRate)}</td>
                      <td>${fmtPct(t.actionRate)}</td>
                    </tr>`).join('') : `<tr><td colspan="6" class="owner-empty">No topic data yet.</td></tr>`}
                </tbody>
              </table>
            </div>
          </article>

          <article class="owner-notif-panel">
            <div class="owner-notif-panel__head">
              <h3 class="owner-notif-panel__title">Topic Distribution</h3>
            </div>
            ${donutSvg(dist.segments || [], dist.totalSent || 0, esc)}
          </article>
        </div>

        <div class="owner-notif-grid-2 owner-notif-row owner-notif-row--lists">
          <article class="owner-notif-panel">
            <div class="owner-notif-panel__head">
              <h3 class="owner-notif-panel__title">Recent Notifications</h3>
              <button type="button" class="owner-btn-ghost" data-notif-view-all="sent">View All</button>
            </div>
            ${recent.length ? `
              <div class="owner-table-wrap">
                <table class="owner-table">
                  <thead>
                    <tr>
                      <th>Title</th><th>Topic</th><th>Sent</th><th>Delivered</th>
                      <th>Open Rate</th><th>Click Rate</th><th>Action Rate</th>
                      <th>Performance</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recent.map((n) => `
                      <tr>
                        <td>
                          <div class="owner-notif-title-cell">
                            <span class="owner-notif-ico" aria-hidden="true">${ICONS.bell}</span>
                            <span>${esc(n.title)}</span>
                          </div>
                        </td>
                        <td>${esc(n.topicLabel)}</td>
                        <td>${esc(fmtWhen(n.sent_at))}</td>
                        <td>${fmt(n.metrics?.delivered_count)}</td>
                        <td>${fmtPct(n.rates?.openRate)}</td>
                        <td>${fmtPct(n.rates?.clickRate)}</td>
                        <td>${fmtPct(n.rates?.actionRate)}</td>
                        <td><span class="owner-notif-badge ${badgeClass(n.performance)}">${esc(n.performance)}</span></td>
                        <td class="owner-notif-actions-cell">
                          <button type="button" class="owner-btn-ghost owner-notif-more" data-notif-menu="${esc(n.id)}" aria-label="Actions for ${esc(n.title)}" aria-haspopup="true" aria-expanded="${menuId === n.id ? 'true' : 'false'}">⋯</button>
                          ${menuId === n.id ? `
                            <div class="owner-notif-menu" role="menu">
                              <button type="button" role="menuitem" data-notif-analytics="${esc(n.id)}">View Analytics</button>
                              <button type="button" role="menuitem" data-notif-duplicate="${esc(n.id)}">Duplicate</button>
                              <button type="button" role="menuitem" data-notif-archive="${esc(n.id)}">Archive</button>
                            </div>` : ''}
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>` : `<p class="owner-empty">No notifications sent yet.<br>Create your first notification to begin seeing performance.</p>`}
          </article>

          <article class="owner-notif-panel">
            <div class="owner-notif-panel__head">
              <h3 class="owner-notif-panel__title">Upcoming Notifications</h3>
              <button type="button" class="owner-btn-ghost" data-notif-view-all="scheduled">View All</button>
            </div>
            ${upcoming.length ? `
              <ul class="owner-notif-upcoming">
                ${upcoming.map((n) => `
                  <li class="owner-notif-upcoming__item">
                    <span class="owner-notif-ico" aria-hidden="true">${ICONS.bell}</span>
                    <div class="owner-notif-upcoming__copy">
                      <strong>${esc(n.title)}</strong>
                      <span class="owner-muted">${esc(n.topicLabel)} · ${esc(fmtShortDate(n.scheduled_at))} · ${esc(fmtShortTime(n.scheduled_at))}</span>
                    </div>
                    <div class="owner-notif-actions-cell">
                      <button type="button" class="owner-btn-ghost owner-notif-more" data-notif-menu="${esc(n.id)}" aria-label="Actions">⋯</button>
                      ${menuId === n.id ? `
                        <div class="owner-notif-menu" role="menu">
                          <button type="button" role="menuitem" data-notif-edit="${esc(n.id)}">Edit</button>
                          <button type="button" role="menuitem" data-notif-duplicate="${esc(n.id)}">Duplicate</button>
                          <button type="button" role="menuitem" data-notif-edit="${esc(n.id)}">Reschedule</button>
                          <button type="button" role="menuitem" data-notif-cancel="${esc(n.id)}">Cancel</button>
                        </div>` : ''}
                    </div>
                  </li>`).join('')}
              </ul>` : `<p class="owner-empty">No scheduled notifications.<br>Upcoming notifications will appear here.</p>`}
          </article>
        </div>

        <div class="owner-notif-grid-3 owner-notif-row">
          <article class="owner-notif-panel">
            <div class="owner-notif-panel__head"><h3 class="owner-notif-panel__title">Audience</h3></div>
            <p class="owner-notif-audience__total"><strong>${fmt(audience.notificationsEnabledCount != null ? audience.notificationsEnabledCount : audience.totalVoices)}</strong> ${audience.notificationsEnabledCount != null ? 'Reachable devices' : 'Total Voices'}</p>
            ${audience.devicePermissionKnown ? `
              <p class="owner-muted">${fmt(audience.totalVoices)} Total Voices</p>
              <p class="owner-muted">${fmtPct(audience.notificationsEnabled)} Notifications Enabled</p>
              <p class="owner-muted">${fmtPct(audience.notificationsDisabled)} Notifications Disabled</p>
              <p class="owner-muted owner-notif-note">${esc(audience.note || '')}</p>
            ` : `
              <div class="owner-notif-audience__split">
                <div>
                  <span class="owner-notif-kpi__label">Notifications Enabled</span>
                  <strong>—</strong>
                </div>
                <div>
                  <span class="owner-notif-kpi__label">Notifications Disabled</span>
                  <strong>—</strong>
                </div>
              </div>
              <p class="owner-muted owner-notif-note">${esc(audience.note || 'Device permission reach is not available yet.')}</p>
            `}
          </article>

          <article class="owner-notif-panel">
            <div class="owner-notif-panel__head">
              <h3 class="owner-notif-panel__title">System Health</h3>
              <button type="button" class="owner-btn-ghost" data-notif-health-details>View Details</button>
            </div>
            <p class="owner-notif-health__status">
              <span class="owner-notif-dot ${health.status === 'operational' ? 'is-ok' : 'is-warn'}" aria-hidden="true"></span>
              ${esc(health.statusLabel || 'Unknown')}
            </p>
            <dl class="owner-notif-meta">
              <div><dt>Delivered</dt><dd>${fmt(health.delivered)}</dd></div>
              <div><dt>Failed</dt><dd>${fmt(health.failed)}</dd></div>
              <div><dt>Delivery Rate</dt><dd>${fmtPct(health.deliveryRate)}</dd></div>
            </dl>
            ${!d.provider?.dispatchEnabled || !d.provider?.pushConfigured ? `<p class="owner-muted owner-notif-note">${esc(health.note || '')}</p>` : `<p class="owner-muted owner-notif-note">${esc(health.note || '')}</p>`}
          </article>

          <article class="owner-notif-panel">
            <div class="owner-notif-panel__head">
              <h3 class="owner-notif-panel__title">Best Time to Send (${esc((state.notifRange || '30d').toUpperCase())})</h3>
            </div>
            ${best.windowLabel ? `
              <p class="owner-notif-best__time">${esc(best.windowLabel)}</p>
              <p class="owner-muted">${esc(best.timezoneNote || 'Local time')}</p>
              <p class="owner-muted">${esc(best.subtitle || '')}</p>
            ` : `
              <p class="owner-notif-best__time owner-notif-best__time--empty">—</p>
              <p class="owner-muted">Local time</p>
              <p class="owner-muted">${esc(best.subtitle || 'Highest engagement across all topics')}</p>
              <p class="owner-muted owner-notif-note">${esc(best.note || 'No data for this time period.')}</p>
            `}
          </article>
        </div>

        ${state.notifComposerOpen ? renderComposer(state, helpers) : ''}
        ${state.notifAnalytics ? renderAnalyticsModal(state, helpers) : ''}
        ${state.notifHealthOpen ? renderHealthModal(state, helpers) : ''}
      </section>`;
  }

  function renderList(state, helpers) {
    const { esc } = helpers;
    const list = state.notifList || { items: [], total: 0, page: 1 };
    const constants = state.notifData?.constants || {};
    const topics = constants.topics || [];
    const menuId = state.notifMenuId;

    return `
      <section class="owner-section owner-notif">
        <header class="owner-notif-header">
          <div>
            <button type="button" class="owner-btn-ghost" data-notif-back-overview>← Back</button>
            <p class="owner-section__label" style="margin-top:10px">Notifications</p>
            <h2 class="owner-notif-title">All Notifications</h2>
            <p class="owner-muted">Search, filter and manage campaigns.</p>
          </div>
          <div class="owner-notif-header__actions">
            <button type="button" class="owner-btn" data-notif-create>+ Create Notification</button>
          </div>
        </header>

        <div class="owner-notif-filters">
          <div class="owner-chips" role="group" aria-label="Status filter">
            ${LIST_STATUS.map((s) => `
              <button type="button" class="owner-chip ${(state.notifListStatus || 'all') === s.id ? 'is-active' : ''}" data-notif-list-status="${s.id}">${s.label}</button>
            `).join('')}
          </div>
          <div class="owner-notif-filters__row">
            <label class="owner-field">
              <span class="owner-muted">Topic</span>
              <select data-notif-list-topic>
                <option value="all">All topics</option>
                ${topics.map((t) => `<option value="${esc(t.key)}" ${(state.notifListTopic || 'all') === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
              </select>
            </label>
            <label class="owner-field">
              <span class="owner-muted">Performance</span>
              <select data-notif-list-perf>
                ${['all', 'Excellent', 'Good', 'Average', 'Low'].map((p) => `
                  <option value="${p}" ${(state.notifListPerf || 'all') === p ? 'selected' : ''}>${p === 'all' ? 'All' : p}</option>
                `).join('')}
              </select>
            </label>
            <label class="owner-field owner-notif-search">
              <span class="owner-muted">Search</span>
              <input type="search" placeholder="Title or message…" value="${esc(state.notifListQuery || '')}" data-notif-list-query>
            </label>
          </div>
        </div>

        <article class="sa-panel">
          ${list.items?.length ? `
            <div class="owner-table-wrap">
              <table class="owner-table">
                <thead>
                  <tr><th>Title</th><th>Topic</th><th>Status</th><th>Updated</th><th>Performance</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  ${list.items.map((n) => `
                    <tr>
                      <td>${esc(n.title)}</td>
                      <td>${esc(n.topicLabel)}</td>
                      <td>${esc(n.status)}</td>
                      <td>${esc(fmtWhen(n.updated_at || n.sent_at || n.scheduled_at))}</td>
                      <td>${n.status === 'sent' ? `<span class="owner-notif-badge ${badgeClass(n.performance)}">${esc(n.performance)}</span>` : '—'}</td>
                      <td class="owner-notif-actions-cell">
                        <button type="button" class="owner-btn-ghost owner-notif-more" data-notif-menu="${esc(n.id)}" aria-label="Actions">⋯</button>
                        ${menuId === n.id ? renderRowMenu(n, esc) : ''}
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            <div class="owner-notif-pager">
              <button type="button" class="owner-btn-ghost" data-notif-list-page="prev" ${(list.page || 1) <= 1 ? 'disabled' : ''}>Previous</button>
              <span class="owner-muted">Page ${list.page || 1} · ${fmt(list.total)} total</span>
              <button type="button" class="owner-btn-ghost" data-notif-list-page="next" ${(list.page || 1) * (list.pageSize || 25) >= (list.total || 0) ? 'disabled' : ''}>Next</button>
            </div>` : `<p class="owner-empty">No matching notifications.</p>`}
        </article>

        ${state.notifComposerOpen ? renderComposer(state, helpers) : ''}
        ${state.notifAnalytics ? renderAnalyticsModal(state, helpers) : ''}
      </section>`;
  }

  function renderRowMenu(n, esc) {
    if (n.status === 'sent' || n.status === 'failed') {
      return `<div class="owner-notif-menu" role="menu">
        <button type="button" role="menuitem" data-notif-analytics="${esc(n.id)}">View Analytics</button>
        <button type="button" role="menuitem" data-notif-duplicate="${esc(n.id)}">Duplicate</button>
        <button type="button" role="menuitem" data-notif-archive="${esc(n.id)}">Archive</button>
      </div>`;
    }
    if (n.status === 'draft') {
      return `<div class="owner-notif-menu" role="menu">
        <button type="button" role="menuitem" data-notif-edit="${esc(n.id)}">Edit</button>
        <button type="button" role="menuitem" data-notif-duplicate="${esc(n.id)}">Duplicate</button>
        <button type="button" role="menuitem" data-notif-delete="${esc(n.id)}">Delete</button>
      </div>`;
    }
    if (n.status === 'scheduled') {
      return `<div class="owner-notif-menu" role="menu">
        <button type="button" role="menuitem" data-notif-edit="${esc(n.id)}">Edit</button>
        <button type="button" role="menuitem" data-notif-duplicate="${esc(n.id)}">Duplicate</button>
        <button type="button" role="menuitem" data-notif-cancel="${esc(n.id)}">Cancel</button>
      </div>`;
    }
    if (n.status === 'cancelled') {
      return `<div class="owner-notif-menu" role="menu">
        <button type="button" role="menuitem" data-notif-duplicate="${esc(n.id)}">Duplicate</button>
        <button type="button" role="menuitem" data-notif-delete="${esc(n.id)}">Delete</button>
      </div>`;
    }
    return `<div class="owner-notif-menu" role="menu">
      <button type="button" role="menuitem" data-notif-duplicate="${esc(n.id)}">Duplicate</button>
    </div>`;
  }

  function renderPreview(form, esc) {
    const tab = form.previewTab || 'ios';
    return `
      <div class="owner-notif-preview">
        <div class="owner-chips" role="tablist" aria-label="Preview platform">
          ${['ios', 'android', 'in_app'].map((t) => `
            <button type="button" role="tab" class="owner-chip ${tab === t ? 'is-active' : ''}" data-notif-preview-tab="${t}" aria-selected="${tab === t}">${t === 'in_app' ? 'In-App' : t.toUpperCase()}</button>
          `).join('')}
        </div>
        <div class="owner-notif-preview__device owner-notif-preview__device--${tab}" aria-live="polite">
          <div class="owner-notif-preview__card">
            <div class="owner-notif-preview__app">World Choir</div>
            <strong>${esc(form.title || 'Notification Title')}</strong>
            <p>${esc(form.message || 'Message preview appears here as you type.')}</p>
            <span class="owner-muted">Sound: ${esc(form.sound_key || 'default')}</span>
          </div>
        </div>
      </div>`;
  }

  function renderComposer(state, helpers) {
    const { esc } = helpers;
    const form = state.notifComposer || emptyComposer(state.notifData?.constants);
    const constants = state.notifData?.constants || {};
    const topics = constants.topics || [];
    const destinations = constants.destinations || [];
    const sounds = constants.sounds || [];
    const titleLen = (form.title || '').length;
    const msgLen = (form.message || '').length;
    const msgWarn = msgLen > 120;

    if (form.step === 'review') {
      return renderReview(state, helpers);
    }

    return `
      <div class="owner-cf-modal owner-notif-modal" role="dialog" aria-modal="true" aria-labelledby="owner-notif-compose-title">
        <button type="button" class="owner-cf-modal__backdrop" data-notif-composer-close aria-label="Close"></button>
        <div class="owner-cf-modal__card owner-notif-modal__card">
          <button type="button" class="owner-cf-modal__close" data-notif-composer-close aria-label="Close">×</button>
          <div class="owner-detail owner-cf-modal__content">
            <h3 id="owner-notif-compose-title">${form.id ? 'Edit Notification' : 'Create Notification'}</h3>
            ${form.error ? `<p class="owner-flash is-err">${esc(form.error)}</p>` : ''}
            <div class="owner-notif-compose-grid">
              <form class="owner-form" id="owner-notif-form">
                <div class="owner-field">
                  <label for="notif-topic">Topic</label>
                  <select id="notif-topic" name="topic" data-notif-field="topic">
                    ${topics.map((t) => `<option value="${esc(t.key)}" ${form.topic === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
                  </select>
                </div>
                <div class="owner-field">
                  <label for="notif-title">Notification Title <span class="owner-muted">${titleLen}/65 guided</span></label>
                  <input id="notif-title" name="title" maxlength="120" value="${esc(form.title)}" data-notif-field="title" required>
                </div>
                <div class="owner-field">
                  <label for="notif-message">Message <span class="owner-muted">${msgLen}/500</span></label>
                  <textarea id="notif-message" name="message" rows="4" maxlength="500" data-notif-field="message" required>${esc(form.message)}</textarea>
                  ${msgWarn ? '<p class="owner-muted">Long messages may truncate on some devices.</p>' : ''}
                </div>
                <div class="owner-field">
                  <label for="notif-dest">When tapped</label>
                  <select id="notif-dest" name="destination_type" data-notif-field="destination_type">
                    ${destinations.map((d) => `<option value="${esc(d.key)}" ${form.destination_type === d.key ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
                  </select>
                </div>
                ${form.destination_type === 'custom' ? `
                  <div class="owner-field">
                    <label for="notif-custom-path">Custom internal path</label>
                    <input id="notif-custom-path" value="${esc(form.destination_payload?.path || '')}" data-notif-field="custom_path" placeholder="e.g. world-chain.html?id=…">
                  </div>` : ''}
                ${form.destination_type === 'world_chain' ? `
                  <div class="owner-field">
                    <label for="notif-chain-id">World Chain ID (optional)</label>
                    <input id="notif-chain-id" value="${esc(form.destination_payload?.chainId || '')}" data-notif-field="chain_id" placeholder="Active chain id">
                  </div>` : ''}
                <div class="owner-field">
                  <label for="notif-sound">Sound</label>
                  <div class="owner-notif-sound-row">
                    <select id="notif-sound" name="sound_key" data-notif-field="sound_key">
                      ${sounds.map((s) => `<option value="${esc(s.key)}" ${form.sound_key === s.key ? 'selected' : ''}>${esc(s.label)}${s.assetReady ? '' : ' (asset TBD)'}</option>`).join('')}
                    </select>
                    <button type="button" class="owner-btn-ghost" data-notif-preview-sound>Preview Sound</button>
                  </div>
                  <p class="owner-muted">Platform notification sounds require native assets. Browser preview falls back to a short system beep when assets are missing.</p>
                </div>
                <div class="owner-field">
                  <label for="notif-priority">Priority</label>
                  <select id="notif-priority" data-notif-field="priority">
                    <option value="normal" ${form.priority === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="important" ${form.priority === 'important' ? 'selected' : ''}>Important</option>
                    <option value="critical_event" ${form.priority === 'critical_event' ? 'selected' : ''}>Critical Event</option>
                  </select>
                </div>
                <div class="owner-field">
                  <label for="notif-channel">Channel</label>
                  <select id="notif-channel" data-notif-field="channel">
                    <option value="push" ${form.channel === 'push' ? 'selected' : ''}>Push</option>
                    <option value="in_app" disabled>In-App (coming soon)</option>
                    <option value="push_and_in_app" disabled>Push + In-App (coming soon)</option>
                  </select>
                </div>
                <fieldset class="owner-field">
                  <legend>Delivery</legend>
                  <label class="owner-notif-radio"><input type="radio" name="delivery" value="now" data-notif-field="delivery" ${form.delivery === 'now' ? 'checked' : ''}> Send Now</label>
                  <label class="owner-notif-radio"><input type="radio" name="delivery" value="schedule" data-notif-field="delivery" ${form.delivery === 'schedule' ? 'checked' : ''}> Schedule</label>
                  ${form.delivery === 'schedule' ? `
                    <div class="owner-notif-schedule-row">
                      <input type="date" data-notif-field="scheduled_date" value="${esc(form.scheduled_date || '')}" required>
                      <input type="time" data-notif-field="scheduled_time" value="${esc(form.scheduled_time || '')}" required>
                    </div>
                    <label for="notif-tz">Timezone mode</label>
                    <select id="notif-tz" data-notif-field="timezone_mode">
                      <option value="global_utc" ${form.timezone_mode === 'global_utc' ? 'selected' : ''}>Global UTC</option>
                      <option value="recipient_local" ${form.timezone_mode === 'recipient_local' ? 'selected' : ''}>Recipient Local Time</option>
                    </select>
                  ` : ''}
                </fieldset>
                <fieldset class="owner-field">
                  <legend>Audience</legend>
                  <label class="owner-notif-radio"><input type="radio" name="audience_mode" value="everyone" data-notif-field="audience_mode" ${form.audience?.mode !== 'custom' ? 'checked' : ''}> Everyone</label>
                  <label class="owner-notif-radio"><input type="radio" name="audience_mode" value="custom" data-notif-field="audience_mode" ${form.audience?.mode === 'custom' ? 'checked' : ''}> Custom Audience</label>
                  ${form.audience?.mode === 'custom' ? `
                    <div class="owner-notif-filters__row">
                      <input type="text" placeholder="Country" data-notif-filter="country" value="${esc(form.audience.filters?.country || '')}">
                      <input type="text" placeholder="City" data-notif-filter="city" value="${esc(form.audience.filters?.city || '')}">
                    </div>
                    <p class="owner-muted">Additional filters (Daily Act, World Chain, donations, etc.) are scaffolded server-side and will estimate when data sources exist.</p>
                  ` : ''}
                  <p class="owner-notif-estimate">Estimated Audience: <strong>${form.estimated_audience != null ? fmt(form.estimated_audience) : '—'} Voices</strong></p>
                </fieldset>
                ${form.fatigue?.warnings?.length ? `
                  <div class="owner-flash is-err" role="status">
                    ${form.fatigue.warnings.map((w) => `<p>${esc(w.message)}</p>`).join('')}
                  </div>` : ''}
                <div class="owner-actions">
                  <button class="owner-btn-ghost" type="button" data-notif-save-draft ${form.busy ? 'disabled' : ''}>Save as Draft</button>
                  <button class="owner-btn-ghost" type="button" data-notif-send-test ${form.busy ? 'disabled' : ''}>Send Test</button>
                  <button class="owner-btn" type="button" data-notif-review ${form.busy ? 'disabled' : ''}>Review</button>
                </div>
              </form>
              ${renderPreview(form, esc)}
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderReview(state, helpers) {
    const { esc } = helpers;
    const form = state.notifComposer;
    const constants = state.notifData?.constants || {};
    const topicLabel = (constants.topics || []).find((t) => t.key === form.topic)?.label || form.topic;
    const destLabel = (constants.destinations || []).find((d) => d.key === form.destination_type)?.label || form.destination_type;
    const soundLabel = (constants.sounds || []).find((s) => s.key === form.sound_key)?.label || form.sound_key;
    const est = form.estimated_audience || 0;
    const needType = est >= (constants.globalSendTypeConfirmThreshold || 50000);
    const needConfirm = est >= (constants.largeSendConfirmThreshold || 10000);

    return `
      <div class="owner-cf-modal owner-notif-modal" role="dialog" aria-modal="true" aria-labelledby="owner-notif-review-title">
        <button type="button" class="owner-cf-modal__backdrop" data-notif-composer-close aria-label="Close"></button>
        <div class="owner-cf-modal__card owner-notif-modal__card">
          <button type="button" class="owner-cf-modal__close" data-notif-composer-close aria-label="Close">×</button>
          <div class="owner-detail owner-cf-modal__content">
            <h3 id="owner-notif-review-title">Review Notification</h3>
            ${form.error ? `<p class="owner-flash is-err">${esc(form.error)}</p>` : ''}
            <dl class="owner-notif-review">
              <div><dt>Topic</dt><dd>${esc(topicLabel)}</dd></div>
              <div><dt>Audience</dt><dd>${esc(form.audience?.mode === 'custom' ? 'Custom Audience' : 'Everyone')}</dd></div>
              <div><dt>Estimated recipients</dt><dd>${fmt(est)} Voices</dd></div>
              <div><dt>Title</dt><dd>${esc(form.title)}</dd></div>
              <div><dt>Message</dt><dd>${esc(form.message)}</dd></div>
              <div><dt>Destination</dt><dd>${esc(destLabel)}</dd></div>
              <div><dt>Sound</dt><dd>${esc(soundLabel)}</dd></div>
              <div><dt>Priority</dt><dd>${esc(form.priority)}</dd></div>
              <div><dt>Delivery</dt><dd>${form.delivery === 'schedule' ? esc(`${form.scheduled_date} ${form.scheduled_time} (${form.timezone_mode})`) : 'Send Now'}</dd></div>
            </dl>
            ${needConfirm ? `
              <p class="owner-flash is-ok">Ready to notify ${fmt(est)} Voices?</p>
              ${needType ? `
                <div class="owner-field">
                  <label for="notif-confirm-send">Type SEND to confirm</label>
                  <input id="notif-confirm-send" data-notif-field="confirmToken" value="${esc(form.confirmToken || '')}" autocomplete="off">
                </div>` : ''}
            ` : ''}
            <div class="owner-actions">
              <button class="owner-btn-ghost" type="button" data-notif-back-edit>Cancel</button>
              <button class="owner-btn" type="button" data-notif-confirm-send ${form.busy ? 'disabled' : ''}>
                ${form.delivery === 'schedule' ? 'Schedule Notification' : 'Send Notification'}
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderAnalyticsModal(state, helpers) {
    const { esc } = helpers;
    const a = state.notifAnalytics;
    if (!a?.notification) return '';
    const n = a.notification;
    return `
      <div class="owner-cf-modal owner-notif-modal" role="dialog" aria-modal="true" aria-labelledby="owner-notif-analytics-title">
        <button type="button" class="owner-cf-modal__backdrop" data-notif-analytics-close aria-label="Close"></button>
        <div class="owner-cf-modal__card owner-notif-modal__card">
          <button type="button" class="owner-cf-modal__close" data-notif-analytics-close aria-label="Close">×</button>
          <div class="owner-detail owner-cf-modal__content">
            <h3 id="owner-notif-analytics-title">${esc(n.title)}</h3>
            <p class="owner-muted">${esc(n.message)}</p>
            <dl class="owner-notif-review">
              <div><dt>Topic</dt><dd>${esc(n.topicLabel)}</dd></div>
              <div><dt>Send time</dt><dd>${esc(fmtWhen(n.sent_at))}</dd></div>
              <div><dt>Audience</dt><dd>${esc(n.audience?.mode || 'everyone')} · ${fmt(n.estimated_audience)} est.</dd></div>
              <div><dt>Sound</dt><dd>${esc(n.sound_key)}</dd></div>
              <div><dt>Destination</dt><dd>${esc(n.destination_type)}</dd></div>
              <div><dt>Priority</dt><dd>${esc(n.priority)}</dd></div>
              <div><dt>Status</dt><dd>${esc(n.status)}</dd></div>
            </dl>
            <h4 class="sa-panel__title">Funnel</h4>
            <div class="owner-table-wrap">
              <table class="owner-table">
                <thead><tr><th>Step</th><th>Count</th><th>% of delivered/sent</th></tr></thead>
                <tbody>
                  ${(a.funnel || []).map((s) => `
                    <tr><td>${esc(s.label)}</td><td>${fmt(s.count)}</td><td>${fmtPct(s.pctOfDelivered)}</td></tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <p class="owner-muted" style="margin-top:12px">${esc(a.negativeSignals?.language || '')}: ${fmt(a.negativeSignals?.permissionsDisabledWithin24h)}</p>
            <p class="owner-muted">${esc(a.negativeSignals?.note || '')}</p>
            <p class="owner-muted">${esc(a.breakdowns?.note || '')}</p>
          </div>
        </div>
      </div>`;
  }

  function renderHealthModal(state, helpers) {
    const { esc } = helpers;
    const h = state.notifData?.systemHealth || {};
    return `
      <div class="owner-cf-modal" role="dialog" aria-modal="true" aria-labelledby="owner-notif-health-title">
        <button type="button" class="owner-cf-modal__backdrop" data-notif-health-close aria-label="Close"></button>
        <div class="owner-cf-modal__card">
          <button type="button" class="owner-cf-modal__close" data-notif-health-close aria-label="Close">×</button>
          <div class="owner-detail owner-cf-modal__content">
            <h3 id="owner-notif-health-title">System Health</h3>
            <dl class="owner-notif-review">
              <div><dt>APNs</dt><dd>${esc(h.providers?.apns?.status || 'not_configured')}</dd></div>
              <div><dt>FCM</dt><dd>${esc(h.providers?.fcm?.status || 'not_configured')}</dd></div>
              <div><dt>Web Push</dt><dd>${esc(h.providers?.web_push?.status || 'not_configured')}</dd></div>
              <div><dt>Queue</dt><dd>${esc(h.queue?.status || 'not_configured')}</dd></div>
            </dl>
            <p class="owner-muted">${esc(h.queue?.note || '')}</p>
            <p class="owner-muted">${esc(h.note || '')}</p>
          </div>
        </div>
      </div>`;
  }

  function render(state, helpers) {
    if (state.notifView === 'list') return renderList(state, helpers);
    return renderOverview(state, helpers);
  }

  function composerPayload(form) {
    const payload = {
      id: form.id || undefined,
      topic: form.topic,
      title: form.title,
      message: form.message,
      destination_type: form.destination_type,
      destination_payload: { ...(form.destination_payload || {}) },
      sound_key: form.sound_key,
      priority: form.priority,
      channel: form.channel || 'push',
      timezone_mode: form.timezone_mode,
      audience: form.audience,
      origin: 'manual',
    };
    if (form.delivery === 'schedule' && form.scheduled_date && form.scheduled_time) {
      payload.scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}:00.000Z`).toISOString();
    }
    return payload;
  }

  function applyTopicDefaults(form, constants) {
    const meta = (constants?.topics || []).find((t) => t.key === form.topic);
    if (!meta) return;
    form.destination_type = meta.defaultDestination || form.destination_type;
    form.sound_key = meta.defaultSound || form.sound_key;
    if (form.topic === 'live_moment') form.priority = 'critical_event';
    if (form.topic === 'live_moment') form.timezone_mode = 'global_utc';
    if (form.topic === 'daily_acts') form.timezone_mode = 'recipient_local';
  }

  async function refreshEstimate(state, api) {
    const form = state.notifComposer;
    if (!form) return;
    try {
      const res = await api('notification-audience-estimate', {
        method: 'POST',
        body: { audience: form.audience },
      });
      form.estimated_audience = res.estimated;
      const fatigue = await api('notification-fatigue', {
        method: 'POST',
        body: { topic: form.topic, audience: form.audience },
      });
      form.fatigue = fatigue;
    } catch {
      /* keep previous */
    }
  }

  function bind(root, state, helpers, { api, onRender, setFlash, loadData, loadList }) {
    root.querySelectorAll('[data-notif-range]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.notifRange = btn.getAttribute('data-notif-range');
        await loadData();
      });
    });

    root.querySelector('[data-notif-create]')?.addEventListener('click', () => {
      state.notifComposer = emptyComposer(state.notifData?.constants);
      state.notifComposerOpen = true;
      onRender();
      refreshEstimate(state, api).then(onRender);
    });

    root.querySelector('[data-notif-enable-test]')?.addEventListener('click', async () => {
      try {
        if (typeof WorldChoirPush === 'undefined') {
          setFlash('Push client not loaded on this page.', 'err');
          onRender();
          return;
        }
        const result = await WorldChoirPush.subscribe({ role: 'owner_test' });
        setFlash(result.ok ? 'This browser is registered for Owner test pushes.' : (result.error || 'Could not enable test pushes.'), result.ok ? 'ok' : 'err');
        onRender();
      } catch (err) {
        setFlash(err.message || 'Could not enable test pushes.', 'err');
        onRender();
      }
    });

    root.querySelector('[data-notif-process-queue]')?.addEventListener('click', async () => {
      try {
        const report = await api('notification-process-queue', { method: 'POST', body: {} });
        setFlash(`Queue processed — started ${report.scheduledStarted || 0}, batches ${report.batchesProcessed || 0}, completed ${report.completed || 0}.`);
        await loadData();
      } catch (err) {
        setFlash(err.message || 'Could not process queue.', 'err');
        onRender();
      }
    });

    root.querySelectorAll('[data-notif-composer-close]').forEach((el) => {
      el.addEventListener('click', () => {
        state.notifComposerOpen = false;
        state.notifComposer = null;
        onRender();
      });
    });

    root.querySelectorAll('[data-notif-view-all]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.notifView = 'list';
        state.notifListStatus = btn.getAttribute('data-notif-view-all') || 'all';
        state.notifListPage = 1;
        await loadList();
      });
    });

    root.querySelector('[data-notif-back-overview]')?.addEventListener('click', async () => {
      state.notifView = 'overview';
      await loadData();
    });

    root.querySelectorAll('[data-notif-topic-filter]').forEach((row) => {
      const go = async () => {
        state.notifView = 'list';
        state.notifListTopic = row.getAttribute('data-notif-topic-filter');
        state.notifListStatus = 'sent';
        state.notifListPage = 1;
        await loadList();
      };
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });

    root.querySelectorAll('[data-notif-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-notif-menu');
        state.notifMenuId = state.notifMenuId === id ? null : id;
        onRender();
      });
    });

    root.querySelectorAll('[data-notif-analytics]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const id = btn.getAttribute('data-notif-analytics');
          state.notifAnalytics = await api('notification', { query: `&id=${encodeURIComponent(id)}` });
          state.notifMenuId = null;
          onRender();
        } catch (err) {
          setFlash(err.message || 'Could not load analytics.', 'err');
          onRender();
        }
      });
    });

    root.querySelectorAll('[data-notif-analytics-close]').forEach((el) => {
      el.addEventListener('click', () => {
        state.notifAnalytics = null;
        onRender();
      });
    });

    root.querySelector('[data-notif-health-details]')?.addEventListener('click', () => {
      state.notifHealthOpen = true;
      onRender();
    });
    root.querySelectorAll('[data-notif-health-close]').forEach((el) => {
      el.addEventListener('click', () => {
        state.notifHealthOpen = false;
        onRender();
      });
    });

    const mutate = async (action, body, okMsg) => {
      try {
        await api(action, { method: 'POST', body });
        setFlash(okMsg);
        state.notifMenuId = null;
        if (state.notifView === 'list') await loadList();
        else await loadData();
      } catch (err) {
        setFlash(err.message || 'Action failed.', 'err');
        onRender();
      }
    };

    root.querySelectorAll('[data-notif-duplicate]').forEach((btn) => {
      btn.addEventListener('click', () => mutate('notification-duplicate', { id: btn.getAttribute('data-notif-duplicate') }, 'Notification duplicated as draft.'));
    });
    root.querySelectorAll('[data-notif-archive]').forEach((btn) => {
      btn.addEventListener('click', () => mutate('notification-archive', { id: btn.getAttribute('data-notif-archive') }, 'Notification archived.'));
    });
    root.querySelectorAll('[data-notif-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Cancel this scheduled notification?')) return;
        mutate('notification-cancel', { id: btn.getAttribute('data-notif-cancel') }, 'Notification cancelled.');
      });
    });
    root.querySelectorAll('[data-notif-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Permanently delete this notification?')) return;
        mutate('notification-delete', { id: btn.getAttribute('data-notif-delete') }, 'Notification deleted.');
      });
    });

    root.querySelectorAll('[data-notif-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const id = btn.getAttribute('data-notif-edit');
          const detail = await api('notification', { query: `&id=${encodeURIComponent(id)}` });
          const n = detail.notification;
          const form = emptyComposer(state.notifData?.constants);
          form.id = n.id;
          form.topic = n.topic;
          form.title = n.title;
          form.message = n.message;
          form.destination_type = n.destination_type;
          form.destination_payload = n.destination_payload || {};
          form.sound_key = n.sound_key;
          form.priority = n.priority;
          form.channel = n.channel;
          form.timezone_mode = n.timezone_mode;
          form.audience = n.audience || { mode: 'everyone', filters: {} };
          form.estimated_audience = n.estimated_audience;
          if (n.scheduled_at) {
            form.delivery = 'schedule';
            const d = new Date(n.scheduled_at);
            form.scheduled_date = d.toISOString().slice(0, 10);
            form.scheduled_time = d.toISOString().slice(11, 16);
          }
          state.notifComposer = form;
          state.notifComposerOpen = true;
          state.notifMenuId = null;
          onRender();
        } catch (err) {
          setFlash(err.message || 'Could not open editor.', 'err');
          onRender();
        }
      });
    });

    // List filters
    root.querySelectorAll('[data-notif-list-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.notifListStatus = btn.getAttribute('data-notif-list-status');
        state.notifListPage = 1;
        await loadList();
      });
    });
    root.querySelector('[data-notif-list-topic]')?.addEventListener('change', async (e) => {
      state.notifListTopic = e.target.value;
      state.notifListPage = 1;
      await loadList();
    });
    root.querySelector('[data-notif-list-perf]')?.addEventListener('change', async (e) => {
      state.notifListPerf = e.target.value;
      state.notifListPage = 1;
      await loadList();
    });
    let searchTimer = null;
    root.querySelector('[data-notif-list-query]')?.addEventListener('input', (e) => {
      state.notifListQuery = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.notifListPage = 1;
        loadList();
      }, 300);
    });
    root.querySelectorAll('[data-notif-list-page]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const dir = btn.getAttribute('data-notif-list-page');
        state.notifListPage = Math.max(1, (state.notifListPage || 1) + (dir === 'next' ? 1 : -1));
        await loadList();
      });
    });

    // Composer fields
    const form = state.notifComposer;
    if (form && state.notifComposerOpen) {
      root.querySelectorAll('[data-notif-field]').forEach((el) => {
        const evt = el.tagName === 'SELECT' || el.type === 'radio' ? 'change' : 'input';
        el.addEventListener(evt, async () => {
          const key = el.getAttribute('data-notif-field');
          if (key === 'delivery' || key === 'audience_mode') {
            if (key === 'delivery') form.delivery = el.value;
            if (key === 'audience_mode') {
              form.audience = form.audience || { mode: 'everyone', filters: {} };
              form.audience.mode = el.value;
            }
            onRender();
            await refreshEstimate(state, api);
            onRender();
            return;
          }
          if (key === 'custom_path') {
            form.destination_payload = { ...form.destination_payload, path: el.value };
            return;
          }
          if (key === 'chain_id') {
            form.destination_payload = { ...form.destination_payload, chainId: el.value };
            return;
          }
          form[key] = el.value;
          if (key === 'topic') {
            applyTopicDefaults(form, state.notifData?.constants);
            onRender();
            await refreshEstimate(state, api);
            onRender();
            return;
          }
          if (key === 'title' || key === 'message' || key === 'sound_key' || key === 'confirmToken') {
            if (key !== 'confirmToken') onRender();
            else form.confirmToken = el.value;
          }
        });
      });

      root.querySelectorAll('[data-notif-filter]').forEach((el) => {
        el.addEventListener('change', async () => {
          const key = el.getAttribute('data-notif-filter');
          form.audience = form.audience || { mode: 'custom', filters: {} };
          form.audience.filters = { ...form.audience.filters, [key]: el.value };
          await refreshEstimate(state, api);
          onRender();
        });
      });

      root.querySelectorAll('[data-notif-preview-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          form.previewTab = btn.getAttribute('data-notif-preview-tab');
          onRender();
        });
      });

      root.querySelector('[data-notif-preview-sound]')?.addEventListener('click', () => {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) {
            setFlash('Sound preview is unavailable in this browser. Native assets are still required for device notification sounds.', 'err');
            onRender();
            return;
          }
          if (form.sound_key === 'silent') {
            setFlash('Silent — no preview tone.');
            onRender();
            return;
          }
          const ctx = new Ctx();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.value = form.sound_key === 'heartbeat' ? 220 : 660;
          g.gain.value = 0.05;
          o.start();
          setTimeout(() => {
            o.stop();
            ctx.close();
          }, 180);
          setFlash('Preview tone played. This is not a platform notification sound asset.');
          onRender();
        } catch {
          setFlash('Could not play preview.', 'err');
          onRender();
        }
      });

      root.querySelector('[data-notif-save-draft]')?.addEventListener('click', async () => {
        form.busy = true;
        form.error = null;
        onRender();
        try {
          const saved = await api('notification-save', {
            method: 'POST',
            body: { ...composerPayload(form), status: 'draft' },
          });
          form.id = saved.id;
          setFlash('Draft saved.');
          state.notifComposerOpen = false;
          await loadData();
        } catch (err) {
          form.error = err.message || 'Could not save draft.';
          form.busy = false;
          onRender();
        }
      });

      root.querySelector('[data-notif-send-test]')?.addEventListener('click', async () => {
        try {
          const res = await api('notification-send-test', { method: 'POST', body: composerPayload(form) });
          setFlash(res.message || 'Test send unavailable.', res.ok ? 'ok' : 'err');
          onRender();
        } catch (err) {
          setFlash(err.message || 'Test send failed.', 'err');
          onRender();
        }
      });

      root.querySelector('[data-notif-review]')?.addEventListener('click', async () => {
        form.error = null;
        if (!form.title?.trim() || !form.message?.trim()) {
          form.error = 'Title and message are required.';
          onRender();
          return;
        }
        await refreshEstimate(state, api);
        form.step = 'review';
        onRender();
      });

      root.querySelector('[data-notif-back-edit]')?.addEventListener('click', () => {
        form.step = 'edit';
        form.error = null;
        onRender();
      });

      root.querySelector('[data-notif-confirm-send]')?.addEventListener('click', async () => {
        form.busy = true;
        form.error = null;
        onRender();
        try {
          const payload = composerPayload(form);
          const threshold = state.notifData?.constants?.largeSendConfirmThreshold || 10000;
          const typeThreshold = state.notifData?.constants?.globalSendTypeConfirmThreshold || 50000;
          const est = form.estimated_audience || 0;
          let confirmToken;
          if (est >= typeThreshold) confirmToken = form.confirmToken;
          else if (est >= threshold) confirmToken = 'confirmed';

          if (form.delivery === 'schedule') {
            await api('notification-schedule', { method: 'POST', body: payload });
            setFlash('Notification scheduled. Cron / Process queue will dispatch at the scheduled time.');
          } else {
            const res = await api('notification-send', {
              method: 'POST',
              body: { ...payload, confirmToken },
            });
            setFlash(res.dispatch?.message || 'Notification queued for delivery.');
          }
          state.notifComposerOpen = false;
          state.notifComposer = null;
          await loadData();
        } catch (err) {
          form.error = err.message || 'Could not send.';
          form.busy = false;
          form.step = 'review';
          onRender();
        }
      });
    }
  }

  return { render, bind, emptyComposer };
})();

if (typeof window !== 'undefined') window.OwnerNotifications = OwnerNotifications;
