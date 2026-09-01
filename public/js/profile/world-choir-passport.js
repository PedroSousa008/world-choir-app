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

  function renderCoverPage(data, { loading = false, interactive = true, hidden = false } = {}) {
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
      <div class="passport-card__page passport-card__page--cover" data-passport-page="cover"${hidden ? ' hidden' : ''}>
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

  /** Inside page — shared background + History header; cover page keeps its own finish. */
  function renderInsidePage(data = {}, { loading = false, hidden = true } = {}) {
    const cfg = typeof WorldChoirConfig !== 'undefined' ? WorldChoirConfig.PASSPORT_INSIDE_BACKGROUND : null;
    const src = cfg?.url || 'images/passport/passport-inside-bg.png?v=20260827c';
    const alt = cfg?.alt || 'World Choir Passport inside page';

    const voiceRaw = loading
      ? null
      : (data.voiceNumber != null && data.voiceNumber !== '' && !Number.isNaN(Number(data.voiceNumber))
        ? Number(data.voiceNumber).toLocaleString('en-US')
        : null);
    const countryRaw = loading ? null : (data.country || '').trim();
    const metaParts = [];
    if (loading) {
      metaParts.push('<span class="passport-skel passport-skel--line passport-skel--inside-meta"></span>');
    } else {
      if (voiceRaw) metaParts.push(`Voice #${esc(voiceRaw)}`);
      if (countryRaw) metaParts.push(esc(countryRaw));
    }
    const metaHtml = metaParts.length
      ? metaParts.join(' <span class="passport-inside-header__dot" aria-hidden="true">•</span> ')
      : '—';

    const stampsHtml = typeof PassportStamps !== 'undefined'
      ? PassportStamps.renderGrid(data.stamps || [], { esc })
      : '';

    return `
      <div class="passport-card__page passport-card__page--inside" data-passport-page="inside"${hidden ? ' hidden' : ''}>
        <img
          class="passport-card__inside-bg"
          src="${esc(src)}"
          alt="${esc(alt)}"
          width="1050"
          height="1498"
          decoding="async"
          fetchpriority="low"
        >
        <div class="passport-card__inner passport-card__inner--inside">
          <header class="passport-inside-header">
            <div class="passport-inside-header__copy">
              <p class="passport-inside-header__kicker">World Choir Passport</p>
              <h2 class="passport-inside-header__title">Stamps</h2>
              <p class="passport-inside-header__meta">${metaHtml}</p>
              <span class="passport-inside-header__rule" aria-hidden="true"></span>
            </div>
          </header>
          <div class="passport-stamps-wrap">
            ${stampsHtml}
          </div>
          <button
            type="button"
            class="passport-card__back"
            id="passport-back-cover"
            aria-label="Back to Passport cover"
          >
            ←
          </button>
          <button
            type="button"
            class="passport-inside-footer"
            id="passport-continue-story"
            aria-label="Tap to continue your story"
          >
            <span class="passport-inside-footer__dots" aria-hidden="true"></span>
            <span class="passport-inside-footer__text">Tap to continue your story</span>
            <span class="passport-inside-footer__dots" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    `;
  }

  function renderCard(data = {}, {
    loading = false,
    id = 'world-choir-passport',
    interactive = true,
    page = 'cover',
  } = {}) {
    const initialPage = (page === 'stamps' || page === 'inside') ? 'inside' : 'cover';
    const showInside = interactive && (!loading || initialPage === 'inside');

    return `
      <article
        class="passport-card${initialPage === 'inside' ? ' is-inside' : ''}"
        id="${esc(id)}"
        data-page="${initialPage}"
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
          ${renderCoverPage(data, {
            loading,
            interactive,
            hidden: initialPage !== 'cover',
          })}
          ${showInside ? renderInsidePage(data, {
            loading,
            hidden: initialPage !== 'inside',
          }) : ''}
        </div>
      </article>
    `;
  }

  function setCardPage(card, page, { historyMode = 'replace', syncUrl = true } = {}) {
    if (!card) return;
    const next = page === 'inside' || page === 'stamps' ? 'inside' : 'cover';
    card.dataset.page = next;
    card.classList.toggle('is-inside', next === 'inside');

    const cover = card.querySelector('[data-passport-page="cover"]');
    const inside = card.querySelector('[data-passport-page="inside"]');
    if (cover) cover.hidden = next !== 'cover';
    if (inside) inside.hidden = next !== 'inside';

    if (syncUrl && typeof PassportRoute !== 'undefined') {
      PassportRoute.syncPassportHtmlUrl(
        next === 'inside' ? 'stamps' : 'cover',
        { replace: historyMode !== 'push' }
      );
    }
  }

  function bindCardPages(root = document) {
    const card = root.querySelector?.('.passport-card') || root.closest?.('.passport-card');
    if (!card || card.dataset.pagesBound === '1') return;
    card.dataset.pagesBound = '1';

    card.querySelector('#passport-open-inside')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCardPage(card, 'inside', { historyMode: 'push' });
      if (typeof PassportStamps !== 'undefined') {
        window.setTimeout(() => {
          PassportStamps.bindRevealAnimations(card);
        }, 320);
      }
    });

    card.querySelector('#passport-back-cover')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setCardPage(card, 'cover', { historyMode: 'push' });
    });

    card.querySelector('#passport-continue-story')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.__passportShowChapter === 'function') {
        window.__passportShowChapter('story', { historyMode: 'push' });
        return;
      }
      if (typeof PassportRoute !== 'undefined') {
        PassportRoute.go('story');
      } else {
        window.location.href = 'passport.html?page=story';
      }
    });

    window.addEventListener('popstate', () => {
      const page = typeof PassportRoute !== 'undefined' ? PassportRoute.getPage() : 'cover';
      if (typeof window.__passportShowChapter === 'function') {
        window.__passportShowChapter(page, { syncUrl: false });
        return;
      }
      setCardPage(card, page === 'stamps' ? 'inside' : 'cover', { syncUrl: false });
      if (page === 'stamps' && typeof PassportStamps !== 'undefined') {
        PassportStamps.bindRevealAnimations(card);
      }
    });
  }

  async function fetchWorldChoirStats() {
    try {
      const eventId = typeof WorldChoirConfig !== 'undefined'
        ? (WorldChoirConfig.ACTIVE_EVENT?.id || 'world-choir-2027')
        : 'world-choir-2027';
      const res = await fetch(`/api/stats?eventId=${encodeURIComponent(eventId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      return data;
    } catch {
      return null;
    }
  }

  function passportCacheKey() {
    const deviceId = typeof WorldChoirDB !== 'undefined'
      ? (WorldChoirDB.getDeviceId?.() || 'anonymous')
      : 'anonymous';
    return `wc_passport_cache_v1_${deviceId}`;
  }

  function readPassportCache() {
    try {
      const raw = sessionStorage.getItem(passportCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || typeof parsed.data !== 'object') return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function writePassportCache(data) {
    try {
      sessionStorage.setItem(passportCacheKey(), JSON.stringify({
        savedAt: Date.now(),
        data,
      }));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function getCachedPassportData() {
    return readPassportCache();
  }

  function readLocalCreatorCauseSupport() {
    try {
      if (typeof CreatorFoundationsStore !== 'undefined'
        && CreatorFoundationsStore.UserSupport?.hasSupportedCreatorCause) {
        return CreatorFoundationsStore.UserSupport.hasSupportedCreatorCause() === true;
      }
    } catch {
      /* ignore */
    }

    try {
      const raw = localStorage.getItem('wc_creator_foundations_support');
      if (!raw) return false;
      const data = JSON.parse(raw);
      const successStatuses = new Set(['succeeded', 'completed', 'paid']);
      return (data?.donations || []).some((entry) => {
        if (entry?.mock === true) return false;
        const status = String(entry?.paymentStatus || entry?.status || '').toLowerCase();
        return successStatuses.has(status);
      });
    } catch {
      return false;
    }
  }

  async function fetchHasSupportedCreatorCause() {
    const localSupported = readLocalCreatorCauseSupport();
    try {
      const deviceId = WorldChoirDB.getDeviceId?.() || null;
      const user = WorldChoirDB.getCurrentUser?.() || null;
      const userId = user?.id || null;
      if (!deviceId && !userId) return localSupported;

      const params = new URLSearchParams({ action: 'has-supported' });
      if (deviceId) params.set('deviceId', deviceId);
      if (userId) params.set('userId', userId);
      const res = await fetch(`/api/donations?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return localSupported;
      return data?.supported === true;
    } catch {
      return localSupported;
    }
  }

  async function fetchDailyPeaceImpact() {
    try {
      const deviceId = WorldChoirDB.getDeviceId();
      const date = localDateString();
      const res = await fetch(
        `/api/daily-peace?deviceId=${encodeURIComponent(deviceId)}&view=impact&date=${encodeURIComponent(date)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      return data?.summary || null;
    } catch {
      return null;
    }
  }

  async function fetchDailyActsCompleted() {
    const summary = await fetchDailyPeaceImpact();
    return Number(summary?.totalCompleted) || 0;
  }

  async function fetchHasCompletedPartnerDailyAct() {
    const summary = await fetchDailyPeaceImpact();
    if (!summary) return false;
    if (summary.hasCompletedPartnerDailyAct === true) return true;
    return (Number(summary.partnerDailyActsCompleted) || 0) >= 1;
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

    const [dailyPeaceImpact, worldStats, hasSupportedCreatorCause] = await Promise.all([
      fetchDailyPeaceImpact(),
      fetchWorldChoirStats(),
      fetchHasSupportedCreatorCause(),
    ]);

    const dailyActsCompleted = Number(dailyPeaceImpact?.totalCompleted) || 0;
    const hasCompletedPartnerDailyAct = dailyPeaceImpact?.hasCompletedPartnerDailyAct === true
      || (Number(dailyPeaceImpact?.partnerDailyActsCompleted) || 0) >= 1;
    const hasCompletedAllPeaceThemes = dailyPeaceImpact?.hasCompletedAllPeaceThemes === true
      || (Number(dailyPeaceImpact?.themesExperienced ?? dailyPeaceImpact?.categoriesExperienced) || 0) >= 8;
    const mapStats = typeof WorldChoirDB !== 'undefined' ? WorldChoirDB.getMapStats?.() : null;
    const userId = user.id || WorldChoirDB.getDeviceId?.() || 'anonymous';
    const userCountry = pledge?.country || user.country || null;
    const userCity = pledge?.city || user.city || null;
    const normalizeCityKey = (city, country) => (
      `${String(city || '').trim().toLowerCase()}|${String(country || '').trim().toLowerCase()}`
    );
    const userCityVoiceCount = (() => {
      if (!userCity || !userCountry) return 0;
      const cityKey = normalizeCityKey(userCity, userCountry);
      const match = WorldChoirDB.getAggregatedCities?.().find(
        (entry) => normalizeCityKey(entry.city, entry.country) === cityKey
      );
      return Number(match?.count) || 0;
    })();
    const stamps = typeof PassportStamps !== 'undefined'
      ? PassportStamps.resolveAllStatuses({
        currentDate: new Date(),
        userId,
        userCountry,
        userCity,
        representedCountryCount: worldStats?.countries ?? mapStats?.countries ?? 0,
        voiceCount: worldStats?.voices ?? mapStats?.voices ?? 0,
        representedContinents: worldStats?.representedContinents ?? [],
        majorCities: worldStats?.majorCities ?? [],
        userCityVoiceCount,
        milestones: worldStats?.milestones ?? {},
        isMapPioneer: pledge?.isMapPioneer === true,
        hasSubmittedPromiseForEvent: (eventId) => WorldChoirDB.hasSubmittedPromise?.(eventId) === true,
        hasPledgedForEvent: (eventId) => WorldChoirDB.hasPledged?.(eventId) === true,
        userHasValidLocation: () => {
          const country = String(userCountry || '').trim();
          const city = String(userCity || '').trim();
          return !!(country && city);
        },
        hasSupportedCreatorCause,
        hasCompletedPartnerDailyAct,
        hasCompletedAllPeaceThemes,
        themesExperienced: Number(dailyPeaceImpact?.themesExperienced ?? dailyPeaceImpact?.categoriesExperienced) || 0,
        dailyActsCompleted,
        pledgedAt: pledge?.pledged_at || user.created_at || null,
      })
      : [];

    const data = {
      voiceNumber: pledge?.voiceNumber ?? null,
      voiceName: pledge?.voiceName || pledge?.display_name || user.display_name || null,
      displayName: user.display_name || pledge?.display_name || null,
      country: pledge?.country || user.country || null,
      city: pledge?.city || user.city || null,
      memberSince: user.created_at || pledge?.pledged_at || null,
      eventsJoined,
      dailyActsCompleted,
      stampsEarned: stamps.filter((stamp) => stamp.unlocked).length,
      hasJoined: !!pledge || eventsJoined > 0,
      stamps,
      userId,
    };

    writePassportCache(data);
    return data;
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
    getCachedPassportData,
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
