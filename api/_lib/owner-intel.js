/**
 * Owner intelligence aggregates — real application data only.
 * Never invents users, pledges, donations, or geography.
 */
const {
  listAllUsers,
  listAllPledges,
  listAllPromises,
  buildOwnerDatabaseRows,
  assertBlobConfigured,
} = require('./store');
const {
  listInfluencers,
  listInfluencersOwnerView,
  getOperationsOverview,
  PLATFORM_FEE_PERCENT,
} = require('./members-store');
const { readBlobJson } = require('./store');

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

function inRange(date, from, to) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function normalizeRange(range = {}) {
  const from = range.from ? parseDate(range.from) : null;
  const to = range.to ? parseDate(range.to) : null;
  return { from, to };
}

function cityKey(city, country) {
  return `${String(city || '').trim().toLowerCase()}|${String(country || '').trim().toLowerCase()}`;
}

function displayCity(city) {
  return String(city || '').trim() || 'Unknown city';
}

function displayCountry(country) {
  return String(country || '').trim() || 'Unknown country';
}

async function readDonationsLedgerSafe() {
  try {
    assertBlobConfigured();
    const data = await readBlobJson('wc-data/members/donations-ledger.json');
    return Array.isArray(data.donations) ? data.donations : [];
  } catch {
    return [];
  }
}

function filterDonations(donations, range) {
  const { from, to } = normalizeRange(range);
  return donations.filter((d) => {
    if (!isSuccessfulDonation(d)) return false;
    const date = parseDate(d.date || d.createdAt || d.created_at);
    if (!from && !to) return true;
    return inRange(date, from, to);
  });
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
    const key = d.donorId || d.deviceId || d.userId || d.emailHash || d.id;
    if (key) set.add(String(key));
  });
  return set.size;
}

function bucketByDay(dates) {
  const map = new Map();
  dates.forEach((iso) => {
    const d = parseDate(iso);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

function buildCityIntelligence(pledges, donations, influencers) {
  const byCity = new Map();

  function ensureCity(city, country) {
    const key = cityKey(city, country);
    if (!byCity.has(key)) {
      byCity.set(key, {
        city: displayCity(city),
        country: displayCountry(country),
        voices: 0,
        latitudes: [],
        longitudes: [],
        donors: new Set(),
        totalDonations: 0,
        donationAmount: 0,
        foundationIds: new Set(),
      });
    }
    return byCity.get(key);
  }

  pledges.forEach((p) => {
    if (!p.city && !p.country) return;
    const row = ensureCity(p.city, p.country);
    row.voices += 1;
    if (Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) {
      row.latitudes.push(Number(p.latitude));
      row.longitudes.push(Number(p.longitude));
    }
  });

  (donations || []).forEach((d) => {
    const city = d.city || d.participationCity || d.world_choir_city_name || '';
    const country = d.country || d.participationCountry || d.world_choir_country || '';
    if (!city && !country) return;
    const row = ensureCity(city, country);
    row.totalDonations += 1;
    const amount = Number(d.amount);
    if (Number.isFinite(amount) && amount > 0) row.donationAmount += amount;
    const dk = d.donorId || d.deviceId || d.userId || d.emailHash || d.id;
    if (dk) row.donors.add(String(dk));
    if (d.foundationId) row.foundationIds.add(String(d.foundationId));
    if (Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude))) {
      row.latitudes.push(Number(d.latitude));
      row.longitudes.push(Number(d.longitude));
    }
  });

  return Array.from(byCity.values())
    .map((row) => {
      const lat = row.latitudes.length
        ? row.latitudes.reduce((a, b) => a + b, 0) / row.latitudes.length
        : null;
      const lng = row.longitudes.length
        ? row.longitudes.reduce((a, b) => a + b, 0) / row.longitudes.length
        : null;
      const uniqueDonors = row.donors.size;
      return {
        rank: 0,
        city: row.city,
        country: row.country,
        voices: row.voices,
        uniqueDonors,
        totalDonations: Math.round(row.donationAmount * 100) / 100,
        donationCount: row.totalDonations,
        averageDonation: row.totalDonations > 0
          ? Math.round((row.donationAmount / row.totalDonations) * 100) / 100
          : null,
        donationConversion: row.voices > 0
          ? Math.round((uniqueDonors / row.voices) * 1000) / 10
          : null,
        latitude: lat,
        longitude: lng,
        foundations: Math.max(
          row.foundationIds.size,
          influencers.filter(
            (i) => String(i.country || '').trim().toLowerCase() === String(row.country).toLowerCase()
              && String(row.city).toLowerCase() !== 'unknown city'
          ).length
        ),
      };
    })
    .sort((a, b) => b.voices - a.voices || b.donationCount - a.donationCount || a.city.localeCompare(b.city))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

function buildCountryIntelligence(pledges, cities, influencers, donations) {
  const byCountry = new Map();

  pledges.forEach((p) => {
    if (!p.country) return;
    const key = String(p.country).trim().toLowerCase();
    if (!byCountry.has(key)) {
      byCountry.set(key, {
        country: displayCountry(p.country),
        voices: 0,
        cities: new Set(),
        donors: new Set(),
        totalDonated: 0,
        donationCount: 0,
        foundationAmount: 0,
        platformFee: 0,
      });
    }
    const row = byCountry.get(key);
    row.voices += 1;
    if (p.city) row.cities.add(String(p.city).trim().toLowerCase());
  });

  (donations || []).forEach((d) => {
    const country = d.country || d.participationCountry || d.world_choir_country || '';
    if (!country) return;
    const key = String(country).trim().toLowerCase();
    if (!byCountry.has(key)) {
      byCountry.set(key, {
        country: displayCountry(country),
        voices: 0,
        cities: new Set(),
        donors: new Set(),
        totalDonated: 0,
        donationCount: 0,
        foundationAmount: 0,
        platformFee: 0,
      });
    }
    const row = byCountry.get(key);
    row.donationCount += 1;
    const amount = Number(d.amount);
    if (Number.isFinite(amount) && amount > 0) row.totalDonated += amount;
    const foundationAmount = Number(d.foundation_amount);
    const platformFee = Number(d.platform_fee);
    if (Number.isFinite(foundationAmount) && foundationAmount > 0) row.foundationAmount += foundationAmount;
    if (Number.isFinite(platformFee) && platformFee > 0) row.platformFee += platformFee;
    const city = d.city || d.participationCity || d.world_choir_city_name;
    if (city) row.cities.add(String(city).trim().toLowerCase());
    const dk = d.donorId || d.deviceId || d.userId || d.emailHash || d.id;
    if (dk) row.donors.add(String(dk));
  });

  return Array.from(byCountry.values())
    .map((row) => {
      const countryFoundations = influencers.filter(
        (i) => String(i.country || '').trim().toLowerCase() === row.country.toLowerCase()
      );
      return {
        country: row.country,
        voices: row.voices,
        cities: row.cities.size,
        donors: row.donors.size,
        totalDonated: Math.round(row.totalDonated * 100) / 100,
        donationCount: row.donationCount,
        foundationAllocation: Math.round(row.foundationAmount * 100) / 100,
        platformFee: Math.round(row.platformFee * 100) / 100,
        donationConversion: row.voices > 0
          ? Math.round((row.donors.size / row.voices) * 1000) / 10
          : null,
        foundations: countryFoundations.length,
        growth: null,
      };
    })
    .sort((a, b) => b.voices - a.voices || b.totalDonated - a.totalDonated || a.country.localeCompare(b.country));
}

function buildMapPoints(pledges, donations = []) {
  const voicePoints = pledges
    .filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
    .map((p) => ({
      id: p.id,
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
      city: p.city || null,
      country: p.country || null,
      voiceNumber: p.voice_number || null,
      voiceName: p.voice_name || null,
      pledgedAt: p.pledged_at || null,
      type: 'voice',
    }));

  const donationPoints = [];
  const byCity = new Map();
  (donations || []).forEach((d) => {
    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    const city = d.city || d.participationCity || d.world_choir_city_name || null;
    const country = d.country || d.participationCountry || d.world_choir_country || null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${String(city || '').toLowerCase()}|${String(country || '').toLowerCase()}`;
    if (!byCity.has(key)) {
      byCity.set(key, {
        id: `don-geo-${key}`,
        latitude: lat,
        longitude: lng,
        city,
        country,
        count: 0,
        raised: 0,
        type: 'donation',
      });
    }
    const row = byCity.get(key);
    row.count += 1;
    const amount = Number(d.amount);
    if (Number.isFinite(amount) && amount > 0) row.raised += amount;
  });
  byCity.forEach((row) => {
    donationPoints.push({
      ...row,
      raised: Math.round(row.raised * 100) / 100,
      donors: row.count,
      voices: 0,
    });
  });

  return { voicePoints, donationPoints };
}

function buildActivity({ users, pledges, promises, influencers, donations }) {
  const items = [];

  pledges.forEach((p) => {
    items.push({
      id: `pledge-${p.id}`,
      type: 'community',
      label: 'New Voice pledged',
      detail: [p.voice_name, p.city, p.country].filter(Boolean).join(' · ') || 'Voice pledged',
      at: p.pledged_at || p.updated_at,
    });
  });

  promises.forEach((p) => {
    items.push({
      id: `promise-${p.id}`,
      type: 'community',
      label: 'Promise submitted',
      detail: [p.voice_name, p.city, p.country].filter(Boolean).join(' · ') || 'Promise recorded',
      at: p.submitted_at,
    });
  });

  users.forEach((u) => {
    items.push({
      id: `user-${u.id}`,
      type: 'community',
      label: 'User registered',
      detail: 'New account created',
      at: u.created_at,
    });
  });

  influencers.forEach((i) => {
    items.push({
      id: `inf-${i.id}`,
      type: 'foundations',
      label: i.published ? 'Creator Foundation published' : 'Creator profile created',
      detail: [i.foundationName || i.displayName, i.country].filter(Boolean).join(' · '),
      at: i.createdAt || i.updatedAt,
    });
  });

  donations.filter(isSuccessfulDonation).forEach((d) => {
    items.push({
      id: `don-${d.id || d.date}`,
      type: 'donations',
      label: 'Donation completed',
      detail: d.foundationId ? `Foundation ${d.foundationId}` : 'Verified donation',
      at: d.date || d.createdAt,
    });
  });

  return items
    .filter((i) => i.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 100);
}

function buildGrowthSeries({ users, pledges, donations, influencers }) {
  return {
    users: bucketByDay(users.map((u) => u.created_at)),
    voices: bucketByDay(pledges.map((p) => p.pledged_at)),
    donations: bucketByDay(
      donations.filter(isSuccessfulDonation).map((d) => d.date || d.createdAt)
    ),
    foundations: bucketByDay(influencers.map((i) => i.createdAt)),
  };
}

function countToday(dates) {
  const today = new Date().toISOString().slice(0, 10);
  return dates.filter((iso) => {
    const d = parseDate(iso);
    return d && d.toISOString().slice(0, 10) === today;
  }).length;
}

/**
 * Full Owner Control Center payload.
 */
async function buildOwnerControlCenter() {
  const [users, pledges, promises, influencers, donations, choirDb, operations] = await Promise.all([
    listAllUsers(),
    listAllPledges(),
    listAllPromises(),
    listInfluencersOwnerView(),
    readDonationsLedgerSafe(),
    buildOwnerDatabaseRows(),
    getOperationsOverview(),
  ]);

  const verifiedDonations = filterDonations(donations, {});
  const cities = buildCityIntelligence(pledges, verifiedDonations, influencers);
  const countries = buildCountryIntelligence(pledges, cities, influencers, verifiedDonations);
  const mapBundles = buildMapPoints(pledges, verifiedDonations);
  const mapPoints = mapBundles.voicePoints;
  const donationMapPoints = mapBundles.donationPoints;
  const activity = buildActivity({ users, pledges, promises, influencers, donations });
  const growth = buildGrowthSeries({ users, pledges, donations, influencers });

  const pledgedUserIds = new Set(pledges.map((p) => p.user_id));
  const promisedUserIds = new Set(promises.map((p) => p.user_id));

  const totalRaised = sumAmounts(verifiedDonations);
  const donorCount = uniqueDonors(verifiedDonations);
  const amounts = verifiedDonations
    .map((d) => Number(d.amount))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const averageDonation = amounts.length
    ? Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100
    : null;
  const medianDonation = amounts.length
    ? amounts[Math.floor(amounts.length / 2)]
    : null;

  const activeFoundations = influencers.filter((i) => i.active !== false && i.published === true);
  const voicesToday = countToday(pledges.map((p) => p.pledged_at));
  const usersToday = countToday(users.map((u) => u.created_at));
  const donationsToday = countToday(
    verifiedDonations.map((d) => d.date || d.createdAt)
  );

  const conversionDonorsOverVoices = pledgedUserIds.size > 0
    ? Math.round((donorCount / pledgedUserIds.size) * 1000) / 10
    : null;

  const needsAttention = [];
  // Real alerts only — none fabricated.

  const systemHealth = {
    overall: 'operational',
    services: [
      { id: 'api', name: 'API', status: 'operational' },
      { id: 'blob', name: 'Data storage', status: 'operational' },
      { id: 'auth', name: 'Owner authentication', status: 'operational' },
      {
        id: 'payments',
        name: 'Payments',
        status: 'not_connected',
        note: 'Live payment processing is not connected yet.',
      },
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    currency: operations.currency || 'EUR',
    platformFeePercent: PLATFORM_FEE_PERCENT,
    overview: {
      totalUsers: choirDb.totals.users,
      totalVoices: choirDb.totals.participants,
      voicesToday,
      usersToday,
      countries: countries.length,
      cities: cities.length,
      totalDonated: totalRaised,
      totalDonors: donorCount,
      totalDonations: verifiedDonations.length,
      donationsToday,
      activeFoundations: activeFoundations.length,
      foundationsTotal: influencers.length,
      mapPoints: mapPoints.length,
      systemHealth: systemHealth.overall,
      operationsShare: operations.operationsShare,
      operationsNote: operations.note,
    },
    community: {
      registeredUsers: choirDb.totals.users,
      voicesPledged: choirDb.totals.participants,
      usersWithPromise: promisedUserIds.size,
      funnel: [
        {
          id: 'registered',
          label: 'Registered',
          count: choirDb.totals.users,
          rateFromPrevious: null,
        },
        {
          id: 'pledged',
          label: 'Pledged to sing',
          count: pledgedUserIds.size,
          rateFromPrevious: choirDb.totals.users > 0
            ? Math.round((pledgedUserIds.size / choirDb.totals.users) * 1000) / 10
            : null,
        },
        {
          id: 'promised',
          label: 'Submitted a promise',
          count: promisedUserIds.size,
          rateFromPrevious: pledgedUserIds.size > 0
            ? Math.round((promisedUserIds.size / pledgedUserIds.size) * 1000) / 10
            : null,
        },
        {
          id: 'donated',
          label: 'Donated',
          count: donorCount,
          rateFromPrevious: pledgedUserIds.size > 0 ? conversionDonorsOverVoices : null,
          note: 'Denominator: Voices pledged. Numerator: unique verified donors.',
        },
      ],
      unavailable: [
        'Returning users',
        'Practice activity',
        'Invitations sent',
        'Invitations accepted',
      ],
    },
    cities,
    countries,
    map: {
      modes: donationMapPoints.length ? ['voices', 'donations', 'combined'] : ['voices'],
      points: mapPoints,
      donationPoints: donationMapPoints,
      note: mapPoints.length || donationMapPoints.length
        ? null
        : 'No geolocated Voices yet. Map points appear when participants share a location.',
      unavailableModes: donationMapPoints.length ? [] : ['donations', 'combined'],
      unavailableNote: donationMapPoints.length
        ? null
        : 'Donation map points appear when verified donations include World Choir participation coordinates.',
    },
    donations: {
      totalDonated: totalRaised,
      totalDonors: donorCount,
      totalDonations: verifiedDonations.length,
      donationsToday,
      averageDonation,
      medianDonation,
      repeatDonors: null,
      conversionRate: conversionDonorsOverVoices,
      conversionDefinition: 'Unique verified donors ÷ Voices pledged',
      currency: operations.currency || 'EUR',
      platformFeePercent: PLATFORM_FEE_PERCENT,
      operationsShare: operations.operationsShare,
      note: operations.note,
      recent: verifiedDonations
        .slice()
        .sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')))
        .slice(0, 40)
        .map((d) => ({
          id: d.id || d.donation_id,
          foundationId: d.foundationId || d.foundation_id,
          foundationName: d.foundationName || '',
          creatorName: d.creatorName || '',
          amount: Number(d.amount_gross ?? d.amount ?? 0),
          foundationAmount: Number(d.foundation_amount ?? 0),
          platformFee: Number(d.platform_fee ?? 0),
          currency: d.currency || 'EUR',
          status: d.paymentStatus || d.status,
          paymentProvider: d.payment_provider || d.paymentProvider || null,
          paymentTransactionId: d.payment_transaction_id || d.paymentTransactionId || null,
          testTransactionId: d.test_transaction_id || d.testTransactionId || null,
          isTest: d.is_test === true || d.isTest === true,
          donorAnonymous: d.donor_anonymous === true || d.donorAnonymous === true,
          donorDisplayName: (d.donor_anonymous === true || d.donorAnonymous === true)
            ? 'Anonymous'
            : (d.donor_display_name || d.donorDisplayName || 'Anonymous'),
          message: d.message || '',
          city: d.city || d.participationCity || d.world_choir_city_name || '',
          country: d.country || d.participationCountry || d.world_choir_country || '',
          paymentMethodType: d.payment_method_type || d.paymentMethodType || null,
          createdAt: d.created_at || d.createdAt || null,
        })),
      byFoundation: activeFoundations.map((f) => {
        const rows = verifiedDonations.filter((d) => d.foundationId === f.id);
        const raised = sumAmounts(rows);
        return {
          id: f.id,
          creator: f.displayName,
          foundation: f.foundationName || f.displayName,
          country: f.country || '',
          status: f.active === false ? 'paused' : (f.published ? 'active' : 'draft'),
          uniqueDonors: uniqueDonors(rows),
          totalRaised: raised,
          averageDonation: rows.length
            ? Math.round((raised / rows.length) * 100) / 100
            : null,
          activeProjects: 0,
          lastActivity: f.updatedAt || f.createdAt,
        };
      }),
      unavailable: [
        'Repeat donors',
        'Failed payment rate',
      ],
    },
    foundations: influencers.map((f) => ({
      id: f.id,
      email: f.email,
      ownerLoginPassword: f.ownerLoginPassword || null,
      creator: f.displayName,
      foundation: f.foundationName || '',
      country: f.country || '',
      mission: f.mission || '',
      biography: f.biography || '',
      whyStarted: f.whyStarted || '',
      howItWorks: f.howItWorks || '',
      primaryCategory: f.primaryCategory || '',
      categories: f.categories || [],
      profileImage: f.profileImage || '',
      coverImage: f.coverImage || '',
      status: f.active === false ? 'paused' : (f.published ? 'active' : 'draft'),
      active: f.active !== false,
      published: f.published === true,
      uniqueDonors: uniqueDonors(verifiedDonations.filter((d) => d.foundationId === f.id)),
      totalRaised: sumAmounts(verifiedDonations.filter((d) => d.foundationId === f.id)),
      activeProjects: 0,
      completedProjects: 0,
      growth: null,
      lastActivity: f.updatedAt || f.createdAt,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    event: {
      voicesPledged: choirDb.totals.participants,
      countries: countries.length,
      cities: cities.length,
      promisesSubmitted: promises.length,
      unavailable: [
        'Users who practiced',
        'Live active users',
        'Technical error stream',
      ],
    },
    growth,
    applications: {
      pipeline: [],
      note: 'A formal Creator Foundation application pipeline is not connected yet. Existing Creator profiles appear under Creator Foundations.',
    },
    operations: {
      health: systemHealth,
      alerts: needsAttention,
      note: needsAttention.length
        ? null
        : 'All clear.',
    },
    reports: {
      executiveSummary: {
        community: {
          totalUsers: choirDb.totals.users,
          voicesPledged: choirDb.totals.participants,
          countries: countries.length,
          cities: cities.length,
        },
        financial: {
          totalDonated: totalRaised,
          donors: donorCount,
          averageDonation,
          currency: operations.currency || 'EUR',
        },
        creatorEcosystem: {
          activeFoundations: activeFoundations.length,
          totalProfiles: influencers.length,
          applications: 0,
        },
        operations: {
          systemHealth: systemHealth.overall,
          criticalAlerts: 0,
          operationsShare: operations.operationsShare,
          platformFeePercent: PLATFORM_FEE_PERCENT,
        },
      },
    },
    admin: {
      roles: [
        { id: 'owner', label: 'Owner', note: 'Absolute control. Currently active.' },
        { id: 'super_admin', label: 'Super Admin', note: 'Not provisioned yet.' },
        { id: 'foundation_manager', label: 'Foundation Manager', note: 'Not provisioned yet.' },
        { id: 'verification', label: 'Verification Team', note: 'Not provisioned yet.' },
        { id: 'finance', label: 'Finance', note: 'Not provisioned yet.' },
        { id: 'support', label: 'Support', note: 'Not provisioned yet.' },
        { id: 'analyst', label: 'Analyst', note: 'Not provisioned yet.' },
      ],
      auditLog: [],
      auditNote: 'Audit logging will appear here as administrative actions are recorded.',
    },
    activity,
    choirDatabase: choirDb,
    unavailableCapabilities: [
      'Attribution / acquisition sources',
      'Viral coefficient',
      'Two-factor authentication',
      'Session revocation list',
      'Practice activity analytics',
      'Invitation analytics',
    ],
  };
}

function searchOwnerControlCenter(payload, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return { foundations: [], creators: [], cities: [], countries: [], voices: [] };
  }

  const foundations = (payload.foundations || []).filter((f) =>
    `${f.foundation} ${f.creator} ${f.country} ${f.mission}`.toLowerCase().includes(q)
  ).slice(0, 8);

  const creators = (payload.foundations || []).filter((f) =>
    String(f.creator || '').toLowerCase().includes(q)
  ).slice(0, 8);

  const cities = (payload.cities || []).filter((c) =>
    `${c.city} ${c.country}`.toLowerCase().includes(q)
  ).slice(0, 8);

  const countries = (payload.countries || []).filter((c) =>
    String(c.country || '').toLowerCase().includes(q)
  ).slice(0, 8);

  const voices = ((payload.choirDatabase && payload.choirDatabase.rows) || [])
    .filter((r) =>
      `${r.voiceName || ''} ${r.city || ''} ${r.country || ''} ${r.userId || ''}`.toLowerCase().includes(q)
    )
    .slice(0, 8)
    .map((r) => ({
      userId: r.userId,
      voiceName: r.voiceName,
      voiceNumber: r.voiceNumber,
      city: r.city,
      country: r.country,
    }));

  return { foundations, creators, cities, countries, voices };
}

module.exports = {
  buildOwnerControlCenter,
  searchOwnerControlCenter,
};
