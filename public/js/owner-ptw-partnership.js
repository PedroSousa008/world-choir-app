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
        dayCache: Object.create(null),
        dayInflight: Object.create(null),
        dayReqId: 0,
        calendarPanel: null,
        overall: null,
        overallLoading: false,
        overallError: null,
        overallInflight: false,
        livePollTimer: null,
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

  async function loadDayDetail(ctx, dateKey, { force = false, silent = false } = {}) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    if (!ps.dayCache) ps.dayCache = Object.create(null);
    if (!ps.dayInflight) ps.dayInflight = Object.create(null);

    const key = String(dateKey || '').trim();
    if (!key) return;

    const reqId = (ps.dayReqId = (ps.dayReqId || 0) + 1);
    const calInfo = calendarDayInfo(ps, key);
    const selectedKeep = ps.dayDetail?.date === key ? ps.dayDetail.selectedConfigId : null;

    // Future / off days resolve from the calendar instantly — no skeleton flash.
    if (!force && calInfo?.status === 'future') {
      ps.dayDetail = { date: key, status: 'future' };
      ps.dayLoading = false;
      if (!silent) render();
      syncLiveAnalytics(ctx);
      return;
    }
    if (!force && calInfo?.status === 'off') {
      ps.dayDetail = { date: key, status: 'off', segments: [], events: [] };
      ps.dayLoading = false;
      if (!silent) render();
      syncLiveAnalytics(ctx);
      return;
    }

    const cached = !force ? ps.dayCache[key] : null;
    if (cached && !silent) {
      ps.dayDetail = { ...cached, selectedConfigId: selectedKeep || cached.selectedConfigId };
      ps.dayLoading = false;
      render();
    } else if (!silent && !cached) {
      ps.dayDetail = seedDayFromCalendar(ps, key);
      ps.dayLoading = false;
      render();
      // Only show skeletons if the network is still slow after a short beat.
      setTimeout(() => {
        if (ps.dayReqId !== reqId) return;
        if (ps.dayDetail?.date !== key) return;
        if (ps.dayCache[key]) return;
        ps.dayLoading = true;
        render();
      }, 70);
    }

    try {
      const data = await fetchDayDetail(ctx, key);
      const firstConfig = data?.analytics?.byConfiguration?.[0]?.configurationId
        || data?.segments?.[0]?.configurationId
        || null;
      const detail = {
        ...data,
        selectedConfigId: selectedKeep
          || (ps.dayDetail?.date === key ? ps.dayDetail.selectedConfigId : null)
          || firstConfig,
      };
      ps.dayCache[key] = detail;
      if (ps.dayDetail?.date === key) {
        ps.dayDetail = detail;
        ps.dayLoading = false;
        render();
      } else if (force && ps.dayReqId === reqId && !silent) {
        ps.dayDetail = detail;
        ps.dayLoading = false;
        render();
      }
    } catch (err) {
      if (ps.dayDetail?.date !== key && ps.dayReqId !== reqId) return;
      // Keep cached / seeded content when a silent refresh fails.
      if (silent || cached || (ps.dayDetail?.analytics && !force)) {
        ps.dayLoading = false;
        if (!silent) render();
        return;
      }
      ps.dayDetail = {
        date: key,
        error: err.message || 'Could not load day details.',
        analytics: {
          error: true,
          unavailableReason: err.message || 'Daily analytics could not be loaded.',
        },
      };
      ps.dayLoading = false;
      render();
    } finally {
      syncLiveAnalytics(ctx);
    }
  }

  function prefetchDayDetail(ctx, dateKey) {
    const { state } = ctx;
    const ps = ensureState(state);
    if (!ps.dayCache) ps.dayCache = Object.create(null);
    if (!ps.dayInflight) ps.dayInflight = Object.create(null);
    const key = String(dateKey || '').trim();
    if (!key || ps.dayCache[key] || ps.dayInflight[key]) return;
    const calInfo = calendarDayInfo(ps, key);
    if (calInfo?.status === 'future' || calInfo?.status === 'off') return;
    fetchDayDetail(ctx, key)
      .then((data) => {
        const firstConfig = data?.analytics?.byConfiguration?.[0]?.configurationId
          || data?.segments?.[0]?.configurationId
          || null;
        ps.dayCache[key] = { ...data, selectedConfigId: firstConfig };
      })
      .catch(() => {});
  }

  async function fetchDayDetail(ctx, dateKey) {
    const { state, api } = ctx;
    const ps = ensureState(state);
    if (!ps.dayInflight) ps.dayInflight = Object.create(null);
    const key = String(dateKey || '').trim();
    if (ps.dayInflight[key]) return ps.dayInflight[key];
    const promise = api('ptw-partnership-day', {
      query: `&date=${encodeURIComponent(key)}`,
    }).finally(() => {
      delete ps.dayInflight[key];
    });
    ps.dayInflight[key] = promise;
    return promise;
  }

  function calendarDayInfo(ps, dateKey) {
    return (ps.calendar?.days || []).find((d) => d.date === dateKey) || null;
  }

  function seedDayFromCalendar(ps, dateKey) {
    const info = calendarDayInfo(ps, dateKey);
    if (!info) return { date: dateKey, _seeded: true };
    const logos = info.logos || [];
    return {
      date: dateKey,
      status: info.status || 'off',
      _seeded: true,
      segments: logos.map((l, i) => ({
        configurationId: l.configurationId || `seed_${i}`,
        mapLogoUrl: l.url || null,
        subtitle: '',
      })),
      events: [],
      analytics: null,
    };
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

  function formatCount(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    return Math.round(num).toLocaleString('en-US');
  }

  // Stroke icons — same language as Owner Notifications / app chrome.
  const METRIC_ICONS = {
    reach: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.6"/></svg>',
    impressions: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>',
    countries: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M2 12h20" stroke="currentColor" stroke-width="1.6"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" stroke-width="1.6"/></svg>',
    cities: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.6"/></svg>',
    clicks: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4l7.5 16 1.8-6.7L20 11.5 4 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    clickers: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/></svg>',
    avgTime: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    activeTime: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h2l2-7 4 14 2-7h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const METRIC_DEFS = [
    { key: 'reach', title: 'Partnership Reach', desc: 'Unique users who viewed Pass the World', value: (m) => formatCount(m.partnershipReach) },
    { key: 'impressions', title: 'Partnership Impressions', desc: 'Total views of the Pass the World page', value: (m) => formatCount(m.partnershipImpressions) },
    { key: 'countries', title: 'Unique Countries Reached', desc: 'Distinct countries from all visitors', value: (m) => formatCount(m.uniqueCountriesReached) },
    { key: 'cities', title: 'Unique Cities Reached', desc: 'Distinct cities from all visitors', value: (m) => formatCount(m.uniqueCitiesReached) },
    { key: 'clicks', title: 'Link Image Clicks', desc: 'Total clicks on the partnership link image', value: (m) => formatCount(m.linkImageClicks) },
    { key: 'clickers', title: 'Unique Link Image Clickers', desc: 'Unique users who clicked the link image', value: (m) => formatCount(m.uniqueLinkImageClickers) },
    { key: 'avgTime', title: 'Average Time on Pass the World', desc: 'Average time spent per user', value: (m) => m.averageTimeOnPassTheWorldLabel || '0s' },
    { key: 'activeTime', title: 'Partnership Active Time', desc: 'Total time partnership was active', value: (m) => m.partnershipActiveTimeLabel || '0s' },
  ];

  function renderMetricCard({ icon, title, desc, valueHtml, loading }) {
    return `
      <article class="owner-ptw-day-metric">
        <header class="owner-ptw-day-metric__head">
          <span class="owner-ptw-day-metric__icon" aria-hidden="true">${icon}</span>
          <span class="owner-ptw-day-metric__title">${esc(title)}</span>
        </header>
        <p class="owner-ptw-day-metric__desc">${esc(desc)}</p>
        <p class="owner-ptw-day-metric__value ${loading ? 'is-skeleton' : ''}">${loading ? '&nbsp;' : valueHtml}</p>
      </article>`;
  }

  function renderMetricCards(metrics, loading) {
    return METRIC_DEFS.map((def) => renderMetricCard({
      icon: METRIC_ICONS[def.key],
      title: def.title,
      desc: def.desc,
      valueHtml: loading ? '' : esc(def.value(metrics || {})),
      loading,
    })).join('');
  }

  function renderTimeline(analytics) {
    const tl = analytics?.timeline;
    if (!tl) return '';
    const intervals = tl.intervals || [];
    if (!intervals.length) {
      return `
        <section class="owner-ptw-day-timeline" aria-label="Day timeline UTC">
          <h4 class="owner-ptw-day-timeline__title">Day Timeline (UTC)</h4>
          <p class="owner-muted">No active partnership intervals on this day.</p>
        </section>`;
    }

    const segmentsHtml = intervals.map((iv) => {
      const start = formatTimeUTC(iv.startIso);
      const end = iv.open ? 'Now' : formatTimeUTC(iv.endIso);
      return `
        <div class="owner-ptw-day-timeline__row ${iv.open ? 'is-live' : ''}">
          <span class="owner-ptw-day-timeline__time">${esc(start)}</span>
          <span class="owner-ptw-day-timeline__track" aria-hidden="true">
            <span class="owner-ptw-day-timeline__dot"></span>
            <span class="owner-ptw-day-timeline__line"></span>
            <span class="owner-ptw-day-timeline__dot"></span>
          </span>
          <span class="owner-ptw-day-timeline__time">${esc(end)}</span>
          <span class="owner-ptw-day-timeline__labels">
            <span>Partnership active</span>
            <span>${iv.open ? 'Still active' : 'Partnership turned off'}</span>
          </span>
        </div>`;
    }).join('');

    return `
      <section class="owner-ptw-day-timeline" aria-label="Day timeline UTC">
        <div class="owner-ptw-day-timeline__head">
          <h4 class="owner-ptw-day-timeline__title">Day Timeline (UTC)</h4>
          ${analytics.live ? '<span class="owner-ptw-day-live">Live</span>' : ''}
        </div>
        ${segmentsHtml}
        <p class="owner-ptw-day-timeline__total">
          <span class="owner-ptw-day-timeline__total-icon" aria-hidden="true">${METRIC_ICONS.avgTime}</span>
          Active for ${esc(tl.activeLabel || '0s')}
        </p>
      </section>`;
  }

  function resolveDayMetrics(d, selectedConfigId) {
    const a = d?.analytics;
    if (!a) return { metrics: null, mapLogoUrl: null, subtitle: '', configs: [] };
    const configs = a.byConfiguration || [];
    const selected = selectedConfigId
      ? configs.find((c) => c.configurationId === selectedConfigId)
      : null;
    if (selected) {
      return {
        metrics: selected.metrics,
        mapLogoUrl: selected.mapLogoUrl,
        subtitle: selected.subtitle,
        configs,
      };
    }
    const first = configs[0] || null;
    return {
      metrics: a.metrics,
      mapLogoUrl: first?.mapLogoUrl || d.segments?.[0]?.mapLogoUrl || null,
      subtitle: first?.subtitle || d.segments?.[0]?.subtitle || '',
      configs,
    };
  }

  function renderAnalyticsGrid(d, loading) {
    const a = d?.analytics;

    if (loading) {
      return `
        <section class="owner-ptw-day-analytics">
          <h4 class="owner-ptw-day-analytics__title">Partnership Analytics</h4>
          <p class="owner-ptw-day-analytics__sub">Key metrics for this specific day while the partnership was active.</p>
          <div class="owner-ptw-day-metrics">
            ${renderMetricCards(null, true)}
          </div>
        </section>`;
    }

    // Brief pre-skeleton window: header/logo already painted, metrics arrive next.
    if (d?._seeded && !a && !d?.error) {
      return `
        <section class="owner-ptw-day-analytics">
          <h4 class="owner-ptw-day-analytics__title">Partnership Analytics</h4>
          <p class="owner-ptw-day-analytics__sub">Key metrics for this specific day while the partnership was active.</p>
        </section>`;
    }

    if (a?.error) {
      return `
        <section class="owner-ptw-day-analytics">
          <h4 class="owner-ptw-day-analytics__title">Partnership Analytics</h4>
          <p class="owner-muted">${esc(a.unavailableReason || 'Daily analytics could not be loaded.')}</p>
          <button type="button" class="owner-btn-ghost" data-ptw-p-day-retry>Retry</button>
        </section>`;
    }

    if (a?.unavailable) {
      return `
        <section class="owner-ptw-day-analytics">
          <h4 class="owner-ptw-day-analytics__title">Partnership Analytics</h4>
          <p class="owner-muted">${esc(a.unavailableReason || 'Analytics unavailable for this date.')}</p>
        </section>`;
    }

    const resolved = resolveDayMetrics(d, d.selectedConfigId);
    const m = resolved.metrics;
    if (!m) {
      return `
        <section class="owner-ptw-day-analytics">
          <h4 class="owner-ptw-day-analytics__title">Partnership Analytics</h4>
          <p class="owner-muted">No analytics for this day.</p>
        </section>`;
    }

    const configTabs = (resolved.configs || []).length > 1
      ? `
        <div class="owner-ptw-day-configs" role="tablist" aria-label="Partnership configurations">
          ${resolved.configs.map((c) => `
            <button type="button"
              role="tab"
              class="owner-ptw-day-configs__btn ${(d.selectedConfigId || resolved.configs[0].configurationId) === c.configurationId ? 'is-active' : ''}"
              data-ptw-p-day-config="${esc(c.configurationId)}">
              ${esc(c.subtitle || 'Partnership')}
            </button>
          `).join('')}
        </div>`
      : '';

    return `
      <section class="owner-ptw-day-analytics">
        <h4 class="owner-ptw-day-analytics__title">Partnership Analytics</h4>
        <p class="owner-ptw-day-analytics__sub">Key metrics for this specific day while the partnership was active.</p>
        ${configTabs}
        <div class="owner-ptw-day-metrics">
          ${renderMetricCards(m, false)}
        </div>
      </section>`;
  }

  function renderDayModal(ps) {
    const d = ps.dayDetail;
    if (!d) return '';
    const title = formatLongDate(d.date);
    const loading = Boolean(ps.dayLoading);

    if (d.error && !loading) {
      return `
        <div class="owner-ptw-p-modal owner-ptw-day-modal" role="dialog" aria-modal="true" aria-labelledby="owner-ptw-p-day-title">
          <button type="button" class="owner-ptw-p-modal__backdrop" data-ptw-p-day-close aria-label="Close"></button>
          <div class="owner-ptw-p-modal__card owner-ptw-day-modal__card">
            <button type="button" class="owner-ptw-p-modal__x" data-ptw-p-day-close aria-label="Close">×</button>
            <h3 id="owner-ptw-p-day-title" class="owner-ptw-day-modal__date">${esc(title)}</h3>
            <p class="owner-muted">${esc(d.error)}</p>
            <div class="owner-ptw-day-modal__footer">
              <button type="button" class="owner-btn-ghost" data-ptw-p-day-retry>Retry</button>
              <button type="button" class="owner-btn-ghost" data-ptw-p-day-close>Close</button>
            </div>
          </div>
        </div>`;
    }

    if (d.status === 'future') {
      return `
        <div class="owner-ptw-p-modal owner-ptw-day-modal" role="dialog" aria-modal="true" aria-labelledby="owner-ptw-p-day-title">
          <button type="button" class="owner-ptw-p-modal__backdrop" data-ptw-p-day-close aria-label="Close"></button>
          <div class="owner-ptw-p-modal__card owner-ptw-day-modal__card">
            <button type="button" class="owner-ptw-p-modal__x" data-ptw-p-day-close aria-label="Close">×</button>
            <h3 id="owner-ptw-p-day-title" class="owner-ptw-day-modal__date">${esc(title)}</h3>
            <p class="owner-muted">Future dates have no historical status yet.</p>
            <div class="owner-ptw-day-modal__footer">
              <button type="button" class="owner-btn-ghost" data-ptw-p-day-close>Close</button>
            </div>
          </div>
        </div>`;
    }

    const isOff = d.status === 'off' && !(d.segments || []).length;
    if (isOff && !loading) {
      return `
        <div class="owner-ptw-p-modal owner-ptw-day-modal" role="dialog" aria-modal="true" aria-labelledby="owner-ptw-p-day-title">
          <button type="button" class="owner-ptw-p-modal__backdrop" data-ptw-p-day-close aria-label="Close"></button>
          <div class="owner-ptw-p-modal__card owner-ptw-day-modal__card">
            <button type="button" class="owner-ptw-p-modal__x" data-ptw-p-day-close aria-label="Close">×</button>
            <header class="owner-ptw-day-modal__header">
              <div>
                <h3 id="owner-ptw-p-day-title" class="owner-ptw-day-modal__date">${esc(title)}</h3>
                <p class="owner-ptw-day-modal__sub">Daily partnership analytics for this specific day.</p>
              </div>
              <span class="owner-ptw-day-status is-off"><span class="owner-ptw-day-status__dot" aria-hidden="true"></span>Partnership Off</span>
            </header>
            <p class="owner-ptw-day-empty">Partnership was not active on this day.</p>
            <div class="owner-ptw-day-modal__footer">
              <button type="button" class="owner-btn-ghost" data-ptw-p-day-close>Close</button>
            </div>
          </div>
        </div>`;
    }

    const resolved = resolveDayMetrics(d, d.selectedConfigId);
    const mapLogoUrl = resolved.mapLogoUrl || d.segments?.[0]?.mapLogoUrl || null;
    const active = d.status === 'active' || (d.segments || []).length > 0;
    const showTimelineSkel = loading && !d.analytics;

    return `
      <div class="owner-ptw-p-modal owner-ptw-day-modal" role="dialog" aria-modal="true" aria-labelledby="owner-ptw-p-day-title">
        <button type="button" class="owner-ptw-p-modal__backdrop" data-ptw-p-day-close aria-label="Close"></button>
        <div class="owner-ptw-p-modal__card owner-ptw-day-modal__card">
          <button type="button" class="owner-ptw-p-modal__x" data-ptw-p-day-close aria-label="Close">×</button>
          ${mapLogoUrl ? `
            <div class="owner-ptw-day-modal__logo">
              <img src="${esc(mapLogoUrl)}" alt="" decoding="async">
            </div>` : ''}
          <header class="owner-ptw-day-modal__header">
            <div>
              <h3 id="owner-ptw-p-day-title" class="owner-ptw-day-modal__date">${esc(title)}</h3>
              <p class="owner-ptw-day-modal__sub">Daily partnership analytics for this specific day.</p>
            </div>
            <span class="owner-ptw-day-status ${active ? 'is-active' : 'is-off'}">
              <span class="owner-ptw-day-status__dot" aria-hidden="true"></span>
              ${active ? 'Partnership Active' : 'Partnership Off'}
            </span>
          </header>
          ${d.analytics ? renderTimeline(d.analytics) : (showTimelineSkel ? `
            <section class="owner-ptw-day-timeline owner-ptw-day-timeline--skeleton" aria-hidden="true">
              <div class="owner-ptw-day-timeline__head">
                <h4 class="owner-ptw-day-timeline__title">Day Timeline (UTC)</h4>
              </div>
              <div class="owner-ptw-day-timeline__skel"></div>
              <div class="owner-ptw-day-timeline__skel is-short"></div>
            </section>` : '')}
          <div class="owner-ptw-day-modal__rule" aria-hidden="true"></div>
          ${renderAnalyticsGrid(d, loading)}
          <div class="owner-ptw-day-modal__rule" aria-hidden="true"></div>
          <div class="owner-ptw-day-modal__footer">
            <button type="button" class="owner-btn-ghost" data-ptw-p-day-close>Close</button>
          </div>
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
          <div class="owner-ptw-p-cal__footer">
            <div class="owner-ptw-p-cal__legend" aria-label="Legend">
              <span><span class="owner-ptw-p-cal__swatch is-active" aria-hidden="true"></span> Partnership active</span>
              <span><span class="owner-ptw-p-cal__swatch is-off" aria-hidden="true"></span> Partnership off</span>
            </div>
            <button type="button" class="owner-btn-ghost owner-ptw-p-cal__panel-btn" data-ptw-p-cal-panel>
              Overview
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function renderCalendarPanelModal(ps) {
    if (!ps.calendarPanel) return '';
    const tab = ps.calendarPanel.tab || 'analytics';
    const loading = Boolean(ps.overallLoading) && !ps.overall;
    const err = ps.overallError;
    const data = ps.overall;

    return `
      <div class="owner-ptw-p-modal owner-ptw-day-modal owner-ptw-overall-modal" role="dialog" aria-modal="true" aria-labelledby="owner-ptw-p-cal-panel-title">
        <button type="button" class="owner-ptw-p-modal__backdrop" data-ptw-p-cal-panel-close aria-label="Close"></button>
        <div class="owner-ptw-p-modal__card owner-ptw-day-modal__card owner-ptw-overall-modal__card">
          <button type="button" class="owner-ptw-p-modal__x" data-ptw-p-cal-panel-close aria-label="Close">×</button>
          <header class="owner-ptw-day-modal__header owner-ptw-overall-modal__header">
            <div>
              <h3 id="owner-ptw-p-cal-panel-title" class="owner-ptw-day-modal__date">Partnership Analytics</h3>
              <p class="owner-ptw-day-modal__sub">Overall performance and partnership insights across all tracked days.</p>
            </div>
          </header>
          <div class="owner-ptw-overall-tabs" role="tablist" aria-label="Partnership analytics sections">
            <button type="button" role="tab" class="owner-ptw-overall-tabs__btn ${tab === 'analytics' ? 'is-active' : ''}"
              aria-selected="${tab === 'analytics' ? 'true' : 'false'}" data-ptw-overall-tab="analytics">Analytics</button>
            <button type="button" role="tab" class="owner-ptw-overall-tabs__btn ${tab === 'partnerships' ? 'is-active' : ''}"
              aria-selected="${tab === 'partnerships' ? 'true' : 'false'}" data-ptw-overall-tab="partnerships">Partnerships</button>
          </div>
          <div class="owner-ptw-overall-body">
            ${err && !data ? `
              <p class="owner-muted">Partnership analytics could not be loaded.</p>
              <p class="owner-muted">${esc(err)}</p>
              <button type="button" class="owner-btn-ghost" data-ptw-overall-retry>Retry</button>
            ` : tab === 'partnerships'
              ? renderOverallPartnershipsTab(ps, data, loading)
              : renderOverallAnalyticsTab(ps, data, loading)}
          </div>
        </div>
      </div>`;
  }

  const OVERALL_METRIC_DEFS = [
    { key: 'reach', title: 'Partnership Reach', desc: 'Unique users reached across all partnership activity', value: (m) => formatCount(m.partnershipReach) },
    { key: 'impressions', title: 'Partnership Impressions', desc: 'Total qualifying Pass the World views', value: (m) => formatCount(m.partnershipImpressions) },
    { key: 'countries', title: 'Unique Countries Reached', desc: 'Distinct countries reached across all partnership activity', value: (m) => formatCount(m.uniqueCountriesReached) },
    { key: 'cities', title: 'Unique Cities Reached', desc: 'Distinct cities reached across all partnership activity', value: (m) => formatCount(m.uniqueCitiesReached) },
    { key: 'clicks', title: 'Link Image Clicks', desc: 'Total clicks on partnership link images', value: (m) => formatCount(m.linkImageClicks) },
    { key: 'clickers', title: 'Unique Link Image Clickers', desc: 'Unique users who clicked a partnership link image', value: (m) => formatCount(m.uniqueLinkImageClickers) },
    { key: 'avgTime', title: 'Average Time on Pass the World', desc: 'Average engaged time per qualifying user', value: (m) => m.averageTimeOnPassTheWorldLabel || '0s' },
    { key: 'activeDays', title: 'Partnership Active Days', desc: 'Calendar days with partnership activity', value: (m) => formatCount(m.partnershipActiveDays), icon: 'activeTime' },
  ];

  function formatShortDay(dateKey) {
    const m = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dateKey || '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
    } catch {
      return dateKey;
    }
  }

  function formatAxisTime(ms) {
    const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (totalSec < 60) return `${totalSec}s`;
    const minutes = Math.floor(totalSec / 60);
    const rem = totalSec % 60;
    if (minutes < 60) return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
  }

  function formatRangeLabel(range) {
    if (!range?.startDate) return '—';
    const start = formatShortDay(range.startDate);
    if (range.open || !range.endDate) return `${start} – Present`;
    return `${start} – ${formatShortDay(range.endDate)}`;
  }

  function barWidthPct(value, max) {
    const v = Number(value) || 0;
    const m = Number(max) || 0;
    if (m <= 0) return 0;
    return Math.max(0, Math.min(100, (v / m) * 100));
  }

  function renderScaleBar(value, max, label) {
    const pct = barWidthPct(value, max);
    return `
      <div class="owner-ptw-scale">
        <div class="owner-ptw-scale__track" aria-hidden="true">
          <span class="owner-ptw-scale__fill" style="width:${pct.toFixed(1)}%"></span>
        </div>
        <span class="owner-ptw-scale__value">${esc(label)}</span>
      </div>`;
  }

  function seriesValue(point, metric) {
    if (!point || point.unavailable || !point.values) return null;
    if (metric === 'clicks') return point.values.clicks;
    if (metric === 'time') return point.values.avgTimeMs;
    return point.values.reach;
  }

  function renderOverallGraph(ps, data, loading) {
    const metric = ps.calendarPanel?.graphMetric || 'reach';
    const series = data?.series7d || [];
    if (loading) {
      return `
        <section class="owner-ptw-overall-graph">
          <div class="owner-ptw-overall-graph__head">
            <div>
              <h4 class="owner-ptw-overall-section__title">7-Day Performance</h4>
              <p class="owner-ptw-overall-section__sub">Daily partnership performance across the last 7 tracked calendar days.</p>
            </div>
          </div>
          <div class="owner-ptw-overall-graph__skel" aria-hidden="true"></div>
        </section>`;
    }

    const selectors = ['reach', 'clicks', 'time'].map((id) => `
      <button type="button"
        class="owner-ptw-overall-graph__sel ${metric === id ? 'is-active' : ''}"
        data-ptw-overall-graph="${id}">${id === 'reach' ? 'Reach' : id === 'clicks' ? 'Clicks' : 'Time'}</button>
    `).join('');

    const w = 560;
    const h = 200;
    const pad = { l: 44, r: 16, t: 18, b: 36 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const points = series.map((p, i) => {
      const raw = seriesValue(p, metric);
      return {
        ...p,
        i,
        raw,
        plottable: !p.unavailable && raw != null,
      };
    });
    const nums = points.filter((p) => p.plottable).map((p) => Number(p.raw) || 0);
    const maxY = Math.max(1, ...nums);
    const coords = points.map((p) => {
      const x = pad.l + (points.length <= 1 ? innerW / 2 : (p.i / (points.length - 1)) * innerW);
      if (!p.plottable) return { ...p, x, y: null };
      const y = pad.t + innerH - ((Number(p.raw) || 0) / maxY) * innerH;
      return { ...p, x, y };
    });
    const lineParts = [];
    coords.forEach((c) => {
      if (c.y == null) return;
      lineParts.push(`${lineParts.length ? 'L' : 'M'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`);
    });
    const line = lineParts.join(' ');
    const yTicks = [0, 0.5, 1].map((t) => t * maxY);
    const tipPayload = coords.map((c) => ({
      x: c.x,
      y: c.y,
      date: c.date,
      unavailable: Boolean(c.unavailable),
      partnershipOff: Boolean(c.partnershipOff),
      metric,
      value: c.raw,
      label: metric === 'time'
        ? formatAxisTime(c.raw)
        : formatCount(c.raw),
      metricLabel: metric === 'clicks'
        ? 'Link Image Clicks'
        : metric === 'time'
          ? 'Average Time'
          : 'Partnership Reach',
    }));

    return `
      <section class="owner-ptw-overall-graph">
        <div class="owner-ptw-overall-graph__head">
          <div>
            <h4 class="owner-ptw-overall-section__title">7-Day Performance</h4>
            <p class="owner-ptw-overall-section__sub">Daily partnership performance across the last 7 tracked calendar days.</p>
          </div>
          <div class="owner-ptw-overall-graph__sels" role="group" aria-label="Graph metric">${selectors}</div>
        </div>
        <div class="owner-ptw-overall-graph__plot" data-ptw-overall-chart data-ptw-overall-points="${esc(JSON.stringify(tipPayload))}">
          <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="7-day ${metric} performance">
            <defs>
              <linearGradient id="owner-ptw-overall-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#4ec5e8" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="#4ec5e8" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${yTicks.map((tick) => {
              const y = pad.t + innerH - (tick / maxY) * innerH;
              const label = metric === 'time' ? formatAxisTime(tick) : formatCount(tick);
              return `
                <line class="owner-ptw-overall-graph__grid" x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}"/>
                <text class="owner-ptw-overall-graph__ylab" x="${pad.l - 8}" y="${y + 3}" text-anchor="end">${esc(label)}</text>`;
            }).join('')}
            ${line ? `<path class="owner-ptw-overall-graph__line" d="${line}" fill="none"/>` : ''}
            ${coords.map((c) => (c.y == null
              ? `<circle class="owner-ptw-overall-graph__miss" cx="${c.x}" cy="${pad.t + innerH}" r="3.2"/>`
              : `<circle class="owner-ptw-overall-graph__dot" cx="${c.x}" cy="${c.y}" r="3.4"/>`
            )).join('')}
            <rect class="owner-ptw-overall-graph__hit" x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
          </svg>
          <div class="owner-ptw-overall-graph__x">
            ${coords.map((c) => `<span>${esc(formatShortDay(c.date))}</span>`).join('')}
          </div>
          <div class="owner-ptw-overall-tip" data-ptw-overall-tip hidden></div>
        </div>
      </section>`;
  }

  function renderDailyPerformanceTable(rows, loading) {
    if (loading) {
      return `
        <section class="owner-ptw-overall-table">
          <h4 class="owner-ptw-overall-section__title">Daily Performance</h4>
          <div class="owner-ptw-overall-table__skel" aria-hidden="true"></div>
        </section>`;
    }
    const list = rows || [];
    if (!list.length) {
      return `
        <section class="owner-ptw-overall-table">
          <h4 class="owner-ptw-overall-section__title">Daily Performance</h4>
          <p class="owner-muted">No tracked days yet.</p>
        </section>`;
    }
    const maxReach = Math.max(0, ...list.map((r) => r.metrics?.partnershipReach || 0));
    const maxImp = Math.max(0, ...list.map((r) => r.metrics?.partnershipImpressions || 0));
    const maxClicks = Math.max(0, ...list.map((r) => r.metrics?.linkImageClicks || 0));
    const maxAvg = Math.max(0, ...list.map((r) => r.metrics?.averageTimeOnPassTheWorldMs || 0));
    const maxActive = Math.max(0, ...list.map((r) => r.metrics?.partnershipActiveTimeMs || 0));

    return `
      <section class="owner-ptw-overall-table">
        <h4 class="owner-ptw-overall-section__title">Daily Performance</h4>
        <div class="owner-ptw-overall-table__scroll">
          <table class="owner-ptw-overall-table__grid">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reach</th>
                <th>Impressions</th>
                <th>Link Clicks</th>
                <th>Avg. Time</th>
                <th>Active Time</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((r) => {
                const m = r.metrics || {};
                return `
                  <tr class="${r.partnershipOff ? 'is-off' : ''}">
                    <td>${esc(formatShortDay(r.date))}${r.partnershipOff ? '<span class="owner-ptw-overall-table__off">Off</span>' : ''}</td>
                    <td>${renderScaleBar(m.partnershipReach, maxReach, formatCount(m.partnershipReach))}</td>
                    <td>${renderScaleBar(m.partnershipImpressions, maxImp, formatCount(m.partnershipImpressions))}</td>
                    <td>${renderScaleBar(m.linkImageClicks, maxClicks, formatCount(m.linkImageClicks))}</td>
                    <td>${renderScaleBar(m.averageTimeOnPassTheWorldMs, maxAvg, m.averageTimeOnPassTheWorldLabel || '0s')}</td>
                    <td>${renderScaleBar(m.partnershipActiveTimeMs, maxActive, m.partnershipActiveTimeLabel || '0s')}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function renderGeoTable(geo, loading) {
    if (loading) {
      return `
        <section class="owner-ptw-overall-table">
          <h4 class="owner-ptw-overall-section__title">Geographic Reach</h4>
          <div class="owner-ptw-overall-table__skel is-short" aria-hidden="true"></div>
        </section>`;
    }
    const countries = Number(geo?.uniqueCountriesReached) || 0;
    const cities = Number(geo?.uniqueCitiesReached) || 0;
    return `
      <section class="owner-ptw-overall-table">
        <h4 class="owner-ptw-overall-section__title">Geographic Reach</h4>
        <div class="owner-ptw-overall-geo">
          <div class="owner-ptw-overall-geo__row">
            <span>Unique Countries Reached</span>
            ${renderScaleBar(countries, Math.max(countries, 1), formatCount(countries))}
          </div>
          <div class="owner-ptw-overall-geo__row">
            <span>Unique Cities Reached</span>
            ${renderScaleBar(cities, Math.max(cities, 1), formatCount(cities))}
          </div>
        </div>
      </section>`;
  }

  function renderOverallAnalyticsTab(ps, data, loading) {
    const m = data?.overall || {};
    return `
      <section class="owner-ptw-overall-analytics" aria-label="Overall analytics">
        <div class="owner-ptw-overall-block owner-ptw-overall-block--kpis">
          <h4 class="owner-ptw-overall-section__title">Overall Performance</h4>
          <div class="owner-ptw-day-metrics owner-ptw-overall-metrics">
            ${OVERALL_METRIC_DEFS.map((def) => renderMetricCard({
              icon: METRIC_ICONS[def.icon || def.key] || METRIC_ICONS.reach,
              title: def.title,
              desc: def.desc,
              valueHtml: loading ? '' : esc(def.value(m)),
              loading,
            })).join('')}
          </div>
        </div>

        <div class="owner-ptw-overall-block owner-ptw-overall-block--graph">
          ${renderOverallGraph(ps, data, loading)}
        </div>

        <div class="owner-ptw-overall-block owner-ptw-overall-block--breakdown">
          <h4 class="owner-ptw-overall-section__title owner-ptw-overall-section__title--center">Analytics Breakdown</h4>
          <div class="owner-ptw-overall-breakdown">
            ${renderDailyPerformanceTable(data?.dailyPerformance, loading)}
            ${renderGeoTable(data?.geographic, loading)}
          </div>
        </div>
      </section>`;
  }

  function selectedComparePartners(ps, data) {
    const all = data?.partnerships || [];
    let ids = ps.calendarPanel?.compareIds;
    if (!Array.isArray(ids) || !ids.length) {
      ids = all.slice(0, 2).map((p) => p.partnerId);
    }
    return all.filter((p) => ids.includes(p.partnerId)).slice(0, 3);
  }

  function renderOverallPartnershipsTab(ps, data, loading) {
    if (loading) {
      return `
        <section class="owner-ptw-overall-partners">
          <div class="owner-ptw-overall-table__skel" aria-hidden="true"></div>
        </section>`;
    }
    const all = data?.partnerships || [];
    if (!all.length) {
      return `
        <section class="owner-ptw-overall-empty" aria-label="No partnership data">
          <span class="owner-ptw-overall-empty__icon" aria-hidden="true">${METRIC_ICONS.impressions}</span>
          <h4 class="owner-ptw-overall-empty__title">No Partnership Data Yet</h4>
          <p class="owner-ptw-overall-empty__body">Partnership comparisons will appear here once partnership activity has been recorded.</p>
        </section>`;
    }
    if (all.length < 2) {
      return `
        <section class="owner-ptw-overall-empty" aria-label="No partnership comparison">
          <span class="owner-ptw-overall-empty__icon" aria-hidden="true">${METRIC_ICONS.reach}</span>
          <h4 class="owner-ptw-overall-empty__title">No Partnership Comparison Yet</h4>
          <p class="owner-ptw-overall-empty__body">Another partnership is needed before performance can be compared.</p>
          <p class="owner-muted">Once more than one partnership has been active, their performance will appear here.</p>
        </section>`;
    }

    const selected = selectedComparePartners(ps, data);
    const selector = all.length > 2 ? `
      <div class="owner-ptw-overall-compare-pick" role="group" aria-label="Partnerships to compare">
        ${all.map((p) => `
          <button type="button"
            class="owner-ptw-overall-compare-pick__btn ${selected.some((s) => s.partnerId === p.partnerId) ? 'is-active' : ''}"
            data-ptw-overall-compare="${esc(p.partnerId)}">
            ${esc(p.label || 'Partnership')}
          </button>`).join('')}
      </div>` : '';

    const compareMetrics = [
      { key: 'reach', label: 'Reach', get: (p) => p.metrics?.partnershipReach || 0, fmt: formatCount },
      { key: 'impressions', label: 'Impressions', get: (p) => p.metrics?.partnershipImpressions || 0, fmt: formatCount },
      { key: 'countries', label: 'Countries', get: (p) => p.metrics?.uniqueCountriesReached || 0, fmt: formatCount },
      { key: 'cities', label: 'Cities', get: (p) => p.metrics?.uniqueCitiesReached || 0, fmt: formatCount },
      { key: 'clicks', label: 'Link Clicks', get: (p) => p.metrics?.linkImageClicks || 0, fmt: formatCount },
      { key: 'clickers', label: 'Unique Clickers', get: (p) => p.metrics?.uniqueLinkImageClickers || 0, fmt: formatCount },
      { key: 'avgTime', label: 'Avg Time', get: (p) => p.metrics?.averageTimeOnPassTheWorldMs || 0, fmt: (v, p) => p.metrics?.averageTimeOnPassTheWorldLabel || formatAxisTime(v) },
      { key: 'activeDays', label: 'Active Days', get: (p) => p.activeDays || 0, fmt: formatCount },
    ];

    const perDayMetrics = [
      { key: 'reachDay', label: 'Reach / Active Day', get: (p) => p.perActiveDay?.reach || 0, fmt: (v) => formatCount(Math.round(v)) },
      { key: 'impDay', label: 'Impressions / Active Day', get: (p) => p.perActiveDay?.impressions || 0, fmt: (v) => formatCount(Math.round(v)) },
      { key: 'clickDay', label: 'Clicks / Active Day', get: (p) => p.perActiveDay?.linkImageClicks || 0, fmt: (v) => formatCount(Math.round(v)) },
    ];

    function compareRows(metrics) {
      return metrics.map((metric) => {
        const vals = selected.map((p) => metric.get(p));
        const max = Math.max(0, ...vals);
        return `
          <div class="owner-ptw-overall-compare__row">
            <div class="owner-ptw-overall-compare__metric">${esc(metric.label)}</div>
            <div class="owner-ptw-overall-compare__cols" style="--cols:${selected.length}">
              ${selected.map((p, i) => {
                const v = vals[i];
                const label = typeof metric.fmt === 'function' ? metric.fmt(v, p) : formatCount(v);
                return `<div>${renderScaleBar(v, max, label)}</div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('');
    }

    return `
      <section class="owner-ptw-overall-partners" aria-label="Partnership comparison">
        <h4 class="owner-ptw-overall-section__title">Partnership Comparison</h4>
        <p class="owner-ptw-overall-section__sub">Compare performance across historical Pass the World partnerships.</p>
        ${selector}
        <div class="owner-ptw-overall-compare__heads" style="--cols:${selected.length}">
          <div class="owner-ptw-overall-compare__metric-spacer"></div>
          ${selected.map((p) => `
            <div class="owner-ptw-overall-compare__head">
              ${p.mapLogoUrl ? `<img src="${esc(p.mapLogoUrl)}" alt="" class="owner-ptw-overall-compare__logo">` : ''}
              <strong>${esc(p.label || 'Partnership')}</strong>
              <span>${esc(formatRangeLabel(p.dateRange))}</span>
              <span>${esc(formatCount(p.activeDays))} active day${p.activeDays === 1 ? '' : 's'}</span>
            </div>`).join('')}
        </div>
        <div class="owner-ptw-overall-compare">
          ${compareRows(compareMetrics)}
        </div>
        <h4 class="owner-ptw-overall-section__title" style="margin-top:18px">Per Active Day</h4>
        <div class="owner-ptw-overall-compare">
          ${compareRows(perDayMetrics)}
        </div>
      </section>`;
  }

  async function loadOverallAnalytics(ctx, { force = false, silent = false } = {}) {
    const { state, api, render } = ctx;
    const ps = ensureState(state);
    if (ps.overallInflight) return;
    if (ps.overall && !force) {
      syncLiveAnalytics(ctx);
      return;
    }
    const showSkeleton = !silent && !ps.overall;
    ps.overallInflight = true;
    if (showSkeleton) {
      ps.overallLoading = true;
      ps.overallError = null;
      render();
    } else if (!silent) {
      ps.overallError = null;
    }
    try {
      const data = await api('ptw-partnership-overall');
      // Ignore stale responses if the panel was closed mid-flight.
      if (!ps.calendarPanel && silent) return;
      ps.overall = data;
      ps.overallError = null;
      if (ps.calendarPanel && !ps.calendarPanel.compareIds?.length) {
        const ids = (data?.partnerships || []).slice(0, 2).map((p) => p.partnerId);
        ps.calendarPanel = { ...ps.calendarPanel, compareIds: ids };
      }
      if (ps.calendarPanel) render();
    } catch (err) {
      if (silent && ps.overall) return;
      ps.overallError = err.message || 'Partnership analytics could not be loaded.';
      if (!ps.overall) ps.overall = null;
      if (ps.calendarPanel) render();
    } finally {
      ps.overallLoading = false;
      ps.overallInflight = false;
      syncLiveAnalytics(ctx);
    }
  }

  const LIVE_ANALYTICS_MS = 15000;

  function stopLiveAnalytics(ps) {
    if (!ps) return;
    if (ps.livePollTimer) {
      clearInterval(ps.livePollTimer);
      ps.livePollTimer = null;
    }
  }

  function syncLiveAnalytics(ctx) {
    const { state } = ctx;
    const ps = ensureState(state);
    const dayOpen = Boolean(
      ps.dayDetail
      && ps.dayDetail.status !== 'future'
      && !(ps.dayDetail.status === 'off' && !(ps.dayDetail.segments || []).length)
      && !ps.dayDetail.error
    );
    const overallOpen = Boolean(ps.calendarPanel);
    if (!dayOpen && !overallOpen) {
      stopLiveAnalytics(ps);
      return;
    }
    if (ps.livePollTimer) return;
    ps.livePollTimer = setInterval(() => {
      const cur = ensureState(ctx.state);
      if (!cur.calendarPanel && !cur.dayDetail) {
        stopLiveAnalytics(cur);
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (cur.calendarPanel) {
        loadOverallAnalytics(ctx, { force: true, silent: true });
      }
      if (
        cur.dayDetail?.date
        && cur.dayDetail.status !== 'future'
        && !(cur.dayDetail.status === 'off' && !(cur.dayDetail.segments || []).length)
        && !cur.dayDetail.error
      ) {
        loadDayDetail(ctx, cur.dayDetail.date, { force: true, silent: true });
      }
    }, LIVE_ANALYTICS_MS);
  }

  function closeOverallPanel(ctx) {
    const ps = ensureState(ctx.state);
    ps.calendarPanel = null;
    syncLiveAnalytics(ctx);
    ctx.render();
  }

  function closeDayPanel(ctx) {
    const ps = ensureState(ctx.state);
    ps.dayDetail = null;
    syncLiveAnalytics(ctx);
    ctx.render();
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
        ${renderCalendarPanelModal(ps)}
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

    root.querySelector('[data-ptw-p-cal-panel]')?.addEventListener('click', () => {
      ps.dayDetail = null;
      ps.calendarPanel = {
        id: 'overview',
        tab: ps.calendarPanel?.tab || 'analytics',
        graphMetric: ps.calendarPanel?.graphMetric || 'reach',
        compareIds: ps.calendarPanel?.compareIds || [],
      };
      render();
      loadOverallAnalytics(ctx, { force: true });
    });

    document.querySelectorAll('[data-ptw-p-cal-panel-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeOverallPanel(ctx));
    });

    document.querySelectorAll('[data-ptw-overall-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!ps.calendarPanel) return;
        const next = btn.getAttribute('data-ptw-overall-tab') || 'analytics';
        ps.calendarPanel = { ...ps.calendarPanel, tab: next };
        render();
      });
    });

    document.querySelectorAll('[data-ptw-overall-graph]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!ps.calendarPanel) return;
        const metric = btn.getAttribute('data-ptw-overall-graph') || 'reach';
        ps.calendarPanel = { ...ps.calendarPanel, graphMetric: metric };
        render();
      });
    });

    document.querySelectorAll('[data-ptw-overall-compare]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!ps.calendarPanel) return;
        const id = btn.getAttribute('data-ptw-overall-compare');
        if (!id) return;
        const cur = new Set(ps.calendarPanel.compareIds || []);
        if (cur.has(id)) {
          if (cur.size <= 1) return;
          cur.delete(id);
        } else {
          if (cur.size >= 3) {
            const first = cur.values().next().value;
            cur.delete(first);
          }
          cur.add(id);
        }
        ps.calendarPanel = { ...ps.calendarPanel, compareIds: [...cur] };
        render();
      });
    });

    document.querySelector('[data-ptw-overall-retry]')?.addEventListener('click', () => {
      loadOverallAnalytics(ctx, { force: true });
    });

    const chart = document.querySelector('[data-ptw-overall-chart]');
    if (chart && !chart._ptwBound) {
      chart._ptwBound = true;
      let points = [];
      try {
        points = JSON.parse(chart.getAttribute('data-ptw-overall-points') || '[]');
      } catch {
        points = [];
      }
      const tip = chart.querySelector('[data-ptw-overall-tip]');
      const svg = chart.querySelector('svg');
      const hide = () => { if (tip) tip.hidden = true; };
      const show = (e) => {
        if (!tip || !svg || !points.length) return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const x = ((e.clientX - rect.left) / rect.width) * 560;
        let best = null;
        let bestDist = Infinity;
        points.forEach((p) => {
          const d = Math.abs(p.x - x);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        });
        if (!best) return;
        const dateLabel = formatLongDate(best.date);
        let body;
        if (best.unavailable) {
          body = `<strong>${esc(dateLabel)}</strong><span>Analytics unavailable</span>`;
        } else if (best.partnershipOff) {
          body = `<strong>${esc(dateLabel)}</strong><span>Partnership inactive</span><span>${esc(best.metricLabel)} · ${esc(best.label || '0')}</span>`;
        } else {
          body = `<strong>${esc(dateLabel)}</strong><span>${esc(best.metricLabel)}</span><span class="owner-ptw-overall-tip__val">${esc(best.label || '0')}</span>`;
        }
        tip.innerHTML = body;
        tip.hidden = false;
        const chartRect = chart.getBoundingClientRect();
        const px = ((best.x / 560) * rect.width) + (rect.left - chartRect.left);
        tip.style.left = `${Math.max(8, Math.min(px, chartRect.width - 140))}px`;
        tip.style.top = '12px';
      };
      chart.addEventListener('pointermove', show);
      chart.addEventListener('pointerdown', show);
      chart.addEventListener('pointerleave', hide);
    }

    root.querySelectorAll('[data-ptw-p-day]').forEach((btn) => {
      const date = btn.getAttribute('data-ptw-p-day');
      btn.addEventListener('pointerenter', () => {
        if (date) prefetchDayDetail(ctx, date);
      });
      btn.addEventListener('focus', () => {
        if (date) prefetchDayDetail(ctx, date);
      });
      btn.addEventListener('click', () => {
        if (!date) return;
        ps.calendarPanel = null;
        loadDayDetail(ctx, date);
      });
    });

    document.querySelectorAll('[data-ptw-p-day-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeDayPanel(ctx));
    });

    document.querySelectorAll('[data-ptw-p-day-config]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-ptw-p-day-config');
        if (!ps.dayDetail || !id) return;
        ps.dayDetail = { ...ps.dayDetail, selectedConfigId: id };
        render();
      });
    });

    document.querySelector('[data-ptw-p-day-retry]')?.addEventListener('click', () => {
      const date = ps.dayDetail?.date;
      if (date) loadDayDetail(ctx, date, { force: true });
    });

    if ((ps.dayDetail || ps.calendarPanel) && !ps._dayEscBound) {
      ps._dayEscBound = true;
      const onEsc = (e) => {
        if (e.key !== 'Escape') return;
        const cur = ensureState(state);
        if (cur.calendarPanel) {
          closeOverallPanel(ctx);
          return;
        }
        if (!cur.dayDetail) return;
        closeDayPanel(ctx);
      };
      document.addEventListener('keydown', onEsc);
    }

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
