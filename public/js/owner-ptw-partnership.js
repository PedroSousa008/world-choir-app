/**
 * Owner — Pass the World → Partnership page.
 * Versioned configs, immutable history calendar, safe ON/OFF.
 */
const OwnerPtwPartnership = (() => {
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const FIELD_LABELS = {
    subtitle: 'Subtitle',
    tabLogo: 'Tab Logo',
    mapLogo: 'Map Logo',
    linkImage: 'Link Image',
    linkUrl: 'Link Image website',
  };

  function ensureState(state) {
    if (!state.ptwView) state.ptwView = 'main';
    if (!state.ptwPartnership) {
      state.ptwPartnership = {
        loading: false,
        saving: false,
        toggling: false,
        uploading: null,
        error: null,
        data: null,
        form: null,
        dirty: false,
        missing: [],
        calendar: null,
        calendarLoading: false,
        calendarError: null,
        calYear: null,
        calMonth: null,
        dayDetail: null,
        dayLoading: false,
        modal: null,
        toast: null,
        toastTimer: null,
      };
    }
    return state.ptwPartnership;
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function limits(ps) {
    return ps.data?.limits || {
      subtitleMaxChars: 120,
      linkUrlMaxChars: 2048,
      tabLogoRecommended: { width: 512, height: 512 },
      mapLogoRecommended: { width: 512, height: 512 },
      linkImageRecommended: { width: 1200, height: 630 },
    };
  }

  function formFromData(data) {
    const d = data?.draft || {};
    return {
      subtitle: String(d.subtitle || ''),
      tabLogo: d.tabLogo || null,
      mapLogo: d.mapLogo || null,
      linkImage: d.linkImage || null,
      linkUrl: String(d.linkUrl || ''),
    };
  }

  function recommendedLabel(rec) {
    if (!rec?.width || !rec?.height) return '';
    return `Recommended: ${rec.width} × ${rec.height} px`;
  }

  function showToast(ps, message, type = 'ok', renderFn = null) {
    ps.toast = { message, type };
    if (ps.toastTimer) clearTimeout(ps.toastTimer);
    ps.toastTimer = setTimeout(() => {
      ps.toast = null;
      ps.toastTimer = null;
      if (typeof renderFn === 'function') renderFn();
    }, 3200);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.readAsDataURL(file);
    });
  }

  async function load(ctx, { silent = false } = {}) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    if (ps.loading) return;
    ps.loading = true;
    if (!silent) {
      ps.error = null;
      render();
    }
    try {
      const data = await api('ptw-partnership');
      ps.data = data;
      if (!ps.dirty || !ps.form) {
        ps.form = formFromData(data);
        ps.dirty = false;
      }
      ps.missing = [];
      const now = new Date();
      if (ps.calYear == null) ps.calYear = now.getUTCFullYear();
      if (ps.calMonth == null) ps.calMonth = now.getUTCMonth() + 1;
      await loadCalendar(ctx, { silent: true });
    } catch (err) {
      ps.error = err.message || 'Could not load partnership settings.';
    } finally {
      ps.loading = false;
      render();
    }
  }

  async function loadCalendar(ctx, { silent = false } = {}) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    if (ps.calendarLoading) return;
    ps.calendarLoading = true;
    if (!silent) {
      ps.calendarError = null;
      render();
    }
    try {
      const year = ps.calYear;
      const month = ps.calMonth;
      const data = await api('ptw-partnership-history', {
        query: `&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`,
      });
      ps.calendar = data;
      ps.calendarError = null;
    } catch (err) {
      ps.calendarError = err.message || 'Could not load partnership history.';
    } finally {
      ps.calendarLoading = false;
      if (!silent) render();
    }
  }

  async function loadDayDetail(ctx, dateKey) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    ps.dayLoading = true;
    ps.dayDetail = { date: dateKey };
    render();
    try {
      const data = await api('ptw-partnership-day', {
        query: `&date=${encodeURIComponent(dateKey)}`,
      });
      ps.dayDetail = data;
    } catch (err) {
      ps.dayDetail = {
        date: dateKey,
        error: err.message || 'Could not load day details.',
      };
    } finally {
      ps.dayLoading = false;
      render();
    }
  }

  function markDirty(ps) {
    ps.dirty = true;
  }

  function syncFormFromInputs(root, ps) {
    if (!ps.form) return;
    const input = root.querySelector('[data-ptw-p-subtitle]');
    if (input) ps.form.subtitle = String(input.value || '').slice(0, limits(ps).subtitleMaxChars);
    const linkInput = root.querySelector('[data-ptw-p-link-url]');
    if (linkInput) {
      ps.form.linkUrl = String(linkInput.value || '').slice(0, limits(ps).linkUrlMaxChars || 2048);
    }
  }

  function renderUpload(field, label, hint, image, recommended, uploading, isMissing) {
    const busy = uploading === field;
    const has = Boolean(image?.url);
    return `
      <div class="owner-ptw-p-card owner-ptw-p-upload ${isMissing ? 'is-missing' : ''}" data-ptw-p-field="${esc(field)}">
        <div class="owner-ptw-p-card__head">
          <h3 class="owner-ptw-p-card__title">${esc(label)}</h3>
          <p class="owner-ptw-p-card__sub">${esc(hint)}</p>
        </div>
        <div class="owner-ptw-p-dropzone ${has ? 'has-file' : ''} ${busy ? 'is-busy' : ''}"
             data-ptw-p-drop="${esc(field)}"
             tabindex="0"
             role="button"
             aria-label="${esc(label)} upload">
          <input type="file" accept="image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.svg,.ico,.jfif,.gif"
                 class="owner-ptw-p-dropzone__input" data-ptw-p-file="${esc(field)}" ${busy ? 'disabled' : ''}>
          ${has ? `
            <div class="owner-ptw-p-dropzone__preview">
              <img src="${esc(image.url)}" alt="${esc(label)}" class="owner-ptw-p-dropzone__img">
            </div>
            <div class="owner-ptw-p-dropzone__meta">
              <p class="owner-ptw-p-dropzone__name">${esc(image.fileName || 'Uploaded image')}</p>
              <div class="owner-ptw-p-dropzone__actions">
                <button type="button" class="owner-btn-ghost" data-ptw-p-replace="${esc(field)}" ${busy ? 'disabled' : ''}>Replace</button>
                <button type="button" class="owner-btn-ghost" data-ptw-p-remove="${esc(field)}" ${busy ? 'disabled' : ''}>Remove</button>
              </div>
            </div>
          ` : `
            <div class="owner-ptw-p-dropzone__empty">
              <span class="owner-ptw-p-dropzone__icon" aria-hidden="true">☁</span>
              <strong>${busy ? 'Uploading…' : 'Upload image'}</strong>
              <span class="owner-muted">Drag and drop or click to browse</span>
              <span class="owner-muted">Any image from your device · up to 8 MB</span>
            </div>
          `}
          ${busy ? '<div class="owner-ptw-p-dropzone__progress" role="status">Uploading…</div>' : ''}
        </div>
        <p class="owner-ptw-p-recommend">${esc(recommended)}</p>
      </div>
    `;
  }

  function renderMissingBanner(missing) {
    if (!missing?.length) return '';
    const labels = missing.map((m) => FIELD_LABELS[m] || m).join(', ');
    return `
      <div class="owner-ptw-p-banner is-warn" role="alert">
        Complete the partnership information before activating.
        <span class="owner-muted">Missing: ${esc(labels)}</span>
      </div>`;
  }

  function renderModal(modal) {
    if (!modal) return '';
    return `
      <div class="owner-ptw-p-modal" role="dialog" aria-modal="true" aria-labelledby="owner-ptw-p-modal-title">
        <button type="button" class="owner-ptw-p-modal__backdrop" data-ptw-p-modal-cancel aria-label="Cancel"></button>
        <div class="owner-ptw-p-modal__card">
          <h3 id="owner-ptw-p-modal-title" class="owner-ptw-p-modal__title">${esc(modal.title)}</h3>
          <p class="owner-ptw-p-modal__body">${esc(modal.body)}</p>
          <div class="owner-ptw-p-modal__actions">
            <button type="button" class="owner-btn-ghost" data-ptw-p-modal-cancel>Cancel</button>
            <button type="button" class="owner-btn" data-ptw-p-modal-confirm>${esc(modal.confirmLabel)}</button>
          </div>
        </div>
      </div>`;
  }

  function renderDayModal(ps) {
    const d = ps.dayDetail;
    if (!d) return '';
    const title = formatLongDate(d.date);
    let body = '';
    if (ps.dayLoading) {
      body = '<p class="owner-muted">Loading day history…</p>';
    } else if (d.error) {
      body = `<p class="owner-muted">${esc(d.error)}</p>`;
    } else if (d.status === 'future') {
      body = '<p class="owner-muted">Future dates have no historical status yet.</p>';
    } else if (d.status === 'off' && !(d.events || []).length) {
      body = '<p class="owner-muted">Partnership was off for this entire day.</p>';
    } else {
      const eventsHtml = (d.events || []).length
        ? `
          <ol class="owner-ptw-p-day-events">
            ${(d.events || []).map((ev) => `
              <li>
                <time datetime="${esc(ev.at)}">${esc(formatTimeUTC(ev.at))}</time>
                <span>${esc(eventLabel(ev.type))}</span>
                ${ev.tabLogoUrl ? `<img src="${esc(ev.tabLogoUrl)}" alt="" class="owner-ptw-p-day-events__logo">` : ''}
                ${ev.subtitle ? `<span class="owner-muted">${esc(ev.subtitle)}</span>` : ''}
              </li>
            `).join('')}
          </ol>`
        : '';
      const segmentsHtml = (d.segments || []).map((seg) => `
        <article class="owner-ptw-p-day-seg">
          <p class="owner-ptw-p-day-seg__time">
            ${esc(formatTimeUTC(seg.startedAt))}
            – ${seg.endedAt ? esc(formatTimeUTC(seg.endedAt)) : 'ongoing'}
            <span class="owner-muted">UTC</span>
          </p>
          ${seg.subtitle ? `<p class="owner-ptw-p-day-seg__sub">${esc(seg.subtitle)}</p>` : ''}
          <div class="owner-ptw-p-day-seg__imgs">
            ${seg.tabLogoUrl ? `<figure><img src="${esc(seg.tabLogoUrl)}" alt="Tab logo"><figcaption>Tab</figcaption></figure>` : ''}
            ${seg.mapLogoUrl ? `<figure><img src="${esc(seg.mapLogoUrl)}" alt="Map logo"><figcaption>Map</figcaption></figure>` : ''}
            ${seg.linkImageUrl ? `<figure><img src="${esc(seg.linkImageUrl)}" alt="Link image"><figcaption>Link</figcaption></figure>` : ''}
          </div>
          ${seg.linkUrl ? `<p class="owner-ptw-p-day-seg__link"><a href="${esc(seg.linkUrl)}" target="_blank" rel="noopener noreferrer">${esc(seg.linkUrl)}</a></p>` : ''}
        </article>
      `).join('');
      body = `
        <p class="owner-ptw-p-day-status">${d.status === 'active' ? 'Partnership active' : 'Partnership off'}</p>
        ${eventsHtml}
        ${segmentsHtml || '<p class="owner-muted">No configuration segments recorded.</p>'}
      `;
    }
    return `
      <div class="owner-ptw-p-modal" role="dialog" aria-modal="true" aria-labelledby="owner-ptw-p-day-title">
        <button type="button" class="owner-ptw-p-modal__backdrop" data-ptw-p-day-close aria-label="Close"></button>
        <div class="owner-ptw-p-modal__card owner-ptw-p-modal__card--wide">
          <button type="button" class="owner-ptw-p-modal__x" data-ptw-p-day-close aria-label="Close">×</button>
          <h3 id="owner-ptw-p-day-title" class="owner-ptw-p-modal__title">${esc(title)}</h3>
          <div class="owner-ptw-p-day-body">${body}</div>
        </div>
      </div>`;
  }

  function eventLabel(type) {
    switch (type) {
      case 'activated': return 'Partnership activated';
      case 'deactivated': return 'Partnership turned off';
      case 'updated': return 'Partnership information updated';
      case 'superseded': return 'Configuration superseded';
      default: return type || 'Event';
    }
  }

  function formatTimeUTC(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false,
      }).format(new Date(iso));
    } catch {
      return String(iso).slice(11, 16);
    }
  }

  function formatLongDate(key) {
    const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return key || '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
    } catch {
      return key;
    }
  }

  function formatMonthTitle(year, month) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
    } catch {
      return `${year}-${month}`;
    }
  }

  function renderCalendar(ps) {
    const cal = ps.calendar;
    const year = ps.calYear;
    const month = ps.calMonth;
    const title = formatMonthTitle(year, month);

    let grid = '';
    if (ps.calendarLoading && !cal) {
      grid = '<p class="owner-muted">Loading calendar…</p>';
    } else if (ps.calendarError && !cal) {
      grid = `<p class="owner-muted">${esc(ps.calendarError)}</p>
        <button type="button" class="owner-btn-ghost" data-ptw-p-cal-retry>Retry</button>`;
    } else if (cal) {
      const byDate = new Map((cal.days || []).map((d) => [d.date, d]));
      const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 Sun
      const mondayIndex = (firstDow + 6) % 7;
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const cells = [];
      for (let i = 0; i < mondayIndex; i += 1) {
        cells.push('<div class="owner-ptw-p-cal__cell is-empty" aria-hidden="true"></div>');
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const info = byDate.get(key) || { status: 'off', logos: [] };
        const isToday = cal.today === key;
        const logos = (info.logos || []).slice(0, 3);
        const logosHtml = logos.map((l) => (
          `<img src="${esc(l.url)}" alt="" class="owner-ptw-p-cal__logo">`
        )).join('');
        cells.push(`
          <button type="button"
            class="owner-ptw-p-cal__cell is-${esc(info.status)} ${isToday ? 'is-today' : ''}"
            data-ptw-p-day="${esc(key)}"
            aria-label="${esc(formatLongDate(key))}, ${info.status === 'active' ? 'partnership active' : info.status === 'future' ? 'future' : 'partnership off'}">
            <span class="owner-ptw-p-cal__num">${day}</span>
            <span class="owner-ptw-p-cal__logos">${logosHtml}</span>
          </button>
        `);
      }
      grid = `
        <div class="owner-ptw-p-cal__weekdays">
          ${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}
        </div>
        <div class="owner-ptw-p-cal__grid">${cells.join('')}</div>
        ${ps.calendarLoading ? '<p class="owner-muted owner-ptw-p-cal__loading">Updating…</p>' : ''}
      `;
    }

    return `
      <section class="owner-ptw-p-history">
        <header class="owner-ptw-p-history__head">
          <div>
            <h3 class="owner-ptw-p-card__title">Partnership History</h3>
            <p class="owner-ptw-p-card__sub">A permanent record of when Pass the World partnerships were active and which partnership identity was live.</p>
          </div>
        </header>
        <div class="owner-ptw-p-cal">
          <div class="owner-ptw-p-cal__nav">
            <button type="button" class="owner-btn-ghost" data-ptw-p-cal-prev aria-label="Previous month">‹</button>
            <div class="owner-ptw-p-cal__title-wrap">
              <h4 class="owner-ptw-p-cal__title">${esc(title)}</h4>
              <button type="button" class="owner-ptw-p-cal__today" data-ptw-p-cal-today>Today</button>
            </div>
            <button type="button" class="owner-btn-ghost" data-ptw-p-cal-next aria-label="Next month">›</button>
          </div>
          ${grid}
          <div class="owner-ptw-p-cal__legend" aria-label="Legend">
            <span><span class="owner-ptw-p-cal__swatch is-active" aria-hidden="true"></span> Partnership active</span>
            <span><span class="owner-ptw-p-cal__swatch is-off" aria-hidden="true"></span> Partnership off</span>
          </div>
          <p class="owner-muted owner-ptw-p-cal__tz">Calendar dates use ${esc(cal?.timezone || 'UTC')}.</p>
        </div>
      </section>
    `;
  }

  function renderSkeleton() {
    return `
      <section class="owner-ptw-partnership" aria-label="Partnership">
        <button type="button" class="owner-ptw-partnership__back" data-ptw-partnership-back>← Back</button>
        <div class="owner-ptw-p">
          <p class="owner-ptw-p-crumb">Pass the World &gt; Partnership</p>
          <h2 class="owner-ptw-p-title">Partnership</h2>
          <p class="owner-muted">Loading partnership settings…</p>
          <div class="owner-ptw-p-skel" aria-hidden="true">
            <div class="owner-ptw-p-skel__card"></div>
            <div class="owner-ptw-p-skel__card"></div>
            <div class="owner-ptw-p-skel__row">
              <div class="owner-ptw-p-skel__card"></div>
              <div class="owner-ptw-p-skel__card"></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function render(ctx) {
    const { state } = ctx;
    const ps = ensureState(state);

    if (ps.loading && !ps.data) return renderSkeleton();

    const form = ps.form || formFromData(ps.data);
    const enabled = Boolean(ps.data?.enabled);
    const lim = limits(ps);
    const subMax = lim.subtitleMaxChars || 120;
    const subLen = String(form.subtitle || '').length;
    const missingSet = new Set(ps.missing || []);

    const toast = ps.toast
      ? `<div class="owner-ptw-p-toast is-${esc(ps.toast.type)}" role="status">${esc(ps.toast.message)}</div>`
      : '';

    return `
      <section class="owner-ptw-partnership" aria-label="Partnership">
        <button type="button" class="owner-ptw-partnership__back" data-ptw-partnership-back>← Back</button>
        <div class="owner-ptw-p" data-ptw-partnership-root>
          <p class="owner-ptw-p-crumb">Pass the World &gt; Partnership</p>
          <header class="owner-ptw-p-hero">
            <div>
              <h2 class="owner-ptw-p-title">Partnership</h2>
              <p class="owner-ptw-p-lead">Manage the partnership content for the Pass the World experience.</p>
            </div>
          </header>

          ${ps.error ? `<div class="owner-flash is-err">${esc(ps.error)}</div>` : ''}
          ${renderMissingBanner(ps.missing)}

          <section class="owner-ptw-p-card owner-ptw-p-feature">
            <div class="owner-ptw-p-feature__copy">
              <h3 class="owner-ptw-p-card__title">Partnership Feature</h3>
              <p class="owner-ptw-p-card__sub">Turn the partnership experience on or off for all users on the Pass the World page.</p>
            </div>
            <button type="button"
              class="owner-ptw-p-toggle ${enabled ? 'is-on' : 'is-off'}"
              data-ptw-p-toggle
              role="switch"
              aria-checked="${enabled ? 'true' : 'false'}"
              aria-label="Partnership feature ${enabled ? 'on' : 'off'}"
              ${ps.toggling ? 'disabled' : ''}>
              <span class="owner-ptw-p-toggle__track" aria-hidden="true"><span class="owner-ptw-p-toggle__knob"></span></span>
              <span class="owner-ptw-p-toggle__label">${enabled ? 'ON' : 'OFF'}</span>
            </button>
          </section>

          <p class="owner-ptw-p-info">
            When turned off, the Pass the World experience remains unchanged. When turned on, the active partnership content will be shown to users.
          </p>

          <section class="owner-ptw-p-card ${missingSet.has('subtitle') ? 'is-missing' : ''}">
            <h3 class="owner-ptw-p-card__title">Subtitle</h3>
            <p class="owner-ptw-p-card__sub">Add the subtitle text that will appear on the Pass the World experience while this partnership is active.</p>
            <div class="owner-ptw-p-subtitle-row">
              <input class="owner-input owner-ptw-p-subtitle"
                     type="text"
                     maxlength="${subMax}"
                     placeholder="Enter subtitle..."
                     value="${esc(form.subtitle || '')}"
                     data-ptw-p-subtitle
                     aria-label="Partnership subtitle">
              <span class="owner-ptw-p-counter" aria-live="polite"><span data-ptw-p-sub-count>${subLen}</span>/${subMax}</span>
            </div>
          </section>

          <div class="owner-ptw-p-logos">
            ${renderUpload(
              'tabLogo',
              'Tab Logo',
              'This image will be used as the partnership logo within the Pass the World tab experience while the partnership is active.',
              form.tabLogo,
              recommendedLabel(lim.tabLogoRecommended),
              ps.uploading,
              missingSet.has('tabLogo'),
            )}
            ${renderUpload(
              'mapLogo',
              'Map Logo',
              'This image will be used for the partnership presence on the Pass the World map while the partnership is active.',
              form.mapLogo,
              recommendedLabel(lim.mapLogoRecommended),
              ps.uploading,
              missingSet.has('mapLogo'),
            )}
          </div>

          ${renderUpload(
            'linkImage',
            'Link Image',
            'This image will be used for the partnership link/content experience while the partnership is active.',
            form.linkImage,
            recommendedLabel(lim.linkImageRecommended),
            ps.uploading,
            missingSet.has('linkImage'),
          )}

          <section class="owner-ptw-p-card">
            <h3 class="owner-ptw-p-card__title">Link Image website</h3>
            <p class="owner-ptw-p-card__sub">When set, tapping the Link Image on Pass the World opens this website in a new tab.</p>
            <div class="owner-ptw-p-linkurl-row">
              <input class="owner-input owner-ptw-p-linkurl"
                     type="url"
                     inputmode="url"
                     autocomplete="url"
                     maxlength="${lim.linkUrlMaxChars || 2048}"
                     placeholder="https://example.com"
                     value="${esc(form.linkUrl || '')}"
                     data-ptw-p-link-url
                     aria-label="Link Image website">
            </div>
          </section>

          <div class="owner-ptw-p-actions">
            <button type="button" class="owner-btn-ghost" data-ptw-p-cancel ${ps.saving ? 'disabled' : ''}>Cancel</button>
            <button type="button" class="owner-btn" data-ptw-p-save ${ps.saving ? 'disabled' : ''}>
              ${ps.saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

          ${renderCalendar(ps)}
        </div>
        ${toast}
        ${renderModal(ps.modal)}
        ${renderDayModal(ps)}
      </section>
    `;
  }

  function openConfirm(ps, modal, render) {
    ps.modal = modal;
    render();
  }

  function closeConfirm(ps, render) {
    ps.modal = null;
    render();
  }

  function leaveGuard(ps) {
    if (!ps.dirty) return true;
    return window.confirm('You have unsaved partnership changes. Leave without saving?');
  }

  function bind(ctx) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    const root = document.querySelector('[data-ptw-partnership-root]')?.closest('.owner-ptw-partnership')
      || document.querySelector('.owner-ptw-partnership');

    if (!ps.data && !ps.loading) {
      load(ctx);
    }

    document.querySelector('[data-ptw-partnership-back]')?.addEventListener('click', () => {
      if (!leaveGuard(ps)) return;
      state.ptwView = 'main';
      ps.dirty = false;
      window.onbeforeunload = null;
      window.history.pushState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#pass-the-world`
      );
      render();
    });

    if (!root) return;

    const subtitle = root.querySelector('[data-ptw-p-subtitle]');
    subtitle?.addEventListener('input', () => {
      const max = limits(ps).subtitleMaxChars || 120;
      ps.form = ps.form || formFromData(ps.data);
      ps.form.subtitle = String(subtitle.value || '').slice(0, max);
      markDirty(ps);
      const count = root.querySelector('[data-ptw-p-sub-count]');
      if (count) count.textContent = String(ps.form.subtitle.length);
      if (ps.missing?.includes('subtitle') && ps.form.subtitle.trim()) {
        ps.missing = ps.missing.filter((m) => m !== 'subtitle');
      }
    });

    const linkUrlInput = root.querySelector('[data-ptw-p-link-url]');
    linkUrlInput?.addEventListener('input', () => {
      const max = limits(ps).linkUrlMaxChars || 2048;
      ps.form = ps.form || formFromData(ps.data);
      ps.form.linkUrl = String(linkUrlInput.value || '').slice(0, max);
      markDirty(ps);
    });

    root.querySelectorAll('[data-ptw-p-file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const field = input.getAttribute('data-ptw-p-file');
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !field) return;
        await handleUpload(ctx, field, file);
      });
    });

    root.querySelectorAll('[data-ptw-p-drop]').forEach((zone) => {
      const field = zone.getAttribute('data-ptw-p-drop');
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('is-drag');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('is-drag');
        const file = e.dataTransfer?.files?.[0];
        if (file) await handleUpload(ctx, field, file);
      });
      zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          root.querySelector(`[data-ptw-p-file="${field}"]`)?.click();
        }
      });
    });

    root.querySelectorAll('[data-ptw-p-replace]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const field = btn.getAttribute('data-ptw-p-replace');
        root.querySelector(`[data-ptw-p-file="${field}"]`)?.click();
      });
    });

    root.querySelectorAll('[data-ptw-p-remove]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const field = btn.getAttribute('data-ptw-p-remove');
        await handleRemove(ctx, field);
      });
    });

    root.querySelector('[data-ptw-p-toggle]')?.addEventListener('click', () => {
      if (ps.toggling || ps.saving) return;
      const currentlyOn = Boolean(ps.data?.enabled);
      if (!currentlyOn) {
        // Validate local form completeness before confirm
        syncFormFromInputs(root, ps);
        const missing = [];
        if (!String(ps.form?.subtitle || '').trim()) missing.push('subtitle');
        if (!ps.form?.tabLogo?.url) missing.push('tabLogo');
        if (!ps.form?.mapLogo?.url) missing.push('mapLogo');
        if (!ps.form?.linkImage?.url) missing.push('linkImage');
        if (missing.length) {
          ps.missing = missing;
          showToast(ps, 'Complete the partnership information before activating.', 'err', render);
          render();
          return;
        }
        openConfirm(ps, {
          title: 'Activate Partnership?',
          body: 'This will make the current partnership configuration active for Pass the World users.',
          confirmLabel: 'Activate Partnership',
          action: 'activate',
        }, render);
      } else {
        openConfirm(ps, {
          title: 'Turn Off Partnership?',
          body: 'The partnership experience will stop appearing to users. Your current partnership information and historical records will remain saved.',
          confirmLabel: 'Turn Off Partnership',
          action: 'deactivate',
        }, render);
      }
    });

    root.querySelector('[data-ptw-p-save]')?.addEventListener('click', () => {
      if (ps.saving) return;
      syncFormFromInputs(root, ps);
      if (ps.data?.enabled) {
        openConfirm(ps, {
          title: 'Update Live Partnership?',
          body: 'The partnership is currently active. Saving these changes will update the partnership experience for users and create a new historical version. Previous history will remain unchanged.',
          confirmLabel: 'Update Partnership',
          action: 'save-live',
        }, render);
      } else {
        doSave(ctx, { confirmLiveUpdate: false });
      }
    });

    root.querySelector('[data-ptw-p-cancel]')?.addEventListener('click', () => {
      if (ps.dirty && !window.confirm('Discard unsaved changes?')) return;
      ps.form = formFromData(ps.data);
      ps.dirty = false;
      ps.missing = [];
      render();
    });

    root.querySelector('[data-ptw-p-cal-prev]')?.addEventListener('click', async () => {
      let y = ps.calYear;
      let m = ps.calMonth - 1;
      if (m < 1) { m = 12; y -= 1; }
      ps.calYear = y;
      ps.calMonth = m;
      await loadCalendar(ctx);
      render();
    });

    root.querySelector('[data-ptw-p-cal-next]')?.addEventListener('click', async () => {
      let y = ps.calYear;
      let m = ps.calMonth + 1;
      if (m > 12) { m = 1; y += 1; }
      ps.calYear = y;
      ps.calMonth = m;
      await loadCalendar(ctx);
      render();
    });

    root.querySelector('[data-ptw-p-cal-today]')?.addEventListener('click', async () => {
      const now = new Date();
      ps.calYear = now.getUTCFullYear();
      ps.calMonth = now.getUTCMonth() + 1;
      await loadCalendar(ctx);
      render();
    });

    root.querySelector('[data-ptw-p-cal-retry]')?.addEventListener('click', async () => {
      await loadCalendar(ctx);
      render();
    });

    root.querySelectorAll('[data-ptw-p-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const date = btn.getAttribute('data-ptw-p-day');
        if (date) loadDayDetail(ctx, date);
      });
    });

    document.querySelectorAll('[data-ptw-p-day-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ps.dayDetail = null;
        render();
      });
    });

    document.querySelectorAll('[data-ptw-p-modal-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => closeConfirm(ps, render));
    });

    document.querySelector('[data-ptw-p-modal-confirm]')?.addEventListener('click', async () => {
      const action = ps.modal?.action;
      closeConfirm(ps, render);
      if (action === 'activate') await doToggle(ctx, true);
      else if (action === 'deactivate') await doToggle(ctx, false);
      else if (action === 'save-live') await doSave(ctx, { confirmLiveUpdate: true });
    });

    // Warn on browser leave only while this page has unsaved edits
    if (ps.dirty) {
      window.onbeforeunload = (e) => { e.preventDefault(); e.returnValue = ''; };
    } else if (state.ptwView === 'partnership') {
      window.onbeforeunload = null;
    }
  }

  async function handleUpload(ctx, field, file) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    if (ps.uploading) return;
    if (!file.type?.startsWith('image/') && !/\.(heic|heif|avif|bmp|tif|tiff|svg|ico|jfif|gif|webp|png|jpe?g)$/i.test(file.name || '')) {
      showToast(ps, 'Please choose an image file.', 'err', render);
      render();
      return;
    }
    ps.uploading = field;
    ps.error = null;
    render();
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await api('ptw-partnership-upload', {
        method: 'POST',
        body: { field, dataUrl, fileName: file.name || '' },
      });
      ps.form = ps.form || formFromData(ps.data);
      ps.form[field] = result.image;
      markDirty(ps);
      if (ps.missing?.includes(field)) {
        ps.missing = ps.missing.filter((m) => m !== field);
      }
      showToast(ps, 'Image uploaded.', 'ok', render);
    } catch (err) {
      showToast(ps, err.message || 'Upload failed.', 'err', render);
    } finally {
      ps.uploading = null;
      render();
    }
  }

  async function handleRemove(ctx, field) {
    const { state, render } = ctx;
    const ps = ensureState(state);
    if (ps.uploading) return;
    ps.form = ps.form || formFromData(ps.data);
    ps.form[field] = null;
    markDirty(ps);
    render();
  }

  async function doSave(ctx, { confirmLiveUpdate }) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    if (ps.saving) return;
    const root = document.querySelector('[data-ptw-partnership-root]');
    if (root) syncFormFromInputs(root, ps);
    ps.saving = true;
    ps.error = null;
    render();
    try {
      const result = await api('ptw-partnership-save', {
        method: 'POST',
        body: {
          draft: {
            subtitle: ps.form?.subtitle || '',
            tabLogo: ps.form?.tabLogo || null,
            mapLogo: ps.form?.mapLogo || null,
            linkImage: ps.form?.linkImage || null,
            linkUrl: ps.form?.linkUrl || '',
          },
          confirmLiveUpdate: Boolean(confirmLiveUpdate),
        },
      });
      ps.data = result.state;
      ps.form = formFromData(result.state);
      ps.dirty = false;
      ps.missing = [];
      showToast(ps, 'Partnership settings saved.', 'ok', render);
      await loadCalendar(ctx, { silent: true });
    } catch (err) {
      if (err.status === 409 || err.message?.includes('confirmation')) {
        openConfirm(ps, {
          title: 'Update Live Partnership?',
          body: 'The partnership is currently active. Saving these changes will update the partnership experience for users and create a new historical version. Previous history will remain unchanged.',
          confirmLabel: 'Update Partnership',
          action: 'save-live',
        }, render);
      } else {
        if (err.missing) ps.missing = err.missing;
        // Try to read missing from response — api() may not attach it
        showToast(ps, err.message || 'Could not save partnership settings.', 'err', render);
      }
    } finally {
      ps.saving = false;
      render();
    }
  }

  async function doToggle(ctx, enabled) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    if (ps.toggling) return;

    // Persist current form into draft before activate so latest subtitle is used
    if (enabled) {
      const root = document.querySelector('[data-ptw-partnership-root]');
      if (root) syncFormFromInputs(root, ps);
      try {
        ps.toggling = true;
        render();
        await api('ptw-partnership-save', {
          method: 'POST',
          body: {
            draft: {
              subtitle: ps.form?.subtitle || '',
              tabLogo: ps.form?.tabLogo || null,
              mapLogo: ps.form?.mapLogo || null,
              linkImage: ps.form?.linkImage || null,
              linkUrl: ps.form?.linkUrl || '',
            },
            confirmLiveUpdate: false,
          },
        });
      } catch (err) {
        // If somehow live, ignore — we're about to activate
        if (!String(err.message || '').includes('confirmation')) {
          ps.toggling = false;
          showToast(ps, err.message || 'Could not save before activating.', 'err', render);
          render();
          return;
        }
      }
    }

    ps.toggling = true;
    render();
    try {
      const result = await api('ptw-partnership-toggle', {
        method: 'POST',
        body: { enabled: Boolean(enabled) },
      });
      ps.data = result.state;
      ps.form = formFromData(result.state);
      ps.dirty = false;
      ps.missing = [];
      showToast(
        ps,
        enabled ? 'Partnership activated successfully.' : 'Partnership turned off successfully.',
        'ok',
        render,
      );
      await loadCalendar(ctx, { silent: true });
    } catch (err) {
      if (err.missing) ps.missing = err.missing;
      else if (err.status === 400) {
        ps.missing = ['subtitle', 'tabLogo', 'mapLogo', 'linkImage'].filter((f) => {
          const val = f === 'subtitle' ? ps.form?.subtitle : ps.form?.[f]?.url;
          return !val;
        });
      }
      showToast(ps, err.message || 'Could not update partnership status.', 'err', render);
    } finally {
      ps.toggling = false;
      render();
    }
  }

  function open(ctx) {
    const { state, render } = ctx;
    ensureState(state);
    state.section = 'pass-the-world';
    state.ptwView = 'partnership';
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#pass-the-world/partnership`
    );
    render();
    load(ctx);
  }

  return { ensureState, render, bind, open, load };
})();

if (typeof window !== 'undefined') window.OwnerPtwPartnership = OwnerPtwPartnership;
