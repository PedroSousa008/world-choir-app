/**
 * Owner — Daily Acts library + Sponsorship / Partnership management
 */
const OwnerDailyPeacePartnerships = (() => {
  const THEMES = [
    { id: 'kindness', label: 'Kindness' },
    { id: 'connection', label: 'Connection' },
    { id: 'courage', label: 'Courage' },
    { id: 'compassion', label: 'Compassion' },
    { id: 'understanding', label: 'Understanding' },
    { id: 'generosity', label: 'Generosity' },
    { id: 'presence', label: 'Presence' },
    { id: 'community', label: 'Community' },
  ];

  function statusLabel(status) {
    const map = {
      draft: 'Draft',
      scheduled: 'Scheduled',
      active: 'Active',
      expired: 'Expired',
      paused: 'Paused',
      cancelled: 'Cancelled',
    };
    return map[status] || status;
  }

  function renderSpark(daily, key = 'viewed') {
    if (!daily?.length) return '<p class="owner-muted">No daily data yet.</p>';
    const max = Math.max(1, ...daily.map((d) => Number(d[key] || 0)));
    return `
      <div class="owner-chart" role="img" aria-label="Daily performance chart">
        ${daily.slice(-42).map((d) => {
          const val = Number(d[key] || 0);
          const h = Math.max(4, Math.round((val / max) * 100));
          return `<span class="owner-chart__bar" style="height:${h}%" title="${d.date}: ${val}"></span>`;
        }).join('')}
      </div>
    `;
  }

  function filterActs(acts, query, filter) {
    let rows = acts || [];
    const q = String(query || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((a) =>
        `${a.text} ${a.categoryLabel} ${a.partnership?.companyName || ''} ${a.actId}`.toLowerCase().includes(q)
      );
    }
    if (filter === 'sponsored') rows = rows.filter((a) => a.partnership);
    if (filter === 'not_sponsored') rows = rows.filter((a) => !a.partnership);
    if (filter === 'company_created') rows = rows.filter((a) => a.source === 'company_created');
    if (filter === 'standard') rows = rows.filter((a) => a.source === 'standard');
    if (filter === 'active') rows = rows.filter((a) => a.partnership?.status === 'active');
    if (filter === 'expired') rows = rows.filter((a) => a.partnership?.status === 'expired');
    return rows;
  }

  function renderLibrary(state, helpers) {
    const { esc, money } = helpers;
    const lib = state.dapLibrary || { catalogCount: 0, acts: [], partnerships: [] };
    const rows = filterActs(lib.acts, state.dapQuery, state.dapFilter);

    return `
      <section class="owner-section">
        <p class="owner-section__label">Daily Acts Library</p>
        <h2 class="owner-h1">${lib.catalogCount} Daily Acts</h2>
        <p class="owner-sub">Complete World Choir catalog from the database — ${lib.partnerships?.length || 0} partnership${(lib.partnerships?.length || 0) === 1 ? '' : 's'} configured.</p>
        <div class="owner-chips" style="margin:16px 0">
          ${[
            ['library', 'Library'],
            ['engagement', 'Engagement'],
            ['partnerships', 'Partnerships'],
          ].map(([id, label]) => `
            <button type="button" class="owner-chip ${state.dapView === id ? 'is-active' : ''}" data-dap-view="${id}">${label}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
          <button type="button" class="owner-btn" data-dap-create-partnership>Create Daily Act Partnership</button>
          <button type="button" class="owner-btn-ghost" data-dap-refresh-library>Refresh</button>
        </div>
        <input class="owner-input" type="search" placeholder="Search acts, categories, sponsors…" value="${esc(state.dapQuery)}" data-dap-query style="margin-bottom:12px">
        <div class="owner-chips" style="margin-bottom:14px">
          ${[
            ['all', 'All'],
            ['sponsored', 'Sponsored'],
            ['not_sponsored', 'Not Sponsored'],
            ['company_created', 'Company-Created'],
            ['standard', 'Standard'],
            ['active', 'Active'],
            ['expired', 'Expired'],
          ].map(([id, label]) => `
            <button type="button" class="owner-chip ${state.dapFilter === id ? 'is-active' : ''}" data-dap-filter="${id}">${label}</button>
          `).join('')}
        </div>
        <div class="owner-table-wrap">
          <table class="owner-table owner-table--dap">
            <thead>
              <tr>
                <th>Act</th>
                <th>Category</th>
                <th>Partnership</th>
                <th>Sponsor</th>
                <th>Assignment</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((a) => {
                const p = a.partnership;
                const sponsored = !!p;
                return `
                  <tr class="owner-table__row" data-dap-act="${esc(a.actId)}">
                    <td>${esc(a.text?.slice(0, 80))}${a.text?.length > 80 ? '…' : ''}</td>
                    <td>${esc(a.categoryLabel || a.category)}</td>
                    <td>${sponsored ? 'Sponsored' : 'Not Sponsored'}</td>
                    <td>${p?.companyLogoUrl ? `<img src="${esc(p.companyLogoUrl)}" alt="" class="owner-dap-logo"> ${esc(p.companyName)}` : '—'}</td>
                    <td>${p ? (p.assignmentMethod === 'specific_date' ? `Specific · ${esc(p.specificDate)}` : `Random · ${p.randomMinDay}–${p.randomMaxDay}`) : 'Standard'}</td>
                    <td>${p ? esc(statusLabel(p.status)) : '—'}</td>
                    <td>
                      ${sponsored ? `<button type="button" class="owner-btn-ghost" data-dap-open-partnership="${esc(p.id)}">Manage</button>` : `<button type="button" class="owner-btn-ghost" data-dap-sponsor-act="${esc(a.actId)}">Partner</button>`}
                    </td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="7" class="owner-empty">No acts match this filter.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderPartnershipList(state, helpers) {
    const { esc, money } = helpers;
    const lib = state.dapLibrary || { partnerships: [] };
    const partnerships = lib.partnerships || [];

    return `
      <section class="owner-section">
        <p class="owner-section__label">Partnerships</p>
        <div class="owner-chips" style="margin:16px 0">
          ${[
            ['library', 'Library'],
            ['engagement', 'Engagement'],
            ['partnerships', 'Partnerships'],
          ].map(([id, label]) => `
            <button type="button" class="owner-chip ${state.dapView === id ? 'is-active' : ''}" data-dap-view="${id}">${label}</button>
          `).join('')}
        </div>
        <button type="button" class="owner-btn" data-dap-create-partnership style="margin-bottom:16px">Create Partnership</button>
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead>
              <tr><th>Company</th><th>Act</th><th>Type</th><th>Assignment</th><th>Period</th><th>Amount</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              ${partnerships.length ? partnerships.map((p) => {
                const act = (state.dapLibrary?.acts || []).find((a) => a.actId === p.actId);
                return `
                  <tr>
                    <td>${p.companyLogoUrl ? `<img src="${esc(p.companyLogoUrl)}" alt="" class="owner-dap-logo">` : ''} ${esc(p.companyName)}</td>
                    <td>${esc(act?.text?.slice(0, 48) || p.actId)}</td>
                    <td>${p.partnershipType === 'company_created' ? 'Company-Created' : 'Sponsored Standard'}</td>
                    <td>${p.assignmentMethod === 'specific_date' ? esc(p.specificDate) : `Random ${p.randomMinDay}–${p.randomMaxDay}`}</td>
                    <td>${esc(p.startDate)} → ${esc(p.endDate)}</td>
                    <td>${money(p.contractedAmount, p.currency)}</td>
                    <td>${esc(statusLabel(p.status))}</td>
                    <td><button type="button" class="owner-btn-ghost" data-dap-open-partnership="${esc(p.id)}">Details</button></td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="8" class="owner-empty">No partnerships yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderPartnershipDetail(state, helpers) {
    const { esc, money } = helpers;
    const detail = state.dapPartnershipDetail;
    if (!detail?.partnership) return '<p class="owner-empty">Partnership not found.</p>';
    const p = detail.partnership;
    const a = detail.analytics || {};
    const act = detail.act || {};

    return `
      <section class="owner-section">
        <button type="button" class="owner-btn-ghost" data-dap-back-library>← Back to library</button>
        <div class="owner-dap-detail-head" style="margin-top:16px">
          ${p.companyLogoUrl ? `<img src="${esc(p.companyLogoUrl)}" alt="" class="owner-dap-detail-logo">` : ''}
          <div>
            <h2 class="owner-h1">${esc(p.companyName)}</h2>
            <p class="owner-muted">${esc(statusLabel(p.status))} · ${p.partnershipType === 'company_created' ? 'Company-Created Act' : 'Sponsored Standard Act'}</p>
            <p class="owner-muted">${esc(p.startDate)} → ${esc(p.endDate)} · ${money(p.contractedAmount, p.currency)}</p>
          </div>
        </div>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Act</p>
        <p class="owner-h2" style="font-size:1rem">${esc(act.text || act.title || '')}</p>
        ${act.explanation ? `<p class="owner-muted">${esc(act.explanation)}</p>` : ''}
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Impact</p>
        <div class="owner-groups">
          <div class="owner-group"><span class="owner-metric__value">${Number(a.reach || 0).toLocaleString()}</span><span class="owner-metric__label">Reach</span></div>
          <div class="owner-group"><span class="owner-metric__value">${Number(a.views || 0).toLocaleString()}</span><span class="owner-metric__label">Views</span></div>
          <div class="owner-group"><span class="owner-metric__value">${Number(a.completions || 0).toLocaleString()}</span><span class="owner-metric__label">Completed</span></div>
          <div class="owner-group"><span class="owner-metric__value">${(a.completionRate || 0).toFixed(1)}%</span><span class="owner-metric__label">Completion Rate</span></div>
          <div class="owner-group"><span class="owner-metric__value">${Number(a.logoImpressions || 0).toLocaleString()}</span><span class="owner-metric__label">Logo Impressions</span></div>
          <div class="owner-group"><span class="owner-metric__value">${Number(a.uniqueLogoClicks || 0).toLocaleString()}</span><span class="owner-metric__label">Unique Clicks</span></div>
          <div class="owner-group"><span class="owner-metric__value">${(a.ctrUnique || 0).toFixed(2)}%</span><span class="owner-metric__label">CTR</span></div>
        </div>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Daily Performance</p>
        <p class="owner-muted" style="margin-bottom:8px">Reach over time</p>
        ${renderSpark(a.daily, 'reached')}
        <p class="owner-muted" style="margin:16px 0 8px">Logo clicks</p>
        ${renderSpark(a.daily, 'totalClicks')}
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Geography</p>
        <div class="owner-table-wrap">
          <table class="owner-table">
            <thead><tr><th>Country</th><th>Reached</th><th>Completed</th><th>Clicks</th></tr></thead>
            <tbody>
              ${Object.entries(a.countries || {}).length ? Object.entries(a.countries).map(([country, s]) => `
                <tr><td>${esc(country)}</td><td>${s.reached || 0}</td><td>${s.completed || 0}</td><td>${s.clicks || 0}</td></tr>
              `).join('') : `<tr><td colspan="4" class="owner-empty">No geographic data yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <section class="owner-section">
        <p class="owner-section__label">Actions</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <button type="button" class="owner-btn-ghost" data-dap-edit-partnership="${esc(p.id)}">Edit</button>
          ${p.status === 'draft' || p.status === 'scheduled' ? `<button type="button" class="owner-btn" data-dap-publish-partnership="${esc(p.id)}">Publish</button>` : ''}
          ${p.status === 'active' ? `<button type="button" class="owner-btn-ghost" data-dap-pause-partnership="${esc(p.id)}">Pause</button>` : ''}
          ${p.status === 'paused' ? `<button type="button" class="owner-btn" data-dap-resume-partnership="${esc(p.id)}">Resume</button>` : ''}
          <a class="owner-btn-ghost" href="/api/admin?action=daily-peace-partnership-export&id=${encodeURIComponent(p.id)}" download>Export Report</a>
        </div>
      </section>
    `;
  }

  function renderPartnershipForm(state, helpers) {
    const { esc } = helpers;
    const form = state.dapForm || {};
    const isEdit = !!form.id;
    const lib = state.dapLibrary || { catalogCount: 403, acts: [] };
    const catalogActs = (lib.acts || []).filter((a) => a.source === 'standard');

    return `
      <section class="owner-section">
        <button type="button" class="owner-btn-ghost" data-dap-back-library>← Cancel</button>
        <p class="owner-section__label" style="margin-top:16px">${isEdit ? 'Edit Partnership' : 'Create Partnership'}</p>
        <h2 class="owner-h1">${isEdit ? 'Update sponsorship' : 'New sponsorship'}</h2>
        ${state.dapFormError ? `<p class="owner-flash owner-flash--error">${esc(state.dapFormError)}</p>` : ''}
        <form class="owner-form" id="dap-partnership-form">
          <div class="owner-form__grid">
            <label>Company name<input class="owner-input" name="companyName" value="${esc(form.companyName || '')}" required></label>
            <label>Website URL<input class="owner-input" name="companyWebsiteUrl" type="url" value="${esc(form.companyWebsiteUrl || '')}" placeholder="https://company.com" required></label>
            <label>Partnership type
              <select class="owner-input" name="partnershipType" id="dap-partnership-type">
                <option value="sponsored_standard" ${form.partnershipType !== 'company_created' ? 'selected' : ''}>Sponsored Standard Act</option>
                <option value="company_created" ${form.partnershipType === 'company_created' ? 'selected' : ''}>Company-Created Act</option>
              </select>
            </label>
            <label>Start date<input class="owner-input" name="startDate" type="date" value="${esc(form.startDate || '')}" required></label>
            <label>End date<input class="owner-input" name="endDate" type="date" value="${esc(form.endDate || '')}" required></label>
            <label>Contracted amount<input class="owner-input" name="contractedAmount" type="number" min="0" step="0.01" value="${esc(form.contractedAmount ?? '')}"></label>
            <label>Currency<input class="owner-input" name="currency" value="${esc(form.currency || 'EUR')}"></label>
            <label>Payment status
              <select class="owner-input" name="paymentStatus">
                ${['pending', 'partially_paid', 'paid', 'overdue', 'cancelled'].map((s) => `
                  <option value="${s}" ${form.paymentStatus === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>
                `).join('')}
              </select>
            </label>
            <label>Assignment method
              <select class="owner-input" name="assignmentMethod" id="dap-assignment-method">
                <option value="random" ${form.assignmentMethod !== 'specific_date' ? 'selected' : ''}>Random Daily Assignment</option>
                <option value="specific_date" ${form.assignmentMethod === 'specific_date' ? 'selected' : ''}>Specific Calendar Day</option>
              </select>
            </label>
            <label id="dap-field-random-min" style="${form.assignmentMethod === 'specific_date' ? 'display:none' : ''}">Min journey day<input class="owner-input" name="randomMinDay" type="number" min="1" value="${esc(form.randomMinDay ?? 1)}"></label>
            <label id="dap-field-random-max" style="${form.assignmentMethod === 'specific_date' ? 'display:none' : ''}">Max journey day<input class="owner-input" name="randomMaxDay" type="number" min="1" value="${esc(form.randomMaxDay ?? lib.catalogCount)}"></label>
            <label id="dap-field-specific-date" style="${form.assignmentMethod === 'specific_date' ? '' : 'display:none'}">Specific date<input class="owner-input" name="specificDate" type="date" value="${esc(form.specificDate || '')}"></label>
          </div>

          <div id="dap-standard-act-picker" style="${form.partnershipType === 'company_created' ? 'display:none' : ''};margin-top:16px">
            <label>Daily Act
              <select class="owner-input" name="actId">
                <option value="">Select an act…</option>
                ${catalogActs.map((a) => `
                  <option value="${esc(a.actId)}" ${form.actId === a.actId ? 'selected' : ''}>${esc(a.text?.slice(0, 72))}</option>
                `).join('')}
              </select>
            </label>
          </div>

          <div id="dap-company-act-fields" style="${form.partnershipType === 'company_created' ? '' : 'display:none'};margin-top:16px">
            <label>Act title<input class="owner-input" name="companyActText" value="${esc(form.companyAct?.text || '')}"></label>
            <label>Act description<textarea class="owner-input" name="companyActExplanation" rows="3">${esc(form.companyAct?.explanation || '')}</textarea></label>
            <label>Category
              <select class="owner-input" name="companyActCategory">
                ${THEMES.map((t) => `<option value="${t.id}" ${form.companyAct?.category === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </label>
          </div>

          <label style="margin-top:16px;display:block">Internal notes (Owner only)<textarea class="owner-input" name="internalNotes" rows="3">${esc(form.internalNotes || '')}</textarea></label>

          <label style="margin-top:16px;display:block">Company logo
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="dap-logo-upload">
            ${form.companyLogoUrl ? `<img src="${esc(form.companyLogoUrl)}" alt="" class="owner-dap-detail-logo" style="margin-top:8px">` : ''}
          </label>

          <div class="owner-dap-preview" style="margin-top:24px">
            <p class="owner-section__label">User preview</p>
            <div class="owner-dap-preview-card">
              <div class="owner-dap-preview-meta">
                <div><span class="owner-dap-preview-label">Revealed</span><span>${esc(form.startDate || '—')}</span></div>
                <div><span class="owner-dap-preview-label">Featured by</span>${form.companyLogoUrl ? `<img src="${esc(form.companyLogoUrl)}" alt="" class="owner-dap-logo">` : '<span class="owner-muted">Logo</span>'}</div>
              </div>
              <p class="owner-h2" style="font-size:1rem;margin-top:12px">${esc(form.companyAct?.text || catalogActs.find((a) => a.actId === form.actId)?.text || 'Act title')}</p>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:20px">
            <button type="submit" class="owner-btn">${isEdit ? 'Save changes' : 'Save draft'}</button>
            ${!isEdit ? '' : `<button type="button" class="owner-btn" data-dap-publish-partnership="${esc(form.id)}">Publish</button>`}
          </div>
        </form>
      </section>
    `;
  }

  function render(state, helpers, engagementHtml) {
    if (state.dapFormMode) return renderPartnershipForm(state, helpers);
    if (state.dapPartnershipId && state.dapPartnershipDetail) {
      return renderPartnershipDetail(state, helpers);
    }
    if (state.dapView === 'partnerships') return renderPartnershipList(state, helpers);
    if (state.dapView === 'engagement') return engagementHtml;
    return renderLibrary(state, helpers);
  }

  return {
    render,
    renderLibrary,
    renderPartnershipList,
    renderPartnershipDetail,
    renderPartnershipForm,
    THEMES,
  };
})();
