const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  getOwnerPasswordHash,
  saveOwnerPasswordHash,
  getOwnerEmailOverride,
  saveOwnerEmail,
} = require('./store');

const SESSION_COOKIE = 'wc_owner_session';
const MEMBERS_SESSION_COOKIE = 'wc_members_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

function getOwnerConfig() {
  return {
    email: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
    relationshipDate: normalizeRelationshipDate(process.env.OWNER_RELATIONSHIP_DATE || ''),
    sessionSecret: process.env.OWNER_SESSION_SECRET || '',
  };
}

async function getEffectiveOwnerEmail() {
  const override = await getOwnerEmailOverride();
  if (override) return override;
  return getOwnerConfig().email;
}

function isOwnerAuthConfigured() {
  const cfg = getOwnerConfig();
  const hasPassword = !!process.env.OWNER_PASSWORD_HASH;
  return !!(cfg.email && cfg.sessionSecret && hasPassword);
}

function normalizeRelationshipDate(input) {
  const s = String(input || '').trim().replace(/\s/g, '');
  if (!s) return '';

  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`;
  }

  m = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (m) {
    return `${m[3].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[1]}`;
  }

  return s;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function signSession(payload) {
  const { sessionSecret } = getOwnerConfig();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySessionToken(token, { allowedRoles = ['owner'] } = {}) {
  if (!token || !isOwnerAuthConfigured()) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, sig] = parts;
  const { sessionSecret } = getOwnerConfig();
  const expected = crypto.createHmac('sha256', sessionSecret).update(data).digest('base64url');

  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!allowedRoles.includes(payload.role)) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE], { allowedRoles: ['owner'] });
}

function getMembersSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[MEMBERS_SESSION_COOKIE], {
    allowedRoles: ['owner', 'influencer'],
  });
}

function buildSessionCookie(name, token, maxAgeSeconds) {
  const secure = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  return [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function setOwnerSessionCookie(res) {
  const token = signSession({
    role: 'owner',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  });
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', [
    buildSessionCookie(SESSION_COOKIE, token, maxAge),
    buildSessionCookie(MEMBERS_SESSION_COOKIE, token, maxAge),
  ]);
}

function setMembersSessionCookie(res, payload) {
  const token = signSession({
    ...payload,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  });
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  if (payload.role === 'owner') {
    res.setHeader('Set-Cookie', [
      buildSessionCookie(SESSION_COOKIE, token, maxAge),
      buildSessionCookie(MEMBERS_SESSION_COOKIE, token, maxAge),
    ]);
    return;
  }
  res.setHeader(
    'Set-Cookie',
    buildSessionCookie(MEMBERS_SESSION_COOKIE, token, maxAge)
  );
}

function clearOwnerSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    buildSessionCookie(SESSION_COOKIE, '', 0),
    buildSessionCookie(MEMBERS_SESSION_COOKIE, '', 0),
  ]);
}

function clearMembersSessionCookie(res) {
  res.setHeader('Set-Cookie', buildSessionCookie(MEMBERS_SESSION_COOKIE, '', 0));
}

function requireOwner(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session;
}

function requireMembersOwner(req, res) {
  const session = getMembersSessionFromRequest(req);
  if (!session || session.role !== 'owner') {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session;
}

function requireMembersSession(req, res) {
  const session = getMembersSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return session;
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function verifyOwnerCredentials({ email, password }) {
  if (!isOwnerAuthConfigured()) {
    return { ok: false, error: 'Owner authentication is not configured' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const ownerEmail = await getEffectiveOwnerEmail();

  if (!normalizedEmail || !password) {
    return { ok: false, error: 'Email and password are required' };
  }

  const emailMatch = safeEqual(normalizedEmail, ownerEmail);
  const passwordMatch = await bcrypt.compare(String(password), await getOwnerPasswordHash());

  if (!emailMatch || !passwordMatch) {
    return { ok: false, error: 'Invalid owner credentials' };
  }

  return { ok: true };
}

async function changeOwnerPassword({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, error: 'All password fields are required' };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'New passwords do not match' };
  }

  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  if (currentPassword === newPassword) {
    return { ok: false, error: 'New password must be different from your current password' };
  }

  const currentHash = await getOwnerPasswordHash();
  if (!currentHash) {
    return { ok: false, error: 'Owner authentication is not configured' };
  }

  const currentMatch = await bcrypt.compare(String(currentPassword), currentHash);
  if (!currentMatch) {
    return { ok: false, error: 'Current password is incorrect' };
  }

  const newHash = await bcrypt.hash(String(newPassword), 12);
  await saveOwnerPasswordHash(newHash);
  return { ok: true };
}

async function changeOwnerEmail({ currentPassword, newEmail, confirmEmail }) {
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

  const currentHash = await getOwnerPasswordHash();
  if (!currentHash) {
    return { ok: false, error: 'Owner authentication is not configured' };
  }

  const passwordMatch = await bcrypt.compare(String(currentPassword), currentHash);
  if (!passwordMatch) {
    return { ok: false, error: 'Current password is incorrect' };
  }

  const currentEmail = await getEffectiveOwnerEmail();
  if (safeEqual(normalized, currentEmail)) {
    return { ok: false, error: 'New email must be different from your current email' };
  }

  await saveOwnerEmail(normalized);
  return { ok: true, email: normalized };
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  SESSION_COOKIE,
  MEMBERS_SESSION_COOKIE,
  MIN_PASSWORD_LENGTH,
  corsHeaders,
  getOwnerConfig,
  getEffectiveOwnerEmail,
  isOwnerAuthConfigured,
  normalizeRelationshipDate,
  getSessionFromRequest,
  getMembersSessionFromRequest,
  setOwnerSessionCookie,
  setMembersSessionCookie,
  clearOwnerSessionCookie,
  clearMembersSessionCookie,
  requireOwner,
  requireMembersOwner,
  requireMembersSession,
  verifyOwnerCredentials,
  changeOwnerPassword,
  changeOwnerEmail,
  safeEqual,
};
