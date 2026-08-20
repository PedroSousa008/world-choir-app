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

  function initialsFrom(data) {
    const name = String(data.voiceName || data.displayName || data.city || 'WC').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    if (/^voice\s+\d+/i.test(name)) {
      return 'WC';
    }
    return name.slice(0, 2).toUpperCase();
  }

  function worldMapSvg() {
    // Fine gold dotted engraving — decorative only
    const dots = [
      [18, 42], [28, 38], [38, 44], [48, 40], [58, 46], [22, 55], [34, 58], [46, 54],
      [72, 36], [84, 32], [96, 38], [108, 34], [120, 40], [88, 48], [102, 52], [114, 48],
      [132, 42], [144, 38], [156, 44], [140, 54], [152, 58],
      [42, 72], [54, 78], [66, 74], [78, 82], [58, 88], [70, 92],
      [98, 70], [110, 76], [122, 72], [134, 80], [146, 74], [118, 88], [130, 94],
      [26, 28], [160, 28], [170, 48], [12, 68], [168, 82], [80, 28], [150, 90],
      [64, 34], [92, 90], [40, 90], [105, 28], [75, 60], [125, 60],
    ];
    const bright = new Set([2, 9, 14, 20, 28, 35, 41]);
    const circles = dots.map(([x, y], i) => {
      const r = bright.has(i) ? 1.7 : 1.15;
      const o = bright.has(i) ? 0.95 : 0.55;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#c9a962" opacity="${o}"/>`;
    }).join('');
    return `
      <svg class="passport-card__map" viewBox="0 0 180 110" aria-hidden="true" focusable="false">
        ${circles}
      </svg>
    `;
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

  function portraitHtml(data, loading) {
    if (loading) {
      return `<div class="passport-card__portrait" aria-hidden="true"><span class="passport-skel passport-skel--portrait"></span></div>`;
    }
    if (data.profileImage) {
      return `
        <div class="passport-card__portrait">
          <img src="${esc(data.profileImage)}" alt="" decoding="async">
        </div>
      `;
    }
    return `
      <div class="passport-card__portrait" aria-hidden="true">
        <div class="passport-card__portrait-fallback">${esc(initialsFrom(data))}</div>
      </div>
    `;
  }

  function renderCard(data = {}, { loading = false, id = 'world-choir-passport' } = {}) {
    const emblem = typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.PASSPORT_EMBLEM
      ? WorldChoirConfig.PASSPORT_EMBLEM.url
      : 'images/passport/passport-emblem.png?v=20260820a';
    const emblemAlt = typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.PASSPORT_EMBLEM
      ? WorldChoirConfig.PASSPORT_EMBLEM.alt
      : 'World Choir Passport emblem';

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
      <article class="passport-card" id="${esc(id)}" aria-label="World Choir Passport">
        <div class="passport-card__spine" aria-hidden="true"></div>
        <div class="passport-card__texture" aria-hidden="true"></div>
        <div class="passport-card__inner">
          <div class="passport-card__top">
            <div>
              <p class="passport-card__brand-kicker">World Choir</p>
              <p class="passport-card__brand-title">Passport</p>
            </div>
            <img
              class="passport-card__emblem"
              id="passport-card-emblem"
              src="${esc(emblem)}"
              alt="${esc(emblemAlt)}"
              width="304"
              height="178"
              decoding="async"
            >
          </div>
          <div class="passport-card__identity">
            ${portraitHtml(data, loading)}
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
            ${worldMapSvg()}
          </div>
        </div>
      </article>
    `;
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
      profileImage: user.profileImage || pledge?.profileImage || null,
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
    host.innerHTML = renderCard(data, { loading: false, id: 'passport-export-card' });
    document.body.appendChild(host);

    const card = host.querySelector('.passport-card');
    await waitForImages(host);
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
    isExportBusy: () => exportBusy,
  };
})();
