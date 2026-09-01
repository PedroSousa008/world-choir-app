/**
 * Owner — Map sponsor / company management
 */
const OwnerMapSponsors = (() => {
  const CONTRACT_STATUSES = [
    ['draft', 'Draft'],
    ['negotiating', 'Negotiating'],
    ['pending_signature', 'Pending Signature'],
    ['active', 'Active'],
    ['expired', 'Expired'],
    ['terminated', 'Terminated'],
    ['renewing', 'Renewing'],
    ['other', 'Other'],
  ];

  const PAYMENT_STRUCTURES = [
    ['one_time', 'One-time'],
    ['monthly', 'Monthly'],
    ['quarterly', 'Quarterly'],
    ['annually', 'Annually'],
    ['milestone', 'Milestone-based'],
    ['custom', 'Custom'],
  ];

  const PAYMENT_STATUSES = [
    ['not_applicable', 'Not applicable'],
    ['pending', 'Pending'],
    ['partially_paid', 'Partially paid'],
    ['paid', 'Paid'],
    ['overdue', 'Overdue'],
    ['custom', 'Custom'],
  ];

  const AGREEMENT_TYPES = [
    ['sponsorship', 'Sponsorship Agreement'],
    ['partnership', 'Partnership Agreement'],
    ['in_kind', 'In-Kind Partnership'],
    ['promotional', 'Promotional Partnership'],
    ['strategic', 'Strategic Partnership'],
    ['other', 'Other'],
  ];

  const MOBILE_MAX_VISIBLE = 6;
  const DESKTOP_MAX_VISIBLE = 10;
  const SPOTS_PER_PAGE = 8;

  let dragId = null;

  function scrollToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function statusLabel(isActive) {
    return isActive ? 'Active' : 'Inactive';
  }

  function contractStatusLabel(status) {
    return CONTRACT_STATUSES.find(([id]) => id === status)?.[1] || status || '—';
  }

  function filterCompanies(companies, query, filter) {
    let rows = companies || [];
    const q = String(query || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) =>
        `${c.companyName} ${c.country || ''} ${c.internalReference || ''}`.toLowerCase().includes(q)
      );
    }
    if (filter === 'active') rows = rows.filter((c) => c.isActive);
    if (filter === 'inactive') rows = rows.filter((c) => !c.isActive);
    return rows;
  }

  function formatAddedDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
      });
    } catch {
      return '—';
    }
  }

  function visibleCount(activeCount, max) {
    return Math.min(activeCount, max);
  }

  function renderStatCards(data, esc) {
    const o = data?.overview || {};
    const capacity = data?.capacity ?? 20;
    const active = o.activeCount ?? 0;
    const mobileVisible = visibleCount(active, MOBILE_MAX_VISIBLE);
    const desktopVisible = visibleCount(active, DESKTOP_MAX_VISIBLE);

    return `
      <div class="owner-sponsors-stats">
        <div class="owner-sponsors-stat">
          <span class="owner-sponsors-stat__icon" aria-hidden="true">◎</span>
          <div>
            <span class="owner-sponsors-stat__val">${esc(capacity)}</span>
            <span class="owner-sponsors-stat__lbl">Total Spots</span>
          </div>
        </div>
        <div class="owner-sponsors-stat">
          <span class="owner-sponsors-stat__icon" aria-hidden="true">◉</span>
          <div>
            <span class="owner-sponsors-stat__val">${esc(active)} Active</span>
            <span class="owner-sponsors-stat__lbl">Active Sponsors</span>
          </div>
        </div>
        <div class="owner-sponsors-stat">
          <span class="owner-sponsors-stat__icon" aria-hidden="true">▢</span>
          <div>
            <span class="owner-sponsors-stat__val">${esc(mobileVisible)} / ${esc(MOBILE_MAX_VISIBLE)}</span>
            <span class="owner-sponsors-stat__lbl">Visible Now (Mobile) · Max ${esc(MOBILE_MAX_VISIBLE)}</span>
          </div>
        </div>
        <div class="owner-sponsors-stat">
          <span class="owner-sponsors-stat__icon" aria-hidden="true">▣</span>
          <div>
            <span class="owner-sponsors-stat__val">${esc(desktopVisible)} / ${esc(DESKTOP_MAX_VISIBLE)}</span>
            <span class="owner-sponsors-stat__lbl">Visible Now (Desktop) · Max ${esc(DESKTOP_MAX_VISIBLE)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderStatusPill(isActive, isEmpty = false) {
    if (isEmpty) {
      return '<span class="owner-sponsors-status owner-sponsors-status--empty"><span class="owner-sponsors-status__dot"></span>Empty</span>';
    }
    if (isActive) {
      return '<span class="owner-sponsors-status owner-sponsors-status--active"><span class="owner-sponsors-status__dot"></span>Active</span>';
    }
    return '<span class="owner-sponsors-status owner-sponsors-status--inactive"><span class="owner-sponsors-status__dot"></span>Inactive</span>';
  }

  function renderTableRow(slot, esc, { isFirst, isLast }) {
    const pos = slot.position;
    const s = slot.sponsor;

    if (!s) {
      return `
        <tr class="owner-sponsors-row owner-sponsors-row--empty" data-sponsor-slot="${pos}">
          <td class="owner-sponsors-row__drag" aria-hidden="true"></td>
          <td class="owner-sponsors-row__order">${pad2(pos)}</td>
          <td class="owner-sponsors-row__company">
            <span class="owner-sponsors-row__empty-icon" aria-hidden="true">+</span>
            <span>
              <strong>Available Spot</strong>
              <span class="owner-muted owner-sponsors-row__hint">Add a company to this position</span>
            </span>
          </td>
          <td class="owner-sponsors-row__website">—</td>
          <td class="owner-sponsors-row__status">${renderStatusPill(false, true)}</td>
          <td class="owner-sponsors-row__added">—</td>
          <td class="owner-sponsors-row__actions">
            <button type="button" class="owner-sponsors-icon-btn" data-sponsor-create-at="${pos}" aria-label="Add company to spot ${pad2(pos)}">+</button>
          </td>
        </tr>
      `;
    }

    const logo = s.companyLogoUrl
      ? `<img src="${esc(s.companyLogoUrl)}" alt="" class="owner-sponsors-row__logo">`
      : '<span class="owner-sponsors-row__logo owner-sponsors-row__logo--empty" aria-hidden="true">—</span>';

    const websiteCell = s.companyWebsiteUrl
      ? `<a href="${esc(s.companyWebsiteUrl)}" target="_blank" rel="noopener noreferrer" class="owner-sponsors-link" data-sponsor-stop>${esc(s.companyWebsiteUrl.replace(/^https?:\/\//, ''))} <span aria-hidden="true">↗</span></a>`
      : '<span class="owner-muted">—</span>';

    return `
      <tr
        class="owner-sponsors-row"
        data-sponsor-slot="${pos}"
        data-sponsor-id="${esc(s.id)}"
        draggable="true"
      >
        <td class="owner-sponsors-row__drag" title="Drag to reorder" aria-label="Drag to reorder">⠿</td>
        <td class="owner-sponsors-row__order">${pad2(pos)}</td>
        <td class="owner-sponsors-row__company">
          ${logo}
          <strong>${esc(s.companyName)}</strong>
        </td>
        <td class="owner-sponsors-row__website">${websiteCell}</td>
        <td class="owner-sponsors-row__status">${renderStatusPill(s.isActive)}</td>
        <td class="owner-sponsors-row__added">${esc(formatAddedDate(s.createdAt))}</td>
        <td class="owner-sponsors-row__actions">
          <button type="button" class="owner-sponsors-icon-btn" data-sponsor-edit="${esc(s.id)}" aria-label="Edit ${esc(s.companyName)}">✎</button>
          <button type="button" class="owner-sponsors-icon-btn" data-sponsor-move="up" data-sponsor-id="${esc(s.id)}" ${isFirst ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button type="button" class="owner-sponsors-icon-btn" data-sponsor-move="down" data-sponsor-id="${esc(s.id)}" ${isLast ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button type="button" class="owner-sponsors-icon-btn" data-sponsor-deactivate="${esc(s.id)}" aria-label="Deactivate ${esc(s.companyName)}">⊘</button>
        </td>
      </tr>
    `;
  }

  function renderPagination(state, totalPages, esc) {
    if (totalPages <= 1) return '';
    const page = state.sponsorsPage || 1;
    return `
      <nav class="owner-sponsors-pagination" aria-label="Roster pages">
        <button type="button" class="owner-sponsors-pagination__btn" data-sponsor-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
        ${Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => `
          <button type="button" class="owner-sponsors-pagination__btn ${n === page ? 'is-active' : ''}" data-sponsor-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>
        `).join('')}
        <button type="button" class="owner-sponsors-pagination__btn" data-sponsor-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="Next page">›</button>
      </nav>
    `;
  }

  function renderSidebar(data, esc) {
    const o = data?.overview || {};
    const active = o.activeCount ?? 0;
    const mobileVisible = visibleCount(active, MOBILE_MAX_VISIBLE);
    const desktopVisible = visibleCount(active, DESKTOP_MAX_VISIBLE);
    const inactiveCount = o.inactiveCount ?? 0;

    return `
      <aside class="owner-sponsors-aside">
        <div class="owner-sponsors-card">
          <h3 class="owner-sponsors-card__title">Public Sponsor Bar</h3>
          <p class="owner-muted">Active sponsors appear on the World Choir Map header belt.</p>
          <div class="owner-sponsors-card__metrics">
            <div><span class="owner-muted">Mobile</span><strong>${esc(mobileVisible)}</strong></div>
            <div><span class="owner-muted">Desktop</span><strong>${esc(desktopVisible)}</strong></div>
          </div>
          <a class="owner-btn-ghost owner-sponsors-card__btn" href="/map" target="_blank" rel="noopener noreferrer">View Public Preview ↗</a>
        </div>

        <div class="owner-sponsors-card">
          <h3 class="owner-sponsors-card__title">Information</h3>
          <ul class="owner-sponsors-info">
            <li><strong>Reorder</strong><span>Drag and drop to change the order of sponsors.</span></li>
            <li><strong>Auto-Compaction</strong><span>When a sponsor is removed or deactivated, remaining sponsors move up automatically.</span></li>
            <li><strong>Visibility</strong><span>Only active sponsors are included in the public rotation.</span></li>
            <li><strong>Changes Apply Immediately</strong><span>All changes are reflected on the public sponsor bar after save.</span></li>
          </ul>
        </div>

        ${inactiveCount > 0 ? `
          <div class="owner-sponsors-card">
            <h3 class="owner-sponsors-card__title">Inactive Companies</h3>
            <p class="owner-muted">${esc(inactiveCount)} inactive ${inactiveCount === 1 ? 'company' : 'companies'} stored.</p>
            <button type="button" class="owner-btn-ghost owner-sponsors-card__btn" data-sponsor-view="inactive">View inactive</button>
          </div>
        ` : ''}
      </aside>
    `;
  }

  function renderRosterTable(state, helpers) {
    const { esc } = helpers;
    const data = state.sponsorsData || { slots: [], capacity: 20 };
    const allSlots = data.slots || [];
    const capacity = data.capacity ?? 20;
    const totalPages = Math.max(1, Math.ceil(capacity / SPOTS_PER_PAGE));
    const page = Math.min(Math.max(1, state.sponsorsPage || 1), totalPages);
    const start = (page - 1) * SPOTS_PER_PAGE;
    const pageSlots = allSlots.slice(start, start + SPOTS_PER_PAGE);

    const activeSlots = allSlots.filter((slot) => slot.sponsor);
    const activeIds = activeSlots.map((slot) => slot.sponsor.id);
    const firstId = activeIds[0] || null;
    const lastId = activeIds[activeIds.length - 1] || null;

    return `
      <div class="owner-sponsors-table-wrap">
        <table class="owner-sponsors-table">
          <thead>
            <tr>
              <th scope="col" class="owner-sponsors-row__drag"></th>
              <th scope="col">Order</th>
              <th scope="col">Company</th>
              <th scope="col">Website</th>
              <th scope="col">Status</th>
              <th scope="col">Added</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody data-sponsor-roster>
            ${pageSlots.map((slot) => renderTableRow(slot, esc, {
              isFirst: slot.sponsor?.id === firstId,
              isLast: slot.sponsor?.id === lastId,
            })).join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination(state, totalPages, esc)}
    `;
  }

  function renderInactiveList(state, helpers) {
    const { esc } = helpers;
    const inactive = state.sponsorsData?.inactive || [];
    if (!inactive.length) {
      return '<p class="owner-muted">No inactive companies.</p>';
    }
    return `
      <div class="owner-table-wrap">
        <table class="owner-table">
          <thead>
            <tr><th>Company</th><th>Contract</th><th>Updated</th><th></th></tr>
          </thead>
          <tbody>
            ${inactive.map((s) => `
              <tr>
                <td>${s.companyLogoUrl ? `<img src="${esc(s.companyLogoUrl)}" alt="" class="owner-dap-logo"> ` : ''}${esc(s.companyName)}</td>
                <td>${esc(contractStatusLabel(s.contractStatus))}</td>
                <td>${esc((s.updatedAt || '').slice(0, 10))}</td>
                <td>
                  <button type="button" class="owner-btn-ghost" data-sponsor-edit="${esc(s.id)}">Edit</button>
                  <button type="button" class="owner-btn-ghost" data-sponsor-reactivate="${esc(s.id)}">Reactivate</button>
                  <button type="button" class="owner-btn-ghost" data-sponsor-delete="${esc(s.id)}" data-sponsor-name="${esc(s.companyName)}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function field(label, html) {
    return `<label class="owner-field"><span class="owner-field__lbl">${label}</span>${html}</label>`;
  }

  function renderContactFields(prefix, contact, esc) {
    const c = contact || {};
    return `
      ${field('Full Name', `<input class="owner-input" name="${prefix}.fullName" value="${esc(c.fullName || '')}">`)}
      ${field('Position / Role', `<input class="owner-input" name="${prefix}.role" value="${esc(c.role || '')}">`)}
      ${field('Email', `<input class="owner-input" type="email" name="${prefix}.email" value="${esc(c.email || '')}">`)}
      ${field('Phone', `<input class="owner-input" name="${prefix}.phone" value="${esc(c.phone || '')}">`)}
      ${field('Notes', `<textarea class="owner-input" name="${prefix}.notes" rows="2">${esc(c.notes || '')}</textarea>`)}
    `;
  }

  function renderContractFields(contract, esc) {
    const c = contract || {};
    return `
      <div class="owner-form-grid">
        ${field('Contract Status', `<select class="owner-input" name="contract.status">${CONTRACT_STATUSES.map(([id, label]) => `<option value="${id}" ${c.status === id ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}
        ${field('Agreement Type', `<select class="owner-input" name="contract.agreementType">${AGREEMENT_TYPES.map(([id, label]) => `<option value="${id}" ${c.agreementType === id ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}
        ${field('Contract Start', `<input class="owner-input" type="date" name="contract.startDate" value="${esc(c.startDate || '')}">`)}
        ${field('Contract End', `<input class="owner-input" type="date" name="contract.endDate" value="${esc(c.endDate || '')}">`)}
        ${field('Date Signed', `<input class="owner-input" type="date" name="contract.signedDate" value="${esc(c.signedDate || '')}">`)}
        ${field('Renewal Date', `<input class="owner-input" type="date" name="contract.renewalDate" value="${esc(c.renewalDate || '')}">`)}
        ${field('Renewal Reminder', `<input class="owner-input" type="date" name="contract.renewalReminderDate" value="${esc(c.renewalReminderDate || '')}">`)}
        ${field('Contract Value', `<input class="owner-input" type="number" step="0.01" name="contract.value" value="${esc(c.value ?? '')}">`)}
        ${field('Currency', `<input class="owner-input" name="contract.currency" value="${esc(c.currency || 'EUR')}">`)}
        ${field('Payment Structure', `<select class="owner-input" name="contract.paymentStructure">${PAYMENT_STRUCTURES.map(([id, label]) => `<option value="${id}" ${c.paymentStructure === id ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}
        ${field('Payment Status', `<select class="owner-input" name="contract.paymentStatus">${PAYMENT_STATUSES.map(([id, label]) => `<option value="${id}" ${c.paymentStatus === id ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}
        ${field('Amount Paid', `<input class="owner-input" type="number" step="0.01" name="contract.amountPaid" value="${esc(c.amountPaid ?? '')}">`)}
        ${field('Amount Outstanding', `<input class="owner-input" type="number" step="0.01" name="contract.amountOutstanding" value="${esc(c.amountOutstanding ?? '')}">`)}
        ${field('Invoice Reference', `<input class="owner-input" name="contract.invoiceReference" value="${esc(c.invoiceReference || '')}">`)}
      </div>
      ${field('World Choir Deliverables', `<textarea class="owner-input" name="contract.ownerDeliverables" rows="3">${esc(c.ownerDeliverables || '')}</textarea>`)}
      ${field('Company Deliverables', `<textarea class="owner-input" name="contract.companyDeliverables" rows="3">${esc(c.companyDeliverables || '')}</textarea>`)}
      ${field('Exclusivity Terms', `<textarea class="owner-input" name="contract.exclusivityTerms" rows="2">${esc(c.exclusivityTerms || '')}</textarea>`)}
      ${field('Territory / Geographic Scope', `<textarea class="owner-input" name="contract.territory" rows="2">${esc(c.territory || '')}</textarea>`)}
      ${field('Usage Rights', `<textarea class="owner-input" name="contract.usageRights" rows="2">${esc(c.usageRights || '')}</textarea>`)}
      ${field('Brand / Logo Usage Rights', `<textarea class="owner-input" name="contract.logoUsageRights" rows="2">${esc(c.logoUsageRights || '')}</textarea>`)}
      ${field('Campaign / Event Applicability', `<textarea class="owner-input" name="contract.campaignApplicability" rows="2">${esc(c.campaignApplicability || '')}</textarea>`)}
      ${field('Renewal Terms', `<textarea class="owner-input" name="contract.renewalTerms" rows="2">${esc(c.renewalTerms || '')}</textarea>`)}
      ${field('Termination Terms', `<textarea class="owner-input" name="contract.terminationTerms" rows="2">${esc(c.terminationTerms || '')}</textarea>`)}
      ${field('Special Conditions', `<textarea class="owner-input" name="contract.specialConditions" rows="2">${esc(c.specialConditions || '')}</textarea>`)}
      ${field('Internal Contract Notes', `<textarea class="owner-input" name="contract.internalNotes" rows="3">${esc(c.internalNotes || '')}</textarea>`)}
    `;
  }

  function renderDocuments(sponsor, esc) {
    const docs = sponsor?.documents || [];
    if (!docs.length) return '<p class="owner-muted">No documents uploaded.</p>';
    return `
      <ul class="owner-sponsor-docs">
        ${docs.map((d) => `
          <li class="owner-sponsor-docs__item">
            <div>
              <strong>${esc(d.name)}</strong>
              <span class="owner-muted">${esc((d.uploadedAt || '').slice(0, 10))}${d.description ? ` · ${esc(d.description)}` : ''}</span>
            </div>
            <div>
              <a class="owner-btn-ghost" href="/api/admin?action=download-map-sponsor-document&id=${encodeURIComponent(sponsor.id)}&documentId=${encodeURIComponent(d.id)}" data-sponsor-stop>Download</a>
              <button type="button" class="owner-btn-ghost" data-sponsor-delete-doc="${esc(d.id)}">Delete</button>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function getNextAvailableSpot(data) {
    const slots = data?.slots || [];
    const empty = slots.find((s) => !s.sponsor);
    if (empty) return empty.position;
    const active = data?.overview?.activeCount ?? 0;
    const capacity = data?.capacity ?? 20;
    return Math.min(active + 1, capacity);
  }

  function getLogoPreviewSrc(state, sponsor) {
    if (state.sponsorPendingLogo?.dataUrl) return state.sponsorPendingLogo.dataUrl;
    return sponsor?.companyLogoUrl || '';
  }

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif|avif|ico|tiff?|jfif)$/i.test(file.name || '');
  }

  function renderFormSection(num, title, subtitle, body, open = true) {
    return `
      <details class="owner-sponsor-form-section" ${open ? 'open' : ''}>
        <summary class="owner-sponsor-form-section__head">
          <span class="owner-sponsor-form-section__num">${num}</span>
          <span class="owner-sponsor-form-section__titles">
            <strong>${title}</strong>
            <span>${subtitle}</span>
          </span>
          <span class="owner-sponsor-form-section__chev" aria-hidden="true"></span>
        </summary>
        <div class="owner-sponsor-form-section__body">${body}</div>
      </details>
    `;
  }

  function renderFormSidebar(state, helpers) {
    const { esc } = helpers;
    const sponsor = state.sponsorDetail || {};
    const data = state.sponsorsData || {};
    const nextSpot = pad2(getNextAvailableSpot(data));
    const logoSrc = getLogoPreviewSrc(state, sponsor);
    const companyName = sponsor.companyName || 'Company';
    const website = sponsor.companyWebsiteUrl || '';
    const websiteDisplay = website ? website.replace(/^https?:\/\//, '') : 'example.com';

    const logoPreview = logoSrc
      ? `<img src="${esc(logoSrc)}" alt="" class="owner-sponsor-form-preview__logo">`
      : `<span class="owner-sponsor-form-preview__logo-placeholder" aria-hidden="true">🌐</span>`;

    return `
      <aside class="owner-sponsor-form-aside">
        <div class="owner-sponsors-card">
          <h3 class="owner-sponsors-card__title">Spot Assignment</h3>
          <p class="owner-muted">This company will be added to the next available spot.</p>
          <div class="owner-sponsor-form-spot">
            <span class="owner-sponsor-form-spot__num">${esc(nextSpot)}</span>
            <span class="owner-muted">Next Available Spot</span>
          </div>
        </div>

        <div class="owner-sponsors-card">
          <h3 class="owner-sponsors-card__title">Public Display Preview</h3>
          <p class="owner-muted">When active, this logo will appear in the public sponsor bar rotation.</p>
          <div class="owner-sponsor-form-preview" id="owner-sponsor-public-preview">
            ${logoPreview}
            <strong id="owner-sponsor-preview-name">${esc(companyName)}</strong>
            <span class="owner-muted" id="owner-sponsor-preview-website">${esc(websiteDisplay)}</span>
          </div>
        </div>

        <div class="owner-sponsors-card">
          <h3 class="owner-sponsors-card__title">Guidelines</h3>
          <ul class="owner-sponsor-form-guidelines">
            <li>Use high quality logos (transparent background recommended)</li>
            <li>Logos should be square (1:1 ratio)</li>
            <li>Company name should be recognizable in the logo</li>
            <li>Keep descriptions concise and professional</li>
            <li>Ensure all information is accurate before saving</li>
          </ul>
        </div>
      </aside>
    `;
  }

  function renderForm(state, helpers) {
    const { esc } = helpers;
    const mode = state.sponsorFormMode;
    const sponsor = state.sponsorDetail || {};
    const isEdit = mode === 'edit';
    const isCreate = mode === 'create';
    const title = isEdit ? `Edit ${sponsor.companyName || 'Company'}` : 'Add Company';
    const subtitle = isCreate
      ? 'Create a new company profile to add to the World Choir sponsor roster.'
      : 'Update company details, branding, and contacts.';
    const logoSrc = getLogoPreviewSrc(state, sponsor);
    const descLen = String(sponsor.internalNotes || '').length;
    const primary = sponsor.contacts?.primary || {};
    const secondary = sponsor.contacts?.secondary || {};

    const section1 = `
      <div class="owner-sponsor-form-grid owner-sponsor-form-grid--2">
        ${field('Company Name *', `<input class="owner-input" name="companyName" required value="${esc(sponsor.companyName || '')}" placeholder="e.g. Nike, Inc." data-sponsor-preview="name">`)}
        ${field('Website URL *', `<input class="owner-input" name="companyWebsiteUrl" required value="${esc(sponsor.companyWebsiteUrl || '')}" placeholder="https://www.example.com" data-sponsor-preview="website">`)}
      </div>
      <label class="owner-field owner-field--full">
        <span class="owner-field__lbl">Short Description</span>
        <textarea class="owner-input" name="internalNotes" rows="3" maxlength="200" placeholder="Enter a short description..." data-sponsor-desc>${esc(sponsor.internalNotes || '')}</textarea>
        <span class="owner-sponsor-form-counter"><span data-sponsor-desc-count>${descLen}</span> / 200</span>
      </label>
      ${field('Status', `
        <select class="owner-input owner-sponsor-form-status" name="isActive">
          <option value="1" ${sponsor.isActive !== false ? 'selected' : ''}>● Active</option>
          <option value="0" ${sponsor.isActive === false ? 'selected' : ''}>○ Inactive</option>
        </select>
      `)}
    `;

    const section2 = `
      <div class="owner-sponsor-form-branding">
        <div class="owner-sponsor-form-branding__upload">
          <label class="owner-field">
            <span class="owner-field__lbl">Company Logo *</span>
            <span class="owner-muted owner-sponsor-form-hint">Recommended: PNG or SVG, transparent background, at least 512×512px</span>
          </label>
          <div class="owner-sponsor-form-dropzone" id="owner-sponsor-logo-dropzone">
            <input type="file" id="owner-sponsor-logo-upload" class="owner-sponsor-form-dropzone__input" accept="image/*">
            <div class="owner-sponsor-form-dropzone__inner">
              <span class="owner-sponsor-form-dropzone__icon" aria-hidden="true">☁</span>
              <strong>Upload Logo</strong>
              <span class="owner-muted">Drag and drop or click to browse</span>
              <span class="owner-muted owner-sponsor-form-dropzone__types">All image types · up to 8 MB</span>
            </div>
          </div>
          ${state.sponsorPendingLogo?.fileName ? `<p class="owner-muted owner-sponsor-form-file">${esc(state.sponsorPendingLogo.fileName)}</p>` : ''}
        </div>
        <div class="owner-sponsor-form-branding__preview">
          <span class="owner-field__lbl">Logo Preview</span>
          <div class="owner-sponsor-form-logo-preview" id="owner-sponsor-logo-preview">
            ${logoSrc
              ? `<img src="${esc(logoSrc)}" alt="">`
              : '<span class="owner-sponsor-form-logo-preview__empty"><span aria-hidden="true">🌐</span><strong>COMPANY</strong></span>'}
          </div>
        </div>
      </div>
      <label class="owner-field owner-field--full">
        <span class="owner-field__lbl">Website URL (Public)</span>
        <span class="owner-muted owner-sponsor-form-hint">The company website that will be linked from the public sponsor bar.</span>
        <input class="owner-input" name="companyWebsiteUrlPublic" value="${esc(sponsor.companyWebsiteUrl || '')}" placeholder="https://www.example.com" data-sponsor-preview="website-public">
      </label>
    `;

    const section3 = `
      <p class="owner-muted owner-sponsor-form-section-note">Primary company contacts</p>
      <div class="owner-sponsor-form-grid owner-sponsor-form-grid--3">
        ${field('Primary Contact Name', `<input class="owner-input" name="contacts.primary.fullName" value="${esc(primary.fullName || '')}" placeholder="Full name">`)}
        ${field('Email Address', `<input class="owner-input" type="email" name="contacts.primary.email" value="${esc(primary.email || '')}" placeholder="email@company.com">`)}
        ${field('Phone Number', `<input class="owner-input" name="contacts.primary.phone" value="${esc(primary.phone || '')}" placeholder="+1 (555) 000-0000">`)}
      </div>
      <div class="owner-sponsor-form-grid owner-sponsor-form-grid--3">
        ${field('Position / Role', `<input class="owner-input" name="contacts.primary.role" value="${esc(primary.role || '')}" placeholder="e.g. Marketing Director">`)}
        ${field('Secondary Contact (Optional)', `<input class="owner-input" name="contacts.secondary.fullName" value="${esc(secondary.fullName || '')}" placeholder="Full name">`)}
        ${field('Secondary Email (Optional)', `<input class="owner-input" type="email" name="contacts.secondary.email" value="${esc(secondary.email || '')}" placeholder="email@company.com">`)}
      </div>
    `;

    const advancedSections = isEdit ? `
      ${renderFormSection('4', 'Contract &amp; Partnership', 'Private commercial information', renderContractFields(sponsor.contract, esc), false)}
      ${renderFormSection('5', 'Internal Notes', 'Additional private notes', `
        ${field('Partnership Notes', `<textarea class="owner-input" name="partnershipNotes" rows="3">${esc(sponsor.partnershipNotes || '')}</textarea>`)}
        ${field('Legal Company Name', `<input class="owner-input" name="legalCompanyName" value="${esc(sponsor.legalCompanyName || '')}">`)}
        ${field('Internal Reference', `<input class="owner-input" name="internalReference" value="${esc(sponsor.internalReference || '')}">`)}
        ${field('Country', `<input class="owner-input" name="country" value="${esc(sponsor.country || '')}">`)}
        ${field('Address', `<textarea class="owner-input" name="address" rows="2">${esc(sponsor.address || '')}</textarea>`)}
      `, false)}
      ${renderFormSection('6', 'Contract Documents', 'Private supporting files', `
        <div class="owner-upload" style="margin-bottom:12px">
          <label class="owner-upload__pick">
            <input type="file" id="owner-sponsor-doc-upload" accept=".pdf,.doc,.docx,.txt,image/*">
            Upload document
          </label>
          <input class="owner-input" id="owner-sponsor-doc-desc" placeholder="Optional description" style="margin-top:8px">
        </div>
        ${renderDocuments(sponsor, esc)}
      `, false)}
    ` : '';

    return `
      <div class="owner-sponsors-page owner-sponsors-form-page">
        <div class="owner-sponsor-form-toolbar">
          <button type="button" class="owner-sponsor-form-back" data-sponsor-form-cancel>‹ Back to Sponsors</button>
          <div class="owner-sponsor-form-toolbar__actions">
            <button type="button" class="owner-btn-ghost" data-sponsor-form-cancel>Cancel</button>
            <button type="submit" form="owner-sponsor-form" class="owner-btn" ${state.sponsorsBusy ? 'disabled' : ''}>${state.sponsorsBusy ? 'Saving…' : 'Save Company'}</button>
          </div>
        </div>

        <header class="owner-sponsor-form-intro">
          <h2 class="owner-sponsor-form-intro__title">${esc(title)}</h2>
          <p class="owner-sponsor-form-intro__sub">${esc(subtitle)}</p>
        </header>

        <div class="owner-sponsor-form-layout">
          <form id="owner-sponsor-form" class="owner-sponsor-form-main">
            <input type="hidden" name="id" value="${esc(sponsor.id || '')}">
            ${renderFormSection('1', 'Company Information', 'Basic company details and status', section1)}
            ${renderFormSection('2', 'Branding &amp; Website', 'Logo and public-facing brand assets', section2)}
            ${renderFormSection('3', 'Contacts', 'Primary company contacts', section3)}
            ${advancedSections}
            ${isEdit ? `
              <div class="owner-sponsor-form-footer">
                <button type="button" class="owner-btn-ghost" data-sponsor-delete="${esc(sponsor.id)}" data-sponsor-name="${esc(sponsor.companyName)}">Delete Company</button>
              </div>
            ` : ''}
          </form>
          ${renderFormSidebar(state, helpers)}
        </div>
      </div>
    `;
  }

  function render(state, helpers) {
    const { esc } = helpers;

    if (state.sponsorsBusy && !state.sponsorsData && !state.sponsorFormMode) {
      return '<p class="owner-muted">Loading sponsors…</p>';
    }

    if (state.sponsorFormMode) {
      return renderForm(state, helpers);
    }

    const data = state.sponsorsData;
    if (!data) {
      return '<p class="owner-muted">Loading sponsors…</p>';
    }

    if (state.sponsorsView === 'inactive') {
      return `
        <div class="owner-sponsors-page">
          <header class="owner-sponsors-header">
            <div>
              <h2 class="owner-sponsors-header__title">Inactive Companies</h2>
              <p class="owner-sponsors-header__sub">Stored companies not in the public rotation.</p>
            </div>
            <button type="button" class="owner-btn-ghost" data-sponsor-view="roster">← Back to roster</button>
          </header>
          <section class="owner-section">${renderInactiveList(state, helpers)}</section>
        </div>
      `;
    }

    return `
      <div class="owner-sponsors-page">
        <header class="owner-sponsors-header">
          <div>
            <h2 class="owner-sponsors-header__title">Sponsors</h2>
            <p class="owner-sponsors-header__sub">Manage companies supporting World Choir. Active sponsors appear on the public map sponsor bar.</p>
          </div>
          <div class="owner-sponsors-header__actions">
            <a class="owner-btn-ghost" href="/map" target="_blank" rel="noopener noreferrer">View Public Preview ↗</a>
            <button type="button" class="owner-btn" data-sponsor-create>+ Add Company</button>
          </div>
        </header>

        ${renderStatCards(data, esc)}

        <div class="owner-sponsors-layout">
          <div class="owner-sponsors-main">
            ${renderRosterTable(state, helpers)}
          </div>
          ${renderSidebar(data, esc)}
        </div>
      </div>
    `;
  }

  function parseNestedForm(fd) {
    const body = {};
    for (const [key, value] of fd.entries()) {
      if (!key.includes('.')) {
        body[key] = value;
        continue;
      }
      const parts = key.split('.');
      let cur = body;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = cur[parts[i]] || {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
    }
    return body;
  }

  function buildUpdatePayload(raw) {
    const contract = raw.contract || {};
    const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
    const website = String(raw.companyWebsiteUrl || raw.companyWebsiteUrlPublic || '').trim();

    return {
      companyName: String(raw.companyName || '').trim(),
      legalCompanyName: String(raw.legalCompanyName || '').trim(),
      internalReference: String(raw.internalReference || '').trim(),
      companyWebsiteUrl: website,
      address: String(raw.address || '').trim(),
      country: String(raw.country || '').trim(),
      internalNotes: String(raw.internalNotes || '').trim(),
      partnershipNotes: String(raw.partnershipNotes || '').trim(),
      contacts: raw.contacts,
      contract: {
        ...contract,
        value: numOrNull(contract.value),
        amountPaid: numOrNull(contract.amountPaid),
        amountOutstanding: numOrNull(contract.amountOutstanding),
      },
    };
  }

  function updateFormPreview(root) {
    const name = root.querySelector('[name="companyName"]')?.value?.trim() || 'Company';
    const website = root.querySelector('[name="companyWebsiteUrl"]')?.value?.trim()
      || root.querySelector('[name="companyWebsiteUrlPublic"]')?.value?.trim()
      || '';
    const websiteDisplay = website ? website.replace(/^https?:\/\//, '') : 'example.com';
    const nameEl = root.querySelector('#owner-sponsor-preview-name');
    const webEl = root.querySelector('#owner-sponsor-preview-website');
    if (nameEl) nameEl.textContent = name;
    if (webEl) webEl.textContent = websiteDisplay;
  }

  function bindFormInteractions(root, state, ctx) {
    const form = root.querySelector('#owner-sponsor-form');
    if (!form) return;

    const desc = form.querySelector('[data-sponsor-desc]');
    const descCount = form.querySelector('[data-sponsor-desc-count]');
    desc?.addEventListener('input', () => {
      if (descCount) descCount.textContent = String(desc.value.length);
    });

    const websiteMain = form.querySelector('[name="companyWebsiteUrl"]');
    const websitePublic = form.querySelector('[name="companyWebsiteUrlPublic"]');
    websiteMain?.addEventListener('input', () => {
      if (websitePublic) websitePublic.value = websiteMain.value;
      updateFormPreview(root);
    });
    websitePublic?.addEventListener('input', () => {
      if (websiteMain) websiteMain.value = websitePublic.value;
      updateFormPreview(root);
    });
    form.querySelector('[name="companyName"]')?.addEventListener('input', () => updateFormPreview(root));

    const processLogoFile = async (file) => {
      if (!file) return;
      if (!isImageFile(file)) {
        ctx.setFlash('Please choose an image file from your device.', 'err');
        ctx.onRender();
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        ctx.setFlash('Logo must be under 8 MB.', 'err');
        ctx.onRender();
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        if (state.sponsorFormMode === 'create' || !state.sponsorDetail?.id) {
          state.sponsorPendingLogo = { dataUrl: reader.result, fileName: file.name };
          ctx.onRender();
          return;
        }

        state.sponsorsBusy = true;
        ctx.onRender();
        try {
          const res = await ctx.api('upload-map-sponsor-logo', {
            method: 'POST',
            body: { id: state.sponsorDetail.id, dataUrl: reader.result, fileName: file.name },
          });
          state.sponsorDetail = res.sponsor;
          state.sponsorPendingLogo = null;
          ctx.setFlash('Logo uploaded.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
        } finally {
          state.sponsorsBusy = false;
          ctx.onRender();
        }
      };
      reader.onerror = () => {
        ctx.setFlash('Could not read that image file.', 'err');
        ctx.onRender();
      };
      reader.readAsDataURL(file);
    };

    const logoInput = root.querySelector('#owner-sponsor-logo-upload');
    logoInput?.addEventListener('change', () => {
      const file = logoInput.files?.[0];
      processLogoFile(file);
      logoInput.value = '';
    });

    const dropzone = root.querySelector('#owner-sponsor-logo-dropzone');
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('is-dragover');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        const file = e.dataTransfer?.files?.[0];
        processLogoFile(file);
      });
    }
  }

  function bindDragDrop(root, state, ctx) {
    const roster = root.querySelector('[data-sponsor-roster]');
    if (!roster) return;

    roster.querySelectorAll('.owner-sponsors-row[data-sponsor-id]').forEach((row) => {
      row.addEventListener('dragstart', (e) => {
        dragId = row.getAttribute('data-sponsor-id');
        row.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      });

      row.addEventListener('dragend', () => {
        dragId = null;
        row.classList.remove('is-dragging');
        roster.querySelectorAll('.owner-sponsors-row').forEach((el) => el.classList.remove('is-drop-target'));
      });

      row.addEventListener('dragover', (e) => {
        if (!dragId) return;
        e.preventDefault();
        row.classList.add('is-drop-target');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('is-drop-target');
      });

      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        row.classList.remove('is-drop-target');
        const targetId = row.getAttribute('data-sponsor-id');
        if (!dragId || !targetId || dragId === targetId) return;

        const active = (state.sponsorsData?.slots || [])
          .map((s) => s.sponsor)
          .filter(Boolean);
        const ids = active.map((s) => s.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;

        ids.splice(to, 0, ids.splice(from, 1)[0]);
        state.sponsorsReorderBusy = true;
        ctx.onRender();
        try {
          const data = await ctx.api('reorder-map-sponsors', { method: 'POST', body: { orderedIds: ids } });
          state.sponsorsData = data;
          ctx.setFlash('Sponsor order updated.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
        } finally {
          state.sponsorsReorderBusy = false;
          ctx.onRender();
        }
      });
    });
  }

  function bind(root, state, helpers, ctx) {
    const { esc } = helpers;

    root.querySelectorAll('[data-sponsor-stop]').forEach((el) => {
      el.addEventListener('click', (e) => e.stopPropagation());
    });

    root.querySelector('[data-sponsor-refresh]')?.addEventListener('click', async () => {
      state.sponsorsData = null;
      await ctx.loadData(true);
    });

    root.querySelector('[data-sponsor-create]')?.addEventListener('click', () => {
      state.sponsorFormMode = 'create';
      state.sponsorDetail = { isActive: true, contacts: { primary: {}, secondary: {} }, contract: {} };
      state.sponsorPendingLogo = null;
      scrollToTop();
      ctx.onRender();
    });

    root.querySelectorAll('[data-sponsor-create-at]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.sponsorFormMode = 'create';
        state.sponsorDetail = { isActive: true, contacts: { primary: {}, secondary: {} }, contract: {} };
        state.sponsorPendingLogo = null;
        scrollToTop();
        ctx.onRender();
      });
    });

    root.querySelectorAll('[data-sponsor-form-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.sponsorFormMode = null;
        state.sponsorDetail = null;
        state.sponsorPendingLogo = null;
        scrollToTop();
        ctx.onRender();
      });
    });

    root.querySelectorAll('[data-sponsor-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.sponsorsView = btn.getAttribute('data-sponsor-view');
        if (state.sponsorsView === 'roster') state.sponsorsPage = 1;
        scrollToTop();
        ctx.onRender();
      });
    });

    root.querySelectorAll('[data-sponsor-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = Number(btn.getAttribute('data-sponsor-page'));
        if (!Number.isFinite(next) || next < 1) return;
        state.sponsorsPage = next;
        scrollToTop();
        ctx.onRender();
      });
    });

    root.querySelector('[data-sponsor-query]')?.addEventListener('input', (e) => {
      state.sponsorsQuery = e.target.value;
      ctx.onRender();
    });

    root.querySelectorAll('[data-sponsor-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sponsor-edit');
        try {
          const res = await ctx.api('map-sponsor', { query: `&id=${encodeURIComponent(id)}` });
          state.sponsorDetail = res.sponsor;
          state.sponsorFormMode = 'edit';
          state.sponsorPendingLogo = null;
          scrollToTop();
          ctx.onRender();
        } catch (err) {
          ctx.setFlash(err.message, 'err');
          ctx.onRender();
        }
      });
    });

    root.querySelectorAll('[data-sponsor-deactivate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sponsor-deactivate');
        if (!confirm('Deactivate this company? It will be removed from the public Map belt but its record will be preserved.')) return;
        try {
          await ctx.api('set-map-sponsor-status', { method: 'POST', body: { id, isActive: false } });
          state.sponsorsData = null;
          await ctx.loadData(true);
          ctx.setFlash('Company deactivated.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
          ctx.onRender();
        }
      });
    });

    root.querySelectorAll('[data-sponsor-reactivate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sponsor-reactivate');
        try {
          await ctx.api('set-map-sponsor-status', { method: 'POST', body: { id, isActive: true } });
          state.sponsorsData = null;
          await ctx.loadData(true);
          ctx.setFlash('Company reactivated.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
          ctx.onRender();
        }
      });
    });

    root.querySelectorAll('[data-sponsor-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sponsor-delete');
        const name = btn.getAttribute('data-sponsor-name') || 'this company';
        if (!confirm(`Delete ${name}?\n\nThis permanently removes the company record and associated stored information.`)) return;
        if (!confirm('This cannot be undone. Delete permanently?')) return;
        try {
          await ctx.api('delete-map-sponsor', { method: 'POST', body: { id } });
          state.sponsorFormMode = null;
          state.sponsorDetail = null;
          state.sponsorsData = null;
          await ctx.loadData(true);
          ctx.setFlash('Company deleted.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
          ctx.onRender();
        }
      });
    });

    root.querySelectorAll('[data-sponsor-move]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sponsor-id');
        const dir = btn.getAttribute('data-sponsor-move');
        const active = (state.sponsorsData?.slots || []).map((s) => s.sponsor).filter(Boolean);
        const ids = active.map((s) => s.id);
        const idx = ids.indexOf(id);
        if (idx < 0) return;
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= ids.length) return;
        [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
        try {
          const data = await ctx.api('reorder-map-sponsors', { method: 'POST', body: { orderedIds: ids } });
          state.sponsorsData = data;
          ctx.setFlash('Sponsor order updated.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
        }
        ctx.onRender();
      });
    });

    bindDragDrop(root, state, ctx);
    bindFormInteractions(root, state, ctx);

    const docInput = root.querySelector('#owner-sponsor-doc-upload');
    docInput?.addEventListener('change', async () => {
      const file = docInput.files?.[0];
      if (!file || !state.sponsorDetail?.id) return;
      if (file.size > 15 * 1024 * 1024) {
        ctx.setFlash('Document must be under 15 MB.', 'err');
        ctx.onRender();
        return;
      }
      const desc = root.querySelector('#owner-sponsor-doc-desc')?.value || '';
      const reader = new FileReader();
      reader.onload = async () => {
        state.sponsorsBusy = true;
        ctx.onRender();
        try {
          const res = await ctx.api('upload-map-sponsor-document', {
            method: 'POST',
            body: {
              id: state.sponsorDetail.id,
              dataUrl: reader.result,
              fileName: file.name,
              description: desc,
            },
          });
          state.sponsorDetail = res.sponsor;
          ctx.setFlash('Document uploaded.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
        } finally {
          state.sponsorsBusy = false;
          docInput.value = '';
          ctx.onRender();
        }
      };
      reader.readAsDataURL(file);
    });

    root.querySelectorAll('[data-sponsor-delete-doc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const documentId = btn.getAttribute('data-sponsor-delete-doc');
        if (!state.sponsorDetail?.id) return;
        if (!confirm('Delete this document?')) return;
        try {
          const res = await ctx.api('delete-map-sponsor-document', {
            method: 'POST',
            body: { id: state.sponsorDetail.id, documentId },
          });
          state.sponsorDetail = res.sponsor;
          ctx.setFlash('Document deleted.');
        } catch (err) {
          ctx.setFlash(err.message, 'err');
        }
        ctx.onRender();
      });
    });

    const form = root.querySelector('#owner-sponsor-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const raw = parseNestedForm(fd);
      const payload = buildUpdatePayload(raw);
      state.sponsorsBusy = true;
      ctx.onRender();

      try {
        if (state.sponsorFormMode === 'create') {
          const isActive = raw.isActive !== '0';
          const res = await ctx.api('create-map-sponsor', {
            method: 'POST',
            body: { ...payload, isActive },
          });
          let sponsor = res.sponsor;
          if (state.sponsorPendingLogo?.dataUrl) {
            const logoRes = await ctx.api('upload-map-sponsor-logo', {
              method: 'POST',
              body: {
                id: sponsor.id,
                dataUrl: state.sponsorPendingLogo.dataUrl,
                fileName: state.sponsorPendingLogo.fileName,
              },
            });
            sponsor = logoRes.sponsor;
          }
          state.sponsorDetail = sponsor;
          state.sponsorPendingLogo = null;
          state.sponsorFormMode = 'edit';
          state.sponsorsData = null;
          await ctx.loadData(true);
          ctx.setFlash('Company created.');
        } else {
          const id = raw.id;
          const res = await ctx.api('update-map-sponsor', {
            method: 'POST',
            body: { id, ...payload },
          });
          const wantsActive = raw.isActive !== '0';
          if (wantsActive !== !!state.sponsorDetail.isActive) {
            const statusRes = await ctx.api('set-map-sponsor-status', {
              method: 'POST',
              body: { id, isActive: wantsActive },
            });
            state.sponsorDetail = statusRes.sponsor;
          } else {
            state.sponsorDetail = res.sponsor;
          }
          state.sponsorsData = null;
          await ctx.loadData(true);
          ctx.setFlash('Company saved.');
        }
      } catch (err) {
        ctx.setFlash(err.message, 'err');
      } finally {
        state.sponsorsBusy = false;
        ctx.onRender();
      }
    });
  }

  return { render, bind };
})();
