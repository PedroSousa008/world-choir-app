/**
 * ChangeLocationModal — manual city/country selection (no GPS)
 */
const ChangeLocationModal = (() => {
  const COUNTRIES = WorldChoirParticipation?.COUNTRIES || [
    'Portugal', 'United Kingdom', 'United States', 'Spain', 'France', 'Germany',
    'Brazil', 'Canada', 'Australia', 'Japan',
  ];

  let mode = 'change';
  let onSuccessCallback = null;
  let countriesPopulated = false;

  function populateCountries() {
    const sel = document.getElementById('location-country');
    if (!sel || countriesPopulated) return;
    COUNTRIES.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    countriesPopulated = true;
  }

  function open(options = {}) {
    populateCountries();
    mode = options.mode || 'change';
    onSuccessCallback = options.onSuccess || null;

    const user = WorldChoirDB.getCurrentUser();
    const pledge = WorldChoirDB.getPledgeForCurrentUser();

    document.getElementById('location-country').value = pledge?.country || user.country || '';
    document.getElementById('location-city').value = pledge?.city || user.city || '';

    const title = document.getElementById('location-modal-title');
    const copy = document.getElementById('location-modal-copy');
    const confirmBtn = document.getElementById('location-confirm');

    if (mode === 'pledge') {
      title.textContent = 'Where will you sing from?';
      copy.textContent =
        'Choose the city and country where you plan to join World Choir. You can change this later in your profile.';
      confirmBtn.textContent = 'Confirm Participation';
    } else {
      title.textContent = 'Change Participation Location';
      copy.textContent =
        'Update where you will sing from. Your light on the map will move to your new city.';
      confirmBtn.textContent = 'Save Location';
    }

    document.getElementById('change-location-overlay').classList.add('active');
  }

  function close() {
    document.getElementById('change-location-overlay')?.classList.remove('active');
  }

  async function confirm() {
    const country = document.getElementById('location-country').value.trim();
    const city = document.getElementById('location-city').value.trim();
    if (!country || !city) {
      alert('Please select a country and enter your city.');
      return;
    }

    const btn = document.getElementById('location-confirm');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      if (mode === 'pledge') {
        await WorldChoirDB.createPledgeWithGeocode({ city, country });
      } else {
        await WorldChoirDB.updateParticipationLocation({ city, country });
      }
      close();
      if (onSuccessCallback) await onSuccessCallback({ city, country, mode });
    } catch (err) {
      console.error(err);
      alert('Could not save location. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'pledge' ? 'Confirm Participation' : 'Save Location';
    }
  }

  function init() {
    populateCountries();
    document.getElementById('location-confirm')?.addEventListener('click', confirm);
    document.getElementById('location-cancel')?.addEventListener('click', close);
    document.getElementById('change-location-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'change-location-overlay') close();
    });
  }

  return { init, open, close, confirm };
})();
