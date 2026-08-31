/**
 * World Choir — country → continent mapping for Passport global milestones.
 * Uses the same country names as the pledge country selector.
 */
const {
  continents: COUNTRY_TO_CONTINENT,
  legacyContinentAliases = {},
} = require('../../public/data/world-choir-countries.json');

const REQUIRED_CONTINENTS = ['africa', 'america', 'asia', 'europe', 'oceania'];

const NORMALIZED_COUNTRY_TO_CONTINENT = Object.fromEntries(
  Object.entries(COUNTRY_TO_CONTINENT).map(([country, continent]) => [
    String(country).trim().toLowerCase(),
    continent,
  ])
);

Object.entries(legacyContinentAliases).forEach(([country, continent]) => {
  NORMALIZED_COUNTRY_TO_CONTINENT[country] = continent;
});

function getContinentForCountry(country) {
  const key = String(country || '').trim().toLowerCase();
  if (!key) return null;
  return NORMALIZED_COUNTRY_TO_CONTINENT[key] || null;
}

function hasEveryContinent(representedContinents = []) {
  const set = new Set(
    representedContinents
      .map((continent) => String(continent || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return REQUIRED_CONTINENTS.every((continent) => set.has(continent));
}

function computeRepresentedContinentsFromPledges(pledges = []) {
  const seenUsers = new Set();
  const continents = new Set();

  for (const pledge of pledges) {
    if (!pledge?.user_id || seenUsers.has(pledge.user_id)) continue;
    seenUsers.add(pledge.user_id);
    if (!pledge.country) continue;

    const continent = getContinentForCountry(pledge.country);
    if (continent) continents.add(continent);
  }

  return Array.from(continents).sort();
}

module.exports = {
  REQUIRED_CONTINENTS,
  COUNTRY_TO_CONTINENT,
  getContinentForCountry,
  hasEveryContinent,
  computeRepresentedContinentsFromPledges,
};
