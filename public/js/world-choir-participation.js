/**
 * World Choir — Shared participation modal (Home + Map)
 */
const WorldChoirParticipation = (() => {
  const COUNTRIES = [
    'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria', 'Belgium',
    'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Croatia', 'Czech Republic',
    'Denmark', 'Egypt', 'Finland', 'France', 'Germany', 'Greece', 'Hungary',
    'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Kenya',
    'Mexico', 'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway',
    'Philippines', 'Poland', 'Portugal', 'Romania', 'Russia', 'Saudi Arabia',
    'Singapore', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland',
    'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom',
    'United States', 'Vietnam',
  ];

  let onSuccessCallback = null;
  let countriesPopulated = false;

  function populateCountries() {
    const sel = document.getElementById('pledge-country');
    if (!sel || countriesPopulated) return;
    COUNTRIES.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    countriesPopulated = true;
  }

  function open() {
    populateCountries();
    const user = WorldChoirDB.getCurrentUser();
    const pledge = WorldChoirDB.getPledgeForCurrentUser();
    document.getElementById('pledge-country').value = pledge?.country || user.country || '';
    document.getElementById('pledge-city').value = pledge?.city || user.city || '';
    document.getElementById('participation-overlay').classList.add('active');
  }

  function close() {
    document.getElementById('participation-overlay').classList.remove('active');
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
      alert(err.message || 'Could not save participation. Please try again.');
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
