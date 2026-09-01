const {
  findUserByDevice,
  readPledge,
  readBlobJson,
  getWorldChoirStats,
} = require('./store');
const { getImpact } = require('./daily-peace');
const { hasSupportedCreatorCause } = require('./donations');
const { EVENT_ID } = require('./wallet/wallet-store');

const MAJOR_CITY_VOICE_THRESHOLD = 50_000;
const REQUIRED_DAILY_ACTS_405_COUNT = 405;
const REQUIRED_PEACE_THEME_COUNT = 8;
const REQUIRED_PLEDGE_DAYS_1_YEAR = 365;
const REQUIRED_CONTINENTS = ['africa', 'america', 'asia', 'europe', 'oceania'];

function promisePath(userId, eventId) {
  return `wc-data/promises/${userId}/${eventId}.json`;
}

async function readPromise(userId, eventId) {
  try {
    return await readBlobJson(promisePath(userId, eventId));
  } catch {
    return null;
  }
}

function formatVoiceNumber(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  return `#${Number(n).toLocaleString('en-US')}`;
}

function formatMemberSince(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function normalizeCityKey(city, country) {
  return `${String(city || '').trim().toLowerCase()}|${String(country || '').trim().toLowerCase()}`;
}

function isMapPioneerActive(pledge) {
  if (!pledge?.map_pioneer_for_country || !pledge?.country) return false;
  return String(pledge.map_pioneer_for_country).trim().toLowerCase()
    === String(pledge.country).trim().toLowerCase();
}

function eventParticipationCompleted(eventDateUTC) {
  if (!eventDateUTC) return false;
  const eventEnd = new Date(eventDateUTC);
  if (Number.isNaN(eventEnd.getTime())) return false;
  eventEnd.setUTCDate(eventEnd.getUTCDate() + 1);
  return Date.now() >= eventEnd.getTime();
}

function countUnlockedStamps(context) {
  let count = 0;
  const {
    pledge,
    promise,
    worldStats,
    dailyActsCompleted,
    hasCompletedPartnerDailyAct,
    hasCompletedAllPeaceThemes,
    hasSupportedCreatorCause: creatorCause,
    pledgedAt,
  } = context;

  if (pledge) count += 1; // Your Voice Joined
  if (pledge && eventParticipationCompleted('2027-09-21T16:00:00.000Z')) count += 1;
  if (pledge && (worldStats?.milestones?.['100-countries']?.reached)) count += 1;
  if (pledge && (worldStats?.milestones?.['1-million-voices']?.reached)) count += 1;
  if (pledge && REQUIRED_CONTINENTS.every((c) => (worldStats?.representedContinents || []).includes(c))) count += 1;
  if (pledge && isMapPioneerActive(pledge)) count += 1;
  if (pledge && promise) count += 1;
  if (pledge && (worldStats?.majorCities || []).includes(normalizeCityKey(pledge.city, pledge.country))) count += 1;
  if (creatorCause) count += 1;
  if (hasCompletedPartnerDailyAct) count += 1;
  if (dailyActsCompleted >= REQUIRED_DAILY_ACTS_405_COUNT) count += 1;
  if (hasCompletedAllPeaceThemes) count += 1;
  if (pledge && pledgedAt) {
    const pledgedMs = new Date(pledgedAt).getTime();
    if (!Number.isNaN(pledgedMs)) {
      const days = Math.floor((Date.now() - pledgedMs) / (24 * 60 * 60 * 1000));
      if (days >= REQUIRED_PLEDGE_DAYS_1_YEAR) count += 1;
    }
  }
  return count;
}

async function loadPassportDataForDevice(deviceId) {
  const trimmedDevice = String(deviceId || '').trim();
  if (!trimmedDevice) {
    const err = new Error('deviceId required');
    err.statusCode = 400;
    throw err;
  }

  const user = await findUserByDevice(trimmedDevice);
  if (!user?.id) {
    const err = new Error('World Choir account not found');
    err.statusCode = 404;
    throw err;
  }

  const pledge = await readPledge(EVENT_ID, user.id);
  if (!pledge) {
    const err = new Error('Join World Choir to receive your Passport');
    err.statusCode = 403;
    throw err;
  }

  const [impactResult, worldStats, promise, creatorCause] = await Promise.all([
    getImpact(trimmedDevice).catch(() => null),
    getWorldChoirStats(EVENT_ID).catch(() => null),
    readPromise(user.id, EVENT_ID),
    hasSupportedCreatorCause({ deviceId: trimmedDevice, userId: user.id }).catch(() => false),
  ]);

  const summary = impactResult?.summary || {};
  const dailyActsCompleted = Number(summary.totalCompleted) || 0;
  const hasCompletedPartnerDailyAct = summary.hasCompletedPartnerDailyAct === true
    || Number(summary.partnerDailyActsCompleted) >= 1;
  const hasCompletedAllPeaceThemes = summary.hasCompletedAllPeaceThemes === true
    || Number(summary.themesExperienced ?? summary.categoriesExperienced) >= REQUIRED_PEACE_THEME_COUNT;

  const userCityVoiceCount = (() => {
    const city = pledge.city;
    const country = pledge.country;
    if (!city || !country) return 0;
    const key = normalizeCityKey(city, country);
    const major = (worldStats?.majorCities || []).includes(key);
    if (major) return MAJOR_CITY_VOICE_THRESHOLD;
    return 0;
  })();

  const stampsEarned = countUnlockedStamps({
    pledge,
    promise,
    worldStats,
    dailyActsCompleted,
    hasCompletedPartnerDailyAct,
    hasCompletedAllPeaceThemes,
    hasSupportedCreatorCause: creatorCause === true,
    pledgedAt: pledge.pledged_at || user.created_at,
    userCityVoiceCount,
  });

  const eventsJoined = 1;

  return {
    userId: user.id,
    deviceId: trimmedDevice,
    voiceNumber: pledge.voice_number,
    voiceNumberFormatted: formatVoiceNumber(pledge.voice_number),
    voiceName: pledge.voice_name || `Voice ${pledge.voice_number}`,
    displayName: pledge.voice_name || null,
    country: pledge.country || null,
    city: pledge.city || null,
    memberSince: user.created_at || pledge.pledged_at || null,
    memberSinceFormatted: formatMemberSince(user.created_at || pledge.pledged_at),
    eventsJoined,
    dailyActsCompleted,
    stampsEarned,
    eventTitle: 'World Choir 2027',
    hasJoined: true,
  };
}

async function loadPublicPassportByUserId(userId) {
  const trimmed = String(userId || '').trim();
  if (!trimmed) return null;

  const pledge = await readPledge(EVENT_ID, trimmed);
  if (!pledge) return null;

  return {
    voiceNumberFormatted: formatVoiceNumber(pledge.voice_number),
    country: pledge.country || null,
    city: pledge.city || null,
    eventTitle: 'World Choir 2027',
    memberSinceFormatted: formatMemberSince(pledge.pledged_at),
  };
}

module.exports = {
  loadPassportDataForDevice,
  loadPublicPassportByUserId,
  formatVoiceNumber,
  formatMemberSince,
};
