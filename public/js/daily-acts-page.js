/**
 * DailyActsPage — Today + My Impact experience
 */
const DailyActsPage = (() => {
  let tab = 'today';
  let todayData = null;
  let impactData = null;
  let view = { mode: 'tabs' }; // tabs | detail | calendar | calendar-day | reflect
  let calendarMonth = null;
  let calendarData = null;
  let busy = false;

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
    const d = raw.length <= 10
      ? new Date(`${raw}T12:00:00`)
      : new Date(raw);
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

  function queryTab() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const t = params.get('tab');
      if (t === 'impact') return 'impact';
      return 'today';
    } catch {
      return 'today';
    }
  }

  async function loadToday() {
    todayData = await apiFetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&date=${encodeURIComponent(localDateString())}`
    );
    return todayData;
  }

  async function loadImpact() {
    impactData = await apiFetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&view=impact&date=${encodeURIComponent(localDateString())}`
    );
    return impactData;
  }

  async function loadCalendar(month) {
    calendarMonth = month;
    calendarData = await apiFetch(
      `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&view=calendar&month=${encodeURIComponent(month)}&date=${encodeURIComponent(localDateString())}`
    );
    return calendarData;
  }

  function renderShell(inner) {
    return `
      <header class="dap-header">
        <p class="dap-header__label">Daily Acts of Peace</p>
        <h1 class="dap-header__title">Create a little more peace</h1>
      </header>
      <div class="dap-tabs" role="tablist" aria-label="Daily Acts sections">
        <button type="button" class="dap-tab ${tab === 'today' ? 'is-active' : ''}" data-dap-tab="today" role="tab" aria-selected="${tab === 'today'}">Today</button>
        <button type="button" class="dap-tab ${tab === 'impact' ? 'is-active' : ''}" data-dap-tab="impact" role="tab" aria-selected="${tab === 'impact'}">My Impact</button>
      </div>
      ${inner}
    `;
  }

  function renderToday() {
    if (!todayData?.act) {
      return '<p class="dap-loading">Loading today’s act…</p>';
    }
    const { act, userDailyAct } = todayData;
    const completed = !!userDailyAct?.completed;

    return `
      <article class="dap-today-card">
        <p class="dap-kicker">Today's Act of Peace</p>
        <h2 class="dap-act-title">${esc(act.text)}</h2>
        <p class="dap-act-explain">${esc(act.explanation || 'Here is one small opportunity to make a difference today.')}</p>
      </article>
      <div class="dap-actions">
        ${act.nav?.type ? `
          <button type="button" class="btn btn-primary" id="dap-nav-btn" data-nav-type="${esc(act.nav.type)}" data-nav-cause="${esc(act.nav.cause || '')}">
            ${esc(act.nav.label || 'Open')}
          </button>
        ` : ''}
        ${completed
          ? `<p class="dap-done-note">Completed today${userDailyAct.reflection ? ' · Reflection saved' : ''}</p>
             <button type="button" class="btn btn-secondary" id="dap-view-completed">View this act</button>`
          : `<button type="button" class="btn ${act.nav ? 'btn-secondary' : 'btn-primary'}" id="dap-complete-btn">I COMPLETED THIS ACT</button>`
        }
      </div>
    `;
  }

  function renderImpact() {
    if (!impactData?.summary) {
      return '<p class="dap-loading">Loading your impact…</p>';
    }
    const s = impactData.summary;
    const completed = impactData.completed || [];
    const stillOpen = impactData.stillOpen || [];

    return `
      <section class="dap-impact-summary">
        <p class="dap-impact-summary__label">Your Impact</p>
        <p class="dap-impact-summary__value">${esc(String(s.totalCompleted))}</p>
        <p class="dap-impact-summary__copy">${s.totalCompleted === 1
          ? '1 opportunity to make a difference.'
          : `${esc(String(s.totalCompleted))} opportunities to make a difference.`}</p>
        <button type="button" class="btn btn-secondary dap-calendar-btn" id="dap-open-calendar">Calendar</button>
        <div class="dap-impact-metrics">
          <div class="dap-metric">
            <span class="dap-metric__value">${esc(String(s.onTimeCompleted || 0))}</span>
            <span class="dap-metric__label">On time</span>
          </div>
          <div class="dap-metric">
            <span class="dap-metric__value">${esc(String(s.currentStreak || 0))}</span>
            <span class="dap-metric__label">Current streak</span>
          </div>
          <div class="dap-metric">
            <span class="dap-metric__value">${esc(String(s.longestStreak || 0))}</span>
            <span class="dap-metric__label">Longest streak</span>
          </div>
          <div class="dap-metric">
            <span class="dap-metric__value">${esc(String(s.categoriesExperienced || 0))}</span>
            <span class="dap-metric__label">Categories</span>
          </div>
        </div>
      </section>

      <p class="dap-section-label">Completed</p>
      <div class="dap-list">
        ${completed.length ? completed.map((item) => `
          <button type="button" class="dap-list-item" data-open-assignment="${esc(item.userDailyAct.date)}">
            <p class="dap-list-item__title">✓ ${esc(item.act?.text || '')}</p>
            <p class="dap-list-item__meta">Completed ${esc(formatLongDate(item.userDailyAct.completedAt || item.userDailyAct.date))}</p>
            ${item.userDailyAct.reflection ? '<span class="dap-list-item__badge">Reflection available</span>' : ''}
          </button>
        `).join('') : '<p class="dap-empty">Your completed acts will appear here — each one a real moment of peace.</p>'}
      </div>

      <p class="dap-section-label">Still Open</p>
      <div class="dap-list">
        ${stillOpen.length ? stillOpen.map((item) => `
          <button type="button" class="dap-list-item" data-open-assignment="${esc(item.userDailyAct.date)}">
            <p class="dap-list-item__title">${esc(item.act?.text || '')}</p>
            <p class="dap-list-item__meta">Your Act of Peace on ${esc(formatLongDate(item.userDailyAct.date))}</p>
          </button>
        `).join('') : '<p class="dap-empty">Nothing waiting right now. Tomorrow will bring a new opportunity.</p>'}
      </div>
    `;
  }

  function renderDetail(item) {
    const uda = item.userDailyAct;
    const act = item.act;
    const completed = !!uda.completed;

    return `
      <div class="dap-detail">
        <button type="button" class="dap-detail__back" id="dap-detail-back">← Back</button>
        <article class="dap-today-card">
          <p class="dap-kicker">${completed ? 'Completed Act' : 'Still Open'}</p>
          <h2 class="dap-act-title">${esc(act.text)}</h2>
          <p class="dap-act-explain">${esc(act.explanation || '')}</p>
          <p class="dap-act-explain" style="margin-top:16px;font-size:0.85rem">
            Assigned ${esc(formatLongDate(uda.date))}
            ${completed ? `<br>Completed ${esc(formatLongDate(uda.completedAt))}` : ''}
            ${completed ? `<br>${uda.completedOnAssignedDay ? 'Completed on the assigned day' : 'Completed later'}` : ''}
          </p>
        </article>

        ${!completed ? `
          <div class="dap-actions">
            ${act.nav?.type ? `
              <button type="button" class="btn btn-primary" id="dap-nav-btn" data-nav-type="${esc(act.nav.type)}" data-nav-cause="${esc(act.nav.cause || '')}" data-assignment-date="${esc(uda.date)}">
                ${esc(act.nav.label || 'Open')}
              </button>
            ` : ''}
            <button type="button" class="btn ${act.nav ? 'btn-secondary' : 'btn-primary'}" id="dap-complete-btn" data-assignment-date="${esc(uda.date)}">
              I COMPLETED THIS ACT
            </button>
          </div>
        ` : `
          ${uda.reflection ? `
            <p class="dap-section-label">Your Reflection</p>
            <blockquote class="dap-quote">${esc(uda.reflection)}</blockquote>
          ` : ''}
        `}
      </div>
    `;
  }

  function renderReflect(item) {
    const prompt = item.act?.reflectionPrompt || 'What would you like to remember about this act?';
    return `
      <div class="dap-complete-moment">
        <p class="dap-complete-moment__eyebrow">Act of Peace Completed</p>
        <p class="dap-complete-moment__heart" aria-hidden="true">🤍</p>
        <p class="dap-complete-moment__copy">Every small action can leave a real impact.</p>
      </div>
      <div class="dap-reflection-box">
        <label for="dap-reflection-input">${esc(prompt)}</label>
        <p class="dap-reflection-hint">Share what you learned, what you did, who you helped, or anything you would like to remember. Optional.</p>
        <textarea id="dap-reflection-input" maxlength="4000" placeholder="Write a few words…"></textarea>
        <div class="dap-actions" style="margin-top:14px">
          <button type="button" class="btn btn-primary" id="dap-save-reflection" data-assignment-date="${esc(item.userDailyAct.date)}">SAVE MY REFLECTION</button>
          <button type="button" class="btn btn-ghost" id="dap-skip-reflection">SKIP FOR NOW</button>
        </div>
      </div>
    `;
  }

  function renderCalendar() {
    if (!calendarData) return '<p class="dap-loading">Loading calendar…</p>';
    const [year, month] = calendarMonth.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const startDow = first.getDay(); // 0 Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const marked = calendarData.days || {};

    const cells = [];
    for (let i = 0; i < startDow; i++) {
      cells.push('<div class="dap-calendar__day is-empty" aria-hidden="true"></div>');
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${calendarMonth}-${String(day).padStart(2, '0')}`;
      const isMarked = !!marked[date];
      cells.push(`
        <button type="button" class="dap-calendar__day ${isMarked ? 'is-marked' : ''}" ${isMarked ? `data-calendar-day="${date}"` : 'disabled'}>
          ${day}${isMarked ? ' ✓' : ''}
        </button>
      `);
    }

    return `
      <div class="dap-detail">
        <button type="button" class="dap-detail__back" id="dap-detail-back">← Back</button>
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
          <p class="dap-empty" style="margin-top:18px">Marked days are when you completed that day’s assigned Act of Peace on the same day.</p>
        </div>
      </div>
    `;
  }

  function renderCalendarDay(item) {
    const uda = item.userDailyAct;
    return `
      <div class="dap-detail">
        <button type="button" class="dap-detail__back" id="dap-cal-day-back">← Calendar</button>
        <article class="dap-today-card">
          <p class="dap-kicker">${esc(formatLongDate(uda.date))}</p>
          <h2 class="dap-act-title">${esc(item.act?.text || '')}</h2>
          <p class="dap-done-note">✓ Completed on this day</p>
          ${uda.reflection ? `
            <p class="dap-section-label" style="text-align:left;margin-top:22px">Your Reflection</p>
            <blockquote class="dap-quote" style="text-align:left">${esc(uda.reflection)}</blockquote>
          ` : ''}
        </article>
      </div>
    `;
  }

  function paint() {
    const el = root();
    if (!el) return;

    if (view.mode === 'reflect' && view.item) {
      el.innerHTML = renderShell(renderReflect(view.item));
      bindCommon();
      bindReflect();
      return;
    }

    if (view.mode === 'detail' && view.item) {
      el.innerHTML = renderShell(renderDetail(view.item));
      bindCommon();
      bindDetail();
      return;
    }

    if (view.mode === 'calendar') {
      el.innerHTML = renderShell(renderCalendar());
      bindCommon();
      bindCalendar();
      return;
    }

    if (view.mode === 'calendar-day' && view.item) {
      el.innerHTML = renderShell(renderCalendarDay(view.item));
      bindCommon();
      document.getElementById('dap-cal-day-back')?.addEventListener('click', () => {
        view = { mode: 'calendar' };
        paint();
      });
      return;
    }

    const inner = tab === 'impact' ? renderImpact() : renderToday();
    el.innerHTML = renderShell(inner);
    bindCommon();
    if (tab === 'today') bindToday();
    else bindImpact();
  }

  function bindCommon() {
    document.querySelectorAll('[data-dap-tab]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = btn.getAttribute('data-dap-tab');
        if (next === tab && view.mode === 'tabs') return;
        tab = next;
        view = { mode: 'tabs' };
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState({}, '', url.pathname + url.search);
        paint();
        try {
          if (tab === 'impact') {
            await loadImpact();
          } else {
            await loadToday();
          }
          paint();
        } catch (err) {
          root().innerHTML = renderShell(`<p class="dap-error">${esc(err.message)}</p>`);
          bindCommon();
        }
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
            assignmentDate: assignmentDate || todayData?.userDailyAct?.date,
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
      view = { mode: 'reflect', item: data };
      if (todayData && todayData.userDailyAct?.date === assignmentDate) {
        todayData = data;
      }
      paint();
    } catch (err) {
      alert(err.message || 'Could not save completion.');
    } finally {
      busy = false;
    }
  }

  function bindToday() {
    document.getElementById('dap-nav-btn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      handleNav(btn.getAttribute('data-nav-type'), btn.getAttribute('data-nav-cause') || '', todayData?.userDailyAct?.date);
    });
    document.getElementById('dap-complete-btn')?.addEventListener('click', () => {
      completeAct(todayData?.userDailyAct?.date);
    });
    document.getElementById('dap-view-completed')?.addEventListener('click', () => {
      view = { mode: 'detail', item: todayData };
      paint();
    });

    // mark viewed (non-blocking)
    if (todayData?.userDailyAct?.date && !todayData.userDailyAct.viewed) {
      apiFetch('/api/daily-peace', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: deviceId(),
          date: localDateString(),
          assignmentDate: todayData.userDailyAct.date,
          action: 'mark-viewed',
        }),
      }).catch(() => {});
    }
  }

  function bindImpact() {
    document.getElementById('dap-open-calendar')?.addEventListener('click', async () => {
      try {
        await loadCalendar(localDateString().slice(0, 7));
        view = { mode: 'calendar' };
        paint();
      } catch (err) {
        alert(err.message || 'Could not load calendar.');
      }
    });
    document.querySelectorAll('[data-open-assignment]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const assignmentDate = btn.getAttribute('data-open-assignment');
        try {
          const item = await apiFetch(
            `/api/daily-peace?deviceId=${encodeURIComponent(deviceId())}&view=assignment&assignmentDate=${encodeURIComponent(assignmentDate)}&date=${encodeURIComponent(localDateString())}`
          );
          view = { mode: 'detail', item };
          paint();
        } catch (err) {
          alert(err.message || 'Could not open act.');
        }
      });
    });
  }

  function bindDetail() {
    document.getElementById('dap-detail-back')?.addEventListener('click', async () => {
      view = { mode: 'tabs' };
      if (tab === 'impact') {
        try { await loadImpact(); } catch { /* keep */ }
      } else {
        try { await loadToday(); } catch { /* keep */ }
      }
      paint();
    });
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
  }

  function bindReflect() {
    document.getElementById('dap-skip-reflection')?.addEventListener('click', async () => {
      view = { mode: 'tabs' };
      tab = 'impact';
      try { await loadImpact(); await loadToday(); } catch { /* keep */ }
      paint();
      if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.refreshBanner?.();
    });
    document.getElementById('dap-save-reflection')?.addEventListener('click', async (e) => {
      if (busy) return;
      busy = true;
      const assignmentDate = e.currentTarget.getAttribute('data-assignment-date');
      const reflection = document.getElementById('dap-reflection-input')?.value || '';
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
        view = { mode: 'tabs' };
        tab = 'impact';
        await loadImpact();
        await loadToday();
        paint();
        if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.refreshBanner?.();
      } catch (err) {
        alert(err.message || 'Could not save reflection.');
      } finally {
        busy = false;
      }
    });
  }

  function bindCalendar() {
    document.getElementById('dap-detail-back')?.addEventListener('click', async () => {
      view = { mode: 'tabs' };
      tab = 'impact';
      try { await loadImpact(); } catch { /* keep */ }
      paint();
    });
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
        view = { mode: 'calendar-day', item };
        paint();
      });
    });
  }

  async function init() {
    WorldChoirNav.startWatcher('daily-acts');
    tab = queryTab();
    root().innerHTML = renderShell('<p class="dap-loading">Loading…</p>');
    bindCommon();

    try {
      await WorldChoirDB.ready();
      if (typeof DailyActsPeace !== 'undefined') DailyActsPeace.start?.();
      if (tab === 'impact') await loadImpact();
      else await loadToday();
      paint();
    } catch (err) {
      root().innerHTML = renderShell(`<p class="dap-error">${esc(err.message || 'Could not load Daily Acts of Peace.')}</p>`);
      bindCommon();
    }
  }

  return { init };
})();
