const { randomBytes, createHmac } = require('crypto');
const { readBlobJson, writeJson, assertBlobConfigured } = require('../store');

const ROOT = 'wc-data/wallet-passes';
const EVENT_ID = 'world-choir-2027';
const DOWNLOAD_TTL_MS = 10 * 60 * 1000;

function walletRecordPath(userId) {
  return `${ROOT}/users/${userId}.json`;
}

function tokenIndexPath(token) {
  return `${ROOT}/token-index/${token}.json`;
}

function downloadTicketPath(ticket) {
  return `${ROOT}/download-tickets/${ticket}.json`;
}

function passFilePath(userId) {
  return `${ROOT}/files/${userId}.pkpass`;
}

function createPublicToken() {
  return randomBytes(24).toString('base64url');
}

function createAuthToken() {
  return randomBytes(32).toString('base64url');
}

function stableSerialNumber(userId) {
  return `${EVENT_ID}:${userId}`;
}

function getPublicBaseUrl(req) {
  const configured = process.env.WORLD_CHOIR_PUBLIC_URL || process.env.VERCEL_URL;
  if (configured) {
    const url = configured.startsWith('http') ? configured : `https://${configured}`;
    return url.replace(/\/$/, '');
  }
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return 'https://world-choir-app.vercel.app';
}

function publicPassportUrl(req, token) {
  return `${getPublicBaseUrl(req)}/passport/${encodeURIComponent(token)}`;
}

async function readWalletRecord(userId) {
  assertBlobConfigured();
  try {
    return await readBlobJson(walletRecordPath(userId));
  } catch {
    return null;
  }
}

async function ensureWalletRecord({ userId, deviceId }) {
  assertBlobConfigured();
  const existing = await readWalletRecord(userId);
  if (existing?.walletPassSerialNumber && existing?.passportPublicToken) {
    return existing;
  }

  const now = new Date().toISOString();
  const passportPublicToken = existing?.passportPublicToken || createPublicToken();
  const record = {
    userId,
    deviceId: deviceId || existing?.deviceId || null,
    walletPassSerialNumber: existing?.walletPassSerialNumber || stableSerialNumber(userId),
    passportPublicToken,
    authenticationToken: existing?.authenticationToken || createAuthToken(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastPassGeneratedAt: existing?.lastPassGeneratedAt || null,
  };

  await writeJson(walletRecordPath(userId), record, { overwrite: true });
  await writeJson(tokenIndexPath(passportPublicToken), { userId }, { overwrite: true });
  return record;
}

async function resolveUserIdByPublicToken(token) {
  assertBlobConfigured();
  const trimmed = String(token || '').trim();
  if (!trimmed) return null;
  try {
    const index = await readBlobJson(tokenIndexPath(trimmed));
    return index?.userId || null;
  } catch {
    return null;
  }
}

function signDownloadTicket(userId) {
  const secret = process.env.APPLE_PASS_DOWNLOAD_SECRET || process.env.OWNER_SESSION_SECRET || 'dev-only';
  const ticket = randomBytes(18).toString('base64url');
  const expiresAt = Date.now() + DOWNLOAD_TTL_MS;
  const payload = `${ticket}.${userId}.${expiresAt}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return { ticket, userId, expiresAt, sig };
}

async function storeDownloadTicket({ ticket, userId, expiresAt, sig }) {
  await writeJson(downloadTicketPath(ticket), { ticket, userId, expiresAt, sig }, { overwrite: true });
}

function verifyDownloadTicket(record, userId) {
  const secret = process.env.APPLE_PASS_DOWNLOAD_SECRET || process.env.OWNER_SESSION_SECRET || 'dev-only';
  if (!record || record.userId !== userId || !record.ticket) return false;
  if (!record.expiresAt || Date.now() > record.expiresAt) return false;
  const payload = `${record.ticket}.${userId}.${record.expiresAt}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  return expected === record.sig;
}

async function readDownloadTicket(ticket) {
  try {
    return await readBlobJson(downloadTicketPath(ticket));
  } catch {
    return null;
  }
}

async function markPassGenerated(userId) {
  const record = await readWalletRecord(userId);
  if (!record) return null;
  const next = {
    ...record,
    updatedAt: new Date().toISOString(),
    lastPassGeneratedAt: new Date().toISOString(),
  };
  await writeJson(walletRecordPath(userId), next, { overwrite: true });
  return next;
}

module.exports = {
  EVENT_ID,
  passFilePath,
  ensureWalletRecord,
  readWalletRecord,
  resolveUserIdByPublicToken,
  publicPassportUrl,
  getPublicBaseUrl,
  signDownloadTicket,
  storeDownloadTicket,
  verifyDownloadTicket,
  readDownloadTicket,
  markPassGenerated,
};
