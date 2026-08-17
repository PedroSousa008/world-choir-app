/**
 * Daily Acts of Peace — minimalist act grid
 */
const DailyActsPage = (() => {
  let journeyData = null;
  let selectedCategory = 'all';
  let view = { mode: 'grid' };
  let calendarMonth = null;
  let busy = false;
  let justCompletedDate = null;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function localDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatLongDate(isoOrDay) {
    if (!isoOrDay) return '';
    const raw = String(isoOrDay);
    const d = raw.length <= 10 ? new Date(`${raw}T12:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function deviceId() {
    return WorldChoirDB.getDeviceId();
  }

  function root() {
    return document.getElementById('daily-acts-root');
  }

  function todayDate() {
    return journeyData?.summary?.todayDate || localDateString();
  }

  function allItems() {
    return journeyData?.journey || [];
  }

  function themes() {
    return journeyData?.themes || [];
  }

  function findItem(date, key) {
    const items = allItems();
    if (key) {
      const byKey = items.find((item) => item.key === key || item.actId === key);
      if (byKey) return byKey;
    }
    if (date) return items.find((item) => item.date === date) || null;
    return null;
  }

  function filteredItems() {
    const items = allItems();
    const filtered = selectedCategory === 'all'
      ? items.slice()
      : items.filter((item) => item.category === selectedCategory);

    const today = todayDate();

    const rank = (item) => {
      // 1) Today's act — always first (completed or not)
      if (item.isToday || item.date === today) return 0;
      // 2) Completed (not today)
      if (item.status === 'completed') return 1;
      // 3) Past / available, not completed
      if (item.status === 'available') return 2;
      // 4) Not yet revealed
      return 3;
    };

    const completedStamp = (item) =>
      String(item.assignment?.completedAt || item.date || '');

    const revealedStamp = (item) =>
      String(item.date || item.assignment?.revealedAt || '');

    filtered.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      // Completed: most recent → oldest
      if (ra === 1) {
        return completedStamp(b).localeCompare(completedStamp(a));
      }

      // Available past: most recent reveal day → oldest
      if (ra === 2) {
        return revealedStamp(b).localeCompare(revealedStamp(a));
      }

      // Future / today (single): stable by sequence
      return (a.sequence || 0) - (b.sequence || 0);
    });

    return filtered;
  }

  function selectedThemeMeta() {
    if (selectedCategory === 'all') {
      return {
        id: 'all',
        label: 'All',
        description: 'Every moment in your journey of peace.',
      };
    }
    return themes().find((t) => t.id === selectedCategory) || {
      id: selectedCategory,
      label: selectedCategory,
      description: '',
    };
  }

  function itemToDetail(item) {
    if (!item?.act) return null;
    return {
      act: item.act,
      sponsorship: item.sponsorship || null,
      userDailyAct: {
        id: item.assignment?.id,
        date: item.date,
        completed: item.status === 'completed',
        completedAt: item.assignment?.completedAt,
        revealedAt: item.assignment?.revealedAt,
        reflection: item.assignment?.reflection,
        reflectionAt: item.assignment?.reflectionAt,
      },
    };
  }

  function renderSponsorMeta(sponsorship, revealedDate, assignmentDate) {
    if (!sponsorship?.companyLogoUrl) return '';
    const logo = sponsorship.companyLogoUrl;
    const name = sponsorship.companyName || 'Partner';
    return `
      <div class="dap-sheet__meta-row">
        <div class="dap-sheet__meta-block dap-sheet__meta-block--inline">
          <p class="dap-sheet__meta-label">Revealed</p>
          <p class="dap-sheet__meta-value">${esc(formatLongDate(revealedDate))}</p>
        </div>
        <div class="dap-sheet__meta-block dap-sheet__meta-block--inline dap-sheet__meta-block--sponsor">
          <p class="dap-sheet__meta-label">Featured by</p>
          <button type="button" class="dap-sponsor-logo" id="dap-sponsor-logo"
            data-assignment-date="${esc(assignmentDate)}"
            aria-label="Visit ${esc(name)} website">
            <img src="${esc(logo)}" alt="${esc(name)}" loading="lazy" decoding="async">
          </button>
        </div>
      </div>
    `;
  }

  async function loadJourney() {
    journeyData = await apiFetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&view=journey&date=${encodeURIComponent(localDateString())}`
    );
    return journeyData;
  }

  function completedByDate() {
    const map = {};
    for (const item of allItems()) {
      if (item.status === 'completed' && item.date) {
        map[item.date] = item;
      }
    }
    return map;
  }

  function openCalendar(month) {
    calendarMonth = month || localDateString().slice(0, 7);
    view = { mode: 'calendar' };
    paint();
  }

  function renderHeader() {
    return `
      <header class="dap-header">
        <div class="dap-header__row">
          <div class="dap-header__main">
            <p class="dap-header__label">Daily Acts of Peace</p>
            <h1 class="dap-header__title">Create a little more peace</h1>
            <p class="dap-header__subtitle">Small actions. Real moments. A little more peace.</p>
          </div>
          <button type="button" class="dap-header__calendar" id="dap-open-calendar" aria-label="Open calendar overview">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </header>
    `;
  }

  function renderCategoryNav() {
    const themeList = themes();
    const allCount = allItems().length;

    const pills = [
      { id: 'all', label: 'All', count: allCount },
      ...themeList.map((t) => ({ id: t.id, label: t.label, count: t.count || 0 })),
    ];

    return `
      <nav class="dap-cats" aria-label="Act categories">
        <div class="dap-cats__track" role="tablist">
          ${pills.map((p) => `
            <button
              type="button"
              class="dap-cats__pill ${selectedCategory === p.id ? 'is-active' : ''}"
              data-dap-cat="${esc(p.id)}"
              role="tab"
              aria-selected="${selectedCategory === p.id}"
            >
              <span class="dap-cats__name">${esc(p.label)}</span>
            </button>
          `).join('')}
        </div>
      </nav>
    `;
  }

  function renderThemeIntro() {
    const meta = selectedThemeMeta();
    return `
      <div class="dap-theme-intro">
        <h2 class="dap-theme-intro__label">${esc(meta.label)}</h2>
        ${meta.description ? `<p class="dap-theme-intro__copy">${esc(meta.description)}</p>` : ''}
      </div>
    `;
  }

  function renderSquare(item) {
    const status = item.status;
    const isJustCompleted = justCompletedDate
      && (justCompletedDate === item.date || justCompletedDate === item.key || justCompletedDate === item.actId);
    const stateClass =
      status === 'completed' ? 'is-completed'
        : status === 'future' ? 'is-future'
          : 'is-available';

    const inner = status === 'completed'
      ? '<span class="dap-square__mark" aria-hidden="true">✓</span>'
      : '<span class="dap-square__mystery" aria-hidden="true">?</span>';

    const aria =
      status === 'completed' ? 'Completed act of peace'
        : status === 'future' ? 'Act not yet revealed'
          : 'Act available to complete';

    return `
      <button
        type="button"
        class="dap-square ${stateClass} ${isJustCompleted ? 'is-just-completed' : ''} ${item.isToday ? 'is-today' : ''}"
        data-open-date="${esc(item.date || '')}"
        data-item-key="${esc(item.key || item.actId || '')}"
        data-status="${esc(status)}"
        aria-label="${esc(aria)}"
      >
        ${inner}
      </button>
    `;
  }

  function renderGrid() {
    const items = filteredItems();
    if (!items.length) {
      return `
        <div class="dap-empty-state">
          <p class="dap-empty-state__title">No acts yet</p>
          <p class="dap-empty-state__copy">This part of your journey hasn’t appeared yet.</p>
        </div>
      `;
    }

    return `
      <div class="dap-grid" role="list">
        ${items.map((item) => `<div class="dap-grid__cell" role="listitem">${renderSquare(item)}</div>`).join('')}
      </div>
    `;
  }

  function renderMain() {
    if (!journeyData) {
      return '<p class="dap-loading">Loading…</p>';
    }
    return `
      ${renderHeader()}
      ${renderCategoryNav()}
      ${renderThemeIntro()}
      ${renderGrid()}
    `;
  }

  function renderSheet(content, { className = '' } = {}) {
    return `
      <div class="dap-sheet ${className}" role="dialog" aria-modal="true">
        <button type="button" class="dap-sheet__backdrop" id="dap-sheet-close" aria-label="Close"></button>
        <div class="dap-sheet__panel">
          ${content}
        </div>
      </div>
    `;
  }

  function renderFutureSheet() {
    return renderSheet(`
      <button type="button" class="dap-sheet__close" id="dap-sheet-close-btn" aria-label="Close">×</button>
      <p class="dap-sheet__kicker">Not yet revealed</p>
      <h2 class="dap-sheet__title dap-sheet__title--muted">An act awaits you</h2>
      <p class="dap-sheet__body">This Act hasn’t been revealed yet.</p>
      <p class="dap-sheet__body dap-sheet__body--soft">Come back when its moment arrives.</p>
      <div class="dap-sheet__actions">
        <button type="button" class="btn btn-secondary" id="dap-sheet-close-btn-bottom">Close</button>
      </div>
    `, { className: 'dap-sheet--future' });
  }

  function renderActDetail(item, { editingReflection = false } = {}) {
    const uda = item.userDailyAct;
    const act = item.act;
    const sponsorship = item.sponsorship || null;
    const completed = !!uda.completed;
    const revealedMeta = sponsorship
      ? renderSponsorMeta(sponsorship, uda.revealedAt || uda.date, uda.date)
      : `
        <div class="dap-sheet__meta-block">
          <p class="dap-sheet__meta-label">Revealed</p>
          <p class="dap-sheet__meta-value">${esc(formatLongDate(uda.revealedAt || uda.date))}</p>
        </div>
      `;

    return renderSheet(`
      <button type="button" class="dap-sheet__close" id="dap-sheet-close-btn" aria-label="Close">×</button>
      <p class="dap-sheet__kicker">Daily Act of Peace</p>
      ${act.categoryLabel ? `<p class="dap-sheet__category">${esc(act.categoryLabel)}</p>` : ''}
      <h2 class="dap-sheet__title">${esc(act.text)}</h2>
      ${act.explanation ? `<p class="dap-sheet__body">${esc(act.explanation)}</p>` : ''}

      ${completed ? `
        <div class="dap-sheet__meta-block">
          <p class="dap-sheet__meta-label">Completed</p>
          <p class="dap-sheet__meta-value">${esc(formatLongDate(uda.completedAt))}</p>
          ${uda.date && String(uda.completedAt || '').slice(0, 10) !== uda.date ? `
            <p class="dap-sheet__meta-note">Revealed ${esc(formatLongDate(uda.date))}</p>
          ` : ''}
        </div>
        ${sponsorship ? renderSponsorMeta(sponsorship, uda.date, uda.date) : ''}

        ${editingReflection ? `
          <div class="dap-reflection-box">
            <label for="dap-reflection-edit">Your message</label>
            <textarea id="dap-reflection-edit" maxlength="4000" placeholder="What did this moment mean to you?">${esc(uda.reflection || '')}</textarea>
            <div class="dap-sheet__actions">
              <button type="button" class="btn btn-primary" id="dap-save-reflection-edit">Save message</button>
              <button type="button" class="btn btn-ghost" id="dap-cancel-reflection-edit">Cancel</button>
            </div>
          </div>
        ` : uda.reflection ? `
          <div class="dap-reflection-view">
            <p class="dap-reflection-view__label">Your message</p>
            <blockquote class="dap-reflection-view__quote">${esc(uda.reflection)}</blockquote>
            <button type="button" class="dap-link-btn" id="dap-edit-reflection">Edit message</button>
          </div>
        ` : `
          <button type="button" class="dap-link-btn" id="dap-edit-reflection" style="margin-top:18px">Add a message</button>
        `}
      ` : `
        ${revealedMeta}
        <div class="dap-sheet__actions">
          ${act.nav?.type ? `
            <button type="button" class="btn btn-secondary" id="dap-nav-btn"
              data-nav-type="${esc(act.nav.type)}"
              data-nav-cause="${esc(act.nav.cause || '')}"
              data-assignment-date="${esc(uda.date)}">
              ${esc(act.nav.label || 'Open')}
            </button>
          ` : ''}
          <button type="button" class="btn btn-primary" id="dap-complete-btn" data-assignment-date="${esc(uda.date)}">
            Complete act
          </button>
        </div>
      `}
    `, { className: completed ? 'dap-sheet--completed' : '' });
  }

  function renderCompleteMoment() {
    return renderSheet(`
      <div class="dap-complete-moment">
        <div class="dap-complete-moment__icon" aria-hidden="true">
          <span class="dap-complete-ring"></span>
          <span class="dap-complete-check">✓</span>
        </div>
        <p class="dap-complete-moment__eyebrow">Act completed</p>
        <p class="dap-complete-moment__copy">Thank you for creating a little more peace.</p>
      </div>
    `, { className: 'dap-sheet--moment' });
  }

  function renderReflect(item) {
    const prompt = item.act?.reflectionPrompt || 'What did this moment mean to you?';
    return renderSheet(`
      <p class="dap-sheet__kicker">Optional</p>
      <h2 class="dap-sheet__title dap-sheet__title--small">Save this moment</h2>
      <div class="dap-reflection-box">
        <label for="dap-reflection-input">${esc(prompt)}</label>
        <p class="dap-reflection-hint">A few words you’ll want to remember. Optional.</p>
        <textarea id="dap-reflection-input" maxlength="4000" placeholder="Write a few words…"></textarea>
        <div class="dap-sheet__actions">
          <button type="button" class="btn btn-primary" id="dap-save-reflection" data-assignment-date="${esc(item.userDailyAct.date)}">Save message</button>
          <button type="button" class="btn btn-ghost" id="dap-skip-reflection">Skip for now</button>
        </div>
      </div>
    `, { className: 'dap-sheet--reflect' });
  }

  function renderCalendarPanel() {
    if (!calendarMonth) calendarMonth = localDateString().slice(0, 7);
    const [year, month] = calendarMonth.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const marked = completedByDate();

    const cells = [];
    for (let i = 0; i < startDow; i += 1) {
      cells.push('<div class="dap-calendar__day is-empty" aria-hidden="true"></div>');
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${calendarMonth}-${String(day).padStart(2, '0')}`;
      const isMarked = !!marked[date];
      cells.push(`
        <button type="button" class="dap-calendar__day ${isMarked ? 'is-marked' : ''}" ${isMarked ? `data-calendar-day="${date}"` : 'disabled'}>
          ${day}${isMarked ? '<span class="dap-calendar__mark" aria-hidden="true">✓</span>' : ''}
        </button>
      `);
    }

    return `
      <button type="button" class="dap-sheet__close" id="dap-sheet-close-btn" aria-label="Close">×</button>
      <p class="dap-sheet__kicker">Calendar</p>
      <div class="dap-calendar">
        <div class="dap-calendar__nav">
          <button type="button" id="dap-cal-prev" aria-label="Previous month">‹</button>
          <p class="dap-calendar__month">${esc(monthLabel(calendarMonth))}</p>
          <button type="button" id="dap-cal-next" aria-label="Next month">›</button>
        </div>
        <div class="dap-calendar__grid">
          ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="dap-calendar__dow">${d}</div>`).join('')}
          ${cells.join('')}
        </div>
        <p class="dap-calendar__note">Marked days are when you completed an act of peace.</p>
      </div>
    `;
  }

  function renderCalendar() {
    return renderMain() + renderSheet(renderCalendarPanel(), { className: 'dap-sheet--calendar' });
  }

  function refreshCalendarInPlace() {
    const panel = document.querySelector('.dap-sheet--calendar .dap-sheet__panel');
    if (!panel) {
      paint();
      return;
    }
    panel.innerHTML = renderCalendarPanel();
    bindCalendar();
  }

  function paint() {
    const el = root();
    if (!el) return;

    if (view.mode === 'complete-moment') {
      el.innerHTML = renderMain() + renderCompleteMoment();
      bindGrid();
      window.setTimeout(() => {
        if (view.mode === 'complete-moment' && view.item) {
          view = { mode: 'reflect', item: view.item };
          paint();
        }
      }, 1200);
      return;
    }

    if (view.mode === 'reflect' && view.item) {
      el.innerHTML = renderMain() + renderReflect(view.item);
      bindGrid();
      bindReflect();
      return;
    }

    if (view.mode === 'detail' && view.item) {
      el.innerHTML = renderMain() + renderActDetail(view.item, { editingReflection: !!view.editingReflection });
      bindGrid();
      bindDetail();
      return;
    }

    if (view.mode === 'future') {
      el.innerHTML = renderMain() + renderFutureSheet();
      bindGrid();
      bindSheetClose();
      return;
    }

    if (view.mode === 'calendar') {
      el.innerHTML = renderCalendar();
      bindGrid();
      bindCalendar();
      return;
    }

    el.innerHTML = renderMain();
    bindGrid();
    markTodayViewed();

    if (justCompletedDate) {
      window.setTimeout(() => {
        justCompletedDate = null;
      }, 900);
    }
  }

  function closeSheet() {
    view = { mode: 'grid' };
    paint();
  }

  function bindSheetClose() {
    ['dap-sheet-close', 'dap-sheet-close-btn', 'dap-sheet-close-btn-bottom'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', closeSheet);
    });
  }

  function bindGrid() {
    document.getElementById('dap-open-calendar')?.addEventListener('click', () => {
      openCalendar(localDateString().slice(0, 7));
    });

    document.querySelectorAll('[data-dap-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-dap-cat');
        if (!next || next === selectedCategory) return;
        selectedCategory = next;
        view = { mode: 'grid' };
        paint();
      });
    });

    document.querySelectorAll('[data-open-date], [data-item-key]').forEach((btn) => {
      if (!btn.classList.contains('dap-square')) return;
      btn.addEventListener('click', () => {
        const date = btn.getAttribute('data-open-date') || '';
        const key = btn.getAttribute('data-item-key') || '';
        const status = btn.getAttribute('data-status');
        const item = findItem(date, key);
        if (!item) return;

        if (status === 'future' || item.status === 'future') {
          view = { mode: 'future', date: date || null, key };
          paint();
          return;
        }

        view = { mode: 'detail', item: itemToDetail(item) };
        paint();
      });
    });
  }

  function handleNav(type, cause, assignmentDate) {
    const track = async (interaction) => {
      try {
        await apiFetch('/api/daily-peace', {
          method: 'POST',
          body: JSON.stringify({
            deviceId: deviceId(),
            date: localDateString(),
            assignmentDate: assignmentDate || todayDate(),
            action: 'track-interaction',
            interaction,
          }),
        });
      } catch {
        /* non-blocking */
      }
    };

    if (type === 'practice') {
      track('openedPractice');
      window.location.href = 'profile.html?practice=1';
      return;
    }
    if (type === 'map') {
      track('openedMap');
      window.location.href = 'map.html';
      return;
    }
    if (type === 'donate') {
      track('openedDonate');
      const params = new URLSearchParams();
      if (cause) params.set('cause', cause);
      const qs = params.toString();
      window.location.href = qs ? `donate.html?${qs}` : 'donate.html';
      return;
    }
    if (type === 'invite') {
      track('openedInvite');
      if (typeof DailyActsPeace !== 'undefined' && DailyActsPeace.shareInvite) {
        DailyActsPeace.shareInvite();
      }
      return;
    }
    if (type === 'profile') {
      track('openedProfile');
      window.location.href = 'profile.html';
    }
  }

  async function completeAct(assignmentDate) {
    if (busy) return;
    busy = true;
    const btn = document.getElementById('dap-complete-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Completing…';
    }
    try {
      const data = await apiFetch('/api/daily-peace', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: deviceId(),
          date: localDateString(),
          assignmentDate,
          action: 'complete',
        }),
      });
      if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.refreshBanner?.();
      justCompletedDate = assignmentDate;
      await loadJourney();
      view = { mode: 'complete-moment', item: data };
      paint();
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Complete act';
      }
      alert(err.message || 'Could not save completion.');
    } finally {
      busy = false;
    }
  }

  function bindDetail() {
    bindSheetClose();

    document.getElementById('dap-nav-btn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      handleNav(
        btn.getAttribute('data-nav-type'),
        btn.getAttribute('data-nav-cause') || '',
        btn.getAttribute('data-assignment-date')
      );
    });

    document.getElementById('dap-complete-btn')?.addEventListener('click', (e) => {
      completeAct(e.currentTarget.getAttribute('data-assignment-date'));
    });

    const sponsorship = view.item?.sponsorship;
    if (sponsorship && view.item?.userDailyAct?.date) {
      const assignmentDate = view.item.userDailyAct.date;
      apiFetch('/api/daily-peace', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: deviceId(),
          date: localDateString(),
          assignmentDate,
          action: 'track-sponsor-impression',
        }),
      }).catch(() => {});

      document.getElementById('dap-sponsor-logo')?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const data = await apiFetch('/api/daily-peace', {
            method: 'POST',
            body: JSON.stringify({
              deviceId: deviceId(),
              date: localDateString(),
              assignmentDate,
              action: 'track-sponsor-click',
              platform: 'web',
            }),
          });
          const url = data?.redirectUrl || sponsorship.companyWebsiteUrl;
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
          const url = sponsorship.companyWebsiteUrl;
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    }

    document.getElementById('dap-edit-reflection')?.addEventListener('click', () => {
      view = { ...view, editingReflection: true };
      paint();
    });

    document.getElementById('dap-cancel-reflection-edit')?.addEventListener('click', () => {
      view = { ...view, editingReflection: false };
      paint();
    });

    document.getElementById('dap-save-reflection-edit')?.addEventListener('click', async (e) => {
      if (busy) return;
      busy = true;
      const btn = e.currentTarget;
      const assignmentDate = view.item?.userDailyAct?.date;
      const reflection = document.getElementById('dap-reflection-edit')?.value || '';
      btn.disabled = true;
      try {
        const data = await apiFetch('/api/daily-peace', {
          method: 'POST',
          body: JSON.stringify({
            deviceId: deviceId(),
            date: localDateString(),
            assignmentDate,
            action: 'update-reflection',
            reflection,
          }),
        });
        await loadJourney();
        view = { mode: 'detail', item: data, editingReflection: false };
        paint();
      } catch (err) {
        alert(err.message || 'Could not save message.');
        btn.disabled = false;
      } finally {
        busy = false;
      }
    });
  }

  function bindReflect() {
    bindSheetClose();

    document.getElementById('dap-skip-reflection')?.addEventListener('click', () => {
      closeSheet();
      if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.refreshBanner?.();
    });

    document.getElementById('dap-save-reflection')?.addEventListener('click', async (e) => {
      if (busy) return;
      busy = true;
      const btn = e.currentTarget;
      const assignmentDate = btn.getAttribute('data-assignment-date')
        || view.item?.userDailyAct?.date
        || localDateString();
      const reflection = document.getElementById('dap-reflection-input')?.value || '';
      btn.disabled = true;
      try {
        await apiFetch('/api/daily-peace', {
          method: 'POST',
          body: JSON.stringify({
            deviceId: deviceId(),
            date: localDateString(),
            assignmentDate,
            action: 'save-reflection',
            reflection,
          }),
        });
        await loadJourney();
        closeSheet();
        if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.refreshBanner?.();
      } catch (err) {
        btn.disabled = false;
        alert(err.message || 'Could not save reflection.');
      } finally {
        busy = false;
      }
    });
  }

  function bindCalendar() {
    bindSheetClose();

    document.getElementById('dap-cal-prev')?.addEventListener('click', () => {
      calendarMonth = shiftMonth(calendarMonth, -1);
      refreshCalendarInPlace();
    });
    document.getElementById('dap-cal-next')?.addEventListener('click', () => {
      calendarMonth = shiftMonth(calendarMonth, 1);
      refreshCalendarInPlace();
    });

    document.querySelectorAll('[data-calendar-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-calendar-day');
        const journeyItem = completedByDate()[day];
        if (!journeyItem) return;
        view = { mode: 'detail', item: itemToDetail(journeyItem) };
        paint();
      });
    });
  }

  function markTodayViewed() {
    const todayItem = allItems().find((i) => i.isToday && i.status !== 'future');
    if (!todayItem?.date) return;
    apiFetch('/api/daily-peace', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: deviceId(),
        date: localDateString(),
        assignmentDate: todayItem.date,
        action: 'mark-viewed',
      }),
    }).catch(() => {});
  }

  async function init() {
    WorldChoirNav.startWatcher('daily-acts');
    selectedCategory = 'all';
    root().innerHTML = '<p class="dap-loading">Loading…</p>';

    try {
      await WorldChoirDB.ready();
      if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.start?.();
      await loadJourney();
      paint();
    } catch (err) {
      root().innerHTML = `<p class="dap-error">${esc(err.message || 'Could not load Daily Acts of Peace.')}</p>`;
    }
  }

  return { init };
})();
