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
    country: row.country || '',
    primaryCategory: row.primaryCategory || '',
    categories: row.categories || [],
    active: row.active !== false,
    published: row.published === true,
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
    published: false,
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
    'country',
    'primaryCategory',
  ];

  textFields.forEach((field) => {
    if (updates[field] !== undefined) {
      next[field] = String(updates[field] || '').trim();
    }
  });

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
  publicInfluencer,
};
