/**
 * WorldChoirMemory — post-event Memory tab (“The World Sang”).
 * Visual DNA matches Donate; structure follows the approved Memory mockup.
 */
const WorldChoirMemory = (() => {
  const REDUCED_MOTION = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let carouselIndex = 0;
  let fabOpen = false;
  let composerOpen = false;
  let composerPreviewUrl = null;
  let bound = false;

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

  function renderCarousel(photos) {
    if (!photos.length) {
      return `
        <section class="mem-carousel mem-carousel--empty" aria-label="Community memories">
          <p class="mem-empty">The first memories from this gathering will appear here.</p>
        </section>
      `;
    }

    const slides = photos.map((photo, i) => {
      const alt = photo.caption
        ? `${photo.caption}${photo.city ? ` — ${photo.city}` : ''}`
        : `Memory from ${photo.userName || 'a World Choir voice'}`;
      return `
        <button
          type="button"
          class="mem-carousel__slide"
          data-index="${i}"
          aria-label="${esc(alt)}"
          aria-current="${i === carouselIndex ? 'true' : 'false'}"
        >
          <img
            class="mem-carousel__img"
            src="${esc(photo.imageUrl)}"
            alt="${esc(alt)}"
            loading="${Math.abs(i - carouselIndex) <= 1 ? 'eager' : 'lazy'}"
            decoding="async"
            draggable="false"
          >
        </button>
      `;
    }).join('');

    const dots = photos.map((_, i) => `
      <button
        type="button"
        class="mem-carousel__dot${i === carouselIndex ? ' is-active' : ''}"
        data-dot="${i}"
        aria-label="Go to memory ${i + 1}"
        aria-current="${i === carouselIndex ? 'true' : 'false'}"
      ></button>
    `).join('');

    return `
      <section class="mem-carousel" aria-roledescription="carousel" aria-label="Community photo memories">
        <div class="mem-carousel__viewport" id="mem-carousel-viewport" tabindex="0">
          <div class="mem-carousel__track" id="mem-carousel-track">
            ${slides}
          </div>
        </div>
        <div class="mem-carousel__dots" role="tablist" aria-label="Memory slides">
          ${dots}
        </div>
      </section>
    `;
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
        <div class="mem-fab__menu" id="mem-fab-menu" hidden>
          <div class="mem-fab__row">
            <span class="mem-fab__label">Camera</span>
            <button type="button" class="mem-fab__action" id="mem-fab-camera" aria-label="Take a photo">
              ${iconSvg('camera')}
            </button>
          </div>
          <div class="mem-fab__row">
            <span class="mem-fab__label">Choose from device</span>
            <button type="button" class="mem-fab__action" id="mem-fab-device" aria-label="Choose photos from device">
              ${iconSvg('image')}
            </button>
          </div>
          <div class="mem-fab__row">
            <span class="mem-fab__label">Share a memory</span>
            <button type="button" class="mem-fab__action" id="mem-fab-share" aria-label="Share a memory">
              ${iconSvg('share')}
            </button>
          </div>
        </div>
        <button
          type="button"
          class="mem-fab__toggle"
          id="mem-fab-toggle"
          aria-label="Add memory"
          aria-expanded="false"
          aria-controls="mem-fab-menu"
        >
          ${iconSvg('plus')}
        </button>
        <input type="file" id="mem-input-camera" accept="image/*" capture="environment" hidden>
        <input type="file" id="mem-input-device" accept="image/*" multiple hidden>
      </div>
    `;
  }

  function renderComposer() {
    return `
      <div class="mem-composer" id="mem-composer" hidden>
        <button type="button" class="mem-composer__backdrop" id="mem-composer-backdrop" aria-label="Close"></button>
        <div class="mem-composer__sheet" role="dialog" aria-modal="true" aria-labelledby="mem-composer-title">
          <h2 class="mem-composer__title" id="mem-composer-title">Share a Memory</h2>
          <div class="mem-composer__preview" id="mem-composer-preview">
            <p class="mem-empty">Add a photo to continue.</p>
          </div>
          <label class="mem-composer__field">
            <span class="mem-composer__label">Caption</span>
            <textarea id="mem-composer-caption" rows="3" maxlength="280" placeholder="What did this moment mean to you?"></textarea>
          </label>
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

  function layoutCarousel() {
    const track = document.getElementById('mem-carousel-track');
    const viewport = document.getElementById('mem-carousel-viewport');
    if (!track || !viewport) return;
    const slides = [...track.querySelectorAll('.mem-carousel__slide')];
    if (!slides.length) return;

    const vw = viewport.clientWidth;
    const centerW = Math.min(vw * 0.58, 280);
    const sideW = centerW * 0.82;
    const gap = 12;
    const reduce = REDUCED_MOTION;

    slides.forEach((slide, i) => {
      const dist = i - carouselIndex;
      const abs = Math.abs(dist);
      const isCenter = dist === 0;
      const width = isCenter ? centerW : sideW;
      const scale = isCenter ? 1 : 0.82;
      const opacity = isCenter ? 1 : abs === 1 ? 0.88 : 0.45;
      slide.style.width = `${width}px`;
      slide.style.opacity = String(opacity);
      slide.style.transform = reduce ? 'none' : `scale(${scale})`;
      slide.setAttribute('aria-current', isCenter ? 'true' : 'false');
      slide.classList.toggle('is-active', isCenter);
      slide.tabIndex = isCenter ? 0 : -1;
    });

    // Center the active slide in the viewport.
    const active = slides[carouselIndex];
    if (!active) return;
    const targetLeft = active.offsetLeft - (vw - active.offsetWidth) / 2;
    viewport.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: reduce ? 'auto' : 'smooth',
    });

    document.querySelectorAll('.mem-carousel__dot').forEach((dot) => {
      const i = Number(dot.getAttribute('data-dot'));
      const on = i === carouselIndex;
      dot.classList.toggle('is-active', on);
      dot.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  function setCarouselIndex(next, photosLength) {
    if (!photosLength) return;
    carouselIndex = ((next % photosLength) + photosLength) % photosLength;
    layoutCarousel();
  }

  function setFabOpen(open) {
    fabOpen = open;
    const menu = document.getElementById('mem-fab-menu');
    const toggle = document.getElementById('mem-fab-toggle');
    const root = document.getElementById('mem-fab');
    if (!menu || !toggle || !root) return;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    root.classList.toggle('is-open', open);
  }

  function openComposer(previewUrl) {
    composerOpen = true;
    composerPreviewUrl = previewUrl || null;
    const root = document.getElementById('mem-composer');
    const preview = document.getElementById('mem-composer-preview');
    if (!root || !preview) return;
    root.hidden = false;
    if (composerPreviewUrl) {
      preview.innerHTML = `<img src="${esc(composerPreviewUrl)}" alt="Selected memory photo" decoding="async">`;
    } else {
      preview.innerHTML = `<p class="mem-empty">Add a photo to continue.</p>`;
    }
    document.getElementById('mem-composer-caption')?.focus();
  }

  function closeComposer() {
    composerOpen = false;
    const root = document.getElementById('mem-composer');
    if (root) root.hidden = true;
    if (composerPreviewUrl && composerPreviewUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(composerPreviewUrl); } catch { /* ignore */ }
    }
    composerPreviewUrl = null;
  }

  function validateImageFiles(fileList) {
    const files = [...(fileList || [])];
    const maxFiles = 6;
    const maxBytes = 12 * 1024 * 1024;
    if (!files.length) return { ok: false, error: 'No image selected.' };
    if (files.length > maxFiles) return { ok: false, error: `Choose up to ${maxFiles} images.` };
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return { ok: false, error: 'Only image files are supported.' };
      }
      if (file.size > maxBytes) {
        return { ok: false, error: 'Each image must be under 12 MB.' };
      }
    }
    return { ok: true, files };
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
    showToast._t = setTimeout(() => el.classList.remove('is-visible'), 2600);
  }

  function bindInteractions(photos) {
    if (bound) return;
    bound = true;
    const root = document.getElementById('memory-content');
    if (!root) return;

    root.addEventListener('click', (ev) => {
      const slide = ev.target.closest('.mem-carousel__slide');
      if (slide) {
        setCarouselIndex(Number(slide.dataset.index), photos.length);
        return;
      }
      const dot = ev.target.closest('.mem-carousel__dot');
      if (dot) {
        setCarouselIndex(Number(dot.getAttribute('data-dot')), photos.length);
      }
    });

    const viewport = document.getElementById('mem-carousel-viewport');
    if (viewport) {
      let startX = 0;
      let dragging = false;
      viewport.addEventListener('pointerdown', (ev) => {
        dragging = true;
        startX = ev.clientX;
        viewport.setPointerCapture?.(ev.pointerId);
      });
      viewport.addEventListener('pointerup', (ev) => {
        if (!dragging) return;
        dragging = false;
        const dx = ev.clientX - startX;
        if (Math.abs(dx) > 40) {
          setCarouselIndex(carouselIndex + (dx < 0 ? 1 : -1), photos.length);
        } else {
          layoutCarousel();
        }
      });
      viewport.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowRight') {
          ev.preventDefault();
          setCarouselIndex(carouselIndex + 1, photos.length);
        } else if (ev.key === 'ArrowLeft') {
          ev.preventDefault();
          setCarouselIndex(carouselIndex - 1, photos.length);
        }
      });
    }

    document.getElementById('mem-fab-toggle')?.addEventListener('click', () => {
      setFabOpen(!fabOpen);
    });

    document.getElementById('mem-fab-camera')?.addEventListener('click', () => {
      setFabOpen(false);
      document.getElementById('mem-input-camera')?.click();
    });
    document.getElementById('mem-fab-device')?.addEventListener('click', () => {
      setFabOpen(false);
      document.getElementById('mem-input-device')?.click();
    });
    document.getElementById('mem-fab-share')?.addEventListener('click', () => {
      setFabOpen(false);
      openComposer(null);
    });

    document.getElementById('mem-input-camera')?.addEventListener('change', (ev) => {
      const result = validateImageFiles(ev.target.files);
      if (!result.ok) {
        showToast(result.error);
        ev.target.value = '';
        return;
      }
      const url = URL.createObjectURL(result.files[0]);
      openComposer(url);
      ev.target.value = '';
    });
    document.getElementById('mem-input-device')?.addEventListener('change', (ev) => {
      const result = validateImageFiles(ev.target.files);
      if (!result.ok) {
        showToast(result.error);
        ev.target.value = '';
        return;
      }
      const url = URL.createObjectURL(result.files[0]);
      openComposer(url);
      ev.target.value = '';
    });

    document.getElementById('mem-composer-cancel')?.addEventListener('click', closeComposer);
    document.getElementById('mem-composer-backdrop')?.addEventListener('click', closeComposer);
    document.getElementById('mem-composer-post')?.addEventListener('click', () => {
      if (!composerPreviewUrl) {
        showToast('Add a photo to continue.');
        return;
      }
      showToast('Memory saved locally — upload coming soon.');
      closeComposer();
    });

    document.getElementById('mem-search-open')?.addEventListener('click', () => {
      document.getElementById('mem-more-label')?.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    });

    document.addEventListener('click', (ev) => {
      if (!fabOpen) return;
      const fab = document.getElementById('mem-fab');
      if (fab && !fab.contains(ev.target)) setFabOpen(false);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (composerOpen) closeComposer();
        else if (fabOpen) setFabOpen(false);
      }
    });

    window.addEventListener('resize', () => layoutCarousel());
  }

  async function render() {
    const el = document.getElementById('memory-content');
    if (!el) return;

    const [event, route] = await Promise.all([
      WorldChoirMemoryData.loadEventArchive(),
      WorldChoirMemoryData.loadPassTheWorldRoute(),
    ]);
    const photos = WorldChoirMemoryData.getPhotos();
    const stamps = WorldChoirMemoryData.getStamps();
    carouselIndex = Math.min(carouselIndex, Math.max(0, photos.length - 1));
    if (photos.length >= 3) carouselIndex = Math.min(1, photos.length - 1);

    const passportHtml = await buildPassportHtml();

    el.innerHTML = `
      ${renderTopbar()}
      ${renderIntro()}
      ${renderCarousel(photos)}
      ${renderEventCard(event)}
      ${renderPassportAndStamps(passportHtml, stamps)}
      ${renderItinerary(route)}
      ${renderMoreMemories()}
      ${renderFab()}
      ${renderComposer()}
    `;

    bound = false;
    bindInteractions(photos);
    requestAnimationFrame(() => {
      layoutCarousel();
      requestAnimationFrame(layoutCarousel);
    });
  }

  async function init() {
    await (typeof WorldChoirDB !== 'undefined' ? WorldChoirDB.ready() : Promise.resolve());
    if (typeof WorldChoirNav !== 'undefined' && !WorldChoirNav.guardMemoryRoute()) return;
    if (typeof WorldChoirNav !== 'undefined') WorldChoirNav.startWatcher('memory');
    await render();
  }

  return { init, render };
})();
