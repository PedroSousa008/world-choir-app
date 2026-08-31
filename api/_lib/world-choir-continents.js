/**
 * World Choir — country → continent mapping for Passport global milestones.
 * Uses the same country names as the pledge country selector.
 */
const REQUIRED_CONTINENTS = ['africa', 'america', 'asia', 'europe', 'oceania'];

const COUNTRY_TO_CONTINENT = {
  Afghanistan: 'asia',
  Albania: 'europe',
  Algeria: 'africa',
  Argentina: 'america',
  Australia: 'oceania',
  Austria: 'europe',
  Belgium: 'europe',
  Brazil: 'america',
  Canada: 'america',
  Chile: 'america',
  China: 'asia',
  Colombia: 'america',
  Croatia: 'europe',
  'Czech Republic': 'europe',
  Denmark: 'europe',
  Egypt: 'africa',
  Finland: 'europe',
  France: 'europe',
  Germany: 'europe',
  Greece: 'europe',
  Hungary: 'europe',
  India: 'asia',
  Indonesia: 'asia',
  Ireland: 'europe',
  Israel: 'asia',
  Italy: 'europe',
  Japan: 'asia',
  Kenya: 'africa',
  Mexico: 'america',
  Morocco: 'africa',
  Netherlands: 'europe',
  'New Zealand': 'oceania',
  Nigeria: 'africa',
  Norway: 'europe',
  Philippines: 'asia',
  Poland: 'europe',
  Portugal: 'europe',
  Romania: 'europe',
  Russia: 'europe',
  'Saudi Arabia': 'asia',
  Singapore: 'asia',
  'South Africa': 'africa',
  'South Korea': 'asia',
  Spain: 'europe',
  Sweden: 'europe',
  Switzerland: 'europe',
  Thailand: 'asia',
  Turkey: 'europe',
  Ukraine: 'europe',
  'United Arab Emirates': 'asia',
  'United Kingdom': 'europe',
  'United States': 'america',
  Vietnam: 'asia',
};

const NORMALIZED_COUNTRY_TO_CONTINENT = Object.fromEntries(
  Object.entries(COUNTRY_TO_CONTINENT).map(([country, continent]) => [
    String(country).trim().toLowerCase(),
    continent,
  ])
);

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
