/**
 * Server-side city/country geocoding (Nominatim).
 * Browser calls to Nominatim are blocked (403) — join/update-location must use this.
 */
const { geocodeAliases } = require('../../public/data/world-choir-countries.json');
const { lookupCountryCentroid } = require('./country-centroids');

function resolveGeocodeCountry(country) {
  const key = String(country || '').trim();
  if (!key) return '';
  return geocodeAliases?.[key] || key;
}

function finiteCoords(latitude, longitude) {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') {
    return null;
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  // Number(null) === 0 — never treat missing values as the Gulf of Guinea.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * Nominatim lookup. Throws on failure.
 */
async function geocodeCityCountry(city, country) {
  const cityName = String(city || '').trim();
  const countryName = resolveGeocodeCountry(country);
  if (!cityName || !countryName) {
    throw new Error('City and country are required');
  }

  const q = encodeURIComponent(`${cityName}, ${countryName}`);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WorldChoirApp/1.0 (join; https://worldchoirapp.com)',
      },
    }
  );
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('City not found');
  const coords = finiteCoords(data[0].lat, data[0].lon);
  if (!coords) throw new Error('Invalid geocode result');
  return coords;
}

/**
 * Prefer valid provided coords; otherwise geocode; last resort country centroid.
 * @returns {{ latitude: number, longitude: number }}
 */
async function resolveCityCoordinates(city, country, latitude = null, longitude = null) {
  const provided = finiteCoords(latitude, longitude);
  if (provided) return provided;

  try {
    return await geocodeCityCountry(city, country);
  } catch (err) {
    const centroid = lookupCountryCentroid(country);
    const fallback = finiteCoords(centroid?.latitude, centroid?.longitude);
    if (fallback) return fallback;
    const message = err?.message || 'Could not locate that city';
    const wrapped = new Error(
      message === 'City not found'
        ? 'Could not find that city. Check the spelling and try again.'
        : 'Could not locate that city right now. Please try again.'
    );
    wrapped.code = 'GEOCODE_FAILED';
    throw wrapped;
  }
}

module.exports = {
  resolveGeocodeCountry,
  finiteCoords,
  geocodeCityCountry,
  resolveCityCoordinates,
};
