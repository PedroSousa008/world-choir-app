/**
 * Push subscription store (Web Push + Expo tokens).
 * Never expose raw tokens in Owner UI logs beyond truncated ids.
 */
const { writeJson, readBlobJson, listAllUsers, listAllPledges } = require('./store');

const ROOT = 'wc-data/push';
const INDEX_PATH = `${ROOT}/subscriptions-index.json`;

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = 'sub') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function truncateEndpoint(endpoint) {
  const s = String(endpoint || '');
  if (s.length <= 48) return s;
  return `${s.slice(0, 24)}…${s.slice(-12)}`;
}

async function readIndex() {
  try {
    const data = await readBlobJson(INDEX_PATH);
    return {
      version: 1,
      subscriptions: Array.isArray(data?.subscriptions) ? data.subscriptions : [],
      updatedAt: data?.updatedAt || null,
    };
  } catch {
    return { version: 1, subscriptions: [], updatedAt: null };
  }
}

async function writeIndex(index) {
  const payload = {
    version: 1,
    subscriptions: index.subscriptions || [],
    updatedAt: nowIso(),
  };
  await writeJson(INDEX_PATH, payload);
  return payload;
}

function publicSub(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    platform: row.platform,
    enabled: row.enabled !== false && !row.invalidatedAt,
    timezone: row.timezone || null,
    locale: row.locale || null,
    role: row.role || 'voice',
    updatedAt: row.updatedAt,
    endpointHint: row.provider === 'web_push' ? truncateEndpoint(row.endpoint) : null,
  };
}

/**
 * Upsert a web push subscription for a device/user.
 */
async function upsertWebPushSubscription({
  deviceId,
  userId,
  subscription,
  timezone,
  locale,
  role = 'voice',
}) {
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || '').trim();
  const auth = String(subscription?.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    const err = new Error('Invalid web push subscription');
    err.statusCode = 400;
    throw err;
  }
  if (!deviceId) {
    const err = new Error('deviceId required');
    err.statusCode = 400;
    throw err;
  }

  const index = await readIndex();
  const existing = index.subscriptions.find(
    (s) => s.provider === 'web_push' && s.endpoint === endpoint
  );
  const now = nowIso();
  const row = {
    id: existing?.id || uid('sub'),
    provider: 'web_push',
    platform: 'web',
    deviceId: String(deviceId),
    userId: userId || existing?.userId || null,
    endpoint,
    keys: { p256dh, auth },
    timezone: timezone || existing?.timezone || null,
    locale: locale || existing?.locale || null,
    role: role === 'owner_test' ? 'owner_test' : (existing?.role || 'voice'),
    enabled: true,
    invalidatedAt: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // One active web subscription per device — drop older endpoints for same device.
  index.subscriptions = index.subscriptions.filter(
    (s) => !(s.provider === 'web_push' && s.deviceId === row.deviceId && s.endpoint !== endpoint)
  );

  if (existing) {
    index.subscriptions = index.subscriptions.map((s) => (s.id === row.id ? row : s));
  } else {
    index.subscriptions.unshift(row);
  }
  await writeIndex(index);
  return publicSub(row);
}

async function upsertExpoPushToken({
  deviceId,
  userId,
  expoPushToken,
  platform,
  timezone,
  locale,
  role = 'voice',
}) {
  const token = String(expoPushToken || '').trim();
  if (!token || !token.startsWith('ExponentPushToken')) {
    const err = new Error('Invalid Expo push token');
    err.statusCode = 400;
    throw err;
  }
  if (!deviceId) {
    const err = new Error('deviceId required');
    err.statusCode = 400;
    throw err;
  }

  const index = await readIndex();
  const existing = index.subscriptions.find(
    (s) => s.provider === 'expo' && s.expoPushToken === token
  );
  const now = nowIso();
  const row = {
    id: existing?.id || uid('sub'),
    provider: 'expo',
    platform: platform === 'ios' || platform === 'android' ? platform : 'unknown',
    deviceId: String(deviceId),
    userId: userId || existing?.userId || null,
    expoPushToken: token,
    timezone: timezone || existing?.timezone || null,
    locale: locale || existing?.locale || null,
    role: role === 'owner_test' ? 'owner_test' : (existing?.role || 'voice'),
    enabled: true,
    invalidatedAt: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  index.subscriptions = index.subscriptions.filter(
    (s) => !(s.provider === 'expo' && s.deviceId === row.deviceId && s.expoPushToken !== token)
  );
  if (existing) {
    index.subscriptions = index.subscriptions.map((s) => (s.id === row.id ? row : s));
  } else {
    index.subscriptions.unshift(row);
  }
  await writeIndex(index);
  return publicSub(row);
}

async function disableSubscription({ deviceId, endpoint, expoPushToken }) {
  const index = await readIndex();
  let changed = 0;
  index.subscriptions = index.subscriptions.map((s) => {
    const matchDevice = deviceId && s.deviceId === String(deviceId);
    const matchEndpoint = endpoint && s.endpoint === endpoint;
    const matchExpo = expoPushToken && s.expoPushToken === expoPushToken;
    if (matchDevice || matchEndpoint || matchExpo) {
      changed += 1;
      return {
        ...s,
        enabled: false,
        invalidatedAt: nowIso(),
        updatedAt: nowIso(),
      };
    }
    return s;
  });
  if (changed) await writeIndex(index);
  return { ok: true, changed };
}

async function markSubscriptionInvalid(subscriptionId, reason) {
  const index = await readIndex();
  const row = index.subscriptions.find((s) => s.id === subscriptionId);
  if (!row) return null;
  row.enabled = false;
  row.invalidatedAt = nowIso();
  row.invalidReason = String(reason || 'invalid').slice(0, 120);
  row.updatedAt = row.invalidatedAt;
  await writeIndex(index);
  return publicSub(row);
}

function isActive(sub) {
  return !!sub && sub.enabled !== false && !sub.invalidatedAt;
}

/**
 * Resolve push recipients for an audience definition.
 * Prefer real subscriptions over pledge counts.
 */
async function resolveRecipients(audience = { mode: 'everyone' }, { ownerTestOnly = false } = {}) {
  const index = await readIndex();
  let pool = index.subscriptions.filter(isActive);
  if (ownerTestOnly) {
    pool = pool.filter((s) => s.role === 'owner_test');
    return { recipients: pool, totalActive: pool.length };
  }

  const mode = audience?.mode === 'custom' ? 'custom' : 'everyone';
  const filters = audience?.filters || {};

  if (mode === 'custom' && (filters.country || filters.city || filters.notifications_enabled != null)) {
    const [users, pledges] = await Promise.all([
      listAllUsers().catch(() => []),
      listAllPledges().catch(() => []),
    ]);
    const pledgeByUser = new Map();
    for (const p of pledges) {
      const uid = p.user_id || p.userId;
      if (uid) pledgeByUser.set(uid, p);
    }
    const userByDevice = new Map();
    for (const u of users) {
      if (u.anonymous_device_id) userByDevice.set(u.anonymous_device_id, u);
    }

    pool = pool.filter((s) => {
      if (filters.notifications_enabled === false) return false;
      const pledge = (s.userId && pledgeByUser.get(s.userId))
        || (s.deviceId && userByDevice.get(s.deviceId) && pledgeByUser.get(userByDevice.get(s.deviceId).id))
        || null;
      if (filters.country) {
        const c = String(filters.country).trim().toLowerCase();
        if (!pledge || String(pledge.country || '').trim().toLowerCase() !== c) return false;
      }
      if (filters.city) {
        const c = String(filters.city).trim().toLowerCase();
        if (!pledge || String(pledge.city || '').trim().toLowerCase() !== c) return false;
      }
      return true;
    });
  }

  return {
    recipients: pool,
    totalActive: index.subscriptions.filter(isActive).length,
  };
}

async function getAudienceReachSummary() {
  const index = await readIndex();
  const active = index.subscriptions.filter(isActive);
  const web = active.filter((s) => s.provider === 'web_push').length;
  const expo = active.filter((s) => s.provider === 'expo').length;
  const ownerTest = active.filter((s) => s.role === 'owner_test').length;
  const [users] = await Promise.all([listAllUsers().catch(() => [])]);
  const totalVoices = users.length;
  const enabledPct = totalVoices > 0 ? Math.round((active.length / totalVoices) * 1000) / 10 : null;
  return {
    totalVoices,
    notificationsEnabledCount: active.length,
    notificationsEnabled: enabledPct,
    notificationsDisabled: enabledPct == null ? null : Math.round((100 - enabledPct) * 10) / 10,
    appSubscriptionKnown: true,
    devicePermissionKnown: true,
    byProvider: { web_push: web, expo },
    ownerTestDevices: ownerTest,
    note: active.length
      ? 'Reach counts devices with an active World Choir push subscription.'
      : 'No push subscriptions registered yet. Users must enable notifications in the app.',
  };
}

module.exports = {
  readIndex,
  upsertWebPushSubscription,
  upsertExpoPushToken,
  disableSubscription,
  markSubscriptionInvalid,
  resolveRecipients,
  getAudienceReachSummary,
  publicSub,
  isActive,
  truncateEndpoint,
};
