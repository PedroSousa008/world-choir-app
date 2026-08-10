/**
 * Approved primary cause categories for Creator Foundations (Donate filters).
 * Subcategories/tags may exist elsewhere — these are the only main filters.
 */

const FOUNDATION_CAUSES = [
  'Food & Hunger',
  'Health',
  'Education',
  'Humanitarian Aid',
  'Environment',
];

const CAUSE_SET = new Set(FOUNDATION_CAUSES.map((c) => c.toLowerCase()));

/** Legacy / informal labels → approved primary category */
const CAUSE_ALIASES = {
  'humanity help': 'Humanitarian Aid',
  humanitarian: 'Humanitarian Aid',
  'humanitarian aid': 'Humanitarian Aid',
  food: 'Food & Hunger',
  hunger: 'Food & Hunger',
  'food & hunger': 'Food & Hunger',
  'food and hunger': 'Food & Hunger',
  health: 'Health',
  education: 'Education',
  environment: 'Environment',
  climate: 'Environment',
  nature: 'Environment',
};

/**
 * Known Foundation IDs missing a stored category — real cause assignments only.
 * Live to Love: emergency / community support → Humanitarian Aid
 * HelpBnk: opportunity & starting from nothing → Education
 */
const KNOWN_CAUSE_BY_ID = {
  '689fa965-53cd-4c00-be66-36668962e852': 'Humanitarian Aid',
  '1857e734-e1f9-444b-ade9-be550009019e': 'Education',
};

function isApprovedCause(value) {
  return CAUSE_SET.has(String(value || '').trim().toLowerCase());
}

function normalizePrimaryCategory(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (CAUSE_ALIASES[lower]) return CAUSE_ALIASES[lower];
  const exact = FOUNDATION_CAUSES.find((c) => c.toLowerCase() === lower);
  return exact || '';
}

/**
 * Resolve and optionally correct a Foundation's stored primary cause.
 * Returns { primaryCategory, categories, changed }.
 */
function resolveFoundationCause(row = {}) {
  const id = String(row.id || '').trim();
  const fromPrimary = normalizePrimaryCategory(row.primaryCategory);
  const fromList = Array.isArray(row.categories)
    ? normalizePrimaryCategory(row.categories.find((c) => normalizePrimaryCategory(c)))
    : '';
  let primaryCategory = fromPrimary || fromList || '';

  if (!primaryCategory && id && KNOWN_CAUSE_BY_ID[id]) {
    primaryCategory = KNOWN_CAUSE_BY_ID[id];
  }

  const prevPrimary = String(row.primaryCategory || '').trim();
  const prevCategories = Array.isArray(row.categories)
    ? row.categories.map((c) => String(c).trim()).filter(Boolean)
    : [];

  const categories = primaryCategory
    ? [primaryCategory, ...prevCategories.filter((c) => normalizePrimaryCategory(c) !== primaryCategory && c !== primaryCategory)]
    : prevCategories;

  const changed = primaryCategory !== prevPrimary
    || categories.length !== prevCategories.length
    || categories.some((c, i) => c !== prevCategories[i]);

  return { primaryCategory, categories, changed };
}

module.exports = {
  FOUNDATION_CAUSES,
  CAUSE_ALIASES,
  KNOWN_CAUSE_BY_ID,
  isApprovedCause,
  normalizePrimaryCategory,
  resolveFoundationCause,
};
