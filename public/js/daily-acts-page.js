/**
 * Daily Acts of Peace — personal journey experience
 */
const DailyActsPage = (() => {
  let journeyData = null;
  let view = { mode: 'journey' };
  let calendarMonth = null;
  let calendarData = null;
  let busy = false;
  let completingDate = null;

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

  function formatShortDate(isoOrDay) {
    if (!isoOrDay) return '';
    const raw = String(isoOrDay);
    const d = raw.length <= 10 ? new Date(`${raw}T12:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  function formatLongDate(isoOrDay) {
    if (!isoOrDay) return '';
    const raw = String(isoOrDay);
    const d = raw.length <= 10 ? new Date(`${raw}T12:00:00`) : new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function futureLabel(date, todayDate) {
    const t = new Date(`${todayDate}T12:00:00`);
    const target = new Date(`${date}T12:00:00`);
    const diff = Math.round((target - t) / 86400000);
    if (diff === 1) return 'Tomorrow';
    if (diff === 2) return 'In two days';
    return formatShortDate(date);
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

  function journeyItems() {
    return journeyData?.journey || [];
  }

  function findItem(date) {
    return journeyItems().find((item) => item.date === date) || null;
  }

  function itemToDetail(item) {
    if (!item?.act) return null;
    return {
      act: item.act,
      userDailyAct: {
        id: item.assignment.id,
        date: item.date,
        completed: item.status === 'completed',
        completedAt: item.assignment.completedAt,
        revealedAt: item.assignment.revealedAt,
        reflection: item.assignment.reflection,
        reflectionAt: item.assignment.reflectionAt,
      },
    };
  }

  async function loadJourney() {
    journeyData = await apiFetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&view=journey&date=${encodeURIComponent(localDateString())}`
    );
    return journeyData;
  }

  async function loadCalendar(month) {
    calendarMonth = month;
    calendarData = await apiFetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&view=calendar&month=${encodeURIComponent(month)}&date=${encodeURIComponent(localDateString())}`
    );
    return calendarData;
  }

  function momentsCopy(count) {
    if (!count) return null;
    if (count === 1) return '1 moment of peace';
    return `${count} moments of peace`;
  }

  function renderHeader() {
    const moments = journeyData?.summary?.momentsOfPeace || 0;
    const momentsText = momentsCopy(moments);
    return `
      <header class="dap-header">
        <div class="dap-header__row">
          <div class="dap-header__main">
            <p class="dap-header__label">Daily Acts of Peace</p>
            <h1 class="dap-header__title">Create a little more peace</h1>
            <p class="dap-header__subtitle">One small act. One moment. A little more peace.</p>
          </div>
          <button type="button" class="dap-header__calendar" id="dap-open-calendar" aria-label="Open calendar overview">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        ${momentsText ? `<p class="dap-header__moments">${esc(momentsText)}</p>` : ''}
      </header>
    `;
  }

  function renderTodayCard(item) {
    if (!item?.act) {
      return '<p class="dap-loading">Preparing today’s act…</p>';
    }
    const completed = item.status === 'completed';
    const act = item.act;

    return `
      <section class="dap-today" aria-label="Today's act">
        <p class="dap-today__label">Today</p>
        <button type="button" class="dap-journey-card dap-journey-card--today ${completed ? 'is-completed' : 'is-revealed'}" data-open-date="${esc(item.date)}">
          <div class="dap-journey-card__inner">
            ${act.categoryLabel ? `<p class="dap-journey-card__category">${esc(act.categoryLabel)}</p>` : ''}
            <h2 class="dap-journey-card__title">${esc(act.text)}</h2>
            <p class="dap-journey-card__status">
              ${completed
                ? `<span class="dap-status dap-status--done">✓ Completed today</span>`
                : `<span class="dap-status dap-status--open">Open act</span>`
              }
            </p>
          </div>
        </button>
      </section>
    `;
  }

  function renderTimelineItem(item, { isLast = false } = {}) {
    if (item.status === 'future') {
      return `
        <li class="dap-timeline__item dap-timeline__item--future ${isLast ? 'is-last' : ''}">
          <div class="dap-timeline__rail" aria-hidden="true">
            <span class="dap-timeline__dot dap-timeline__dot--future"></span>
            ${!isLast ? '<span class="dap-timeline__line"></span>' : ''}
          </div>
          <button type="button" class="dap-journey-card dap-journey-card--future" data-future-date="${esc(item.date)}">
            <p class="dap-journey-card__date">${esc(futureLabel(item.date, todayDate()))}</p>
            <p class="dap-journey-card__mystery">An act awaits you.</p>
            <p class="dap-journey-card__hint">Not revealed yet</p>
          </button>
        </li>
      `;
    }

    const completed = item.status === 'completed';
    const act = item.act;
    const overdue = !completed && !item.isToday;
    const stateClass = completed ? 'is-completed' : 'is-revealed';

    return `
      <li class="dap-timeline__item ${stateClass} ${isLast ? 'is-last' : ''}">
        <div class="dap-timeline__rail" aria-hidden="true">
          <span class="dap-timeline__dot ${completed ? 'dap-timeline__dot--done' : 'dap-timeline__dot--open'}"></span>
          ${!isLast ? '<span class="dap-timeline__line"></span>' : ''}
        </div>
        <button type="button" class="dap-journey-card ${stateClass}" data-open-date="${esc(item.date)}">
          <div class="dap-journey-card__inner">
            ${completed ? '<span class="dap-journey-card__check" aria-hidden="true">✓</span>' : ''}
            ${act.categoryLabel && !completed ? `<p class="dap-journey-card__category">${esc(act.categoryLabel)}</p>` : ''}
            <h3 class="dap-journey-card__title">${esc(act.text)}</h3>
            <div class="dap-journey-card__meta">
              ${completed
                ? `<span class="dap-status dap-status--done">Completed ${esc(formatShortDate(item.assignment.completedAt || item.date))}</span>`
                : overdue
                  ? `<span class="dap-status dap-status--waiting">Revealed ${esc(formatShortDate(item.date))}</span>`
                  : `<span class="dap-status dap-status--waiting">${esc(formatShortDate(item.date))}</span>`
              }
            </div>
          </div>
        </button>
      </li>
    `;
  }

  function renderJourney() {
    if (!journeyData) {
      return '<p class="dap-loading">Loading your journey…</p>';
    }

    const items = journeyItems();
    const todayItem = items.find((i) => i.isToday && i.status !== 'future') || null;
    const pastItems = items.filter((i) => !i.isToday && i.status !== 'future');
    const futureItems = items.filter((i) => i.status === 'future');

    return `
      ${renderHeader()}
      ${renderTodayCard(todayItem)}
      ${pastItems.length ? `
        <section class="dap-section" aria-label="Previous moments">
          <h2 class="dap-section__label">Previous moments</h2>
          <ol class="dap-timeline">
            ${pastItems.map((item, idx) => renderTimelineItem(item, { isLast: idx === pastItems.length - 1 && !futureItems.length })).join('')}
          </ol>
        </section>
      ` : ''}
      ${futureItems.length ? `
        <section class="dap-section dap-section--future" aria-label="Future acts">
          <h2 class="dap-section__label">Ahead</h2>
          <ol class="dap-timeline">
            ${futureItems.map((item, idx) => renderTimelineItem(item, { isLast: idx === futureItems.length - 1 })).join('')}
          </ol>
        </section>
      ` : ''}
      ${!pastItems.length && !futureItems.length && todayItem ? `
        <p class="dap-empty">Your journey begins today. Each act you complete becomes a moment of peace.</p>
      ` : ''}
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

  function renderActDetail(item, { editingReflection = false } = {}) {
    const uda = item.userDailyAct;
    const act = item.act;
    const completed = !!uda.completed;
    const overdue = !completed && uda.date < todayDate();

    return `
      ${renderSheet(`
        <button type="button" class="dap-sheet__close" id="dap-sheet-close-btn" aria-label="Close">×</button>
        <p class="dap-sheet__kicker">Daily Act of Peace</p>
        ${act.categoryLabel ? `<p class="dap-sheet__category">${esc(act.categoryLabel)}</p>` : ''}
        <h2 class="dap-sheet__title">${esc(act.text)}</h2>
        ${act.explanation ? `<p class="dap-sheet__body">${esc(act.explanation)}</p>` : ''}

        ${overdue ? `
          <p class="dap-sheet__dates">Revealed ${esc(formatLongDate(uda.revealedAt || uda.date))}</p>
        ` : ''}

        ${completed ? `
          ${uda.reflection && !editingReflection ? `
            <div class="dap-reflection-view">
              <p class="dap-reflection-view__label">Your message</p>
              <blockquote class="dap-reflection-view__quote">${esc(uda.reflection)}</blockquote>
              <button type="button" class="dap-link-btn" id="dap-edit-reflection">Edit message</button>
            </div>
          ` : ''}
          ${editingReflection ? `
            <div class="dap-reflection-box">
              <label for="dap-reflection-edit">Your message</label>
              <textarea id="dap-reflection-edit" maxlength="4000" placeholder="Write a few words…">${esc(uda.reflection || '')}</textarea>
              <div class="dap-sheet__actions">
                <button type="button" class="btn btn-primary" id="dap-save-reflection-edit">Save message</button>
                <button type="button" class="btn btn-ghost" id="dap-cancel-reflection-edit">Cancel</button>
              </div>
            </div>
          ` : ''}
          <div class="dap-sheet__completed">
            <span class="dap-status dap-status--done">✓ Completed</span>
            <p class="dap-sheet__completed-date">${esc(formatLongDate(uda.completedAt))}</p>
            ${uda.date !== localDateFromCompletionDay(uda.completedAt) && uda.date < todayDate() ? `
              <p class="dap-sheet__completed-note">Revealed ${esc(formatLongDate(uda.date))}</p>
            ` : ''}
          </div>
        ` : `
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
      `, { className: completed ? 'dap-sheet--completed' : '' })}
    `;
  }

  function localDateFromCompletionDay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return localDateString(d);
  }

  function renderFutureSheet(date) {
    return renderSheet(`
      <button type="button" class="dap-sheet__close" id="dap-sheet-close-btn" aria-label="Close">×</button>
      <p class="dap-sheet__kicker">Not yet revealed</p>
      <h2 class="dap-sheet__title dap-sheet__title--muted">${esc(futureLabel(date, todayDate()))}</h2>
      <p class="dap-sheet__body">This act hasn't been revealed yet.</p>
      <p class="dap-sheet__body dap-sheet__body--soft">Come back when its moment arrives.</p>
      <div class="dap-sheet__actions">
        <button type="button" class="btn btn-secondary" id="dap-sheet-close-btn-bottom">Close</button>
      </div>
    `, { className: 'dap-sheet--future' });
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
    const prompt = item.act?.reflectionPrompt || 'What would you like to remember about this act?';
    return renderSheet(`
      <p class="dap-sheet__kicker">Optional reflection</p>
      <h2 class="dap-sheet__title dap-sheet__title--small">Save this moment</h2>
      <div class="dap-reflection-box">
        <label for="dap-reflection-input">${esc(prompt)}</label>
        <p class="dap-reflection-hint">Share what you did, who you reached, or anything you'd like to remember. Optional.</p>
        <textarea id="dap-reflection-input" maxlength="4000" placeholder="Write a few words…"></textarea>
        <div class="dap-sheet__actions">
          <button type="button" class="btn btn-primary" id="dap-save-reflection" data-assignment-date="${esc(item.userDailyAct.date)}">Save message</button>
          <button type="button" class="btn btn-ghost" id="dap-skip-reflection">Skip for now</button>
        </div>
      </div>
    `, { className: 'dap-sheet--reflect' });
  }

  function renderCalendar() {
    if (!calendarData) return renderJourney() + renderSheet('<p class="dap-loading">Loading calendar…</p>');
    const [year, month] = calendarMonth.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const marked = calendarData.days || {};

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

    return renderJourney() + renderSheet(`
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
    `, { className: 'dap-sheet--calendar' });
  }

  function paint() {
    const el = root();
    if (!el) return;

    if (view.mode === 'complete-moment') {
      el.innerHTML = renderJourney() + renderCompleteMoment();
      bindJourney();
      window.setTimeout(() => {
        if (view.mode === 'complete-moment' && view.item) {
          view = { mode: 'reflect', item: view.item };
          paint();
        }
      }, 1400);
      return;
    }

    if (view.mode === 'reflect' && view.item) {
      el.innerHTML = renderJourney() + renderReflect(view.item);
      bindJourney();
      bindReflect();
      return;
    }

    if (view.mode === 'detail' && view.item) {
      el.innerHTML = renderJourney() + renderActDetail(view.item, { editingReflection: !!view.editingReflection });
      bindJourney();
      bindDetail();
      return;
    }

    if (view.mode === 'future' && view.date) {
      el.innerHTML = renderJourney() + renderFutureSheet(view.date);
      bindJourney();
      bindFutureSheet();
      return;
    }

    if (view.mode === 'calendar') {
      el.innerHTML = renderCalendar();
      bindJourney();
      bindCalendar();
      return;
    }

    el.innerHTML = renderJourney();
    bindJourney();
    markTodayViewed();
  }

  function closeSheet() {
    view = { mode: 'journey' };
    paint();
  }

  function bindSheetClose() {
    ['dap-sheet-close', 'dap-sheet-close-btn', 'dap-sheet-close-btn-bottom'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', closeSheet);
    });
  }

  function bindJourney() {
    document.getElementById('dap-open-calendar')?.addEventListener('click', async () => {
      try {
        await loadCalendar(localDateString().slice(0, 7));
        view = { mode: 'calendar' };
        paint();
      } catch (err) {
        alert(err.message || 'Could not load calendar.');
      }
    });

    document.querySelectorAll('[data-open-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const date = btn.getAttribute('data-open-date');
        const item = findItem(date);
        if (!item || item.status === 'future') return;
        view = { mode: 'detail', item: itemToDetail(item) };
        paint();
      });
    });

    document.querySelectorAll('[data-future-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view = { mode: 'future', date: btn.getAttribute('data-future-date') };
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
    completingDate = assignmentDate;
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
      completingDate = null;
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

  function bindFutureSheet() {
    bindSheetClose();
  }

  function bindReflect() {
    bindSheetClose();

    document.getElementById('dap-skip-reflection')?.addEventListener('click', async () => {
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

    document.getElementById('dap-cal-prev')?.addEventListener('click', async () => {
      await loadCalendar(shiftMonth(calendarMonth, -1));
      paint();
    });
    document.getElementById('dap-cal-next')?.addEventListener('click', async () => {
      await loadCalendar(shiftMonth(calendarMonth, 1));
      paint();
    });

    document.querySelectorAll('[data-calendar-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-calendar-day');
        const item = calendarData?.days?.[day];
        if (!item) return;
        view = { mode: 'detail', item };
        paint();
      });
    });
  }

  function markTodayViewed() {
    const todayItem = journeyItems().find((i) => i.isToday && i.status !== 'future');
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
