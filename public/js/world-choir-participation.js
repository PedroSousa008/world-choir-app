/**
 * World Choir — Shared participation modal (Home + Map)
 */
const WorldChoirParticipation = (() => {
  const COUNTRIES = WorldChoirCountries?.COUNTRIES || [];

  let onSuccessCallback = null;
  let countriesPopulated = false;

  function populateCountries() {
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

  function open() {
    populateCountries();
    const user = WorldChoirDB.getCurrentUser();
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    document.getElementById('pledge-country').value = pledge?.country || user.country || '';
    document.getElementById('pledge-city').value = pledge?.city || user.city || '';
    const overlay = document.getElementById('participation-overlay');
    overlay?.classList.add('active');
    WorldChoirA11y?.syncOverlayState?.(overlay, true);
  }

  function close() {
    const overlay = document.getElementById('participation-overlay');
    overlay?.classList.remove('active');
    WorldChoirA11y?.syncOverlayState?.(overlay, false);
  }

  async function confirm() {
    const country = document.getElementById('pledge-country').value.trim();
    const city = document.getElementById('pledge-city').value.trim();
    if (!country || !city) {
      alert('Please select a country and enter your city.');
      return;
    }

    const btn = document.getElementById('participation-confirm');
    btn.disabled = true;
    btn.textContent = 'Confirming…';

    try {
      const pledge = await WorldChoirDB.createPledgeWithGeocode({ city, country });
      close();
      if (onSuccessCallback) {
        await onSuccessCallback(pledge, { city, country });
      }
    } catch (err) {
      console.error(err);
      const msg = err.message || '';
      const friendly = msg.includes('temporarily unavailable')
        ? 'We could not connect your voice right now. Please try again in a moment.'
        : (msg || 'Could not save participation. Please try again.');
      alert(friendly);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirm Participation';
    }
  }

  function init(options = {}) {
    onSuccessCallback = options.onSuccess || null;
    populateCountries();

    document.getElementById('participation-confirm')?.addEventListener('click', confirm);
    document.getElementById('participation-cancel')?.addEventListener('click', close);
    document.getElementById('participation-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'participation-overlay') close();
    });
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

  return { init, open, close, confirm, triggerVoiceJoinedAnimation, COUNTRIES };
})();
