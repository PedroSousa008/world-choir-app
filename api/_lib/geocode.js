/**
 * Server-side city/country geocoding (Nominatim).
 * Browser calls to Nominatim are blocked (403) — join/update-location must use this.
 *
 * Rejects city/country mismatches (e.g. Madrid + Portugal) so Voices cannot be
 * saved with a city that is not in the selected country.
 */
const { geocodeAliases } = require('../../public/data/world-choir-countries.json');
const { resolveCountryIso2 } = require('./country-iso2');

const MISMATCH_MESSAGE =
  'That city is not in the selected country. Please enter a city that matches your country.';

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

function locationMismatchError(message = MISMATCH_MESSAGE) {
  const err = new Error(message);
  err.code = 'LOCATION_MISMATCH';
  return err;
}

function geocodeFailedError(message) {
  const err = new Error(message);
  err.code = 'GEOCODE_FAILED';
  return err;
}

function normalizePlaceName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function namesMatch(a, b) {
  const left = normalizePlaceName(a);
  const right = normalizePlaceName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // Allow "New York" ↔ "New York City", but not "Madrid" inside "Avenida de Madrid".
  if (left.startsWith(`${right} `) || right.startsWith(`${left} `)) return true;
  return false;
}

function addressCityFields(address = {}) {
  return [
    address.city,
    address.town,
    address.village,
    address.municipality,
  ].filter(Boolean);
}

function isPlaceLikeResult(row) {
  const cls = String(row?.class || '');
  const type = String(row?.type || '');
  if (cls === 'highway' || cls === 'amenity' || cls === 'building' || cls === 'shop') {
    return false;
  }
  // Only city-level places — reject squares/neighbourhoods named after other cities
  // (e.g. "Pariser Platz" for city=Paris&country=Germany).
  if (cls === 'place') {
    return ['city', 'town', 'village', 'hamlet', 'municipality', 'city_block', 'isolated_dwelling'].includes(type);
  }
  if (cls === 'boundary' && (type === 'administrative' || type === 'postal_code')) return true;
  return false;
}

function resultInCountry(row, expectedIso2) {
  if (!row || !expectedIso2) return false;
  const code = String(row.address?.country_code || '').trim().toUpperCase();
  return code === String(expectedIso2).toUpperCase();
}

function resultMatchesCityName(row, cityName) {
  if (!row || !cityName) return false;
  const address = row.address || {};
  if (addressCityFields(address).some((field) => namesMatch(field, cityName))) return true;
  if (namesMatch(row.name, cityName)) return true;
  const displayCity = String(row.display_name || '').split(',')[0];
  return namesMatch(displayCity, cityName);
}

async function nominatimSearch(extra = {}, limit = 5) {
  const search = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    limit: String(limit),
    ...extra,
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${search.toString()}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WorldChoirApp/1.0 (join; https://worldchoirapp.com)',
      },
    }
  );
  if (!res.ok) throw geocodeFailedError('Geocoding failed');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function pickCoords(rows, { expectedIso2, requireNameMatch, cityName }) {
  for (const row of rows) {
    if (!isPlaceLikeResult(row)) continue;
    if (expectedIso2 && !resultInCountry(row, expectedIso2)) continue;
    if (requireNameMatch && !resultMatchesCityName(row, cityName)) continue;
    const coords = finiteCoords(row.lat, row.lon);
    if (coords) return coords;
  }
  return null;
}

/**
 * Nominatim lookup constrained to the selected country.
 * Throws LOCATION_MISMATCH when the city exists elsewhere but not in that country.
 */
async function geocodeCityCountry(city, country) {
  const cityName = String(city || '').trim();
  const countryName = resolveGeocodeCountry(country);
  if (!cityName || !countryName) {
    throw geocodeFailedError('City and country are required');
  }

  const expectedIso2 = resolveCountryIso2(country) || resolveCountryIso2(countryName);

  let structured = [];
  try {
    const extra = { city: cityName, country: countryName };
    if (expectedIso2) extra.countrycodes = expectedIso2.toLowerCase();
    structured = await nominatimSearch(extra, 5);
  } catch (err) {
    if (err.code === 'GEOCODE_FAILED' || err.code === 'LOCATION_MISMATCH') throw err;
    throw geocodeFailedError('Could not locate that city right now. Please try again.');
  }

  // Structured city=+country= is authoritative (Lisbon → Lisboa is fine).
  const structuredHit = pickCoords(structured, {
    expectedIso2,
    requireNameMatch: false,
    cityName,
  });
  if (structuredHit) return structuredHit;

  // Free-text fallback: must match city name and country; reject streets.
  let freeText = [];
  try {
    const extra = { q: `${cityName}, ${countryName}` };
    if (expectedIso2) extra.countrycodes = expectedIso2.toLowerCase();
    freeText = await nominatimSearch(extra, 5);
  } catch {
    freeText = [];
  }
  const freeTextHit = pickCoords(freeText, {
    expectedIso2,
    requireNameMatch: true,
    cityName,
  });
  if (freeTextHit) return freeTextHit;

  // Is this city real in another country?
  let globalCity = [];
  try {
    globalCity = await nominatimSearch({ city: cityName }, 5);
  } catch {
    globalCity = [];
  }

  const existsElsewhere = globalCity.some((row) => {
    if (!isPlaceLikeResult(row)) return false;
    if (!expectedIso2) return false;
    const code = String(row.address?.country_code || '').trim().toUpperCase();
    return Boolean(code && code !== expectedIso2);
  });

  if (existsElsewhere) {
    throw locationMismatchError(
      `“${cityName}” does not appear to be in ${String(country).trim()}. Please enter a city in that country.`
    );
  }

  throw geocodeFailedError('Could not find that city. Check the spelling and try again.');
}

/**
 * Resolve coordinates for a city in a country.
 * Always verifies the city belongs to the selected country — client-provided
 * lat/lng are ignored so a mismatched city cannot be forced through.
 */
async function resolveCityCoordinates(city, country, _latitude = null, _longitude = null) {
  try {
    return await geocodeCityCountry(city, country);
  } catch (err) {
    if (err?.code === 'LOCATION_MISMATCH' || err?.code === 'GEOCODE_FAILED') throw err;
    throw geocodeFailedError('Could not locate that city right now. Please try again.');
  }
}

module.exports = {
  resolveGeocodeCountry,
  finiteCoords,
  geocodeCityCountry,
  resolveCityCoordinates,
  MISMATCH_MESSAGE,
};
