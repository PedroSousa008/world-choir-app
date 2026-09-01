/**
 * Map sponsor / company management — Owner storage and public projection.
 *
 * Authoritative data for the public Map sponsor bar. Private contract and contact
 * fields are never included in publicSponsorRecord().
 */
const { randomUUID } = require('crypto');
const {
  readBlobJson,
  writeJson,
  putPrivateBinary,
  readPrivateBinary,
  mediaProxyUrl,
  assertBlobConfigured,
} = require('./store');

const SPONSORS_ROOT = 'wc-data/map-sponsors';
const SPONSORS_INDEX = `${SPONSORS_ROOT}/index.json`;
const SPONSORS_MEDIA_ROOT = `${SPONSORS_ROOT}/media`;
const SPONSORS_DOCS_ROOT = `${SPONSORS_ROOT}/documents`;

/** Default roster capacity — configurable later without model changes */
const DEFAULT_SPONSOR_CAPACITY = 20;

const CONTRACT_STATUSES = new Set([
  'draft', 'negotiating', 'pending_signature', 'active', 'expired',
  'terminated', 'renewing', 'other',
]);
const PAYMENT_STRUCTURES = new Set([
  'one_time', 'monthly', 'quarterly', 'annually', 'milestone', 'custom',
]);
const PAYMENT_STATUSES = new Set([
  'not_applicable', 'pending', 'partially_paid', 'paid', 'overdue', 'custom',
]);
const AGREEMENT_TYPES = new Set([
  'sponsorship', 'partnership', 'in_kind', 'promotional', 'strategic', 'other',
]);

const IMAGE_MIME_RE = /^image\/[a-z0-9.+-]+$/i;
const IMAGE_EXT_MAP = {
  png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif',
  svg: 'svg', 'svg+xml': 'svg', avif: 'avif', bmp: 'bmp',
};
const DOC_MIME_ALLOW = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_DOC_BYTES = 15 * 1024 * 1024;

let sponsorsCache = null;
let sponsorsCacheAt = 0;
const CACHE_MS = 5000;

function sponsorPath(id) {
  return `${SPONSORS_ROOT}/${id}.json`;
}

function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.href;
  } catch {
    return '';
  }
}

function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function emptyContact() {
  return { fullName: '', role: '', email: '', phone: '', notes: '' };
}

function emptyContract() {
  return {
    status: 'draft',
    startDate: null,
    endDate: null,
    signedDate: null,
    renewalDate: null,
    renewalReminderDate: null,
    value: null,
    currency: 'EUR',
    paymentStructure: 'annually',
    paymentStatus: 'not_applicable',
    amountPaid: null,
    amountOutstanding: null,
    invoiceReference: '',
    agreementType: 'sponsorship',
    ownerDeliverables: '',
    companyDeliverables: '',
    exclusivityTerms: '',
    territory: '',
    usageRights: '',
    logoUsageRights: '',
    campaignApplicability: '',
    renewalTerms: '',
    terminationTerms: '',
    specialConditions: '',
    internalNotes: '',
  };
}

function normalizeSponsorRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;

  const contacts = raw.contacts && typeof raw.contacts === 'object' ? raw.contacts : {};
  const contract = raw.contract && typeof raw.contract === 'object' ? raw.contract : {};

  return {
    id,
    companyName: String(raw.companyName || '').trim(),
    companyLogoUrl: raw.companyLogoUrl || null,
    companyWebsiteUrl: normalizeUrl(raw.companyWebsiteUrl),
    isActive: raw.isActive !== false && raw.isActive !== 0 && raw.isActive !== '0',
    displayOrder: Number.isFinite(Number(raw.displayOrder)) ? Number(raw.displayOrder) : 0,

    legalCompanyName: String(raw.legalCompanyName || '').trim(),
    internalReference: String(raw.internalReference || '').trim(),
    contacts: {
      primary: { ...emptyContact(), ...(contacts.primary || {}) },
      secondary: contacts.secondary
        ? { ...emptyContact(), ...contacts.secondary }
        : { ...emptyContact() },
    },
    address: String(raw.address || '').trim(),
    country: String(raw.country || '').trim(),
    internalNotes: String(raw.internalNotes || '').trim(),
    partnershipNotes: String(raw.partnershipNotes || '').trim(),

    contract: {
      ...emptyContract(),
      ...contract,
      status: CONTRACT_STATUSES.has(contract.status) ? contract.status : 'draft',
      paymentStructure: PAYMENT_STRUCTURES.has(contract.paymentStructure)
        ? contract.paymentStructure
        : 'annually',
      paymentStatus: PAYMENT_STATUSES.has(contract.paymentStatus)
        ? contract.paymentStatus
        : 'not_applicable',
      agreementType: AGREEMENT_TYPES.has(contract.agreementType)
        ? contract.agreementType
        : 'sponsorship',
      startDate: normalizeDate(contract.startDate),
      endDate: normalizeDate(contract.endDate),
      signedDate: normalizeDate(contract.signedDate),
      renewalDate: normalizeDate(contract.renewalDate),
      renewalReminderDate: normalizeDate(contract.renewalReminderDate),
    },

    documents: Array.isArray(raw.documents)
      ? raw.documents.map((d) => ({
        id: String(d.id || ''),
        name: String(d.name || d.fileName || 'Document').trim(),
        fileName: String(d.fileName || '').trim(),
        contentType: String(d.contentType || '').trim(),
        pathname: String(d.pathname || '').trim(),
        description: String(d.description || '').trim(),
        uploadedAt: d.uploadedAt || null,
      })).filter((d) => d.id && d.pathname)
      : [],

    activatedAt: raw.activatedAt || null,
    activationHistory: Array.isArray(raw.activationHistory) ? raw.activationHistory : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
  };
}

function publicSponsorRecord(sponsor) {
  return {
    id: sponsor.id,
    companyName: sponsor.companyName,
    logo: sponsor.companyLogoUrl || '',
    websiteUrl: sponsor.companyWebsiteUrl || '',
    displayOrder: sponsor.displayOrder ?? 0,
  };
}

function ownerSummary(sponsor) {
  return {
    id: sponsor.id,
    companyName: sponsor.companyName,
    companyLogoUrl: sponsor.companyLogoUrl,
    companyWebsiteUrl: sponsor.companyWebsiteUrl,
    isActive: sponsor.isActive,
    displayOrder: sponsor.displayOrder,
    contractStatus: sponsor.contract?.status || 'draft',
    country: sponsor.country,
    updatedAt: sponsor.updatedAt,
    createdAt: sponsor.createdAt,
  };
}

async function invalidateCache() {
  sponsorsCache = null;
  sponsorsCacheAt = 0;
}

async function readIndex() {
  try {
    const index = await readBlobJson(SPONSORS_INDEX);
    return Array.isArray(index?.ids) ? index.ids.map(String) : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids) {
  await writeJson(SPONSORS_INDEX, { ids, updatedAt: new Date().toISOString() });
}

async function loadAllSponsors({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && sponsorsCache && now - sponsorsCacheAt < CACHE_MS) {
    return sponsorsCache.slice();
  }

  assertBlobConfigured();
  const ids = await readIndex();
  const sponsors = [];
  for (const id of ids) {
    try {
      const raw = await readBlobJson(sponsorPath(id));
      const normalized = normalizeSponsorRecord(raw);
      if (normalized) sponsors.push(normalized);
    } catch {
      /* skip malformed */
    }
  }

  sponsorsCache = sponsors;
  sponsorsCacheAt = now;
  return sponsors.slice();
}

async function getSponsorById(id) {
  const sid = String(id || '').trim();
  if (!sid) return null;
  try {
    const raw = await readBlobJson(sponsorPath(sid));
    return normalizeSponsorRecord(raw);
  } catch {
    return null;
  }
}

async function writeSponsor(sponsor) {
  sponsor.updatedAt = new Date().toISOString();
  await writeJson(sponsorPath(sponsor.id), sponsor);
  await invalidateCache();
  return sponsor;
}

function getActiveSponsors(sponsors) {
  return sponsors
    .filter((s) => s.isActive)
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.companyName.localeCompare(b.companyName);
    });
}

function getInactiveSponsors(sponsors) {
  return sponsors
    .filter((s) => !s.isActive)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function compactActiveOrder(sponsors) {
  const active = getActiveSponsors(sponsors);
  for (let i = 0; i < active.length; i++) {
    const nextOrder = i + 1;
    if (active[i].displayOrder !== nextOrder) {
      active[i].displayOrder = nextOrder;
      await writeSponsor(active[i]);
    }
  }
}

function findDuplicateActiveName(sponsors, companyName, excludeId = null) {
  const needle = String(companyName || '').trim().toLowerCase();
  if (!needle) return null;
  return sponsors.find((s) =>
    s.isActive
    && s.id !== excludeId
    && s.companyName.trim().toLowerCase() === needle
  ) || null;
}

function validateCreatePayload(payload) {
  const errors = [];
  const name = String(payload.companyName || '').trim();
  if (!name) errors.push('Company name is required');
  if (name.length > 120) errors.push('Company name is too long');
  const url = normalizeUrl(payload.companyWebsiteUrl);
  if (payload.companyWebsiteUrl && !url) errors.push('Website URL must use http or https');
  return { errors, companyName: name, companyWebsiteUrl: url };
}

async function loadActivePublicSponsors() {
  const all = await loadAllSponsors();
  return getActiveSponsors(all)
    .filter((s) => s.companyName && s.companyLogoUrl)
    .map(publicSponsorRecord);
}

async function buildOwnerSponsorsLibrary() {
  const all = await loadAllSponsors({ fresh: true });
  const active = getActiveSponsors(all);
  const inactive = getInactiveSponsors(all);
  const capacity = DEFAULT_SPONSOR_CAPACITY;

  const slots = [];
  for (let pos = 1; pos <= capacity; pos++) {
    const sponsor = active.find((s) => s.displayOrder === pos) || null;
    slots.push({
      position: pos,
      sponsor: sponsor ? ownerSummary(sponsor) : null,
    });
  }

  return {
    capacity,
    overview: {
      totalCompanies: all.length,
      activeCount: active.length,
      inactiveCount: inactive.length,
      availablePositions: Math.max(0, capacity - active.length),
    },
    slots,
    inactive: inactive.map(ownerSummary),
    companies: all.map(ownerSummary),
  };
}

async function createMapSponsor(payload = {}) {
  assertBlobConfigured();
  const { errors, companyName, companyWebsiteUrl } = validateCreatePayload(payload);
  if (errors.length) throw new Error(errors.join('; '));

  const all = await loadAllSponsors({ fresh: true });
  const wantsActive = payload.isActive !== false;

  if (wantsActive) {
    const dup = findDuplicateActiveName(all, companyName);
    if (dup) throw new Error(`"${companyName}" is already an active sponsor.`);
    const activeCount = getActiveSponsors(all).length;
    if (activeCount >= DEFAULT_SPONSOR_CAPACITY) {
      throw new Error(`All ${DEFAULT_SPONSOR_CAPACITY} roster positions are in use. Deactivate a company or add as inactive.`);
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  let displayOrder = 0;

  if (wantsActive) {
    const active = getActiveSponsors(all);
    displayOrder = active.length + 1;
  }

  const sponsor = normalizeSponsorRecord({
    id,
    companyName,
    companyLogoUrl: payload.companyLogoUrl || null,
    companyWebsiteUrl,
    isActive: wantsActive,
    displayOrder,
    legalCompanyName: payload.legalCompanyName,
    internalReference: payload.internalReference,
    contacts: payload.contacts,
    address: payload.address,
    country: payload.country,
    internalNotes: payload.internalNotes,
    partnershipNotes: payload.partnershipNotes,
    contract: payload.contract,
    activatedAt: wantsActive ? now : null,
    activationHistory: wantsActive ? [{ activatedAt: now, deactivatedAt: null }] : [],
    createdAt: now,
    updatedAt: now,
  });

  await writeSponsor(sponsor);
  const ids = await readIndex();
  if (!ids.includes(id)) {
    ids.push(id);
    await writeIndex(ids);
  }

  if (wantsActive) {
    await compactActiveOrder(await loadAllSponsors({ fresh: true }));
  }

  return getSponsorById(id);
}

async function updateMapSponsor(id, updates = {}) {
  assertBlobConfigured();
  const sponsor = await getSponsorById(id);
  if (!sponsor) throw new Error('Company not found');

  const all = await loadAllSponsors({ fresh: true });

  if (updates.companyName !== undefined) {
    const name = String(updates.companyName || '').trim();
    if (!name) throw new Error('Company name is required');
    if (sponsor.isActive) {
      const dup = findDuplicateActiveName(all, name, sponsor.id);
      if (dup) throw new Error(`"${name}" is already an active sponsor.`);
    }
    sponsor.companyName = name;
  }

  if (updates.companyWebsiteUrl !== undefined) {
    const url = normalizeUrl(updates.companyWebsiteUrl);
    if (updates.companyWebsiteUrl && !url) throw new Error('Website URL must use http or https');
    sponsor.companyWebsiteUrl = url;
  }

  if (updates.companyLogoUrl !== undefined) {
    sponsor.companyLogoUrl = updates.companyLogoUrl || null;
  }

  if (updates.legalCompanyName !== undefined) sponsor.legalCompanyName = String(updates.legalCompanyName || '').trim();
  if (updates.internalReference !== undefined) sponsor.internalReference = String(updates.internalReference || '').trim();
  if (updates.address !== undefined) sponsor.address = String(updates.address || '').trim();
  if (updates.country !== undefined) sponsor.country = String(updates.country || '').trim();
  if (updates.internalNotes !== undefined) sponsor.internalNotes = String(updates.internalNotes || '').trim();
  if (updates.partnershipNotes !== undefined) sponsor.partnershipNotes = String(updates.partnershipNotes || '').trim();

  if (updates.contacts !== undefined && typeof updates.contacts === 'object') {
    sponsor.contacts = {
      primary: { ...emptyContact(), ...(updates.contacts.primary || {}) },
      secondary: updates.contacts.secondary
        ? { ...emptyContact(), ...updates.contacts.secondary }
        : sponsor.contacts.secondary,
    };
  }

  if (updates.contract !== undefined && typeof updates.contract === 'object') {
    sponsor.contract = {
      ...sponsor.contract,
      ...updates.contract,
      status: updates.contract.status && CONTRACT_STATUSES.has(updates.contract.status)
        ? updates.contract.status
        : sponsor.contract.status,
    };
  }

  await writeSponsor(sponsor);
  return getSponsorById(id);
}

async function setMapSponsorStatus(id, isActive) {
  assertBlobConfigured();
  const sponsor = await getSponsorById(id);
  if (!sponsor) throw new Error('Company not found');

  const nextActive = !!isActive;
  if (nextActive === sponsor.isActive) return sponsor;

  const all = await loadAllSponsors({ fresh: true });
  const now = new Date().toISOString();
  sponsor.activationHistory = Array.isArray(sponsor.activationHistory) ? sponsor.activationHistory : [];

  if (nextActive) {
    const dup = findDuplicateActiveName(all, sponsor.companyName, sponsor.id);
    if (dup) throw new Error(`"${sponsor.companyName}" is already an active sponsor.`);
    const activeCount = getActiveSponsors(all).length;
    if (activeCount >= DEFAULT_SPONSOR_CAPACITY) {
      throw new Error(`All ${DEFAULT_SPONSOR_CAPACITY} roster positions are in use.`);
    }
    sponsor.isActive = true;
    sponsor.displayOrder = getActiveSponsors(all).length + 1;
    sponsor.activatedAt = sponsor.activatedAt || now;
    sponsor.activationHistory.push({ activatedAt: now, deactivatedAt: null });
  } else {
    sponsor.isActive = false;
    sponsor.displayOrder = 0;
    const openPeriod = [...sponsor.activationHistory].reverse().find((period) => !period.deactivatedAt);
    if (openPeriod) openPeriod.deactivatedAt = now;
  }

  await writeSponsor(sponsor);
  await compactActiveOrder(await loadAllSponsors({ fresh: true }));
  return getSponsorById(id);
}

async function deleteMapSponsor(id) {
  assertBlobConfigured();
  const sid = String(id || '').trim();
  const sponsor = await getSponsorById(sid);
  if (!sponsor) throw new Error('Company not found');

  const ids = await readIndex();
  await writeIndex(ids.filter((x) => x !== sid));

  const { del } = require('@vercel/blob');
  try {
    await del(sponsorPath(sid));
  } catch {
    /* ignore */
  }

  await invalidateCache();
  await compactActiveOrder(await loadAllSponsors({ fresh: true }));
  return { ok: true, id: sid };
}

async function reorderMapSponsors(orderedIds) {
  assertBlobConfigured();
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    throw new Error('Ordered sponsor ids required');
  }

  const unique = [...new Set(orderedIds.map(String))];
  if (unique.length !== orderedIds.length) {
    throw new Error('Duplicate ids in reorder request');
  }

  const all = await loadAllSponsors({ fresh: true });
  const active = getActiveSponsors(all);
  const activeIds = active.map((s) => s.id);

  if (unique.length !== activeIds.length) {
    throw new Error('Reorder must include every active company exactly once');
  }

  for (const id of unique) {
    if (!activeIds.includes(id)) throw new Error(`Company ${id} is not active`);
  }

  for (let i = 0; i < unique.length; i++) {
    const sponsor = all.find((s) => s.id === unique[i]);
    if (!sponsor) continue;
    sponsor.displayOrder = i + 1;
    await writeSponsor(sponsor);
  }

  await invalidateCache();
  return buildOwnerSponsorsLibrary();
}

function parseDataUrl(dataUrl, fileName = '') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Choose a file from your device');
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error('Could not read that file');

  let contentType = String(match[1] || '').trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new Error('File was empty');

  return { contentType, buffer, fileName: String(fileName || '').trim() };
}

async function uploadMapSponsorLogo(sponsorId, dataUrl, fileName = '') {
  assertBlobConfigured();
  const sponsor = await getSponsorById(sponsorId);
  if (!sponsor) throw new Error('Company not found');

  const { contentType, buffer } = parseDataUrl(dataUrl, fileName);
  if (!IMAGE_MIME_RE.test(contentType) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(fileName)) {
    throw new Error('Logo must be PNG, WebP, GIF, JPEG, or SVG');
  }
  if (buffer.length > MAX_LOGO_BYTES) throw new Error('Logo must be under 8 MB');

  const subtype = contentType.replace(/^image\//, '');
  const ext = IMAGE_EXT_MAP[subtype] || subtype.replace(/[^a-z0-9]/gi, '') || 'img';
  const pathname = `${SPONSORS_MEDIA_ROOT}/${sponsorId}/logo-${randomUUID().slice(0, 8)}.${ext}`;
  await putPrivateBinary(pathname, buffer, contentType);
  const url = mediaProxyUrl(pathname);

  sponsor.companyLogoUrl = url;
  await writeSponsor(sponsor);
  return getSponsorById(sponsorId);
}

async function uploadMapSponsorDocument(sponsorId, dataUrl, fileName = '', description = '') {
  assertBlobConfigured();
  const sponsor = await getSponsorById(sponsorId);
  if (!sponsor) throw new Error('Company not found');

  const { contentType, buffer } = parseDataUrl(dataUrl, fileName);
  if (!DOC_MIME_ALLOW.has(contentType) && !/\.(pdf|docx?|txt|png|jpe?g|webp)$/i.test(fileName)) {
    throw new Error('Unsupported document type. Use PDF, Word, text, or image files.');
  }
  if (buffer.length > MAX_DOC_BYTES) throw new Error('Document must be under 15 MB');

  const ext = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const docId = randomUUID();
  const pathname = `${SPONSORS_DOCS_ROOT}/${sponsorId}/${docId}.${ext}`;
  await putPrivateBinary(pathname, buffer, contentType);

  const doc = {
    id: docId,
    name: fileName || 'Document',
    fileName: fileName || `document.${ext}`,
    contentType,
    pathname,
    description: String(description || '').trim(),
    uploadedAt: new Date().toISOString(),
  };

  sponsor.documents = [...(sponsor.documents || []), doc];
  await writeSponsor(sponsor);
  return getSponsorById(sponsorId);
}

async function deleteMapSponsorDocument(sponsorId, documentId) {
  assertBlobConfigured();
  const sponsor = await getSponsorById(sponsorId);
  if (!sponsor) throw new Error('Company not found');

  const doc = (sponsor.documents || []).find((d) => d.id === documentId);
  if (!doc) throw new Error('Document not found');

  const { del } = require('@vercel/blob');
  try {
    await del(doc.pathname);
  } catch {
    /* ignore */
  }

  sponsor.documents = sponsor.documents.filter((d) => d.id !== documentId);
  await writeSponsor(sponsor);
  return getSponsorById(sponsorId);
}

async function readMapSponsorDocument(sponsorId, documentId) {
  const sponsor = await getSponsorById(sponsorId);
  if (!sponsor) throw new Error('Company not found');
  const doc = (sponsor.documents || []).find((d) => d.id === documentId);
  if (!doc) throw new Error('Document not found');
  const { buffer, contentType } = await readPrivateBinary(doc.pathname);
  return { buffer, contentType: contentType || doc.contentType, fileName: doc.fileName };
}

module.exports = {
  DEFAULT_SPONSOR_CAPACITY,
  publicSponsorRecord,
  loadActivePublicSponsors,
  buildOwnerSponsorsLibrary,
  getSponsorById,
  createMapSponsor,
  updateMapSponsor,
  setMapSponsorStatus,
  deleteMapSponsor,
  reorderMapSponsors,
  uploadMapSponsorLogo,
  uploadMapSponsorDocument,
  deleteMapSponsorDocument,
  readMapSponsorDocument,
  normalizeUrl,
};
