/**
 * Pass the World — Passport chapter UI.
 */
const PassTheWorld = (() => {
  const EVENT_ID = 'world-choir-2027';
  const POLL_MS = 4000;
  const TRAVEL_POLL_MS = 30000;
  const DEV = !!(typeof location !== 'undefined'
    && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      || /[?&]ptwDev=1(?:&|$)/.test(location.search)));

  const MAP_LIBS = [
    { href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', kind: 'css' },
    { href: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css', kind: 'css' },
    { href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', kind: 'js' },
    { href: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js', kind: 'js' },
    { href: 'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js', kind: 'js' },
    { href: 'js/world-choir-map-tiles.js?v=20260912ptwDark', kind: 'js' },
  ];

  let root = null;
  let pollTimer = null;
  let countdownTimer = null;
  let lastPayload = null;
  let submitting = false;
  let mockNow = null;
  let mounted = false;
  let arrivalRefreshScheduled = false;
  let revealRefreshTimer = null;
  let inviteOpenRefreshTimer = null;
  let itineraryPage = 0;
  let itineraryPanelHome = null;
  let itineraryScrollLockHandler = null;
  let guideDemoActive = false;

  const GUIDE_DEMO_CITY = {
    city: 'Braga',
    country: 'Portugal',
    countryCode: 'PT',
    latitude: 41.5518,
    longitude: -8.4229,
  };

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadAsset(asset) {
    return new Promise((resolve, reject) => {
      if (asset.kind === 'css') {
        if ([...document.styleSheets].some((s) => s.href && s.href.includes(asset.href.split('?')[0].split('/').pop()))) {
          resolve();
          return;
        }
        const existing = document.querySelector(`link[href="${asset.href}"]`);
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => resolve());
          resolve();
          return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = asset.href;
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
        return;
      }
      const srcKey = asset.href.split('?')[0];
      if ([...document.scripts].some((s) => s.src && s.src.includes(srcKey.split('/').pop()))) {
        resolve();
        return;
      }
      const existing = document.querySelector(`script[src="${asset.href}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Failed ${asset.href}`)));
        if (existing.dataset.loaded === '1') resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = asset.href;
      script.async = false;
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed ${asset.href}`));
      document.head.appendChild(script);
    });
  }

  async function ensureMapLibs() {
    for (const asset of MAP_LIBS) {
      // Sequential so maplibre-gl-leaflet sees L + maplibregl
      // eslint-disable-next-line no-await-in-loop
      await loadAsset(asset);
    }
  }

  function placeLabel(loc) {
    if (!loc) return '';
    if (typeof WorldChoirFlags !== 'undefined') {
      return WorldChoirFlags.formatPlace(loc.city, loc.country);
    }
    return [loc.city, loc.country].filter(Boolean).join(', ');
  }

  function toCaps(s) {
    return String(s || '').trim().toUpperCase();
  }

  function renderPlaceBlock(loc) {
    if (!loc) return '';
    const city = toCaps(loc.city);
    const country = toCaps(loc.country);
    if (!city && !country) return '';
    return `
      <div class="ptw-place">
        ${city ? `<p class="ptw-place__city">${esc(city)}</p>` : ''}
        ${country ? `<p class="ptw-place__country">${esc(country)}</p>` : ''}
      </div>`;
  }

  function renderRoute(journey) {
    if (!journey) return '';
    if (journey.status === 'TRAVELLING' && journey.origin && journey.destination) {
      return `
        <div class="ptw-route ptw-route--journey" aria-label="Current journey">
          ${renderPlaceBlock(journey.origin)}
          <span class="ptw-route__plane" aria-hidden="true"></span>
          ${renderPlaceBlock(journey.destination)}
        </div>`;
    }
    return `
      <div class="ptw-route" aria-label="Current city">
        ${renderPlaceBlock(journey.current)}
      </div>`;
  }

  function routeKey(journey) {
    if (!journey) return 'empty';
    const { status, origin, destination, current } = journey;
    if (status === 'TRAVELLING' && origin && destination) {
      return `T|${origin.city}|${origin.country}|${destination.city}|${destination.country}`;
    }
    const c = current || {};
    return `${status}|${c.city}|${c.country}`;
  }

  function statusKey(journey, itinerary) {
    if (!journey) return 'empty';
    const partner = lastPayload?.partnership?.enabled ? '1' : '0';
    if (journey.status === 'TRAVELLING' && journey.destination) {
      return `T|${journey.destination.city}|${journey.destination.country}|${partner}`;
    }
    const v = journey.viewer || {};
    return `${journey.status}|${itinerary?.length || 0}|${v.sameCountry}|${v.countryLoaded}|${journey.nextInvitationAt || ''}|${partner}`;
  }

  function ctaKey(journey) {
    if (!journey) return 'empty';
    const v = journey.viewer || {};
    return `${journey.status}|${v.sameCountry}|${v.countryLoaded}|${v.hasInvited}|${v.canInviteNow}|${v.countryEligible}|${v.missingCoords || false}|${journey.invitationCount || 0}|${journey.nextInvitationAt || ''}|${shouldShowVisitButton(journey)}`;
  }

  function revealKey(journey) {
    const r = journey?.lastReveal;
    if (!r) return 'empty';
    return `${r.city}|${r.country}|${r.revealedAt || r.at || ''}|${r.voiceNumber || ''}`;
  }

  function updateTravellingProgress(journey) {
    const prog = journey.progress || {};
    const total = prog.totalKm ?? prog.distanceKm;
    const travelled = prog.travelledKm;
    const el = root?.querySelector('[data-ptw-progress-km]');
    if (el && total != null) {
      el.textContent = `${formatKm(travelled)} of ${formatKm(total)}`;
    }
  }

  function formatKm(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return `${Math.round(Number(n)).toLocaleString()} km`;
  }

  function formatVoice(n) {
    if (n == null) return '';
    return `Voice #${String(n)}`;
  }

  function formatDayDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      });
    } catch {
      return '';
    }
  }

  function deviceId() {
    try {
      if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getDeviceId) {
        return WorldChoirDB.getDeviceId() || '';
      }
      return localStorage.getItem('wc_anonymous_device_id') || '';
    } catch {
      return '';
    }
  }

  async function fetchState() {
    const id = deviceId();
    const params = new URLSearchParams({ eventId: EVENT_ID });
    if (id) params.set('deviceId', id);
    if (mockNow) params.set('now', mockNow);
    const res = await fetch(`/api/pass-the-world?${params}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Could not load Pass the World.');
    }
    return res.json();
  }

  async function sendInvite() {
    const id = deviceId();
    if (!id) throw new Error('Missing device.');
    const body = { action: 'invite', deviceId: id, eventId: EVENT_ID };
    if (mockNow) body.now = mockNow;
    const res = await fetch('/api/pass-the-world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error || 'Invitation could not be sent.');
      e.code = data.error;
      throw e;
    }
    return data;
  }

  function journeyHeadline(journey) {
    if (!journey) return '';
    if (journey.status === 'TRAVELLING' && journey.origin && journey.destination) {
      return `${placeLabel(journey.origin)} → ${placeLabel(journey.destination)}`;
    }
    return placeLabel(journey.current);
  }

  function statusLines(journey, itinerary) {
    const lines = [];
    if (!journey) return lines;
    const status = journey.status;
    const stops = itinerary?.length || 0;
    const viewer = journey.viewer || {};

    if (status === 'TRAVELLING' && journey.destination) {
      return [];
    }

    if (status === 'INVITATION_OPEN') {
      // CTA owns invitation copy — avoid duplicating under the route.
      return lines;
    }

    if (status === 'REVEAL_PENDING') {
      return lines;
    }

    if (status === 'WAITING_FOR_FIRST_CALL') {
      return lines;
    }

    if (status === 'ARRIVED' || status === 'INITIAL') {
      return lines;
    }

    return lines;
  }

  function formatEstFlightTime(journey) {
    const start = journey?.departureAt ? new Date(journey.departureAt).getTime() : NaN;
    const end = journey?.arrivalAt ? new Date(journey.arrivalAt).getTime() : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const mins = Math.round((end - start) / 60000);
    if (mins < 1) return '< 1m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h <= 0) return `${m}m`;
    if (m <= 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function renderTravellingStatus(journey) {
    if (!journey?.destination) return '';
    const prog = journey.progress || {};
    const total = prog.totalKm ?? prog.distanceKm;
    const travelled = prog.travelledKm;
    const partnerOn = Boolean(lastPayload?.partnership?.enabled);

    if (partnerOn) {
      const nextStop = esc(journey.destination.city || '—');
      const distanceHtml = total != null
        ? `<span class="ptw-stats-row__value" data-ptw-progress-km>${formatKm(travelled)}</span>
           <span class="ptw-stats-row__sub">of ${formatKm(total)}</span>`
        : '<span class="ptw-stats-row__value">—</span>';
      const eta = formatEstFlightTime(journey);
      return `
        <div class="ptw-stats-row" role="group" aria-label="Journey progress">
          <div class="ptw-stats-row__cell">
            <span class="ptw-stats-row__label">Next Stop</span>
            <span class="ptw-stats-row__value">${nextStop}</span>
          </div>
          <div class="ptw-stats-row__cell">
            <span class="ptw-stats-row__label">Distance</span>
            ${distanceHtml}
          </div>
          <div class="ptw-stats-row__cell">
            <span class="ptw-stats-row__label">Est. Flight Time</span>
            <span class="ptw-stats-row__value ptw-stats-row__value--eta">
              ${eta ? esc(eta) : '—'}
              <button type="button" class="ptw-status-info" data-ptw-status-info aria-label="Show arrival and invitation times" aria-expanded="false" aria-controls="ptw-status-modal"><span aria-hidden="true">!</span></button>
            </span>
          </div>
        </div>`;
    }

    let line = `Next Stop: ${esc(journey.destination.city)}`;
    if (total != null) {
      line += ` · <span data-ptw-progress-km>${formatKm(travelled)} of ${formatKm(total)}</span>`;
    }
    return `
      <p class="ptw-status__travel">
        <span class="ptw-status__travel-text">${line}</span>
        <button type="button" class="ptw-status-info" data-ptw-status-info aria-label="Show arrival and invitation times" aria-expanded="false" aria-controls="ptw-status-modal"><span aria-hidden="true">!</span></button>
      </p>`;
  }

  function formatUtcHm(hour, minute) {
    const h = String(Number(hour) || 0).padStart(2, '0');
    const m = String(Number(minute) || 0).padStart(2, '0');
    return `${h}:${m} UTC`;
  }

  function ritualTimeCopy(journey) {
    const c = journey?.constants || {};
    const arrive = formatUtcHm(
      c.arrivalHourUtc ?? 15,
      c.arrivalMinuteUtc ?? 59
    );
    const invite = formatUtcHm(
      c.invitationHourUtc ?? 16,
      c.invitationMinuteUtc ?? 0
    );
    return `Arrives · ${arrive} · Next invitation · ${invite}`;
  }

  function ensureStatusModal() {
    let modal = document.getElementById('ptw-status-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'ptw-status-modal';
    modal.className = 'ptw-status-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <button type="button" class="ptw-status-modal__backdrop" data-ptw-status-backdrop aria-label="Close"></button>
      <div class="ptw-status__detail-box" data-ptw-status-detail role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function renderStatus(journey, itinerary) {
    if (journey?.status === 'TRAVELLING' && journey.destination) {
      return renderTravellingStatus(journey);
    }
    return statusLines(journey, itinerary).map((l) => `<p>${l}</p>`).join('');
  }

  function bindTravellingStatusInfo(body, journey) {
    const btn = body?.querySelector('[data-ptw-status-info]');
    if (!btn) return;

    const modal = ensureStatusModal();
    const backdrop = modal.querySelector('[data-ptw-status-backdrop]');
    const detail = modal.querySelector('[data-ptw-status-detail]');
    if (detail) detail.textContent = ritualTimeCopy(journey);

    const close = () => {
      modal.hidden = true;
      document.querySelectorAll('[data-ptw-status-info]').forEach((el) => {
        el.setAttribute('aria-expanded', 'false');
      });
    };

    if (!modal.dataset.bound) {
      modal.dataset.bound = '1';
      backdrop?.addEventListener('click', close);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (detail) detail.textContent = ritualTimeCopy(journey);
      if (modal.hidden) {
        modal.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      } else {
        close();
      }
    });
  }

  function isVisitButtonActive(journey) {
    return journey?.viewer?.canInviteNow === true;
  }

  function formatNextInvitationNote(journey) {
    const at = journey?.nextInvitationAt;
    if (!at) {
      const c = journey?.constants || {};
      return `Invitations open daily at ${formatUtcHm(c.invitationHourUtc ?? 16, c.invitationMinuteUtc ?? 0)}.`;
    }
    try {
      const d = new Date(at);
      const utc = d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      });
      return `Next invitation opens at ${utc} UTC.`;
    } catch {
      return 'Invitations open daily at 16:00 UTC.';
    }
  }

  function shouldShowVisitButton(journey) {
    if (!journey) return false;
    const viewer = journey.viewer || {};
    const status = journey.status;

    if (status === 'TRAVELLING' || status === 'REVEAL_PENDING') return false;
    if (viewer.sameCountry && viewer.countryLoaded) return false;
    if (!viewer.countryEligible) return false;
    // Active during open / first-call; muted preview while waiting for today's ritual.
    if (status === 'INVITATION_OPEN' || status === 'WAITING_FOR_FIRST_CALL') {
      return isVisitButtonActive(journey) || viewer.hasInvited !== true;
    }
    if (status === 'ARRIVED' || status === 'INITIAL') return true;
    return false;
  }

  function renderVisitButton(journey, { showRing = false } = {}) {
    if (!shouldShowVisitButton(journey)) return '';
    const active = isVisitButtonActive(journey);
    const classes = active
      ? 'ptw-visit-btn ptw-visit-btn--primary'
      : 'ptw-visit-btn ptw-visit-btn--muted';
    return `
      <button type="button" class="${classes}" data-ptw-invite aria-label="Visit my city"${active ? '' : ' disabled'}>
        ${showRing && active ? '<span class="ptw-visit-ring" aria-hidden="true"></span>' : ''}
        <span class="ptw-visit-label">VISIT MY CITY</span>
      </button>`;
  }

  function renderCta(journey) {
    if (!journey) return '';
    const viewer = journey.viewer || {};
    const status = journey.status;
    const active = isVisitButtonActive(journey);
    const showVisit = shouldShowVisitButton(journey);
    const showRing = status === 'INVITATION_OPEN' && showVisit && active;
    const hasInvited = viewer.hasInvited === true;

    let lead = '';
    let note = '';
    if (hasInvited && (status === 'INVITATION_OPEN' || status === 'WAITING_FOR_FIRST_CALL')) {
      lead = 'YOU HAVE COMPLETED YOUR INVITATION';
      note = journey.invitationCount > 1
        ? `${Number(journey.invitationCount).toLocaleString()} invitations so far — waiting for the World to choose.`
        : 'Waiting for the World to choose.';
    } else if (hasInvited && status === 'REVEAL_PENDING') {
      lead = 'YOU HAVE COMPLETED YOUR INVITATION';
      note = 'The World is choosing where to go next.';
    } else if (status === 'INVITATION_OPEN' && active) {
      lead = 'WHERE SHOULD THE WORLD GO NEXT?';
      note = 'Invite it to your city.';
    } else if (status === 'WAITING_FOR_FIRST_CALL' && active) {
      // First invite of the day sends the plane — keep the CTA button-first.
      lead = '';
      note = '';
    } else if (status === 'REVEAL_PENDING') {
      lead = 'THE WORLD IS CHOOSING';
      note = 'Where will the journey go next?';
    } else if (status === 'ARRIVED' || status === 'INITIAL') {
      if (viewer.sameCountry && viewer.countryLoaded) {
        lead = 'THE WORLD HAS ARRIVED';
        note = 'The journey is currently in your country. You can invite when it travels elsewhere.';
      } else if (viewer.missingCoords) {
        lead = 'THE WORLD HAS ARRIVED';
        note = 'We are still locating your city on the map. Open this page again in a moment.';
      } else if (!viewer.countryLoaded) {
        note = 'Loading your World Choir city…';
      } else if (!viewer.countryEligible) {
        lead = 'THE WORLD HAS ARRIVED';
        note = 'Join World Choir with your city to invite the World.';
      } else {
        lead = 'THE WORLD HAS ARRIVED';
        note = formatNextInvitationNote(journey);
      }
    } else if (!viewer.countryLoaded) {
      note = 'Loading your World Choir city…';
    } else if (viewer.missingCoords) {
      note = 'We are still locating your city on the map. Open this page again in a moment.';
    } else if (viewer.sameCountry && viewer.countryLoaded) {
      note = 'The journey is currently in your country. You can invite when it travels elsewhere.';
    } else if (!viewer.countryEligible && viewer.countryLoaded) {
      note = 'Join World Choir with your city to invite the World.';
    }

    const countdownHtml = showRing && active
      ? '<p class="ptw-countdown" data-ptw-countdown aria-live="polite"></p>'
      : '';
    const revealCountdownHtml = status === 'REVEAL_PENDING'
      ? '<p class="ptw-countdown" data-ptw-reveal-countdown aria-live="polite"></p>'
      : '';
    const inviteCountHtml = status === 'INVITATION_OPEN' && journey.invitationCount > 0 && (active || hasInvited)
      ? `<p class="ptw-invite-count" aria-live="polite">${Number(journey.invitationCount).toLocaleString()} invitations</p>`
      : '';

    if (!lead && !note && !showVisit && !revealCountdownHtml) return '';

    return `
      <div class="ptw-cta">
        ${lead ? `<p class="ptw-cta-lead">${lead}</p>` : ''}
        ${note ? `<p class="ptw-cta-note">${note}</p>` : ''}
        ${renderVisitButton(journey, { showRing })}
        ${countdownHtml}
        ${revealCountdownHtml}
        ${inviteCountHtml}
      </div>`;
  }

  function renderReveal(journey) {
    const r = journey?.lastReveal;
    if (!r) return '';
    const at = r.revealedAt || r.at;
    if (at) {
      const age = Date.now() - new Date(at).getTime();
      if (age > 120000) return '';
    }
    const flag = typeof WorldChoirFlags !== 'undefined' ? WorldChoirFlags.flagEmoji(r.country) : '';
    return `
      <div class="ptw-reveal" role="status" aria-live="polite">
        <p class="ptw-reveal-title">${esc(String(r.city || '').toUpperCase())} CALLED THE WORLD</p>
        <p class="ptw-reveal-place">${esc(r.country)}${flag ? ` ${esc(flag)}` : ''}</p>
        <p class="ptw-reveal-voice">${esc(formatVoice(r.voiceNumber))}</p>
        <p class="ptw-reveal-note">The journey continues.</p>
      </div>`;
  }

  function formatItineraryDateParts(iso) {
    if (!iso) return { month: '—', day: '—', year: '—' };
    try {
      const d = new Date(iso);
      const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
      const day = String(d.getUTCDate());
      const year = String(d.getUTCFullYear());
      return { month, day, year };
    } catch {
      return { month: '—', day: '—', year: '—' };
    }
  }

  function renderItineraryFlag(entry) {
    const url = typeof WorldChoirFlags !== 'undefined'
      ? WorldChoirFlags.flagCircleUrl(entry.countryCode || entry.country)
      : null;
    if (!url) {
      return '<span class="ptw-day-flag ptw-day-flag--empty" aria-hidden="true"></span>';
    }
    return `
      <span class="ptw-day-flag" aria-hidden="true">
        <img src="${esc(url)}" alt="" width="38" height="38" loading="lazy" decoding="async">
      </span>`;
  }

  function itineraryPageSize() {
    if (typeof window === 'undefined' || !window.matchMedia) return 7;
    return window.matchMedia('(min-width: 900px)').matches ? 12 : 7;
  }

  /** Newest destinations first (highest day / latest arrival). */
  function sortedItineraryNewestFirst(itinerary) {
    return [...(itinerary || [])].sort((a, b) => {
      const sa = Number(a?.sequence) || 0;
      const sb = Number(b?.sequence) || 0;
      if (sb !== sa) return sb - sa;
      return String(b?.arrivedAt || b?.createdAt || '')
        .localeCompare(String(a?.arrivedAt || a?.createdAt || ''));
    });
  }

  function renderItineraryDay(entry) {
    const date = formatItineraryDateParts(entry.arrivedAt || entry.createdAt);
    const city = toCaps(entry.city);
    const country = toCaps(entry.country);
    const calledHtml = entry.calledByVoiceNumber
      ? `
        <p class="ptw-day-called__label">Called by</p>
        <p class="ptw-day-called__voice">${esc(formatVoice(entry.calledByVoiceNumber))}</p>`
      : `
        <p class="ptw-day-called__label">The journey</p>
        <p class="ptw-day-called__voice">began here</p>`;
    return `
      <article class="ptw-day">
        <span class="ptw-day-badge" aria-label="Day ${esc(entry.sequence)}">${esc(entry.sequence)}</span>
        <div class="ptw-day-date" aria-label="${esc(formatDayDate(entry.arrivedAt || entry.createdAt))}">
          <span class="ptw-day-date__month">${esc(date.month)}</span>
          <span class="ptw-day-date__day">${esc(date.day)}</span>
          <span class="ptw-day-date__year">${esc(date.year)}</span>
        </div>
        <div class="ptw-day-place">
          ${city ? `<p class="ptw-day-city">${esc(city)}</p>` : ''}
          ${country ? `<p class="ptw-day-country">${esc(country)}</p>` : ''}
        </div>
        ${renderItineraryFlag(entry)}
        <div class="ptw-day-called">${calledHtml}</div>
      </article>`;
  }

  function renderItineraryPager(page, totalPages) {
    if (totalPages <= 1) return '';
    const pages = Array.from({ length: totalPages }, (_, i) => {
      const n = i + 1;
      const active = i === page ? ' is-active' : '';
      return `<button type="button" class="ptw-itin-page${active}" data-ptw-itin-page="${i}" aria-label="Page ${n}"${i === page ? ' aria-current="page"' : ''}>${n}</button>`;
    }).join('');
    return `
      <nav class="ptw-itinerary-pager" aria-label="Itinerary pages">
        <button type="button" class="ptw-itin-nav" data-ptw-itin-prev aria-label="Previous page"${page <= 0 ? ' disabled' : ''}>‹</button>
        <div class="ptw-itin-pages">${pages}</div>
        <button type="button" class="ptw-itin-nav" data-ptw-itin-next aria-label="Next page"${page >= totalPages - 1 ? ' disabled' : ''}>›</button>
      </nav>`;
  }

  function renderItinerary(itinerary, page = 0) {
    const sorted = sortedItineraryNewestFirst(itinerary);
    if (!sorted.length) {
      return {
        listHtml: '<p class="ptw-empty">The journey has not begun.</p>',
        pagerHtml: '',
      };
    }
    const size = itineraryPageSize();
    const totalPages = Math.max(1, Math.ceil(sorted.length / size));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    itineraryPage = safePage;
    const slice = sorted.slice(safePage * size, safePage * size + size);
    return {
      listHtml: `
        <div class="ptw-itinerary" data-ptw-itin-list>
          ${slice.map(renderItineraryDay).join('')}
        </div>`,
      pagerHtml: renderItineraryPager(safePage, totalPages),
    };
  }

  function renderStats(stats) {
    if (!stats) return '';
    const people = stats.peopleWhoChangedPath ?? stats.people ?? 0;
    return `
      <div class="ptw-stats-grid">
        <div><span class="ptw-stat-value">${formatKm(stats.totalKm)}</span><span class="ptw-stat-label">Total km travelled</span></div>
        <div><span class="ptw-stat-value">${esc(stats.cities)}</span><span class="ptw-stat-label">Cities</span></div>
        <div><span class="ptw-stat-value">${esc(stats.countries)}</span><span class="ptw-stat-label">Countries</span></div>
        <div><span class="ptw-stat-value">${esc(people)}</span><span class="ptw-stat-label">People who changed its path</span></div>
        <div><span class="ptw-stat-value">${esc(stats.daysSinceBegan)}</span><span class="ptw-stat-label">Days since the journey began</span></div>
      </div>`;
  }

  function renderDevTools() {
    if (!DEV) return '';
    return `
      <details class="ptw-dev">
        <summary>Pass the World · Dev</summary>
        <div class="ptw-dev-row">
          <button type="button" data-ptw-dev="seed">Noon UTC</button>
          <button type="button" data-ptw-dev="invite-open">Open invitation</button>
          <button type="button" data-ptw-dev="invite-mid">Mid window</button>
          <button type="button" data-ptw-dev="after-window">Reveal 16:01:05</button>
          <button type="button" data-ptw-dev="after-reveal">After reveal</button>
          <button type="button" data-ptw-dev="clear-now">Clear mock time</button>
          <button type="button" data-ptw-dev="reset-view">Reset map</button>
        </div>
      </details>`;
  }

  function shellHtml() {
    return `
      <section class="ptw" aria-labelledby="ptw-title" data-ptw-root>
        <div class="ptw-map-wrap">
          <div id="ptw-map" class="ptw-map" role="img" aria-label="World map showing the Pass the World journey"></div>
        </div>

        <header class="ptw-header">
          <h1 id="ptw-title" class="ptw-title">Pass the World</h1>
        </header>

        <div class="ptw-body" data-ptw-body>
          <div class="ptw-skeleton" aria-hidden="true">
            <div class="ptw-skel-line"></div>
            <div class="ptw-skel-line ptw-skel-line--short"></div>
          </div>
        </div>

        <div class="ptw-actions">
          <button type="button" class="ptw-link-btn" data-ptw-itinerary>Itinerary</button>
        </div>

        ${renderDevTools()}

        <div class="ptw-panel" data-ptw-panel hidden>
          <div class="ptw-panel-inner">
            <button type="button" class="ptw-panel-close" data-ptw-close aria-label="Close">←</button>
            <div data-ptw-panel-content></div>
          </div>
        </div>
      </section>`;
  }

  function clearPartnershipUi() {
    const story = document.getElementById('passport-story-view');
    const card = story?.querySelector('.passport-card--ptw');
    story?.classList.remove('is-ptw-partner');
    card?.classList.remove('is-ptw-partner');
    root?.classList.remove('is-ptw-partner');

    const subtitle = document.querySelector('#passport-story-view [data-ptw-partner-subtitle]');
    const tabWrap = document.querySelector('#passport-story-view [data-ptw-partner-tab]');
    const tabImg = document.querySelector('#passport-story-view [data-ptw-partner-tab-img]');
    const infoBtn = document.querySelector('#passport-story-view [data-ptw-partner-info]');

    if (subtitle) {
      subtitle.hidden = true;
      subtitle.textContent = '';
    }
    if (tabWrap) tabWrap.hidden = true;
    if (tabImg) {
      tabImg.removeAttribute('src');
      tabImg.alt = '';
      tabImg.onload = null;
      tabImg.onerror = null;
    }
    if (infoBtn) {
      infoBtn.hidden = false;
      infoBtn.removeAttribute('aria-hidden');
      infoBtn.tabIndex = 0;
    }

    root?.querySelector('[data-ptw-partner-map]')?.remove();
    root?.querySelector('[data-ptw-partner-link]')?.remove();
  }

  function ensureMapLogoEl() {
    const wrap = root?.querySelector('.ptw-map-wrap');
    if (!wrap) return null;
    let el = wrap.querySelector('[data-ptw-partner-map]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ptw-partner-map-logo';
      el.setAttribute('data-ptw-partner-map', '');
      el.setAttribute('aria-hidden', 'true');
      wrap.appendChild(el);
    }
    return el;
  }

  function ensureLinkImageEl() {
    if (!root) return null;
    let el = root.querySelector('[data-ptw-partner-link]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ptw-partner-link';
      el.setAttribute('data-ptw-partner-link', '');
      const actions = root.querySelector('.ptw-actions');
      if (actions) actions.insertAdjacentElement('beforebegin', el);
      else root.appendChild(el);
    }
    return el;
  }

  function bindSafeImage(img, url, onFail) {
    if (!img) return;
    img.onload = null;
    img.onerror = () => {
      img.removeAttribute('src');
      img.alt = '';
      if (typeof onFail === 'function') onFail();
    };
    img.src = url;
  }

  function isSafeHttpUrl(url) {
    try {
      const u = new URL(String(url || ''), window.location.origin);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function paintPartnership(payload) {
    const p = payload?.partnership;
    const enabled = Boolean(p?.enabled);

    if (!enabled) {
      clearPartnershipUi();
      return;
    }

    const story = document.getElementById('passport-story-view');
    const card = story?.querySelector('.passport-card--ptw');
    story?.classList.add('is-ptw-partner');
    card?.classList.add('is-ptw-partner');
    root?.classList.add('is-ptw-partner');

    const subtitle = document.querySelector('#passport-story-view [data-ptw-partner-subtitle]');
    const tabWrap = document.querySelector('#passport-story-view [data-ptw-partner-tab]');
    const tabImg = document.querySelector('#passport-story-view [data-ptw-partner-tab-img]');
    const infoBtn = document.querySelector('#passport-story-view [data-ptw-partner-info]');

    // Reference Image 2: Tab Logo owns top-right. Keep info control accessible but not visible.
    if (infoBtn) {
      infoBtn.hidden = true;
      infoBtn.setAttribute('aria-hidden', 'true');
      infoBtn.tabIndex = -1;
    }

    if (subtitle) {
      const text = String(p.subtitle || '').trim();
      if (text) {
        subtitle.textContent = text;
        subtitle.hidden = false;
      } else {
        subtitle.textContent = '';
        subtitle.hidden = true;
      }
    }

    if (tabWrap && tabImg) {
      if (p.tabLogoUrl) {
        tabWrap.hidden = false;
        tabImg.alt = '';
        bindSafeImage(tabImg, p.tabLogoUrl, () => { tabWrap.hidden = true; });
      } else {
        tabWrap.hidden = true;
        tabImg.removeAttribute('src');
      }
    }

    const mapLogo = ensureMapLogoEl();
    if (mapLogo) {
      if (p.mapLogoUrl) {
        mapLogo.hidden = false;
        mapLogo.innerHTML = '<img alt="" decoding="async">';
        const img = mapLogo.querySelector('img');
        bindSafeImage(img, p.mapLogoUrl, () => {
          mapLogo.innerHTML = '';
          mapLogo.hidden = true;
          mapLogo.remove();
        });
      } else {
        mapLogo.innerHTML = '';
        mapLogo.hidden = true;
        mapLogo.remove();
      }
    }

    const linkUrl = p.linkUrl || p.linkHref || null;
    if (p.linkImageUrl) {
      const linkWrap = ensureLinkImageEl();
      if (linkWrap) {
        linkWrap.hidden = false;
        const safeUrl = isSafeHttpUrl(linkUrl) ? String(linkUrl) : null;
        const label = String(p.subtitle || 'Partnership').trim() || 'Partnership';
        if (safeUrl) {
          linkWrap.innerHTML = `
            <a class="ptw-partner-link__anchor" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}">
              <img alt="" decoding="async">
            </a>`;
        } else {
          linkWrap.innerHTML = '<img alt="" decoding="async">';
        }
        const img = linkWrap.querySelector('img');
        bindSafeImage(img, p.linkImageUrl, () => {
          linkWrap.innerHTML = '';
          linkWrap.hidden = true;
          linkWrap.remove();
        });
      }
    } else {
      root?.querySelector('[data-ptw-partner-link]')?.remove();
    }

    // Card height changes when partnership chrome mounts — keep map framed.
    requestAnimationFrame(() => {
      if (typeof PassTheWorldMap !== 'undefined') {
        PassTheWorldMap.invalidateSize?.();
      }
    });
  }

  function paintBody(payload) {
    const body = root?.querySelector('[data-ptw-body]');
    if (!body || !payload) return;
    const journey = payload.journey || {};

    paintPartnership(payload);

    let routeSlot = body.querySelector('[data-ptw-route-slot]');
    if (!routeSlot) {
      body.innerHTML = `
        <div data-ptw-route-slot></div>
        <div data-ptw-status-slot></div>
        <div data-ptw-reveal-slot></div>
        <div data-ptw-cta-slot></div>`;
      routeSlot = body.querySelector('[data-ptw-route-slot]');
    }

    const statusSlot = body.querySelector('[data-ptw-status-slot]');
    const revealSlot = body.querySelector('[data-ptw-reveal-slot]');
    const ctaSlot = body.querySelector('[data-ptw-cta-slot]');

    const rk = routeKey(journey);
    if (routeSlot.dataset.key !== rk) {
      routeSlot.innerHTML = renderRoute(journey);
      routeSlot.dataset.key = rk;
    }

    const sk = statusKey(journey, payload.itinerary);
    if (statusSlot.dataset.key !== sk) {
      statusSlot.innerHTML = `<div class="ptw-status">${renderStatus(journey, payload.itinerary)}</div>`;
      statusSlot.dataset.key = sk;
      bindTravellingStatusInfo(statusSlot, journey);
    } else if (journey.status === 'TRAVELLING') {
      updateTravellingProgress(journey);
    }

    const revk = revealKey(journey);
    const revealHtml = renderReveal(journey);
    if (revealSlot.dataset.key !== revk) {
      revealSlot.innerHTML = revealHtml;
      revealSlot.dataset.key = revk;
    }

    const ck = ctaKey(journey);
    if (ctaSlot.dataset.key !== ck) {
      ctaSlot.innerHTML = renderCta(journey);
      ctaSlot.dataset.key = ck;
      ctaSlot.querySelector('[data-ptw-invite]')?.addEventListener('click', onInvite);
    }

    updateCountdown(journey);
    scheduleRevealRefresh(journey);
    scheduleInviteOpenRefresh(journey);
  }

  function scheduleInviteOpenRefresh(journey) {
    if (inviteOpenRefreshTimer) {
      clearTimeout(inviteOpenRefreshTimer);
      inviteOpenRefreshTimer = null;
    }
    if (journey?.status !== 'ARRIVED' && journey?.status !== 'INITIAL') return;
    if (!journey.nextInvitationAt) return;
    const serverSkew = journey.serverNow
      ? Date.now() - new Date(journey.serverNow).getTime()
      : 0;
    const openMs = new Date(journey.nextInvitationAt).getTime();
    const delay = openMs - (Date.now() - serverSkew) + 120;
    if (delay > 0 && delay < 6 * 60 * 60 * 1000) {
      inviteOpenRefreshTimer = setTimeout(async () => {
        inviteOpenRefreshTimer = null;
        try { await refresh(); } catch { /* keep */ }
      }, delay);
    }
  }

  function scheduleRevealRefresh(journey) {
    if (revealRefreshTimer) {
      clearTimeout(revealRefreshTimer);
      revealRefreshTimer = null;
    }
    if (journey?.status !== 'REVEAL_PENDING' || !journey.revealEndAt) return;
    const serverSkew = journey.serverNow
      ? Date.now() - new Date(journey.serverNow).getTime()
      : 0;
    const endMs = new Date(journey.revealEndAt).getTime();
    const delay = endMs - (Date.now() - serverSkew) + 80;
    if (delay > 0 && delay < 20000) {
      revealRefreshTimer = setTimeout(async () => {
        revealRefreshTimer = null;
        try { await refresh(); } catch { /* keep */ }
      }, delay);
    }
  }

  function updateCountdown(journey) {
    clearInterval(countdownTimer);
    countdownTimer = null;

    const serverSkew = (() => {
      if (!journey?.serverNow) return 0;
      return Date.now() - new Date(journey.serverNow).getTime();
    })();

    const el = root?.querySelector('[data-ptw-countdown]');
    const ring = root?.querySelector('.ptw-visit-ring');
    if (journey?.status === 'INVITATION_OPEN' && el && journey.invitationCloseAt) {
      const closeAt = new Date(journey.invitationCloseAt).getTime();
      const windowMs = journey.constants?.invitationWindowMs || 120000;
      const openAt = new Date(journey.invitationOpenAt || closeAt - windowMs).getTime();
      const tick = () => {
        const now = mockNow
          ? new Date(mockNow).getTime()
          : Date.now() - serverSkew;
        const left = Math.max(0, Math.ceil((closeAt - now) / 1000));
        el.textContent = left > 0 ? `Invitations close in ${left}s` : 'Invitations closing…';
        const total = Math.max(1, closeAt - openAt);
        const progress = Math.min(1, Math.max(0, (now - openAt) / total));
        if (ring) ring.style.setProperty('--ptw-progress', String(progress));
        if (left <= 0) clearInterval(countdownTimer);
      };
      tick();
      countdownTimer = setInterval(tick, 250);
    } else if (ring) {
      ring.style.setProperty('--ptw-progress', '0');
    }

    const revealEl = root?.querySelector('[data-ptw-reveal-countdown]');
    if (journey?.status === 'REVEAL_PENDING' && revealEl && journey.revealEndAt) {
      const revealEnd = new Date(journey.revealEndAt).getTime();
      const revealTick = () => {
        const now = mockNow
          ? new Date(mockNow).getTime()
          : Date.now() - serverSkew;
        const left = Math.max(0, Math.ceil((revealEnd - now) / 1000));
        revealEl.textContent = left > 0 ? `Revealing in ${left}s` : 'The journey continues…';
        if (left <= 0) clearInterval(countdownTimer);
      };
      revealTick();
      countdownTimer = setInterval(revealTick, 250);
    }
  }

  async function onInvite() {
    if (guideDemoActive) return;
    if (submitting) return;
    submitting = true;
    const btn = root?.querySelector('[data-ptw-invite]');
    if (btn) btn.disabled = true;
    try {
      let result;
      try {
        result = await sendInvite();
      } catch (firstErr) {
        // If the client was still on ARRIVED after the empty window, refresh and retry once.
        if (/Invitations are not open/i.test(String(firstErr.message || ''))) {
          await refresh();
          const status = lastPayload?.journey?.status;
          if (status === 'WAITING_FOR_FIRST_CALL' || status === 'INVITATION_OPEN') {
            result = await sendInvite();
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }
      lastPayload = {
        ...lastPayload,
        journey: result.journey || lastPayload?.journey,
        itinerary: result.itinerary || lastPayload?.itinerary,
        stats: result.stats || lastPayload?.stats,
      };
      paintBody(lastPayload);
      if (typeof PassTheWorldMap !== 'undefined') {
        PassTheWorldMap.renderJourney(lastPayload);
      }
      if (result.alreadyMoving && result.journey?.status !== 'TRAVELLING') {
        const note = document.createElement('p');
        note.className = 'ptw-inline-note';
        note.setAttribute('role', 'status');
        note.textContent = 'The World is already moving.';
        root?.querySelector('[data-ptw-body]')?.prepend(note);
      }
    } catch (err) {
      const msg = String(err.message || '');
      if (/already moving|already chosen|Invitations are not/i.test(msg)) {
        try { await refresh(); } catch { /* keep */ }
        paintBody(lastPayload);
        if (typeof PassTheWorldMap !== 'undefined' && lastPayload) {
          PassTheWorldMap.renderJourney(lastPayload);
        }
        const note = document.createElement('p');
        note.className = 'ptw-inline-note';
        note.setAttribute('role', 'status');
        note.textContent = /already/i.test(msg) ? 'The World is already moving.' : msg;
        root?.querySelector('[data-ptw-body]')?.prepend(note);
      } else {
        paintBody(lastPayload);
        const body = root?.querySelector('[data-ptw-body]');
        if (body) {
          const retry = document.createElement('div');
          retry.className = 'ptw-cta';
          retry.innerHTML = `
            <p class="ptw-cta-note">${esc(msg || 'The invitation could not be sent.')}</p>
            <button type="button" class="ptw-visit-btn ptw-visit-btn--primary" data-ptw-invite aria-label="Try again">TRY AGAIN</button>`;
          body.querySelector('.ptw-cta')?.replaceWith(retry);
          retry.querySelector('[data-ptw-invite]')?.addEventListener('click', onInvite);
        }
      }
    } finally {
      submitting = false;
    }
  }

  function getItineraryPanel() {
    return document.querySelector('[data-ptw-panel]')
      || root?.querySelector('[data-ptw-panel]')
      || null;
  }

  function lockBackgroundScroll(lock) {
    document.documentElement.classList.toggle('ptw-itinerary-open', !!lock);
    document.body.classList.toggle('ptw-itinerary-open', !!lock);
    if (lock) {
      if (!itineraryScrollLockHandler) {
        itineraryScrollLockHandler = (event) => {
          const panel = getItineraryPanel();
          if (!panel || panel.hidden) return;
          const scrollEl = panel.querySelector('[data-ptw-itin-scroll]');
          if (scrollEl && (scrollEl === event.target || scrollEl.contains(event.target))) {
            // Allow scrolling only when the list actually overflows.
            if (scrollEl.scrollHeight > scrollEl.clientHeight + 1) return;
          }
          event.preventDefault();
        };
        document.addEventListener('touchmove', itineraryScrollLockHandler, { passive: false });
      }
    } else if (itineraryScrollLockHandler) {
      document.removeEventListener('touchmove', itineraryScrollLockHandler);
      itineraryScrollLockHandler = null;
    }
  }

  function setItineraryOpen(open) {
    const card = document.querySelector('.passport-card--ptw');
    if (card) card.classList.toggle('is-itinerary-open', !!open);
    lockBackgroundScroll(!!open);
  }

  function bindItineraryPager(content) {
    if (!content) return;
    const go = (page) => {
      itineraryPage = page;
      paintItineraryPanel();
    };
    content.querySelector('[data-ptw-itin-prev]')?.addEventListener('click', () => {
      go(Math.max(0, itineraryPage - 1));
    });
    content.querySelector('[data-ptw-itin-next]')?.addEventListener('click', () => {
      go(itineraryPage + 1);
    });
    content.querySelectorAll('[data-ptw-itin-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = Number(btn.getAttribute('data-ptw-itin-page'));
        if (Number.isFinite(page)) go(page);
      });
    });
  }

  function paintItineraryPanel() {
    const panel = getItineraryPanel();
    const content = panel?.querySelector('[data-ptw-panel-content]');
    if (!panel || !content || !lastPayload || panel.hidden) return;
    const { listHtml, pagerHtml } = renderItinerary(lastPayload.itinerary, itineraryPage);
    content.innerHTML = `
      <h2 class="ptw-panel-title">THE JOURNEY</h2>
      <div class="ptw-itinerary-scroll" data-ptw-itin-scroll>
        ${listHtml}
      </div>
      ${pagerHtml}`;
    bindItineraryPager(content);
    const scrollEl = content.querySelector('[data-ptw-itin-scroll]');
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function openPanel(mode) {
    if (guideDemoActive) return;
    const panel = root?.querySelector('[data-ptw-panel]') || getItineraryPanel();
    const content = panel?.querySelector('[data-ptw-panel-content]');
    if (!panel || !content || !lastPayload) return;
    if (mode === 'itinerary') {
      itineraryPage = 0;
      // Host on body so the card's overflow cannot clip / steal scroll.
      if (panel.parentElement !== document.body) {
        itineraryPanelHome = panel.parentElement;
        document.body.appendChild(panel);
      }
      panel.hidden = false;
      panel.setAttribute('aria-hidden', 'false');
      setItineraryOpen(true);
      paintItineraryPanel();
    }
  }

  function closePanel() {
    const panel = getItineraryPanel();
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    setItineraryOpen(false);
    if (itineraryPanelHome && panel.parentElement === document.body) {
      itineraryPanelHome.appendChild(panel);
    }
    itineraryPanelHome = null;
    itineraryPage = 0;
  }

  async function refresh() {
    if (guideDemoActive) return lastPayload;
    const data = await fetchState();
    lastPayload = data;
    paintBody(data);
    paintItineraryPanel();
    if (typeof PassTheWorldMap !== 'undefined') {
      PassTheWorldMap.renderJourney(data);
    }
    if (typeof PassportPage !== 'undefined' && PassportPage.updateJourneyStats) {
      PassportPage.updateJourneyStats(data.stats);
    }
    return data;
  }

  /** Local presentation only — Braga / no destination / Visit my City visible. */
  function buildGuideDemoPayload(real) {
    const base = real && typeof real === 'object' ? real : {};
    const journey = base.journey && typeof base.journey === 'object' ? base.journey : {};
    return {
      ...base,
      journey: {
        ...journey,
        status: 'WAITING_FOR_FIRST_CALL',
        current: { ...GUIDE_DEMO_CITY },
        origin: null,
        destination: null,
        progress: null,
        invitationCount: 0,
        lastReveal: null,
        revealEndAt: null,
        invitationWindow: null,
        viewer: {
          countryLoaded: true,
          countryEligible: true,
          canInviteNow: true,
          sameCountry: false,
          hasInvited: false,
        },
      },
      // Keep real cumulative stats / itinerary for educational Step 3.
      stats: base.stats || journey.stats || null,
      itinerary: Array.isArray(base.itinerary) ? base.itinerary : [],
    };
  }

  function enterGuideDemo() {
    if (!mounted || !lastPayload) return false;
    if (guideDemoActive) return true;
    guideDemoActive = true;
    stopPolling();
    closePanel();
    const demo = buildGuideDemoPayload(lastPayload);
    paintBody(demo);
    if (typeof PassTheWorldMap !== 'undefined') {
      PassTheWorldMap.renderJourney(demo);
      requestAnimationFrame(() => {
        PassTheWorldMap.invalidateSize?.();
        PassTheWorldMap.frameOnPlane?.({ animate: false, force: true });
      });
    }
    return true;
  }

  function exitGuideDemo() {
    if (!guideDemoActive) return;
    guideDemoActive = false;
    closePanel();
    if (lastPayload) {
      paintBody(lastPayload);
      paintItineraryPanel();
      if (typeof PassTheWorldMap !== 'undefined') {
        PassTheWorldMap.renderJourney(lastPayload);
        requestAnimationFrame(() => {
          PassTheWorldMap.invalidateSize?.();
          PassTheWorldMap.frameOnPlane?.({ animate: false, force: true });
        });
      }
      if (typeof PassportPage !== 'undefined' && PassportPage.updateJourneyStats) {
        PassportPage.updateJourneyStats(lastPayload.stats);
      }
    }
    if (mounted) startPolling();
  }

  function isGuideDemo() {
    return guideDemoActive;
  }

  function bindLiveProgress() {
    if (typeof PassTheWorldMap === 'undefined' || !PassTheWorldMap.setOnProgress) return;
    PassTheWorldMap.setOnProgress(({ progress }) => {
      const journey = lastPayload?.journey;
      if (!journey || journey.status !== 'TRAVELLING') return;
      const total = Number(journey.progress?.totalKm) || 0;
      const travelled = Math.round(total * progress);
      const el = root?.querySelector('[data-ptw-progress-km]');
      if (el && total > 0) {
        if (el.classList.contains('ptw-stats-row__value')) {
          el.textContent = formatKm(travelled);
          const sub = el.parentElement?.querySelector('.ptw-stats-row__sub');
          if (sub) sub.textContent = `of ${formatKm(total)}`;
        } else {
          el.textContent = `${formatKm(travelled)} of ${formatKm(total)}`;
        }
      }
      if (typeof PassportPage !== 'undefined' && PassportPage.updateJourneyStatsKm) {
        const liveTotal = PassportPage.liveJourneyTotalKm
          ? PassportPage.liveJourneyTotalKm(lastPayload, travelled)
          : (Number(lastPayload?.stats?.totalKm) || 0);
        PassportPage.updateJourneyStatsKm(liveTotal);
      }
      if (progress >= 1 && !arrivalRefreshScheduled) {
        arrivalRefreshScheduled = true;
        setTimeout(async () => {
          arrivalRefreshScheduled = false;
          try { await refresh(); } catch { /* keep */ }
        }, 800);
      }
    });
  }

  function startPolling() {
    stopPolling();
    const tick = async () => {
      try { await refresh(); } catch { /* keep last */ }
      const journey = lastPayload?.journey;
      const status = journey?.status;
      let ms = POLL_MS;
      if (status === 'INVITATION_OPEN' || status === 'WAITING_FOR_FIRST_CALL') ms = 2000;
      else if (status === 'REVEAL_PENDING') ms = 800;
      else if (status === 'TRAVELLING') ms = TRAVEL_POLL_MS;
      else if ((status === 'ARRIVED' || status === 'INITIAL') && journey?.nextInvitationAt) {
        const serverSkew = journey.serverNow
          ? Date.now() - new Date(journey.serverNow).getTime()
          : 0;
        const untilOpen = new Date(journey.nextInvitationAt).getTime() - (Date.now() - serverSkew);
        if (untilOpen > 0 && untilOpen < 90 * 1000) ms = 1500;
      }
      pollTimer = setTimeout(tick, ms);
    };
    pollTimer = setTimeout(tick, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    if (revealRefreshTimer) clearTimeout(revealRefreshTimer);
    revealRefreshTimer = null;
    if (inviteOpenRefreshTimer) clearTimeout(inviteOpenRefreshTimer);
    inviteOpenRefreshTimer = null;
  }

  function bindDev() {
    if (!DEV || !root) return;
    root.querySelectorAll('[data-ptw-dev]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const kind = btn.getAttribute('data-ptw-dev');
        const d = new Date();
        if (kind === 'clear-now') mockNow = null;
        else if (kind === 'reset-view') {
          PassTheWorldMap.resetWorldView();
          return;
        } else if (kind === 'seed') {
          mockNow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)).toISOString();
        } else if (kind === 'invite-open') {
          mockNow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16, 0, 5)).toISOString();
        } else if (kind === 'invite-mid') {
          mockNow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16, 0, 30)).toISOString();
        } else if (kind === 'after-window') {
          mockNow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16, 1, 5)).toISOString();
        } else if (kind === 'after-reveal') {
          mockNow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 16, 1, 12)).toISOString();
        }
        try { await refresh(); } catch (e) { console.warn(e); }
      });
    });
  }

  async function mount(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    destroy();
    root = el;
    mounted = true;
    lastPayload = null;
    mockNow = null;
    root.innerHTML = shellHtml();
    root.classList.add('ptw-root');

    const routePlanePreload = new Image();
    routePlanePreload.src = 'images/passport/ptw-route-plane.png';

    root.querySelector('[data-ptw-itinerary]')?.addEventListener('click', () => openPanel('itinerary'));
    root.querySelector('[data-ptw-close]')?.addEventListener('click', closePanel);
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(min-width: 900px)').addEventListener('change', () => {
        if (!getItineraryPanel()?.hidden) paintItineraryPanel();
      });
    }
    bindDev();

    try {
      if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.ready) {
        await WorldChoirDB.ready();
      }
      await ensureMapLibs();
      await PassTheWorldMap.mount('ptw-map');
      bindLiveProgress();
      await refresh();
      startPolling();
      if (typeof PassTheWorldWalkthrough !== 'undefined') {
        PassTheWorldWalkthrough.onPageReady?.();
      }
    } catch (err) {
      const body = root.querySelector('[data-ptw-body]');
      if (body) {
        body.innerHTML = `
          <p class="ptw-route">Pass the World</p>
          <p class="ptw-cta-note">${esc(err.message || 'The journey could not be loaded.')}</p>
          <button type="button" class="ptw-visit-btn ptw-visit-btn--primary" data-ptw-retry>TRY AGAIN</button>`;
        body.querySelector('[data-ptw-retry]')?.addEventListener('click', () => mount(container));
      }
    }

    requestAnimationFrame(() => {
      PassTheWorldMap.invalidateSize();
      PassTheWorldMap.frameOnPlane({ animate: false });
    });
    setTimeout(() => {
      PassTheWorldMap.invalidateSize();
      PassTheWorldMap.frameOnPlane({ animate: false });
    }, 200);
  }

  function destroy() {
    guideDemoActive = false;
    stopPolling();
    closePanel();
    if (typeof PassTheWorldMap !== 'undefined') PassTheWorldMap.destroy();
    clearPartnershipUi();
    if (root) {
      root.innerHTML = '';
      root.classList.remove('ptw-root');
    }
    lastPayload = null;
    submitting = false;
    mounted = false;
    root = null;
    itineraryPage = 0;
    itineraryPanelHome = null;
  }

  function isMounted() {
    return mounted;
  }

  function getStats() {
    return lastPayload?.stats || null;
  }

  return {
    mount,
    destroy,
    refresh,
    isMounted,
    getStats,
    enterGuideDemo,
    exitGuideDemo,
    isGuideDemo,
  };
})();
