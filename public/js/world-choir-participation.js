/**
 * World Choir — Shared participation modal (Home + Map + post-event join)
 */
const WorldChoirParticipation = (() => {
  const COUNTRIES = WorldChoirCountries?.COUNTRIES || [];

  let onSuccessCallback = null;
  let sessionOnSuccess = null;
  let sessionOnCancel = null;
  let countriesPopulated = false;

  const DEFAULT_TITLE = 'Where will you sing from?';
  const DEFAULT_COPY =
    'Choose the city and country where you plan to join World Choir. You can change this later in your profile.';
  const POST_EVENT_TITLE = 'Where are you joining from?';
  const POST_EVENT_COPY =
    'Choose your city and country to light up on the World Choir map. You can change this later in your profile.';

  function ensureMarkup() {
    if (document.getElementById('participation-overlay')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="overlay" id="participation-overlay" aria-hidden="true">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="participation-title">
          <h2 class="modal-title" id="participation-title">${DEFAULT_TITLE}</h2>
          <p class="modal-copy" id="participation-copy">${DEFAULT_COPY}</p>

          <div class="form-group">
            <label class="form-label" for="pledge-country">Country</label>
            <select class="form-input form-select" id="pledge-country">
              <option value="">Select country</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="pledge-city">City</label>
            <input class="form-input" id="pledge-city" type="text" placeholder="Your city" autocomplete="address-level2">
          </div>

          <div class="actions-row">
            <button class="btn btn-primary" id="participation-confirm" type="button">Confirm Participation</button>
            <button class="btn btn-secondary" id="participation-cancel" type="button" data-a11y-close>Cancel</button>
          </div>
        </div>
      </div>
    `;
    const node = wrap.firstElementChild;
    if (node) document.body.appendChild(node);
    bindOnce();
  }

  function populateCountries() {
    ensureMarkup();
    const sel = document.getElementById('pledge-country');
    if (!sel || countriesPopulated) return;
    if (typeof WorldChoirCountries !== 'undefined') {
      WorldChoirCountries.populateCountrySelect(sel);
    } else {
      COUNTRIES.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
      });
    }
    countriesPopulated = true;
  }

  function applyCopy(options = {}) {
    const titleEl = document.getElementById('participation-title');
    const copyEl = document.getElementById('participation-copy')
      || document.querySelector('#participation-overlay .modal-copy');
    const postEvent = !!options.postEvent;
    if (titleEl) {
      titleEl.textContent = options.title
        || (postEvent ? POST_EVENT_TITLE : DEFAULT_TITLE);
    }
    if (copyEl) {
      copyEl.textContent = options.copy
        || (postEvent ? POST_EVENT_COPY : DEFAULT_COPY);
    }
  }

  function open(options = {}) {
    ensureMarkup();
    populateCountries();
    applyCopy(options);
    sessionOnSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : null;
    sessionOnCancel = typeof options.onCancel === 'function' ? options.onCancel : null;

    const user = WorldChoirDB.getCurrentUser();
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    const countryEl = document.getElementById('pledge-country');
    const cityEl = document.getElementById('pledge-city');
    if (countryEl) countryEl.value = pledge?.country || user.country || '';
    if (cityEl) cityEl.value = pledge?.city || user.city || '';

    const overlay = document.getElementById('participation-overlay');
    overlay?.classList.add('active');
    WorldChoirA11y?.syncOverlayState?.(overlay, true);
  }

  function close(options = {}) {
    const overlay = document.getElementById('participation-overlay');
    const wasActive = overlay?.classList.contains('active');
    overlay?.classList.remove('active');
    WorldChoirA11y?.syncOverlayState?.(overlay, false);
    const cancelCb = sessionOnCancel;
    sessionOnSuccess = null;
    sessionOnCancel = null;
    if (options.fromCancel && wasActive && typeof cancelCb === 'function') {
      try {
        cancelCb();
      } catch (err) {
        console.warn('WorldChoirParticipation onCancel failed:', err);
      }
    }
  }

  async function confirm() {
    ensureMarkup();
    const country = document.getElementById('pledge-country')?.value.trim() || '';
    const city = document.getElementById('pledge-city')?.value.trim() || '';
    if (!country || !city) {
      alert('Please select a country and enter your city.');
      return;
    }

    const btn = document.getElementById('participation-confirm');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Confirming…';
    }

    try {
      const pledge = await WorldChoirDB.createPledgeWithGeocode({ city, country });
      const cb = sessionOnSuccess || onSuccessCallback;
      sessionOnSuccess = null;
      sessionOnCancel = null;
      close();
      if (cb) {
        await cb(pledge, { city, country });
      }
    } catch (err) {
      console.error(err);
      const msg = err.message || '';
      const friendly = msg.includes('temporarily unavailable')
        ? 'We could not connect your voice right now. Please try again in a moment.'
        : (msg || 'Could not save participation. Please try again.');
      alert(friendly);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirm Participation';
      }
    }
  }

  function bindOnce() {
    if (bindOnce.bound) return;
    bindOnce.bound = true;

    document.getElementById('participation-confirm')?.addEventListener('click', confirm);
    document.getElementById('participation-cancel')?.addEventListener('click', () => close({ fromCancel: true }));
    document.getElementById('participation-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'participation-overlay') close({ fromCancel: true });
    });
  }

  function init(options = {}) {
    onSuccessCallback = options.onSuccess || null;
    ensureMarkup();
    populateCountries();
    bindOnce();
  }

  function triggerVoiceJoinedAnimation(pledge) {
    if (!pledge?.latitude || !pledge?.longitude) return;
    sessionStorage.setItem('wc_voice_joined', JSON.stringify({
      lat: pledge.latitude,
      lng: pledge.longitude,
      city: pledge.city,
      country: pledge.country,
    }));
  }

  return { init, open, close, confirm, triggerVoiceJoinedAnimation, ensureMarkup, COUNTRIES };
})();
