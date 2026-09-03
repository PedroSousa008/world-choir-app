/**
 * WorldChoirMemory — post-event Memory tab (“The World Sang”).
 * Visual DNA matches Donate. Top carousel is a live 3-slot Memory photo stream.
 */
const WorldChoirMemory = (() => {
  const REDUCED_MOTION = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TRANSITION_MS = REDUCED_MOTION ? 0 : 280;

  let composerOpen = false;
  let composerPreviewUrl = null;
  let composerFile = null;
  let composerDataUrl = null;
  let bound = false;
  let feedUnsub = null;
  let posting = false;
  let composerScrollLockHandler = null;
  let composerScrollY = 0;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function formatCount(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('en-US');
  }

  function searchIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="11" cy="11" r="7"/>
        <path d="M20 20l-3.5-3.5" stroke-linecap="round"/>
      </svg>
    `;
  }

  function iconSvg(name) {
    const common = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    const icons = {
      calendar: `<svg viewBox="0 0 24 24" ${common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
      globe: `<svg viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
      voices: `<svg viewBox="0 0 24 24" ${common}><path d="M9 18V5l12-2v13"/><circle cx="7" cy="18" r="2.5"/><circle cx="19" cy="16" r="2.5"/></svg>`,
      countries: `<svg viewBox="0 0 24 24" ${common}><path d="M4 20V6l7-2 9 3v13"/><path d="M11 4v16M4 10h7M11 13h9"/></svg>`,
      promises: `<svg viewBox="0 0 24 24" ${common}><path d="M12 21s-7-4.5-7-10a7 7 0 0 1 14 0c0 5.5-7 10-7 10z"/></svg>`,
      world: `<svg viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="9"/><path d="M2 12h20"/></svg>`,
      heart: `<svg viewBox="0 0 24 24" ${common}><path d="M12 21s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 19 11c0 5.5-7 10-7 10z"/></svg>`,
      music: `<svg viewBox="0 0 24 24" ${common}><path d="M9 18V5l12-2v13"/><circle cx="7" cy="18" r="2.5"/><circle cx="19" cy="16" r="2.5"/></svg>`,
      peace: `<svg viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 12l6.5 6.5M12 12 5.5 18.5"/></svg>`,
      sprout: `<svg viewBox="0 0 24 24" ${common}><path d="M12 22V11"/><path d="M12 11c0-4 3-7 7-7-1 4-4 7-7 7z"/><path d="M12 14c0-3-2.5-6-6-6 1 3 3 6 6 6z"/></svg>`,
      people: `<svg viewBox="0 0 24 24" ${common}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M14 19c.4-2 2-3.5 4.5-3.5 1.8 0 3.2.8 3.5 2.5"/></svg>`,
      camera: `<svg viewBox="0 0 24 24" ${common}><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
      image: `<svg viewBox="0 0 24 24" ${common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/></svg>`,
      share: `<svg viewBox="0 0 24 24" ${common}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.5 13.5 7 4M15.5 6.5l-7 4"/></svg>`,
      plus: `<svg viewBox="0 0 24 24" ${common}><path d="M12 5v14M5 12h14"/></svg>`,
      lock: `<svg viewBox="0 0 24 24" ${common}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
    };
    return icons[name] || icons.globe;
  }

  function photoAlt(photo) {
    if (!photo) return 'World Choir memory';
    if (photo.caption) return photo.caption;
    const place = [photo.city, photo.country].filter(Boolean).join(', ');
    return place
      ? `World Choir memory shared from ${place}`
      : 'World Choir memory';
  }

  function renderTopbar() {
    return `
      <div class="df-topbar mem-topbar">
        <a class="df-topbar__logo" href="index.html" aria-label="World Choir home">
          <img
            src="images/world-choir-logo-donate.png?v=20260813v"
            alt="World Choir"
            width="105"
            height="35"
            decoding="async"
          >
        </a>
        <button type="button" class="df-search-trigger" id="mem-search-open" aria-label="Search memories">
          ${searchIconSvg()}
        </button>
      </div>
    `;
  }

  function renderIntro() {
    return `
      <header class="mem-intro">
        <h1 class="df-intro__title mem-intro__title">The World Sang</h1>
        <p class="mem-intro__kicker">Our memories. Our promise.</p>
      </header>
    `;
  }

  function renderSlotPhoto(photo, slot) {
    if (!photo) {
      return `<div class="mem-carousel__slot mem-carousel__slot--${slot} mem-carousel__slot--empty" aria-hidden="true"></div>`;
    }
    return `
      <div class="mem-carousel__slot mem-carousel__slot--${slot}${slot === 'center' ? ' is-active' : ''}" data-slot="${slot}">
        <img
          class="mem-carousel__img"
          src="${esc(photo.thumbnailUrl || photo.imageUrl)}"
          alt="${esc(photoAlt(photo))}"
          decoding="async"
          draggable="false"
        >
      </div>
    `;
  }

  function renderWaitingCard(reconnect) {
    const title = reconnect ? 'Trying to reconnect…' : 'Waiting for new photos…';
    const sub = reconnect
      ? 'We’ll keep your place in the stream.'
      : 'Memories from around the world will appear here as they’re shared.';
    return `
      <div class="mem-carousel__slot mem-carousel__slot--right mem-carousel__slot--waiting" data-slot="right" aria-live="polite">
        <div class="mem-carousel__waiting">
          <p class="mem-carousel__waiting-title">${esc(title)}</p>
          <p class="mem-carousel__waiting-sub">${esc(sub)}</p>
        </div>
      </div>
    `;
  }

  function renderCarouselShell() {
    return `
      <section class="mem-carousel" id="mem-carousel" aria-roledescription="carousel" aria-label="Community photo memories">
        <div class="mem-carousel__viewport" id="mem-carousel-viewport" tabindex="0">
          <div class="mem-carousel__stage" id="mem-carousel-stage">
            <div class="mem-carousel__slot mem-carousel__slot--center mem-carousel__slot--loading is-active">
              <div class="mem-carousel__waiting">
                <p class="mem-carousel__waiting-title">Loading memories…</p>
              </div>
            </div>
          </div>
        </div>
        <div class="mem-carousel__meta" id="mem-carousel-meta" hidden></div>
        <div class="mem-carousel__dots" role="presentation" aria-hidden="true">
          <span class="mem-carousel__dot" data-pos="left"></span>
          <span class="mem-carousel__dot is-active" data-pos="center"></span>
          <span class="mem-carousel__dot" data-pos="right"></span>
        </div>
        <div class="sr-only">
          <button type="button" id="mem-carousel-prev" aria-label="Previous memory"></button>
          <button type="button" id="mem-carousel-next" aria-label="Next memory"></button>
        </div>
      </section>
    `;
  }

  function updateCarouselView(snap) {
    const stage = document.getElementById('mem-carousel-stage');
    const meta = document.getElementById('mem-carousel-meta');
    const root = document.getElementById('mem-carousel');
    if (!stage || !meta || !root) return;

    if (snap.isInitialLoading) {
      stage.innerHTML = `
        <div class="mem-carousel__slot mem-carousel__slot--center mem-carousel__slot--loading is-active">
          <div class="mem-carousel__waiting">
            <p class="mem-carousel__waiting-title">Loading memories…</p>
          </div>
        </div>
      `;
      meta.hidden = true;
      return;
    }

    if (snap.isEmpty) {
      root.classList.add('mem-carousel--empty');
      stage.innerHTML = `
        <div class="mem-carousel__slot mem-carousel__slot--center mem-carousel__slot--empty-state is-active">
          <div class="mem-carousel__waiting">
            <p class="mem-carousel__waiting-title">Waiting for the first memory…</p>
            <p class="mem-carousel__waiting-sub">Photos from the World Choir will appear here as they’re shared.</p>
          </div>
        </div>
      `;
      meta.hidden = true;
      return;
    }

    root.classList.remove('mem-carousel--empty');

    const left = snap.left
      ? renderSlotPhoto(snap.left, 'left')
      : `<div class="mem-carousel__slot mem-carousel__slot--left mem-carousel__slot--empty" aria-hidden="true"></div>`;
    const center = renderSlotPhoto(snap.current, 'center');
    let right;
    if (snap.right) {
      right = renderSlotPhoto(snap.right, 'right');
    } else if (snap.isPrefetching) {
      right = `
        <div class="mem-carousel__slot mem-carousel__slot--right mem-carousel__slot--waiting" data-slot="right" aria-hidden="true">
          <div class="mem-carousel__waiting">
            <p class="mem-carousel__waiting-title">Loading…</p>
          </div>
        </div>
      `;
    } else if (snap.current) {
      right = renderWaitingCard(snap.isReconnecting);
    } else {
      right = `<div class="mem-carousel__slot mem-carousel__slot--right mem-carousel__slot--empty" aria-hidden="true"></div>`;
    }

    stage.innerHTML = `${left}${center}${right}`;

    const caption = String(snap.current?.caption || '').trim();
    const place = [snap.current?.city, snap.current?.country].filter(Boolean).join(', ');
    if (caption || place) {
      meta.hidden = false;
      meta.innerHTML = `
        ${caption ? `<p class="mem-carousel__caption">${esc(caption)}</p>` : ''}
        ${place ? `<p class="mem-carousel__place">${esc(place)}</p>` : ''}
      `;
    } else {
      meta.hidden = true;
      meta.innerHTML = '';
    }

    // Exactly 3 positional indicators — center always active/cyan.
    document.querySelectorAll('.mem-carousel__dot').forEach((dot) => {
      const pos = dot.getAttribute('data-pos');
      const on = pos === 'center';
      dot.classList.toggle('is-active', on);
    });
  }

  function renderEventCard(event) {
    return `
      <section class="mem-section" aria-labelledby="mem-about-label">
        <h2 class="df-section-label" id="mem-about-label">About the event</h2>
        <article class="mem-card mem-event-card">
          <div class="mem-event-card__top">
            <img
              class="mem-event-card__art"
              src="${esc(event.songArtwork)}"
              alt="${esc(event.songTitle)} artwork"
              width="96"
              height="128"
              decoding="async"
            >
            <div class="mem-event-card__meta">
              <h3 class="mem-event-card__title">${esc(event.songTitle)}</h3>
              <p class="mem-event-card__line">
                <span class="mem-event-card__chip">
                  <span class="mem-event-card__icon" aria-hidden="true">${iconSvg('calendar')}</span>
                  ${esc(event.date)}
                </span>
                <span class="mem-event-card__sep" aria-hidden="true">|</span>
                <span class="mem-event-card__chip">
                  <span class="mem-event-card__icon" aria-hidden="true">${iconSvg('globe')}</span>
                  ${esc(event.eventName)}
                </span>
              </p>
            </div>
          </div>
          <div class="mem-event-card__stats" role="list">
            <div class="mem-stat" role="listitem">
              <span class="mem-stat__icon" aria-hidden="true">${iconSvg('voices')}</span>
              <span class="mem-stat__value">${formatCount(event.participantCount)}</span>
              <span class="mem-stat__label">Voices</span>
            </div>
            <div class="mem-stat" role="listitem">
              <span class="mem-stat__icon" aria-hidden="true">${iconSvg('countries')}</span>
              <span class="mem-stat__value">${formatCount(event.countryCount)}</span>
              <span class="mem-stat__label">Countries</span>
            </div>
            <div class="mem-stat" role="listitem">
              <span class="mem-stat__icon" aria-hidden="true">${iconSvg('promises')}</span>
              <span class="mem-stat__value">${formatCount(event.promisesCount)}</span>
              <span class="mem-stat__label">Promises Made</span>
            </div>
            <div class="mem-stat" role="listitem">
              <span class="mem-stat__icon" aria-hidden="true">${iconSvg('sprout')}</span>
              <span class="mem-stat__value">${event.dailyActsCompleted == null ? '—' : formatCount(event.dailyActsCompleted)}</span>
              <span class="mem-stat__label mem-stat__label--stack">Daily Acts<br>Completed</span>
            </div>
          </div>
        </article>
      </section>
    `;
  }

  function renderStamp(stamp) {
    const locked = !stamp.earned;
    return `
      <div class="mem-stamp${locked ? ' is-locked' : ''} mem-stamp--${esc(stamp.accent)}" role="listitem">
        <div class="mem-stamp__seal" aria-hidden="true">
          <span class="mem-stamp__ring"></span>
          <span class="mem-stamp__label">${esc(stamp.label)}</span>
          <span class="mem-stamp__icon">${iconSvg(stamp.icon)}</span>
          ${locked ? `<span class="mem-stamp__lock">${iconSvg('lock')}</span>` : ''}
        </div>
        <p class="mem-stamp__detail">${esc(stamp.detail || '')}</p>
      </div>
    `;
  }

  function renderPassportAndStamps(passportHtml, stamps) {
    return `
      <section class="mem-split" aria-label="Passport and stamps">
        <div class="mem-split__passport">
          <h2 class="df-section-label">My Passport</h2>
          <a class="mem-passport-link mem-card" href="passport.html" aria-label="Open your World Choir Passport">
            <div class="mem-passport-frame" id="mem-passport-host">
              ${passportHtml}
            </div>
          </a>
        </div>
        <div class="mem-split__stamps">
          <div class="mem-section-row">
            <h2 class="df-section-label mem-section-row__label">Stamps Achieved</h2>
            <a class="mem-link" href="passport.html">View all</a>
          </div>
          <div class="mem-card mem-stamps-card">
            <div class="mem-stamps-grid" role="list">
              ${stamps.map(renderStamp).join('')}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderItinerary(stops) {
    if (!stops.length) {
      return `
        <section class="mem-section">
          <div class="mem-section-row">
            <h2 class="df-section-label mem-section-row__label">Pass the World – Itinerary</h2>
          </div>
          <p class="mem-empty">The Pass the World route will appear here.</p>
        </section>
      `;
    }

    const nodes = stops.map((stop, i) => `
      <div class="mem-route__stop mem-route__stop--${esc(stop.status)}" role="listitem">
        ${i > 0 ? '<span class="mem-route__line" aria-hidden="true"></span>' : ''}
        <span class="mem-route__node" aria-hidden="true"></span>
        <p class="mem-route__city">${esc(stop.city)}</p>
        <p class="mem-route__country">${esc(stop.country)}</p>
        <p class="mem-route__date">${esc(stop.date)}</p>
      </div>
    `).join('');

    return `
      <section class="mem-section" aria-labelledby="mem-route-label">
        <div class="mem-section-row">
          <h2 class="df-section-label mem-section-row__label" id="mem-route-label">Pass the World – Itinerary</h2>
          <a class="mem-link" href="map.html">View full route</a>
        </div>
        <div class="mem-card mem-route-card">
          <div class="mem-route" role="list">
            ${nodes}
          </div>
        </div>
      </section>
    `;
  }

  function renderMoreMemories() {
    return `
      <section class="mem-section mem-more" aria-labelledby="mem-more-label">
        <h2 class="df-section-label" id="mem-more-label">More Memories</h2>
        <p class="mem-empty mem-empty--soft">Community memories will continue to gather here.</p>
      </section>
    `;
  }

  function renderFab() {
    return `
      <div class="mem-fab" id="mem-fab">
        <button
          type="button"
          class="mem-fab__toggle"
          id="mem-fab-toggle"
          aria-label="Choose a photo from device"
        >
          ${iconSvg('plus')}
        </button>
        <input type="file" id="mem-input-device" accept="image/*" hidden>
      </div>
    `;
  }

  function renderComposer() {
    const loc = typeof WorldChoirMemoryFeed !== 'undefined'
      ? WorldChoirMemoryFeed.getUserLocationSnapshot()
      : { city: '', country: '' };
    const place = [loc.city, loc.country].filter(Boolean).join(', ') || 'Your World Choir location';

    return `
      <div class="mem-composer" id="mem-composer" hidden>
        <button type="button" class="mem-composer__backdrop" id="mem-composer-backdrop" aria-label="Close"></button>
        <div class="mem-composer__sheet" role="dialog" aria-modal="true" aria-labelledby="mem-composer-title">
          <h2 class="mem-composer__title" id="mem-composer-title">Share a Memory</h2>
          <div class="mem-composer__preview" id="mem-composer-preview">
            <p class="mem-empty">Add a photo to continue.</p>
          </div>
          <label class="mem-composer__field">
            <span class="mem-composer__label">Caption <span class="mem-composer__optional">(optional)</span></span>
            <textarea id="mem-composer-caption" rows="3" maxlength="200" placeholder="Add a caption…"></textarea>
          </label>
          <p class="mem-composer__place" id="mem-composer-place">${esc(place)}</p>
          <div class="mem-composer__actions">
            <button type="button" class="mem-composer__btn mem-composer__btn--ghost" id="mem-composer-cancel">Cancel</button>
            <button type="button" class="mem-composer__btn mem-composer__btn--primary" id="mem-composer-post">Post Memory</button>
          </div>
        </div>
      </div>
    `;
  }

  async function buildPassportHtml() {
    if (typeof WorldChoirPassport === 'undefined') {
      return `<p class="mem-empty">Your Passport will appear here.</p>`;
    }
    try {
      const data = await WorldChoirPassport.loadPassportData({ fast: true });
      return WorldChoirPassport.renderCard(data, {
        interactive: false,
        id: 'mem-world-choir-passport',
        page: 'cover',
      });
    } catch {
      return WorldChoirPassport.renderCard({}, {
        loading: true,
        interactive: false,
        id: 'mem-world-choir-passport',
      });
    }
  }

  function cooldownMessage() {
    return 'You’ve already shared a memory. You can share another in 24 hours.';
  }

  function applyPostingAvailability(snap) {
    const blocked = Boolean(snap?.postedToday) || snap?.canPost === false || snap?.onCooldown;
    const btn = document.getElementById('mem-fab-toggle');
    if (!btn) return;
    btn.disabled = blocked;
    btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    btn.classList.toggle('is-disabled', blocked);
  }

  function setComposerScrollLock(lock) {
    document.documentElement.classList.toggle('mem-composer-open', !!lock);
    document.body.classList.toggle('mem-composer-open', !!lock);

    if (lock) {
      composerScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${composerScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';

      if (!composerScrollLockHandler) {
        composerScrollLockHandler = (event) => {
          const sheet = document.querySelector('#mem-composer .mem-composer__sheet');
          if (sheet && (sheet === event.target || sheet.contains(event.target))) {
            // Allow scrolling inside the composer when it actually overflows.
            if (sheet.scrollHeight > sheet.clientHeight + 1) return;
          }
          event.preventDefault();
        };
        document.addEventListener('touchmove', composerScrollLockHandler, { passive: false });
      }
      return;
    }

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, composerScrollY || 0);

    if (composerScrollLockHandler) {
      document.removeEventListener('touchmove', composerScrollLockHandler);
      composerScrollLockHandler = null;
    }
  }

  function openComposer(previewUrl, file, dataUrl) {
    const snap = typeof WorldChoirMemoryFeed !== 'undefined'
      ? WorldChoirMemoryFeed.getSnapshot()
      : null;
    if (snap?.postedToday) {
      showToast(cooldownMessage());
      return;
    }

    composerOpen = true;
    composerPreviewUrl = previewUrl || null;
    composerFile = file || null;
    composerDataUrl = dataUrl || null;
    const root = document.getElementById('mem-composer');
    const preview = document.getElementById('mem-composer-preview');
    if (!root || !preview) return;
    root.hidden = false;
    setComposerScrollLock(true);
    if (composerPreviewUrl) {
      preview.innerHTML = `<img src="${esc(composerPreviewUrl)}" alt="Selected memory photo" decoding="async">`;
    } else {
      preview.innerHTML = `<p class="mem-empty">Add a photo to continue.</p>`;
    }
    const loc = WorldChoirMemoryFeed.getUserLocationSnapshot();
    const placeEl = document.getElementById('mem-composer-place');
    if (placeEl) {
      placeEl.textContent = [loc.city, loc.country].filter(Boolean).join(', ')
        || 'Your World Choir location';
    }
    document.getElementById('mem-composer-caption')?.focus();
  }

  function closeComposer() {
    composerOpen = false;
    posting = false;
    const root = document.getElementById('mem-composer');
    if (root) root.hidden = true;
    setComposerScrollLock(false);
    if (composerPreviewUrl && composerPreviewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(composerPreviewUrl); } catch { /* ignore */ }
    }
    composerPreviewUrl = null;
    composerFile = null;
    composerDataUrl = null;
    const caption = document.getElementById('mem-composer-caption');
    if (caption) caption.value = '';
    const postBtn = document.getElementById('mem-composer-post');
    if (postBtn) {
      postBtn.disabled = false;
      postBtn.textContent = 'Post Memory';
    }
  }

  function validateImageFile(fileList) {
    const files = [...(fileList || [])];
    const maxBytes = 12 * 1024 * 1024;
    if (!files.length) return { ok: false, error: 'No image selected.' };
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      return { ok: false, error: 'Only image files are supported.' };
    }
    if (file.size > maxBytes) {
      return { ok: false, error: 'Image must be under 12 MB.' };
    }
    return { ok: true, file };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read that image.'));
      reader.readAsDataURL(file);
    });
  }

  function showToast(message) {
    let el = document.getElementById('mem-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mem-toast';
      el.className = 'mem-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('is-visible'), 2800);
  }

  function navigate(direction) {
    if (typeof WorldChoirMemoryFeed === 'undefined') return;
    const snap = WorldChoirMemoryFeed.getSnapshot();
    if (snap.transitionLocked) return;

    let moved = false;
    if (direction === 'next') {
      if (!snap.canGoNext) return;
      moved = WorldChoirMemoryFeed.goNext();
    } else {
      if (!snap.canGoPrev) return;
      moved = WorldChoirMemoryFeed.goPrev();
    }
    if (!moved) return;

    window.setTimeout(() => {
      WorldChoirMemoryFeed.unlockTransition();
    }, TRANSITION_MS);
  }

  function bindInteractions() {
    if (bound) return;
    bound = true;

    const viewport = document.getElementById('mem-carousel-viewport');
    if (viewport) {
      let startX = 0;
      let dragging = false;
      viewport.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('button')) return;
        dragging = true;
        startX = ev.clientX;
        viewport.setPointerCapture?.(ev.pointerId);
      });
      viewport.addEventListener('pointerup', (ev) => {
        if (!dragging) return;
        dragging = false;
        const dx = ev.clientX - startX;
        if (Math.abs(dx) > 48) {
          navigate(dx < 0 ? 'next' : 'prev');
        }
      });
      viewport.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowRight') {
          ev.preventDefault();
          navigate('next');
        } else if (ev.key === 'ArrowLeft') {
          ev.preventDefault();
          navigate('prev');
        }
      });
    }

    document.getElementById('mem-carousel-prev')?.addEventListener('click', () => navigate('prev'));
    document.getElementById('mem-carousel-next')?.addEventListener('click', () => navigate('next'));

    document.getElementById('mem-fab-toggle')?.addEventListener('click', () => {
      const snap = WorldChoirMemoryFeed.getSnapshot();
      if (snap.postedToday || snap.onCooldown || snap.canPost === false) {
        showToast(cooldownMessage());
        return;
      }
      document.getElementById('mem-input-device')?.click();
    });

    const onFile = async (ev) => {
      const result = validateImageFile(ev.target.files);
      if (!result.ok) {
        showToast(result.error);
        ev.target.value = '';
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(result.file);
        const url = URL.createObjectURL(result.file);
        openComposer(url, result.file, dataUrl);
      } catch {
        showToast('Could not read that image.');
      }
      ev.target.value = '';
    };
    document.getElementById('mem-input-device')?.addEventListener('change', onFile);

    document.getElementById('mem-composer-cancel')?.addEventListener('click', closeComposer);
    document.getElementById('mem-composer-backdrop')?.addEventListener('click', closeComposer);
    document.getElementById('mem-composer-post')?.addEventListener('click', async () => {
      if (posting) return;
      if (!composerDataUrl && !composerFile) {
        showToast('Add a photo to continue.');
        return;
      }
      const loc = WorldChoirMemoryFeed.getUserLocationSnapshot();
      if (!loc.city || !loc.country) {
        showToast('Set your city and country before sharing.');
        return;
      }

      posting = true;
      const postBtn = document.getElementById('mem-composer-post');
      if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = 'Posting…';
      }
      try {
        const dataUrl = composerDataUrl || await fileToDataUrl(composerFile);
        const caption = document.getElementById('mem-composer-caption')?.value || '';
        await WorldChoirMemoryFeed.createPhoto({
          dataUrl,
          caption,
          fileName: composerFile?.name || '',
        });
        closeComposer();
        showToast('Memory shared.');
        applyPostingAvailability(WorldChoirMemoryFeed.getSnapshot());
      } catch (err) {
        posting = false;
        if (postBtn) {
          postBtn.disabled = false;
          postBtn.textContent = 'Post Memory';
        }
        if (err?.code === 'DAILY_MEMORY_LIMIT_REACHED') {
          showToast(cooldownMessage());
          applyPostingAvailability({ postedToday: true, canPost: false, onCooldown: true });
          closeComposer();
          return;
        }
        showToast(err?.message || 'Could not share memory.');
      }
    });

    document.getElementById('mem-search-open')?.addEventListener('click', () => {
      document.getElementById('mem-more-label')?.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && composerOpen) closeComposer();
    });
  }

  async function render() {
    const el = document.getElementById('memory-content');
    if (!el) return;

    const [event, route] = await Promise.all([
      WorldChoirMemoryData.loadEventArchive(),
      WorldChoirMemoryData.loadPassTheWorldRoute(),
    ]);
    const stamps = WorldChoirMemoryData.getStamps();
    const passportHtml = await buildPassportHtml();

    el.innerHTML = `
      ${renderTopbar()}
      ${renderIntro()}
      ${renderCarouselShell()}
      ${renderEventCard(event)}
      ${renderPassportAndStamps(passportHtml, stamps)}
      ${renderItinerary(route)}
      ${renderMoreMemories()}
      ${renderFab()}
      ${renderComposer()}
    `;

    bound = false;
    bindInteractions();

    if (feedUnsub) {
      feedUnsub();
      feedUnsub = null;
    }
    if (typeof WorldChoirMemoryFeed !== 'undefined') {
      feedUnsub = WorldChoirMemoryFeed.subscribe((snap) => {
        updateCarouselView(snap);
        applyPostingAvailability(snap);
      });
      await WorldChoirMemoryFeed.init();
      updateCarouselView(WorldChoirMemoryFeed.getSnapshot());
      applyPostingAvailability(WorldChoirMemoryFeed.getSnapshot());
    }
  }

  async function init() {
    await (typeof WorldChoirDB !== 'undefined' ? WorldChoirDB.ready() : Promise.resolve());
    if (typeof WorldChoirNav !== 'undefined' && !WorldChoirNav.guardMemoryRoute()) return;
    if (typeof WorldChoirNav !== 'undefined') WorldChoirNav.startWatcher('memory');
    await render();
  }

  return { init, render };
})();
