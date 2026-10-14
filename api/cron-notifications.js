/**
 * Cron worker — drain scheduled/queued notification campaigns.
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Optional fallback: ?secret=$CRON_SECRET (timing-safe; prefer Bearer — query can leak in logs).
 * Vercel Cron sends Authorization automatically when CRON_SECRET is configured.
 */
const crypto = require('crypto');
const {
  readBlobJson,
  writeJson,
} = require('./_lib/store');
const { processDueCampaigns } = require('./_lib/notification-dispatch');
const { getProviderStatus } = require('./_lib/push-provider');

const INDEX_PATH = 'wc-data/owner/notifications/campaigns-index.json';
const AUDIT_PATH = 'wc-data/owner/notifications/audit.json';

function emptyMetrics() {
  return {
    targeted_count: 0,
    sent_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    action_completed_count: 0,
    failed_count: 0,
    permissions_disabled_24h: 0,
    denominator: 'delivered',
  };
}

async function readIndex() {
  try {
    const data = await readBlobJson(INDEX_PATH);
    return {
      version: 1,
      campaigns: Array.isArray(data?.campaigns) ? data.campaigns : [],
      updatedAt: data?.updatedAt || null,
    };
  } catch {
    return { version: 1, campaigns: [], updatedAt: null };
  }
}

async function writeIndex(index) {
  await writeJson(INDEX_PATH, {
    version: 1,
    campaigns: index.campaigns || [],
    updatedAt: new Date().toISOString(),
  });
}

async function appendAudit(event) {
  let events = [];
  try {
    const data = await readBlobJson(AUDIT_PATH);
    events = Array.isArray(data?.events) ? data.events : [];
  } catch { /* empty */ }
  events.unshift({
    id: `audit_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    ...event,
  });
  await writeJson(AUDIT_PATH, { events: events.slice(0, 2000), updatedAt: new Date().toISOString() });
}

function secretsEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  try {
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function authorize(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return { ok: false, reason: 'CRON_SECRET not configured' };

  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (bearer && secretsEqual(bearer, secret)) return { ok: true };

  // Fallback for manual ops — prefer Bearer in production.
  const querySecret = String(req.query?.secret || '').trim();
  if (querySecret && secretsEqual(querySecret, secret)) return { ok: true };

  return { ok: false, reason: 'Unauthorized' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Cron is not a browser CORS resource.
  res.setHeader('Access-Control-Allow-Origin', 'null');

  if (req.method === 'OPTIONS') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = authorize(req);
  if (!auth.ok) {
    return res.status(401).json({ error: auth.reason || 'Unauthorized' });
  }

  try {
    const report = await processDueCampaigns({
      readIndex,
      writeIndex,
      appendAudit,
      emptyMetrics,
      maxCampaigns: 5,
      maxBatches: 8,
    });
    return res.status(200).json({
      ok: true,
      at: new Date().toISOString(),
      providers: getProviderStatus(),
      ...report,
    });
  } catch (err) {
    console.error('api/cron-notifications error:', err);
    return res.status(500).json({ error: err.message || 'Cron failed' });
  }
};
