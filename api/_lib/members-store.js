const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');
const { MIN_PASSWORD_LENGTH } = require('./auth');

const ROOT = 'wc-data/members';
const INFLUENCERS_PATH = `${ROOT}/influencers.json`;
const DONATIONS_LEDGER_PATH = `${ROOT}/donations-ledger.json`;
const PLATFORM_FEE_PERCENT = 10;

async function readInfluencersDoc() {
  assertBlobConfigured();
  try {
    const data = await readBlobJson(INFLUENCERS_PATH);
    return {
      version: data.version || 1,
      influencers: Array.isArray(data.influencers) ? data.influencers : [],
    };
  } catch {
    return { version: 1, influencers: [] };
  }
}

async function writeInfluencersDoc(doc) {
  assertBlobConfigured();
  await writeJson(INFLUENCERS_PATH, {
    ...doc,
    updated_at: new Date().toISOString(),
  }, { overwrite: true });
}

async function readDonationsLedger() {
  assertBlobConfigured();
  try {
    const data = await readBlobJson(DONATIONS_LEDGER_PATH);
    return Array.isArray(data.donations) ? data.donations : [];
  } catch {
    return [];
  }
}

function publicInfluencer(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName || '',
    foundationName: row.foundationName || '',
    mission: row.mission || '',
    biography: row.biography || '',
    whyStarted: row.whyStarted || '',
    howItWorks: row.howItWorks || '',
    shortDescription: row.shortDescription || '',
    story: row.story || '',
    website: row.website || '',
    socialLinks: row.socialLinks && typeof row.socialLinks === 'object' ? row.socialLinks : {},
    profileImage: row.profileImage || '',
    coverImage: row.coverImage || '',
    cardShortMission: row.cardShortMission || '',
    country: row.country || '',
    primaryCategory: row.primaryCategory || '',
    categories: row.categories || [],
    active: row.active !== false,
    published: row.published === true,
    verificationStatus: row.verificationStatus || 'unverified',
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

async function listInfluencers() {
  const doc = await readInfluencersDoc();
  return doc.influencers
    .map(publicInfluencer)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function findInfluencerByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const doc = await readInfluencersDoc();
  return doc.influencers.find((row) => row.email === normalized) || null;
}

async function findInfluencerById(id) {
  const doc = await readInfluencersDoc();
  return doc.influencers.find((row) => row.id === id) || null;
}

async function createInfluencer({
  email,
  password,
  displayName,
  foundationName,
  mission,
  biography,
  whyStarted,
  howItWorks,
  country,
  primaryCategory,
  categories,
  active = true,
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { ok: false, error: 'A valid email is required' };
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (!displayName || !String(displayName).trim()) {
    return { ok: false, error: 'Display name is required' };
  }

  const doc = await readInfluencersDoc();
  if (doc.influencers.some((row) => row.email === normalizedEmail)) {
    return { ok: false, error: 'An influencer with this email already exists' };
  }

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(String(password), 12);
  const row = {
    id: randomUUID(),
    email: normalizedEmail,
    passwordHash,
    displayName: String(displayName).trim(),
    foundationName: String(foundationName || '').trim(),
    mission: String(mission || '').trim(),
    biography: String(biography || '').trim(),
    whyStarted: String(whyStarted || '').trim(),
    howItWorks: String(howItWorks || '').trim(),
    country: String(country || '').trim(),
    primaryCategory: String(primaryCategory || '').trim(),
    categories: Array.isArray(categories)
      ? categories.map((c) => String(c).trim()).filter(Boolean)
      : String(primaryCategory || '').trim()
        ? [String(primaryCategory).trim()]
        : [],
    active: active !== false,
    // Owner-created influencers appear on Donate immediately.
    published: true,
    createdAt: now,
    updatedAt: now,
  };

  doc.influencers.push(row);
  await writeInfluencersDoc(doc);
  return { ok: true, influencer: publicInfluencer(row) };
}

async function updateInfluencer(id, updates = {}, { allowEmailChange = false } = {}) {
  const doc = await readInfluencersDoc();
  const index = doc.influencers.findIndex((row) => row.id === id);
  if (index === -1) return { ok: false, error: 'Influencer not found' };

  const current = doc.influencers[index];
  const next = { ...current };

  const textFields = [
    'displayName',
    'foundationName',
    'mission',
    'biography',
    'whyStarted',
    'howItWorks',
    'shortDescription',
    'story',
    'website',
    'profileImage',
    'coverImage',
    'cardShortMission',
    'country',
    'primaryCategory',
  ];

  textFields.forEach((field) => {
    if (updates[field] !== undefined) {
      next[field] = String(updates[field] || '').trim();
    }
  });

  if (updates.socialLinks !== undefined && typeof updates.socialLinks === 'object') {
    const links = {};
    Object.entries(updates.socialLinks).forEach(([k, v]) => {
      const key = String(k).trim().slice(0, 40);
      const val = String(v || '').trim().slice(0, 300);
      if (key && val) links[key] = val;
    });
    next.socialLinks = links;
  }

  if (updates.categories !== undefined) {
    next.categories = Array.isArray(updates.categories)
      ? updates.categories.map((c) => String(c).trim()).filter(Boolean)
      : [];
  }

  if (updates.active !== undefined) next.active = updates.active === true;
  if (updates.published !== undefined) next.published = updates.published === true;

  if (allowEmailChange && updates.email !== undefined) {
    const normalizedEmail = String(updates.email || '').trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      return { ok: false, error: 'Enter a valid email address' };
    }
    const conflict = doc.influencers.find(
      (row) => row.email === normalizedEmail && row.id !== id
    );
    if (conflict) {
      return { ok: false, error: 'Another influencer already uses this email' };
    }
    next.email = normalizedEmail;
  }

  if (updates.password) {
    if (String(updates.password).length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    }
    next.passwordHash = await bcrypt.hash(String(updates.password), 12);
  }

  next.updatedAt = new Date().toISOString();
  doc.influencers[index] = next;
  await writeInfluencersDoc(doc);
  return { ok: true, influencer: publicInfluencer(next) };
}

async function verifyInfluencerCredentials({ email, password }) {
  const row = await findInfluencerByEmail(email);
  if (!row || row.active === false) {
    return { ok: false, error: 'Invalid credentials' };
  }

  const match = await bcrypt.compare(String(password || ''), row.passwordHash || '');
  if (!match) return { ok: false, error: 'Invalid credentials' };

  return { ok: true, influencer: publicInfluencer(row) };
}

async function changeInfluencerPassword(id, { currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, error: 'All password fields are required' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'New passwords do not match' };
  }
  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const doc = await readInfluencersDoc();
  const index = doc.influencers.findIndex((row) => row.id === id);
  if (index === -1) return { ok: false, error: 'Influencer not found' };

  const row = doc.influencers[index];
  const match = await bcrypt.compare(String(currentPassword), row.passwordHash || '');
  if (!match) return { ok: false, error: 'Current password is incorrect' };

  row.passwordHash = await bcrypt.hash(String(newPassword), 12);
  row.updatedAt = new Date().toISOString();
  doc.influencers[index] = row;
  await writeInfluencersDoc(doc);
  return { ok: true };
}

async function changeInfluencerEmail(id, { currentPassword, newEmail, confirmEmail }) {
  if (!currentPassword || !newEmail || !confirmEmail) {
    return { ok: false, error: 'All email fields are required' };
  }

  const normalized = String(newEmail).trim().toLowerCase();
  const confirmed = String(confirmEmail).trim().toLowerCase();
  if (normalized !== confirmed) {
    return { ok: false, error: 'Email addresses do not match' };
  }
  if (!normalized.includes('@')) {
    return { ok: false, error: 'Enter a valid email address' };
  }

  const doc = await readInfluencersDoc();
  const index = doc.influencers.findIndex((row) => row.id === id);
  if (index === -1) return { ok: false, error: 'Influencer not found' };

  const row = doc.influencers[index];
  const match = await bcrypt.compare(String(currentPassword), row.passwordHash || '');
  if (!match) return { ok: false, error: 'Current password is incorrect' };

  if (doc.influencers.some((item) => item.email === normalized && item.id !== id)) {
    return { ok: false, error: 'Another influencer already uses this email' };
  }

  row.email = normalized;
  row.updatedAt = new Date().toISOString();
  doc.influencers[index] = row;
  await writeInfluencersDoc(doc);
  return { ok: true, email: normalized };
}

/**
 * Operations earnings from verified successful donations only.
 * Fee is currently 10% for app operational costs.
 */
async function getOperationsOverview() {
  const donations = await readDonationsLedger();
  const successStatuses = new Set(['succeeded', 'completed', 'paid']);
  const excluded = new Set([
    'failed', 'cancelled', 'canceled', 'refunded', 'reversed',
    'fraudulent', 'pending', 'completed_mock', 'mock',
  ]);

  const successful = donations.filter((d) => {
    const status = String(d.paymentStatus || '').toLowerCase();
    if (d.mock === true) return false;
    if (excluded.has(status)) return false;
    return successStatuses.has(status);
  });

  const totalDonationsAmount = successful.reduce((sum, d) => {
    const amount = Number(d.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);

  const operationsShare = Math.round(totalDonationsAmount * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
  const influencers = await listInfluencers();

  return {
    platformFeePercent: PLATFORM_FEE_PERCENT,
    currency: 'EUR',
    totalSuccessfulDonations: successful.length,
    totalDonationsAmount,
    operationsShare,
    influencerCount: influencers.length,
    activeInfluencerCount: influencers.filter((i) => i.active).length,
    // Real-data only: zeros are honest until live payments exist.
    note: successful.length === 0
      ? 'No verified donations yet. Operations share will appear when real payments are recorded.'
      : null,
  };
}

function slugify(text) {
  const slug = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'foundation';
}

function influencerToFoundation(row, projects = []) {
  const displayName = String(row.displayName || '').trim();
  const foundationName = String(row.foundationName || '').trim()
    || (displayName ? `${displayName}'s Foundation` : 'Creator Foundation');
  const categories = Array.isArray(row.categories)
    ? row.categories.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const primaryCategory = String(row.primaryCategory || '').trim() || categories[0] || '';
  const publicProjects = (projects || [])
    .filter((p) => p && p.status === 'active')
    .map((p) => ({
      id: p.id,
      title: p.title || '',
      description: p.shortDescription || p.description || '',
      country: p.country || '',
      location: p.location || '',
      category: p.category || '',
      coverImage: p.coverImage || '',
      status: 'active',
      goal: p.fundingGoal,
      raised: p.fundingRaised || 0,
    }));

  return {
    id: row.id,
    slug: slugify(foundationName),
    creatorName: displayName,
    foundationName,
    mission: String(row.mission || row.cardShortMission || '').trim(),
    biography: String(row.biography || row.story || '').trim(),
    whyStarted: String(row.whyStarted || '').trim(),
    howItWorks: String(row.howItWorks || '').trim(),
    coreValues: [],
    country: String(row.country || '').trim(),
    languages: [],
    categories: primaryCategory && !categories.includes(primaryCategory)
      ? [primaryCategory, ...categories]
      : categories,
    primaryCategory,
    profileImage: String(row.profileImage || '').trim(),
    coverImage: String(row.coverImage || '').trim(),
    verificationStatus: row.verificationStatus || 'unverified',
    verificationNotes: '',
    foundedDate: row.createdAt || null,
    website: String(row.website || '').trim(),
    socialLinks: row.socialLinks && typeof row.socialLinks === 'object' ? row.socialLinks : {},
    impactMetrics: [],
    legalOrganization: null,
    financialAllocation: [
      { label: 'Direct program support', percent: 100 - PLATFORM_FEE_PERCENT },
      { label: 'Platform fee', percent: PLATFORM_FEE_PERCENT },
    ],
    howDonationsAreUsed:
      `${100 - PLATFORM_FEE_PERCENT}% of every donation goes directly to this Creator Foundation's mission. `
      + `${PLATFORM_FEE_PERCENT}% helps keep World Choir and Creator Foundations running.`,
    featured: true,
    active: row.active !== false,
    donationsEnabled: true,
    sortOrder: 100,
    projects: publicProjects,
  };
}

/**
 * Public Donate catalog from Owner-created influencers + verified donation ledger.
 * Never invents raised totals — ledger only (empty until real payments exist).
 */
async function getPublicCreatorFoundationsCatalog() {
  assertBlobConfigured();
  const doc = await readInfluencersDoc();

  // Active Owner-created influencers appear on Donate.
  // Backfill publish flag for profiles created before auto-publish.
  let mutated = false;
  doc.influencers.forEach((row) => {
    if (row.active !== false && row.published !== true) {
      row.published = true;
      mutated = true;
    }
  });
  if (mutated) {
    await writeInfluencersDoc(doc);
  }

  const influencers = doc.influencers.filter(
    (row) => row.active !== false && row.published === true
  );

  const foundations = await Promise.all(
    influencers.map(async (row) => {
      try {
        const { readWorkspace, publicProject } = require('./foundation-workspace');
        const ws = await readWorkspace(row.id);
        const projects = (ws.projects || []).map(publicProject);
        return influencerToFoundation(row, projects);
      } catch {
        return influencerToFoundation(row, []);
      }
    })
  );
  foundations.sort((a, b) => String(b.foundedDate || '').localeCompare(String(a.foundedDate || '')));

  const foundationIds = new Set(foundations.map((f) => f.id));
  const ledger = await readDonationsLedger();
  const donations = ledger.filter((d) => foundationIds.has(d.foundationId));

  return {
    version: 3,
    dataPolicy: {
      production: true,
      rule:
        'Display only creator-provided facts and platform-calculated stats from verified records. Never invent numbers.',
      source: 'owner-influencers',
    },
    platform: {
      name: 'Creator Foundations',
      feePercent: PLATFORM_FEE_PERCENT,
      feePurpose:
        'Operational costs that keep World Choir running and the Creator Foundations platform secure and transparent.',
    },
    currency: 'EUR',
    supportedCurrencies: ['EUR', 'USD', 'GBP'],
    suggestedAmounts: [5, 10, 25, 50, 100],
    foundations,
    donations,
  };
}

module.exports = {
  PLATFORM_FEE_PERCENT,
  listInfluencers,
  findInfluencerByEmail,
  findInfluencerById,
  createInfluencer,
  updateInfluencer,
  verifyInfluencerCredentials,
  changeInfluencerPassword,
  changeInfluencerEmail,
  getOperationsOverview,
  getPublicCreatorFoundationsCatalog,
  publicInfluencer,
  readDonationsLedger,
};
