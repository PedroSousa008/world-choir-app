const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SESSION_COOKIE = 'wc_owner_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function getOwnerConfig() {
  return {
    email: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
    relationshipDate: normalizeRelationshipDate(process.env.OWNER_RELATIONSHIP_DATE || ''),
    passwordHash: process.env.OWNER_PASSWORD_HASH || '',
    sessionSecret: process.env.OWNER_SESSION_SECRET || '',
  };
}

function isOwnerAuthConfigured() {
  const cfg = getOwnerConfig();
  return !!(cfg.email && cfg.relationshipDate && cfg.passwordHash && cfg.sessionSecret);
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

function verifySessionToken(token) {
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
    if (payload.role !== 'owner') return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE]);
}

function setOwnerSessionCookie(res) {
  const token = signSession({
    role: 'owner',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  });

  const secure = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const cookie = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  res.setHeader('Set-Cookie', cookie);
}

function clearOwnerSessionCookie(res) {
  const secure = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const cookie = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  res.setHeader('Set-Cookie', cookie);
}

function requireOwner(req, res) {
  const session = getSessionFromRequest(req);
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

async function verifyOwnerCredentials({ email, password, relationshipDate }) {
  if (!isOwnerAuthConfigured()) {
    return { ok: false, error: 'Owner authentication is not configured' };
  }

  const cfg = getOwnerConfig();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedDate = normalizeRelationshipDate(relationshipDate);

  if (!normalizedEmail || !password || !normalizedDate) {
    return { ok: false, error: 'Email, password, and relationship date are required' };
  }

  const emailMatch = safeEqual(normalizedEmail, cfg.email);
  const dateMatch = safeEqual(normalizedDate, cfg.relationshipDate);

  const passwordMatch = await bcrypt.compare(String(password), cfg.passwordHash);

  if (!emailMatch || !dateMatch || !passwordMatch) {
    return { ok: false, error: 'Invalid owner credentials' };
  }

  return { ok: true };
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  SESSION_COOKIE,
  corsHeaders,
  getOwnerConfig,
  isOwnerAuthConfigured,
  normalizeRelationshipDate,
  getSessionFromRequest,
  setOwnerSessionCookie,
  clearOwnerSessionCookie,
  requireOwner,
  verifyOwnerCredentials,
};
