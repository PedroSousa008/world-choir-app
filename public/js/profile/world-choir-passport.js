/**
 * WorldChoirPassport — reusable Passport card + data + export
 */
const WorldChoirPassport = (() => {
  let exportBusy = false;

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function localDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatVoiceNumber(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
    return `#${Number(n).toLocaleString('en-US')}`;
  }

  function formatMemberSince(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function field(label, valueHtml, { voice = false } = {}) {
    return `
      <div class="passport-field">
        <p class="passport-field__label">${esc(label)}</p>
        <p class="passport-field__value${voice ? ' passport-field__value--voice' : ''}">${valueHtml}</p>
        <span class="passport-field__rule" aria-hidden="true"></span>
      </div>
    `;
  }

  function featureImageSrc() {
    const cfg = typeof WorldChoirConfig !== 'undefined' ? WorldChoirConfig.PASSPORT_FEATURE_IMAGE : null;
    return {
      src: cfg?.url || 'images/passport/passport-feature.png?v=20260821b',
      alt: cfg?.alt || 'World Choir Passport feature',
    };
  }

  function featureImageHtml({ interactive = true } = {}) {
    const { src, alt } = featureImageSrc();
    // Always render the real static asset — never a skeleton (avoids square flash on refresh).
    const img = `
        <img
          class="passport-card__feature-img"
          src="${esc(src)}"
          alt="${esc(alt)}"
          width="512"
          height="512"
          decoding="async"
          fetchpriority="high"
        >
    `;

    if (!interactive) {
      return `<div class="passport-card__feature">${img}</div>`;
    }

    return `
      <button
        type="button"
        class="passport-card__feature passport-card__feature--btn"
        id="passport-open-inside"
        aria-label="Open next Passport page"
      >
        ${img}
      </button>
    `;
  }

  function revealFeatureImages(root = document) {
    root.querySelectorAll?.('.passport-card__feature-img').forEach((img) => {
      const mark = () => img.classList.add('is-ready');
      if (img.complete && img.naturalWidth > 0) {
        mark();
        return;
      }
      img.addEventListener('load', mark, { once: true });
      img.addEventListener('error', mark, { once: true });
    });
  }

  function renderCoverPage(data, { loading = false, interactive = true } = {}) {
    const logo = typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.LOGO
      ? WorldChoirConfig.LOGO.url
      : 'images/world-choir-logo.png?v=20270706';
    const mapImg = typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.PASSPORT_WORLD_MAP
      ? WorldChoirConfig.PASSPORT_WORLD_MAP.url
      : 'images/passport/passport-world-map.png?v=20260820b';
    const mapAlt = typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.PASSPORT_WORLD_MAP
      ? WorldChoirConfig.PASSPORT_WORLD_MAP.alt
      : 'World Choir world map';

    const voice = loading
      ? '<span class="passport-skel passport-skel--voice"></span>'
      : esc(formatVoiceNumber(data.voiceNumber));
    const country = loading
      ? '<span class="passport-skel passport-skel--line"></span>'
      : esc(data.country || '—');
    const city = loading
      ? '<span class="passport-skel passport-skel--line"></span>'
      : esc(data.city || '—');
    const since = loading
      ? '<span class="passport-skel passport-skel--line"></span>'
      : esc(formatMemberSince(data.memberSince));

    return `
      <div class="passport-card__page passport-card__page--cover" data-passport-page="cover">
        <div class="passport-card__inner">
          <div class="passport-card__top">
            <div>
              <p class="passport-card__brand-kicker">World Choir</p>
              <p class="passport-card__brand-title">Passport</p>
            </div>
            <img class="passport-card__logo" src="${esc(logo)}" alt="World Choir" width="1024" height="1024" decoding="async">
          </div>
          <div class="passport-card__identity">
            ${featureImageHtml({ interactive: interactive && !loading })}
            <div class="passport-card__fields">
              ${field('Voice Number', voice, { voice: true })}
              ${field('Country', country)}
              ${field('City', city)}
            </div>
          </div>
          <div class="passport-card__footer">
            <div class="passport-card__since">
              <p class="passport-field__label">Member Since</p>
              <p class="passport-field__value">${since}</p>
            </div>
            <img
              class="passport-card__map"
              src="${esc(mapImg)}"
              alt="${esc(mapAlt)}"
              width="1637"
              height="960"
              decoding="async"
            >
          </div>
        </div>
      </div>
    `;
  }

  /** Inside page — shared background image for everyone; cover page keeps its own finish. */
  function renderInsidePage() {
    const cfg = typeof WorldChoirConfig !== 'undefined' ? WorldChoirConfig.PASSPORT_INSIDE_BACKGROUND : null;
    const src = cfg?.url || 'images/passport/passport-inside-bg.png?v=20260827a';
    const alt = cfg?.alt || 'World Choir Passport inside page';

    return `
      <div class="passport-card__page passport-card__page--inside" data-passport-page="inside" hidden>
        <img
          class="passport-card__inside-bg"
          src="${esc(src)}"
          alt="${esc(alt)}"
          width="1080"
          height="1543"
          decoding="async"
          fetchpriority="low"
        >
        <div class="passport-card__inner passport-card__inner--inside">
          <button
            type="button"
            class="passport-card__back"
            id="passport-back-cover"
            aria-label="Back to Passport cover"
          >
            ←
          </button>
        </div>
      </div>
    `;
  }

  function renderCard(data = {}, { loading = false, id = 'world-choir-passport', interactive = true } = {}) {
    return `
      <article
        class="passport-card"
        id="${esc(id)}"
        data-page="cover"
        aria-label="World Choir Passport"
      >
        <div class="passport-card__lighting" aria-hidden="true"></div>
        <div class="passport-card__texture" aria-hidden="true"></div>
        <div class="passport-card__texture passport-card__texture--fine" aria-hidden="true"></div>
        <div class="passport-card__spine" aria-hidden="true">
          <span class="passport-card__spine-band"></span>
          <span class="passport-card__spine-edge"></span>
          <span class="passport-card__spine-thickness"></span>
          <span class="passport-card__spine-highlight"></span>
          <span class="passport-card__spine-crease"></span>
          <span class="passport-card__spine-seam"></span>
          <span class="passport-card__spine-blur"></span>
          <span class="passport-card__spine-shade"></span>
          <span class="passport-card__spine-curve"></span>
        </div>
        <div class="passport-card__inset" aria-hidden="true"></div>
        <div class="passport-card__edge-light" aria-hidden="true"></div>
        <div class="passport-card__thickness" aria-hidden="true"></div>
        <div class="passport-card__pages">
          ${renderCoverPage(data, { loading, interactive })}
          ${interactive && !loading ? renderInsidePage() : ''}
        </div>
      </article>
    `;
  }

  function setCardPage(card, page) {
    if (!card) return;
    const next = page === 'inside' ? 'inside' : 'cover';
    card.dataset.page = next;
    card.classList.toggle('is-inside', next === 'inside');

    const cover = card.querySelector('[data-passport-page="cover"]');
    const inside = card.querySelector('[data-passport-page="inside"]');
    if (cover) cover.hidden = next !== 'cover';
    if (inside) inside.hidden = next !== 'inside';
  }

  function bindCardPages(root = document) {
    const card = root.querySelector?.('.passport-card') || root.closest?.('.passport-card');
    if (!card || card.dataset.pagesBound === '1') return;
    card.dataset.pagesBound = '1';

    card.querySelector('#passport-open-inside')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCardPage(card, 'inside');
    });

    card.querySelector('#passport-back-cover')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCardPage(card, 'cover');
    });
  }

  async function fetchDailyActsCompleted() {
    try {
      const deviceId = WorldChoirDB.getDeviceId();
      const date = localDateString();
      const res = await fetch(
        `/api/daily-peace?deviceId=${encodeURIComponent(deviceId)}&view=impact&date=${encodeURIComponent(date)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return 0;
      return Number(data?.summary?.totalCompleted) || 0;
    } catch {
      return 0;
    }
  }

  async function loadPassportData() {
    await WorldChoirDB.ready();
    const user = WorldChoirDB.getCurrentUser() || {};
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    const history = WorldChoirDB.getParticipationHistory?.() || [];

    let eventsJoined = history.length;
    if (eventsJoined === 0 && WorldChoirDB.hasPledged?.()) {
      eventsJoined = 1;
    }

    const dailyActsCompleted = await fetchDailyActsCompleted();

    return {
      voiceNumber: pledge?.voiceNumber ?? null,
      voiceName: pledge?.voiceName || pledge?.display_name || user.display_name || null,
      displayName: user.display_name || pledge?.display_name || null,
      country: pledge?.country || user.country || null,
      city: pledge?.city || user.city || null,
      memberSince: user.created_at || pledge?.pledged_at || null,
      eventsJoined,
      dailyActsCompleted,
      hasJoined: !!pledge || eventsJoined > 0,
    };
  }

  function showToast(message) {
    const el = document.getElementById('passport-toast');
    if (!el) {
      alert(message);
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.add('is-visible');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      el.classList.remove('is-visible');
      window.setTimeout(() => {
        el.hidden = true;
      }, 250);
    }, 2600);
  }

  async function waitForImages(root) {
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              })
      )
    );
  }

  async function capturePassportImage(data) {
    if (typeof html2canvas !== 'function') {
      throw new Error('Passport export is unavailable on this device.');
    }

    const host = document.createElement('div');
    host.className = 'passport-export-host';
    host.innerHTML = renderCard(data, { loading: false, id: 'passport-export-card', interactive: false });
    document.body.appendChild(host);
    revealFeatureImages(host);

    const card = host.querySelector('.passport-card');
    await waitForImages(host);
    host.querySelectorAll('.passport-card__feature-img').forEach((img) => img.classList.add('is-ready'));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const canvas = await html2canvas(card, {
        backgroundColor: null,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: card.offsetWidth,
        height: card.offsetHeight,
      });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png');
      });
      return blob;
    } finally {
      host.remove();
    }
  }

  async function downloadPassport(data) {
    if (exportBusy) return;
    exportBusy = true;
    try {
      const blob = await capturePassportImage(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const voice = data.voiceNumber != null ? `-${data.voiceNumber}` : '';
      a.href = url;
      a.download = `world-choir-passport${voice}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Passport saved');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not save Passport');
    } finally {
      exportBusy = false;
    }
  }

  async function sharePassport(data) {
    if (exportBusy) return;
    exportBusy = true;
    try {
      const blob = await capturePassportImage(data);
      const file = new File([blob], 'world-choir-passport.png', { type: 'image/png' });
      const text = 'My voice is part of World Choir.';
      const url = typeof window !== 'undefined' ? `${window.location.origin}/` : '';

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'World Choir Passport', url });
        return;
      }

      if (navigator.share) {
        await navigator.share({ text: url ? `${text}\n${url}` : text, title: 'World Choir Passport', url: url || undefined });
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'world-choir-passport.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      showToast('Passport saved — share it from your photos');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error(err);
      showToast(err.message || 'Could not share Passport');
    } finally {
      exportBusy = false;
    }
  }

  return {
    renderCard,
    loadPassportData,
    formatVoiceNumber,
    formatMemberSince,
    downloadPassport,
    sharePassport,
    showToast,
    revealFeatureImages,
    bindCardPages,
    setCardPage,
    isExportBusy: () => exportBusy,
  };
})();
