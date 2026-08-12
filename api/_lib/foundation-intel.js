/**
 * Foundation Control Center intelligence — scoped to ONE foundationId.
 * Never returns other foundations' data. Never invents numbers.
 */
const { listAllPledges } = require('./store');
const {
  findInfluencerById,
  publicInfluencer,
  readDonationsLedger,
  PLATFORM_FEE_PERCENT,
} = require('./members-store');
const {
  readWorkspace,
  publicProject,
  publicUpdate,
  publicTeamMember,
  publicNotification,
  rolePermissions,
} = require('./foundation-workspace');

const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'paid']);
const EXCLUDED_STATUSES = new Set([
  'failed', 'cancelled', 'canceled', 'refunded', 'reversed',
  'fraudulent', 'pending', 'completed_mock', 'mock',
]);

function isSuccessfulDonation(d) {
  if (!d || d.mock === true) return false;
  const status = String(d.paymentStatus || '').toLowerCase();
  if (EXCLUDED_STATUSES.has(status)) return false;
  return SUCCESS_STATUSES.has(status);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function donationDate(d) {
  return parseDate(d.date || d.createdAt || d.created_at);
}

function donorKey(d) {
  return d.donorId || d.deviceId || d.userId || d.emailHash || d.id || null;
}

function cityKey(city, country) {
  return `${String(city || '').trim().toLowerCase()}|${String(country || '').trim().toLowerCase()}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeBounds(rangeKey) {
  const now = Date.now();
  const today = startOfToday().getTime();
  const map = {
    today: { from: today, to: now },
    '7d': { from: now - 7 * 86400000, to: now },
    '30d': { from: now - 30 * 86400000, to: now },
    '90d': { from: now - 90 * 86400000, to: now },
    '1y': { from: now - 365 * 86400000, to: now },
    all: { from: null, to: null },
  };
  return map[rangeKey] || map.all;
}

function inBounds(date, from, to) {
  if (!date) return false;
  const t = date.getTime();
  if (from != null && t < from) return false;
  if (to != null && t > to) return false;
  return true;
}

function filterByRange(donations, rangeKey) {
  const { from, to } = rangeBounds(rangeKey);
  if (from == null && to == null) return donations;
  return donations.filter((d) => inBounds(donationDate(d), from, to));
}

function sumAmounts(donations) {
  return donations.reduce((sum, d) => {
    const amount = Number(d.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
}

function uniqueDonors(donations) {
  const set = new Set();
  donations.forEach((d) => {
    const key = donorKey(d);
    if (key) set.add(String(key));
  });
  return set.size;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function bucketSeries(donations, mode = 'amount') {
  const map = new Map();
  donations.forEach((d) => {
    const date = donationDate(d);
    if (!date) return;
    const key = date.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, { date: key, amount: 0, count: 0, donors: new Set() });
    const row = map.get(key);
    const amount = Number(d.amount);
    if (Number.isFinite(amount) && amount > 0) row.amount += amount;
    row.count += 1;
    const dk = donorKey(d);
    if (dk) row.donors.add(String(dk));
  });
  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      amount: Math.round(row.amount * 100) / 100,
      donations: row.count,
      supporters: row.donors.size,
      value: mode === 'supporters' ? row.donors.size : (mode === 'donations' ? row.count : row.amount),
    }));
}

function buildPledgeIndex(pledges) {
  const byUser = new Map();
  pledges.forEach((p) => {
    const ids = [p.user_id, p.userId, p.device_id, p.deviceId].filter(Boolean);
    ids.forEach((id) => {
      byUser.set(String(id), p);
    });
  });
  return byUser;
}

/**
 * Resolve supporter location from donation fields or pledge join.
 * Never invents coordinates.
 */
function resolveLocation(donation, pledgeIndex) {
  const directCity = donation.city
    || donation.participationCity
    || donation.world_choir_city_name;
  const directCountry = donation.country
    || donation.participationCountry
    || donation.world_choir_country;
  let latitude = Number(donation.latitude);
  let longitude = Number(donation.longitude);
  let city = directCity ? String(directCity).trim() : '';
  let country = directCountry ? String(directCountry).trim() : '';

  if (!city || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const keys = [donation.userId, donation.deviceId, donation.donorId, donation.user_id]
      .filter(Boolean)
      .map(String);
    for (const key of keys) {
      const pledge = pledgeIndex.get(key);
      if (!pledge) continue;
      if (!city && pledge.city) city = String(pledge.city).trim();
      if (!country && pledge.country) country = String(pledge.country).trim();
      if (!Number.isFinite(latitude) && Number.isFinite(Number(pledge.latitude))) {
        latitude = Number(pledge.latitude);
      }
      if (!Number.isFinite(longitude) && Number.isFinite(Number(pledge.longitude))) {
        longitude = Number(pledge.longitude);
      }
      if (city && Number.isFinite(latitude) && Number.isFinite(longitude)) break;
    }
  }

  if (!city && !country) return null;
  return {
    city: city || 'Unknown city',
    country: country || 'Unknown country',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function buildGeography(donations, pledgeIndex) {
  const byCity = new Map();
  let located = 0;

  donations.forEach((d) => {
    const loc = resolveLocation(d, pledgeIndex);
    if (!loc) return;
    located += 1;
    const key = cityKey(loc.city, loc.country);
    if (!byCity.has(key)) {
      byCity.set(key, {
        city: loc.city,
        country: loc.country,
        latitudes: [],
        longitudes: [],
        donors: new Set(),
        amount: 0,
        donations: 0,
      });
    }
    const row = byCity.get(key);
    row.donations += 1;
    const amount = Number(d.amount);
    if (Number.isFinite(amount) && amount > 0) row.amount += amount;
    const dk = donorKey(d);
    if (dk) row.donors.add(String(dk));
    if (loc.latitude != null) row.latitudes.push(loc.latitude);
    if (loc.longitude != null) row.longitudes.push(loc.longitude);
  });

  const cities = Array.from(byCity.values())
    .map((row) => {
      const amounts = []; // for avg from totals
      const avg = row.donations > 0 ? row.amount / row.donations : null;
      return {
        city: row.city,
        country: row.country,
        supporters: row.donors.size,
        donations: row.donations,
        totalRaised: Math.round(row.amount * 100) / 100,
        averageDonation: avg != null ? Math.round(avg * 100) / 100 : null,
        latitude: row.latitudes.length
          ? row.latitudes.reduce((a, b) => a + b, 0) / row.latitudes.length
          : null,
        longitude: row.longitudes.length
          ? row.longitudes.reduce((a, b) => a + b, 0) / row.longitudes.length
          : null,
      };
    })
    .sort((a, b) => b.totalRaised - a.totalRaised || b.supporters - a.supporters);

  const byCountry = new Map();
  cities.forEach((c) => {
    const key = String(c.country).toLowerCase();
    if (!byCountry.has(key)) {
      byCountry.set(key, {
        country: c.country,
        supporters: 0,
        donations: 0,
        totalRaised: 0,
        cities: 0,
      });
    }
    const row = byCountry.get(key);
    row.supporters += c.supporters;
    row.donations += c.donations;
    row.totalRaised += c.totalRaised;
    row.cities += 1;
  });

  const countries = Array.from(byCountry.values())
    .map((r) => ({ ...r, totalRaised: Math.round(r.totalRaised * 100) / 100 }))
    .sort((a, b) => b.totalRaised - a.totalRaised || b.supporters - a.supporters);

  const mapPoints = cities
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({
      city: c.city,
      country: c.country,
      latitude: c.latitude,
      longitude: c.longitude,
      count: c.supporters,
      voices: c.supporters,
      donors: c.supporters,
      raised: c.totalRaised,
      currency: 'EUR',
    }));

  return {
    cities: cities.map((c, i) => ({ ...c, rank: i + 1 })),
    countries: countries.map((c, i) => ({ ...c, rank: i + 1 })),
    mapPoints,
    locatedDonations: located,
    unlocatedDonations: Math.max(0, donations.length - located),
    note: donations.length === 0
      ? 'No verified donations yet for this Foundation.'
      : (mapPoints.length === 0
        ? 'Donation geography appears when supporters have a linked participation city.'
        : null),
  };
}

function privacySafeDonation(d, index) {
  const amount = Number(d.amount);
  const anonymous = d.donor_anonymous === true || d.donorAnonymous === true;
  const displayName = String(d.donor_display_name || d.donorDisplayName || '').trim();
  const shareIdentity = !anonymous && !!displayName && displayName.toLowerCase() !== 'anonymous';
  return {
    id: d.id || `d-${index}`,
    date: (donationDate(d) || new Date(0)).toISOString(),
    amount: Number.isFinite(amount) ? amount : 0,
    currency: d.currency || 'EUR',
    projectId: d.projectId || null,
    city: d.city || d.participationCity || d.world_choir_city_name || null,
    country: d.country || d.participationCountry || d.world_choir_country || null,
    isNewSupporter: d.isNewSupporter === true,
    isReturning: d.isReturning === true,
    supporterLabel: shareIdentity ? displayName : 'Anonymous Supporter',
    message: d.message || '',
    isTest: d.is_test === true || d.isTest === true,
  };
}

function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function comparePeriods(donations, rangeKey) {
  if (!rangeKey || rangeKey === 'all' || rangeKey === 'today') {
    return { available: false, reason: 'Not enough historical data.' };
  }
  const { from, to } = rangeBounds(rangeKey);
  if (from == null) return { available: false, reason: 'Not enough historical data.' };
  const span = to - from;
  const prevFrom = from - span;
  const prevTo = from;
  const current = donations.filter((d) => inBounds(donationDate(d), from, to));
  const previous = donations.filter((d) => inBounds(donationDate(d), prevFrom, prevTo));
  if (!previous.length) {
    return { available: false, reason: 'Not enough historical data.' };
  }
  const curAmt = sumAmounts(current);
  const prevAmt = sumAmounts(previous);
  const curSup = uniqueDonors(current);
  const prevSup = uniqueDonors(previous);
  return {
    available: true,
    raisedChangePct: pctChange(curAmt, prevAmt),
    supportersChangePct: pctChange(curSup, prevSup),
    donationsChangePct: pctChange(current.length, previous.length),
  };
}

function todaySummary(donations, geoCities, projects, updates) {
  const from = startOfToday().getTime();
  const to = Date.now();
  const todayDonations = donations.filter((d) => inBounds(donationDate(d), from, to));
  const raised = sumAmounts(todayDonations);
  const supporters = uniqueDonors(todayDonations);
  // Cities newly seen today among located donations — only if we can attribute
  const items = [];
  if (raised > 0) items.push({ key: 'raised', label: 'donated', value: raised });
  if (supporters > 0) items.push({ key: 'supporters', label: 'new supporters', value: supporters });
  const publishedToday = projects.filter((p) => {
    const t = parseDate(p.publishedAt);
    return t && inBounds(t, from, to);
  }).length;
  if (publishedToday > 0) items.push({ key: 'projects', label: 'projects published', value: publishedToday });
  const updatesToday = updates.filter((u) => {
    const t = parseDate(u.publishedAt);
    return t && inBounds(t, from, to);
  }).length;
  if (updatesToday > 0) items.push({ key: 'updates', label: 'updates published', value: updatesToday });

  return {
    items,
    empty: items.length === 0,
    message: items.length === 0 ? 'No new Foundation activity today.' : null,
  };
}

function buildActivityFeed(donations, workspace) {
  const feed = [];

  donations.slice(0, 40).forEach((d, i) => {
    const amount = Number(d.amount);
    feed.push({
      id: `don-${d.id || i}`,
      type: 'donations',
      label: 'New donation received',
      detail: Number.isFinite(amount)
        ? `${amount} ${d.currency || 'EUR'}`
        : 'Donation recorded',
      at: (donationDate(d) || new Date(0)).toISOString(),
    });
  });

  (workspace.activity || []).forEach((a) => {
    let type = 'foundation';
    if (String(a.action || '').includes('project')) type = 'projects';
    if (String(a.action || '').includes('update')) type = 'updates';
    feed.push({
      id: a.id,
      type,
      label: a.label,
      detail: a.detail || '',
      at: a.at,
      actor: a.actor,
    });
  });

  return feed
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 60);
}

/**
 * Build full Foundation Control Center payload for ONE foundation.
 */
async function buildFoundationControlCenter(foundationId, { range = 'all', role = 'owner' } = {}) {
  if (!foundationId) {
    return { ok: false, error: 'Foundation id required' };
  }

  const [influencer, ledger, pledges, workspace] = await Promise.all([
    findInfluencerById(foundationId),
    readDonationsLedger(),
    listAllPledges().catch(() => []),
    readWorkspace(foundationId),
  ]);

  if (!influencer || influencer.active === false) {
    return { ok: false, error: 'Foundation not found' };
  }

  // HARD isolation — only this foundation's donations
  const foundationDonations = ledger.filter(
    (d) => d.foundationId === foundationId && isSuccessfulDonation(d)
  );

  const ranged = filterByRange(foundationDonations, range);
  const amounts = ranged
    .map((d) => Number(d.amount))
    .filter((n) => Number.isFinite(n) && n > 0);

  const pledgeIndex = buildPledgeIndex(pledges);
  const geography = buildGeography(ranged, pledgeIndex);

  const projects = (workspace.projects || []).map(publicProject);
  const activeProjects = projects.filter((p) => p.status === 'active');
  const updates = (workspace.updates || []).map(publicUpdate);
  const team = (workspace.team || []).map(publicTeamMember);
  const notifications = (workspace.notifications || []).map(publicNotification);

  // Attach real raised-to-project when projectId present
  const raisedByProject = new Map();
  foundationDonations.forEach((d) => {
    if (!d.projectId) return;
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    raisedByProject.set(d.projectId, (raisedByProject.get(d.projectId) || 0) + amount);
  });
  const projectsWithFunding = projects.map((p) => ({
    ...p,
    fundingRaised: Math.round((raisedByProject.get(p.id) || 0) * 100) / 100,
  }));

  const totalRaised = Math.round(sumAmounts(ranged) * 100) / 100;
  const totalSupporters = uniqueDonors(ranged);
  const allTimeRaised = Math.round(sumAmounts(foundationDonations) * 100) / 100;
  const allTimeSupporters = uniqueDonors(foundationDonations);

  // Returning supporters: donors with >1 donation in scoped set
  const donorCounts = new Map();
  ranged.forEach((d) => {
    const key = donorKey(d);
    if (!key) return;
    donorCounts.set(String(key), (donorCounts.get(String(key)) || 0) + 1);
  });
  let repeatSupporters = 0;
  donorCounts.forEach((count) => {
    if (count > 1) repeatSupporters += 1;
  });
  const newSupporters = Math.max(0, totalSupporters - repeatSupporters);

  const comparison = comparePeriods(foundationDonations, range);
  const today = todaySummary(foundationDonations, geography.cities, projectsWithFunding, updates);
  const activity = buildActivityFeed(
    [...foundationDonations].sort((a, b) => String(donationDate(b) || 0).localeCompare(String(donationDate(a) || 0))),
    workspace
  );

  const profile = publicInfluencer(influencer);
  // Platform-owned verification — never editable by Foundation
  const verificationStatus = influencer.verificationStatus || 'unverified';

  const unavailable = [];
  if (!foundationDonations.length) {
    unavailable.push('Donation analytics will populate when verified payments are recorded.');
  }
  if (!geography.mapPoints.length) {
    unavailable.push('Map support locations require donations linked to participation cities.');
  }
  unavailable.push('Page view / conversion funnel tracking is not connected yet.');
  unavailable.push('Discovery attribution sources are not tracked yet.');
  unavailable.push('Payout balances are not connected yet.');
  unavailable.push('Two-factor authentication is not enabled yet.');

  return {
    ok: true,
    currency: 'EUR',
    range,
    role,
    permissions: rolePermissions(role),
    foundation: {
      id: profile.id,
      name: profile.foundationName || `${profile.displayName}'s Foundation`,
      creatorName: profile.displayName,
      country: profile.country,
      category: profile.primaryCategory,
      mission: profile.mission,
      biography: profile.biography,
      whyStarted: profile.whyStarted,
      howItWorks: profile.howItWorks,
      shortDescription: influencer.shortDescription || '',
      story: influencer.story || influencer.biography || '',
      website: influencer.website || '',
      socialLinks: influencer.socialLinks || {},
      profileImage: influencer.profileImage || '',
      coverImage: influencer.coverImage || '',
      cardShortMission: influencer.cardShortMission || influencer.mission || '',
      email: profile.email,
      active: profile.active,
      published: profile.published,
      verificationStatus,
      foundedAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
    overview: {
      totalRaised: allTimeRaised,
      totalSupporters: allTimeSupporters,
      totalDonations: foundationDonations.length,
      activeProjects: activeProjects.length,
      countriesReached: geography.countries.length,
      citiesReached: geography.cities.length,
      rangedRaised: totalRaised,
      rangedSupporters: totalSupporters,
      rangedDonations: ranged.length,
    },
    today,
    growth: {
      series: {
        amount: bucketSeries(ranged, 'amount'),
        donations: bucketSeries(ranged, 'donations'),
        supporters: bucketSeries(ranged, 'supporters'),
      },
      comparison,
      projectGrowth: projectsWithFunding
        .filter((p) => p.createdAt)
        .map((p) => ({ date: String(p.createdAt).slice(0, 10), status: p.status })),
    },
    activity,
    donations: {
      totalRaised: allTimeRaised,
      totalSupporters: allTimeSupporters,
      totalDonations: foundationDonations.length,
      newSupporters,
      repeatSupporters,
      averageDonation: average(amounts) != null ? Math.round(average(amounts) * 100) / 100 : null,
      medianDonation: median(amounts) != null ? Math.round(median(amounts) * 100) / 100 : null,
      conversionRate: null,
      conversionNote: 'Conversion rate requires Foundation page view tracking.',
      timeline: bucketSeries(ranged, 'amount'),
      explorer: ranged
        .slice()
        .sort((a, b) => String(donationDate(b) || 0).localeCompare(String(donationDate(a) || 0)))
        .slice(0, 100)
        .map(privacySafeDonation),
      platformFeePercent: PLATFORM_FEE_PERCENT,
      foundationSharePercent: 100 - PLATFORM_FEE_PERCENT,
    },
    geography,
    community: {
      totalSupporters: allTimeSupporters,
      newSupporters,
      returningSupporters: repeatSupporters,
      countriesReached: geography.countries.length,
      citiesReached: geography.cities.length,
      topCountries: geography.countries.slice(0, 8),
      topCities: geography.cities.slice(0, 8),
      discovery: {
        available: false,
        note: 'Discovery attribution is not tracked yet.',
        sources: [],
      },
    },
    insights: {
      growth: bucketSeries(foundationDonations, 'amount'),
      locationLeaders: {
        bySupporters: [...geography.cities].sort((a, b) => b.supporters - a.supporters).slice(0, 10),
        byRaised: [...geography.cities].sort((a, b) => b.totalRaised - a.totalRaised).slice(0, 10),
      },
      conversionFunnel: {
        available: false,
        note: 'Funnel stages are not tracked yet.',
        stages: [],
      },
      contentPerformance: {
        available: false,
        note: 'Content performance tracking is not connected yet.',
      },
    },
    projects: projectsWithFunding,
    updates,
    team,
    notifications,
    drafts: workspace.drafts || { page: null, card: null },
    financial: {
      available: false,
      note: 'Payout accounts and balances are not connected yet.',
      payoutAccount: null,
      availableBalance: null,
      pendingBalance: null,
      paidOut: null,
      history: [],
    },
    verification: {
      status: verificationStatus,
      note: verificationStatus === 'verified'
        ? 'This Foundation is verified by World Choir.'
        : 'Verification is managed by World Choir. Status updates appear here when reviewed.',
      required: [],
      documents: Array.isArray(influencer.verificationDocuments) ? influencer.verificationDocuments : [],
    },
    security: {
      twoFactor: false,
      twoFactorNote: 'Two-factor authentication is not enabled yet.',
      activeSessions: null,
      loginHistory: [],
    },
    unavailableCapabilities: unavailable,
    map: {
      mode: 'foundation_support',
      foundationId,
      points: geography.mapPoints,
      note: geography.note,
    },
  };
}

function searchFoundationControlCenter(data, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !data?.ok) {
    return { projects: [], updates: [], cities: [], countries: [], team: [], settings: [] };
  }

  const match = (text) => String(text || '').toLowerCase().includes(q);

  return {
    projects: (data.projects || []).filter((p) => match(p.title) || match(p.country) || match(p.location)),
    updates: (data.updates || []).filter((u) => match(u.title) || match(u.body)),
    cities: (data.geography?.cities || []).filter((c) => match(c.city) || match(c.country)),
    countries: (data.geography?.countries || []).filter((c) => match(c.country)),
    team: (data.team || []).filter((t) => match(t.name) || match(t.email) || match(t.role)),
    settings: match(data.foundation?.name) || match(data.foundation?.creatorName)
      ? [{ type: 'foundation', label: data.foundation.name }]
      : [],
  };
}

module.exports = {
  buildFoundationControlCenter,
  searchFoundationControlCenter,
  isSuccessfulDonation,
};
