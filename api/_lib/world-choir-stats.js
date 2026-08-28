const ROOT = 'wc-data';

/** Global milestone definitions — extend for 150 countries, 1M voices, etc. */
const GLOBAL_MILESTONE_DEFINITIONS = [
  { id: '100-countries', metric: 'countries', threshold: 100 },
];

function milestonesPath(eventId) {
  return `${ROOT}/${String(eventId).trim()}/milestones.json`;
}

function normalizeCountry(country) {
  return String(country || '').trim();
}

function normalizeCity(city) {
  return String(city || '').trim();
}

/** Unique pledged voices with valid city + country (same rules as map stats). */
function computeStatsFromPledges(pledges) {
  const seenUsers = new Set();
  const unique = [];

  for (const pledge of pledges || []) {
    if (!pledge?.user_id || seenUsers.has(pledge.user_id)) continue;
    seenUsers.add(pledge.user_id);
    unique.push(pledge);
  }

  const withLocation = unique.filter(
    (p) => normalizeCity(p.city) && normalizeCountry(p.country)
  );
  const cities = new Set(
    withLocation.map((p) => `${normalizeCity(p.city)}|${normalizeCountry(p.country)}`)
  );
  const countries = new Set(withLocation.map((p) => normalizeCountry(p.country)));

  return {
    voices: unique.length,
    cities: cities.size,
    countries: countries.size,
  };
}

function reconcileMilestoneState(stats, existingMilestones = {}) {
  const milestones = {};
  const now = new Date().toISOString();

  for (const def of GLOBAL_MILESTONE_DEFINITIONS) {
    const prev = existingMilestones[def.id];
    const value = Number(stats?.[def.metric]) || 0;

    if (prev?.reached === true) {
      milestones[def.id] = { ...prev };
      continue;
    }

    if (value >= def.threshold) {
      milestones[def.id] = {
        id: def.id,
        metric: def.metric,
        threshold: def.threshold,
        reached: true,
        reachedAt: now,
        valueAtReach: value,
      };
    } else {
      milestones[def.id] = {
        id: def.id,
        metric: def.metric,
        threshold: def.threshold,
        reached: false,
        reachedAt: null,
        currentValue: value,
      };
    }
  }

  return milestones;
}

async function readMilestones(eventId) {
  const { readBlobJson } = require('./store');
  try {
    const doc = await readBlobJson(milestonesPath(eventId));
    if (doc && typeof doc === 'object') return doc;
  } catch {
    /* first run */
  }
  return null;
}

async function updateMilestonesForEvent(eventId, stats) {
  const { writeJson } = require('./store');
  const existing = await readMilestones(eventId);
  const milestones = reconcileMilestoneState(stats, existing?.milestones || {});

  const snapshot = {
    updated_at: new Date().toISOString(),
    stats,
    milestones,
  };

  await writeJson(milestonesPath(eventId), snapshot, { overwrite: true });
  return snapshot;
}

async function getWorldChoirStats(eventId) {
  const trimmedEvent = String(eventId).trim();
  let milestoneDoc = await readMilestones(trimmedEvent);

  if (!milestoneDoc?.stats) {
    const { listPledges } = require('./store');
    const pledges = await listPledges(trimmedEvent);
    const stats = computeStatsFromPledges(pledges);
    milestoneDoc = await updateMilestonesForEvent(trimmedEvent, stats);
  }

  return {
    eventId: trimmedEvent,
    updated_at: milestoneDoc.updated_at || null,
    voices: milestoneDoc.stats?.voices ?? 0,
    cities: milestoneDoc.stats?.cities ?? 0,
    countries: milestoneDoc.stats?.countries ?? 0,
    representedCountryCount: milestoneDoc.stats?.countries ?? 0,
    milestones: milestoneDoc.milestones || {},
  };
}

module.exports = {
  GLOBAL_MILESTONE_DEFINITIONS,
  computeStatsFromPledges,
  reconcileMilestoneState,
  readMilestones,
  updateMilestonesForEvent,
  getWorldChoirStats,
  milestonesPath,
};
