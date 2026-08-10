const path = require('path');
const { randomUUID } = require('crypto');
const { readBlobJson, writeJson, findUserByDevice, assertBlobConfigured } = require('./store');

const ROOT = 'wc-data/daily-peace';
const RECENT_ACT_LIMIT = 90;

let catalogCache = null;

function loadCatalog() {
  if (!catalogCache) {
    catalogCache = require(path.join(__dirname, '../data/daily-acts-of-peace.json'));
  }
  return catalogCache.acts.filter((act) => act.active !== false);
}

function getUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Accept YYYY-MM-DD client local dates within a safe window of UTC. */
function resolveDate(input) {
  const fallback = getUtcDateString();
  const raw = String(input || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;

  const utcToday = new Date(`${fallback}T12:00:00.000Z`).getTime();
  const chosen = new Date(`${raw}T12:00:00.000Z`).getTime();
  if (!Number.isFinite(chosen)) return fallback;

  const dayMs = 24 * 60 * 60 * 1000;
  if (Math.abs(chosen - utcToday) > 2 * dayMs) return fallback;
  return raw;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function userDailyActPath(userId, date) {
  return `${ROOT}/assignments/${userId}/${date}.json`;
}

function userHistoryPrefix(userId) {
  return `${ROOT}/assignments/${userId}/`;
}

async function readUserDailyAct(userId, date) {
  try {
    return await readBlobJson(userDailyActPath(userId, date));
  } catch {
    return null;
  }
}

async function listRecentUserActIds(userId, beforeDate, limit = RECENT_ACT_LIMIT) {
  const { list } = require('@vercel/blob');
  assertBlobConfigured();
  const prefix = userHistoryPrefix(userId);
  const { blobs } = await list({ prefix, limit: 200 });
  const entries = await Promise.all(
    blobs
      .filter((b) => b.pathname.endsWith('.json'))
      .map(async (blob) => {
        const date = blob.pathname.split('/').pop().replace('.json', '');
        if (date >= beforeDate) return null;
        try {
          const row = await readBlobJson(blob.pathname);
          return { date, actId: row.act_id };
        } catch {
          return null;
        }
      })
  );

  return entries
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((entry) => entry.actId);
}

function pickActForUser(userId, date, recentActIds) {
  const acts = loadCatalog();
  const recent = new Set(recentActIds);
  let pool = acts.filter((act) => !recent.has(act.id));
  if (!pool.length) pool = acts;

  // Deterministic per user+day, but different users land on different acts.
  const seed = hashString(`${userId}:${date}:peace-v3`);
  const index = seed % pool.length;
  return pool[index];
}

function mapAct(act) {
  if (!act) return null;
  const mapped = {
    id: act.id,
    text: act.text,
    explanation: act.explanation || null,
    category: act.category || null,
  };
  if (act.nav && typeof act.nav === 'object') {
    mapped.nav = {
      type: act.nav.type || null,
      label: act.nav.label || null,
      cause: act.nav.cause || null,
    };
  }
  return mapped;
}

function mapUserDailyAct(row, act) {
  const completed = !!row.completed;
  const notificationDismissed = !!row.notification_dismissed;
  return {
    userDailyAct: {
      id: row.id,
      userId: row.user_id,
      actId: row.act_id,
      date: row.date,
      completed,
      completedAt: row.completed_at || null,
      assignedAt: row.assigned_at,
      notificationDismissed,
      notificationDismissedAt: row.notification_dismissed_at || null,
    },
    act: mapAct(act),
    showNotification: !completed && !notificationDismissed,
  };
}

async function assignFreshDailyAct(user, date, actsById, recentExtraIds = []) {
  const recentActIds = [
    ...recentExtraIds,
    ...(await listRecentUserActIds(user.id, date)),
  ];
  const chosen = pickActForUser(user.id, date, recentActIds);
  const now = new Date().toISOString();

  const row = {
    id: randomUUID(),
    user_id: user.id,
    act_id: chosen.id,
    date,
    completed: false,
    completed_at: null,
    assigned_at: now,
    notification_dismissed: false,
    notification_dismissed_at: null,
  };

  try {
    await writeJson(userDailyActPath(user.id, date), row, { overwrite: true });
  } catch {
    const raced = await readUserDailyAct(user.id, date);
    if (raced) {
      const racedAct = actsById.get(raced.act_id);
      if (racedAct) return mapUserDailyAct(raced, racedAct);
    }
    throw new Error('Could not assign daily act. Please try again.');
  }

  return mapUserDailyAct(row, chosen);
}

async function getOrAssignDailyAct(deviceId, dateInput) {
  assertBlobConfigured();
  const date = resolveDate(dateInput);
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const existing = await readUserDailyAct(user.id, date);
  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));

  if (existing) {
    const act = actsById.get(existing.act_id);
    if (!act) {
      return assignFreshDailyAct(user, date, actsById, [existing.act_id]);
    }
    // Backfill notification fields for older assignment rows.
    if (typeof existing.notification_dismissed !== 'boolean') {
      const patched = {
        ...existing,
        notification_dismissed: false,
        notification_dismissed_at: null,
      };
      await writeJson(userDailyActPath(user.id, date), patched, { overwrite: true });
      return mapUserDailyAct(patched, act);
    }
    return mapUserDailyAct(existing, act);
  }

  return assignFreshDailyAct(user, date, actsById);
}

async function completeDailyAct(deviceId, dateInput) {
  assertBlobConfigured();
  const date = resolveDate(dateInput);
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, date);
  if (!row) throw new Error('no daily act assigned for today');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);

  if (!act) {
    await assignFreshDailyAct(user, date, actsById, [row.act_id]);
    throw new Error('Today’s act was updated. Please open it again.');
  }

  if (row.completed) {
    return mapUserDailyAct(row, act);
  }

  const updated = {
    ...row,
    completed: true,
    completed_at: new Date().toISOString(),
    notification_dismissed: true,
    notification_dismissed_at: row.notification_dismissed_at || new Date().toISOString(),
  };

  await writeJson(userDailyActPath(user.id, date), updated, { overwrite: true });
  return mapUserDailyAct(updated, act);
}

async function dismissDailyActNotification(deviceId, dateInput) {
  assertBlobConfigured();
  const date = resolveDate(dateInput);
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, date);
  if (!row) throw new Error('no daily act assigned for today');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);
  if (!act) {
    await assignFreshDailyAct(user, date, actsById, [row.act_id]);
    throw new Error('Today’s act was updated. Please open it again.');
  }

  if (row.notification_dismissed || row.completed) {
    return mapUserDailyAct(row, act);
  }

  const updated = {
    ...row,
    notification_dismissed: true,
    notification_dismissed_at: new Date().toISOString(),
  };

  await writeJson(userDailyActPath(user.id, date), updated, { overwrite: true });
  return mapUserDailyAct(updated, act);
}

module.exports = {
  getUtcDateString,
  resolveDate,
  getOrAssignDailyAct,
  completeDailyAct,
  dismissDailyActNotification,
  loadCatalog,
};
