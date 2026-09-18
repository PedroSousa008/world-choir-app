/**
 * Temporary Foundation demo seed — clearly marked for later deletion.
 * Marker: wcDemoSeed === true, ids prefixed with wc-demo-
 * Never set mock:true (those are excluded from analytics).
 */
const {
  listInfluencersOwnerView,
  readDonationsLedger,
  PLATFORM_FEE_PERCENT,
} = require('./members-store');
const { writeDonationsLedger } = require('./donations');
const { readWorkspace, writeWorkspace } = require('./foundation-workspace');

const DEMO_ID_PREFIX = 'wc-demo-';
const DEMO_FLAG = 'wcDemoSeed';

const PLACES = [
  { city: 'Lisbon', country: 'Portugal', latitude: 38.7223, longitude: -9.1393 },
  { city: 'Porto', country: 'Portugal', latitude: 41.1579, longitude: -8.6291 },
  { city: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 },
  { city: 'Manchester', country: 'United Kingdom', latitude: 53.4808, longitude: -2.2426 },
  { city: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522 },
  { city: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 },
  { city: 'Amsterdam', country: 'Netherlands', latitude: 52.3676, longitude: 4.9041 },
  { city: 'Madrid', country: 'Spain', latitude: 40.4168, longitude: -3.7038 },
  { city: 'Rome', country: 'Italy', latitude: 41.9028, longitude: 12.4964 },
  { city: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.006 },
  { city: 'Toronto', country: 'Canada', latitude: 43.6532, longitude: -79.3832 },
  { city: 'São Paulo', country: 'Brazil', latitude: -23.5505, longitude: -46.6333 },
  { city: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093 },
  { city: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503 },
  { city: 'Cape Town', country: 'South Africa', latitude: -33.9249, longitude: 18.4241 },
  { city: 'Nairobi', country: 'Kenya', latitude: -1.2921, longitude: 36.8219 },
  { city: 'Dublin', country: 'Ireland', latitude: 53.3498, longitude: -6.2603 },
  { city: 'Stockholm', country: 'Sweden', latitude: 59.3293, longitude: 18.0686 },
];

const DONOR_FIRST = [
  'Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Quinn',
  'Avery', 'Jamie', 'Cameron', 'Drew', 'Harper', 'Reese', 'Skyler', 'Parker',
  'Noah', 'Mia', 'Leo', 'Sofia', 'Owen', 'Isla', 'Lucas', 'Emma',
];

const DONOR_LAST = [
  'Costa', 'Silva', 'Santos', 'Pereira', 'Oliveira', 'Fernandes', 'Martins',
  'Rodrigues', 'Almeida', 'Nunes', 'Ribeiro', 'Carvalho', 'Lopes', 'Gomes',
];

const AMOUNTS = [5, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500];

function isDemoDonation(d) {
  if (!d) return false;
  if (d[DEMO_FLAG] === true) return true;
  const id = String(d.id || d.donation_id || '');
  return id.startsWith(DEMO_ID_PREFIX);
}

function isDemoProject(p) {
  if (!p) return false;
  if (p[DEMO_FLAG] === true) return true;
  const id = String(p.id || '');
  return id.startsWith(DEMO_ID_PREFIX);
}

function splitAmount(gross) {
  const amountGrossCents = Math.round(Number(gross) * 100);
  const platformFeeCents = Math.round(amountGrossCents * (PLATFORM_FEE_PERCENT / 100));
  const foundationAmountCents = amountGrossCents - platformFeeCents;
  return {
    amount: amountGrossCents / 100,
    amount_gross: amountGrossCents / 100,
    platform_fee: platformFeeCents / 100,
    foundation_amount: foundationAmountCents / 100,
    amount_gross_cents: amountGrossCents,
    platform_fee_cents: platformFeeCents,
    foundation_amount_cents: foundationAmountCents,
  };
}

function daysAgoIso(days, hour = 12) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, (days * 7) % 60, (days * 13) % 60, 0);
  return d.toISOString();
}

function hashIndex(str, mod) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h) % Math.max(1, mod);
}

function buildDemoProjects(foundation) {
  const id = foundation.id;
  const name = foundation.foundationName || foundation.displayName || 'Foundation';
  const now = new Date().toISOString();
  return [
    {
      id: `${DEMO_ID_PREFIX}proj-${id}-1`,
      [DEMO_FLAG]: true,
      title: `${name} — Community Fund`,
      shortDescription: 'Temporary demo project for Control Center testing.',
      description: 'Demo seed project. Safe to delete with Clear demo data.',
      status: 'active',
      fundingGoal: 25000,
      location: foundation.country || 'Worldwide',
      country: foundation.country || '',
      category: foundation.primaryCategory || 'Community',
      createdAt: daysAgoIso(200),
      publishedAt: daysAgoIso(180),
      updatedAt: now,
      updates: [],
    },
    {
      id: `${DEMO_ID_PREFIX}proj-${id}-2`,
      [DEMO_FLAG]: true,
      title: `${name} — Local Impact`,
      shortDescription: 'Second temporary demo project.',
      description: 'Demo seed project. Safe to delete with Clear demo data.',
      status: 'active',
      fundingGoal: 10000,
      location: foundation.country || 'Worldwide',
      country: foundation.country || '',
      category: foundation.primaryCategory || 'Community',
      createdAt: daysAgoIso(120),
      publishedAt: daysAgoIso(110),
      updatedAt: now,
      updates: [],
    },
  ];
}

function buildDemoDonationsForFoundation(foundation, projects) {
  const foundationId = foundation.id;
  const foundationName = foundation.foundationName || `${foundation.displayName || 'Creator'}'s Foundation`;
  const creatorName = foundation.displayName || '';
  const donorCount = 22;
  const donationCount = 56;
  const rows = [];

  for (let i = 0; i < donationCount; i += 1) {
    const donorIdx = i < 18
      ? i % donorCount
      : hashIndex(`${foundationId}-ret-${i}`, Math.min(12, donorCount));
    const first = DONOR_FIRST[donorIdx % DONOR_FIRST.length];
    const last = DONOR_LAST[(donorIdx + hashIndex(foundationId, DONOR_LAST.length)) % DONOR_LAST.length];
    const donorId = `${DEMO_ID_PREFIX}donor-${foundationId}-${donorIdx}`;
    const place = PLACES[(i + hashIndex(foundationId, PLACES.length)) % PLACES.length];
    const amount = AMOUNTS[(i * 3 + hashIndex(foundationId, AMOUNTS.length)) % AMOUNTS.length];
    const split = splitAmount(amount);
    const project = projects[i % projects.length];
    const daysAgo = 2 + ((i * 5) % 340);
    const createdAt = daysAgoIso(daysAgo, 8 + (i % 12));
    const anonymous = i % 7 === 0;
    const isVoice = i % 5 !== 0; // ~80% linked as World Choir Voices for demo
    const id = `${DEMO_ID_PREFIX}don-${foundationId}-${String(i).padStart(3, '0')}`;

    rows.push({
      id,
      donation_id: id,
      [DEMO_FLAG]: true,
      wcDemoVoice: isVoice,
      foundationId,
      foundation_id: foundationId,
      foundationName,
      creatorName,
      projectId: project.id,
      project_id: project.id,
      ...split,
      currency: 'EUR',
      paymentStatus: 'succeeded',
      status: 'succeeded',
      payment_provider: 'demo-seed',
      paymentProvider: 'demo-seed',
      payment_transaction_id: `${DEMO_ID_PREFIX}tx-${foundationId}-${i}`,
      donorId,
      donor_id: donorId,
      userId: isVoice ? donorId : null,
      deviceId: `${DEMO_ID_PREFIX}device-${foundationId}-${donorIdx}`,
      donor_display_name: anonymous ? '' : `${first} ${last}`,
      donorDisplayName: anonymous ? '' : `${first} ${last}`,
      donor_anonymous: anonymous,
      donorAnonymous: anonymous,
      message: i % 4 === 0 ? 'Keep going — demo support message.' : '',
      city: place.city,
      country: place.country,
      participationCity: place.city,
      participationCountry: place.country,
      world_choir_city_name: place.city,
      world_choir_country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      created_at: createdAt,
      createdAt,
      date: createdAt,
      completed_at: createdAt,
      is_test: false,
      isTest: false,
      mock: false,
    });
  }

  return rows;
}

async function ensureDemoProjects(foundation) {
  const ws = await readWorkspace(foundation.id);
  const withoutOldDemo = (ws.projects || []).filter((p) => !isDemoProject(p));
  const demoProjects = buildDemoProjects(foundation);
  ws.projects = [...demoProjects, ...withoutOldDemo];
  await writeWorkspace(ws);
  return demoProjects;
}

async function seedFoundationDemoData() {
  const influencers = (await listInfluencersOwnerView()).filter((f) => f && f.active !== false);
  if (!influencers.length) {
    return { ok: false, error: 'No foundations found to seed.' };
  }

  const existing = await readDonationsLedger();
  const kept = existing.filter((d) => !isDemoDonation(d));
  const seededDonations = [];
  const foundationSummaries = [];

  for (const foundation of influencers) {
    const projects = await ensureDemoProjects(foundation);
    const rows = buildDemoDonationsForFoundation(foundation, projects);
    seededDonations.push(...rows);
    foundationSummaries.push({
      id: foundation.id,
      name: foundation.foundationName || foundation.displayName || foundation.id,
      donations: rows.length,
      projects: projects.length,
      raised: Math.round(rows.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100,
    });
  }

  await writeDonationsLedger([...kept, ...seededDonations]);

  return {
    ok: true,
    seeded: true,
    foundations: foundationSummaries.length,
    donations: seededDonations.length,
    details: foundationSummaries,
    note: 'Temporary demo data. Use Clear demo data when finished testing.',
  };
}

async function clearFoundationDemoData() {
  const influencers = (await listInfluencersOwnerView()).filter((f) => f && f.id);
  const existing = await readDonationsLedger();
  const before = existing.length;
  const kept = existing.filter((d) => !isDemoDonation(d));
  await writeDonationsLedger(kept);

  let projectsRemoved = 0;
  for (const foundation of influencers) {
    const ws = await readWorkspace(foundation.id);
    const nextProjects = (ws.projects || []).filter((p) => {
      if (isDemoProject(p)) {
        projectsRemoved += 1;
        return false;
      }
      return true;
    });
    if (nextProjects.length !== (ws.projects || []).length) {
      ws.projects = nextProjects;
      await writeWorkspace(ws);
    }
  }

  return {
    ok: true,
    cleared: true,
    donationsRemoved: before - kept.length,
    projectsRemoved,
    donationsRemaining: kept.length,
  };
}

module.exports = {
  DEMO_ID_PREFIX,
  DEMO_FLAG,
  isDemoDonation,
  isDemoProject,
  seedFoundationDemoData,
  clearFoundationDemoData,
};
