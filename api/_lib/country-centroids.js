/**
 * Country capital coordinates for sponsor analytics map fallbacks.
 */
const centroids = require('../data/country-centroids.json');
const { geocodeAliases } = require('../../public/data/world-choir-countries.json');

function normalizeCountryKey(country) {
  return String(country || '').trim().toLowerCase();
}

function lookupCountryCentroid(country) {
  const raw = String(country || '').trim();
  if (!raw) return null;

  const direct = centroids[normalizeCountryKey(raw)];
  if (direct) return direct;

  const alias = geocodeAliases?.[raw];
  if (alias) {
    const resolved = centroids[normalizeCountryKey(alias)];
    if (resolved) return resolved;
  }

  return null;
}

module.exports = {
  lookupCountryCentroid,
  normalizeCountryKey,
};
