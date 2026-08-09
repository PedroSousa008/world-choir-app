const path = require('path');
const { randomUUID } = require('crypto');
const { readBlobJson, writeJson, findUserByDevice, assertBlobConfigured } = require('./store');

const ROOT = 'wc-data/daily-peace';
const RECENT_ACT_LIMIT = 30;

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
  const { blobs } = await list({ prefix, limit: 120 });
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

  const index = hashString(`${userId}:${date}`) % pool.length;
  return pool[index];
}

function mapUserDailyAct(row, act) {
  return {
    userDailyAct: {
      id: row.id,
      userId: row.user_id,
      actId: row.act_id,
      date: row.date,
      completed: row.completed,
      completedAt: row.completed_at,
      assignedAt: row.assigned_at,
    },
    act: act
      ? {
          id: act.id,
          text: act.text,
          category: act.category || null,
        }
      : null,
  };
}

async function getOrAssignDailyAct(deviceId, date = getUtcDateString()) {
  assertBlobConfigured();
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const existing = await readUserDailyAct(user.id, date);
  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));

  if (existing) {
    const act = actsById.get(existing.act_id);
    if (!act) throw new Error('assigned act not found in catalog');
    return mapUserDailyAct(existing, act);
  }

  const recentActIds = await listRecentUserActIds(user.id, date);
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
  };

  try {
    await writeJson(userDailyActPath(user.id, date), row, { overwrite: false });
  } catch {
    const raced = await readUserDailyAct(user.id, date);
    if (raced) return mapUserDailyAct(raced, actsById.get(raced.act_id));
    throw new Error('Could not assign daily act. Please try again.');
  }

  return mapUserDailyAct(row, chosen);
}

async function completeDailyAct(deviceId, date = getUtcDateString()) {
  assertBlobConfigured();
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, date);
  if (!row) throw new Error('no daily act assigned for today');

  if (row.completed) {
    const act = loadCatalog().find((item) => item.id === row.act_id);
    return mapUserDailyAct(row, act);
  }

  const updated = {
    ...row,
    completed: true,
    completed_at: new Date().toISOString(),
  };

  await writeJson(userDailyActPath(user.id, date), updated, { overwrite: true });
  const act = loadCatalog().find((item) => item.id === updated.act_id);
  return mapUserDailyAct(updated, act);
}

module.exports = {
  getUtcDateString,
  getOrAssignDailyAct,
  completeDailyAct,
  loadCatalog,
};
