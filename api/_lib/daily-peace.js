const path = require('path');
const { randomUUID } = require('crypto');
const { readBlobJson, writeJson, findUserByDevice, assertBlobConfigured } = require('./store');

const ROOT = 'wc-data/daily-peace';
const RECENT_ACT_LIMIT = 90;
const HISTORY_LIST_LIMIT = 400;
const FUTURE_PLACEHOLDER_DAYS = 7;

/** Curated themes shown in the Daily Acts grid (not difficulty). */
const THEMES = [
  {
    id: 'kindness',
    label: 'Kindness',
    description: 'Small gestures of care and generosity of spirit.',
  },
  {
    id: 'connection',
    label: 'Connection',
    description: 'Acts that bring people a little closer together.',
  },
  {
    id: 'courage',
    label: 'Courage',
    description: 'Moments that ask for honesty, bravery, or presence.',
  },
  {
    id: 'compassion',
    label: 'Compassion',
    description: 'Care for others, for the planet, and for those in need.',
  },
  {
    id: 'understanding',
    label: 'Understanding',
    description: 'Listening, learning, and seeing with clearer eyes.',
  },
  {
    id: 'generosity',
    label: 'Generosity',
    description: 'Giving time, attention, or support without expectation.',
  },
  {
    id: 'presence',
    label: 'Presence',
    description: 'Being fully here — with yourself and with others.',
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Acts that strengthen the choir we share.',
  },
];

/** Map catalog category slugs → curated theme ids. */
const CATALOG_TO_THEME = {
  'connection-kindness': 'kindness',
  communication: 'understanding',
  helping: 'compassion',
  courage: 'courage',
  joy: 'presence',
  self: 'presence',
  family: 'connection',
  community: 'community',
  reconnecting: 'connection',
  planet: 'compassion',
  'supporting-change': 'generosity',
  'foundation-discovery': 'understanding',
  'in-app-discovery': 'understanding',
  practice: 'presence',
  'special-choir': 'community',
  bigger: 'courage',
  beyond: 'understanding',
};

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

function parseDateStrict(input) {
  const raw = String(input || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

/** Accept YYYY-MM-DD client local dates within a safe window of UTC (for "today"). */
function resolveDate(input) {
  const fallback = getUtcDateString();
  const raw = parseDateStrict(input);
  if (!raw) return fallback;

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

async function listUserAssignmentRows(userId, { limit = HISTORY_LIST_LIMIT } = {}) {
  const { list } = require('@vercel/blob');
  assertBlobConfigured();
  const prefix = userHistoryPrefix(userId);
  const { blobs } = await list({ prefix, limit });
  const entries = await Promise.all(
    blobs
      .filter((b) => b.pathname.endsWith('.json'))
      .map(async (blob) => {
        try {
          return await readBlobJson(blob.pathname);
        } catch {
          return null;
        }
      })
  );
  return entries
    .filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

async function listRecentUserActIds(userId, beforeDate, limit = RECENT_ACT_LIMIT) {
  const rows = await listUserAssignmentRows(userId);
  return rows
    .filter((row) => row.date && row.date < beforeDate)
    .slice(0, limit)
    .map((row) => row.act_id);
}

function pickActForUser(userId, date, recentActIds) {
  const acts = loadCatalog();
  const recent = new Set(recentActIds);
  let pool = acts.filter((act) => !recent.has(act.id));
  if (!pool.length) pool = acts;

  const seed = hashString(`${userId}:${date}:peace-v3`);
  return pool[seed % pool.length];
}

function resolveTheme(catalogCategory) {
  const themeId = CATALOG_TO_THEME[catalogCategory] || 'presence';
  const theme = THEMES.find((t) => t.id === themeId) || THEMES.find((t) => t.id === 'presence');
  return {
    category: theme.id,
    categoryLabel: theme.label,
  };
}

function categoryLabel(slug) {
  if (!slug) return null;
  const theme = THEMES.find((t) => t.id === slug);
  if (theme) return theme.label;
  const mapped = resolveTheme(slug);
  return mapped.categoryLabel;
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapAct(act) {
  if (!act) return null;
  const theme = resolveTheme(act.category);
  const mapped = {
    id: act.id,
    text: act.text,
    explanation: act.explanation || null,
    category: theme.category,
    categoryLabel: theme.categoryLabel,
    reflectionPrompt: act.reflectionPrompt || 'What would you like to remember about this act?',
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

function normalizeRow(row) {
  return {
    ...row,
    completed: !!row.completed,
    completed_at: row.completed_at || null,
    completed_on_assigned_day: !!row.completed_on_assigned_day,
    completion_source: row.completion_source || null,
    notification_dismissed: !!row.notification_dismissed,
    notification_dismissed_at: row.notification_dismissed_at || null,
    viewed: !!row.viewed,
    viewed_at: row.viewed_at || null,
    reflection: typeof row.reflection === 'string' && row.reflection.trim() ? row.reflection.trim() : null,
    reflection_at: row.reflection_at || null,
    interactions: row.interactions && typeof row.interactions === 'object' ? row.interactions : {},
  };
}

function mapUserDailyAct(row, act, { todayDate = null } = {}) {
  const n = normalizeRow(row);
  const completed = n.completed;
  const notificationDismissed = n.notification_dismissed;
  const isToday = todayDate ? n.date === todayDate : true;
  return {
    userDailyAct: {
      id: n.id,
      userId: n.user_id,
      actId: n.act_id,
      date: n.date,
      completed,
      completedAt: n.completed_at,
      completedOnAssignedDay: n.completed_on_assigned_day,
      completionSource: n.completion_source,
      assignedAt: n.assigned_at,
      revealedAt: n.assigned_at,
      notificationDismissed,
      notificationDismissedAt: n.notification_dismissed_at,
      viewed: n.viewed,
      viewedAt: n.viewed_at,
      reflection: n.reflection,
      reflectionAt: n.reflection_at,
      interactions: n.interactions,
    },
    act: mapAct(act),
    showNotification: isToday && !completed && !notificationDismissed,
  };
}

function localDateFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    completed_on_assigned_day: false,
    completion_source: null,
    assigned_at: now,
    notification_dismissed: false,
    notification_dismissed_at: null,
    viewed: false,
    viewed_at: null,
    reflection: null,
    reflection_at: null,
    interactions: {},
  };

  try {
    await writeJson(userDailyActPath(user.id, date), row, { overwrite: true });
  } catch {
    const raced = await readUserDailyAct(user.id, date);
    if (raced) {
      const racedAct = actsById.get(raced.act_id);
      if (racedAct) return mapUserDailyAct(raced, racedAct, { todayDate: date });
    }
    throw new Error('Could not assign daily act. Please try again.');
  }

  return mapUserDailyAct(row, chosen, { todayDate: date });
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
    const patched = normalizeRow({
      ...existing,
      notification_dismissed: typeof existing.notification_dismissed === 'boolean'
        ? existing.notification_dismissed
        : false,
    });
    if (JSON.stringify(patched) !== JSON.stringify(normalizeRow(existing))) {
      await writeJson(userDailyActPath(user.id, date), patched, { overwrite: true });
    }
    return mapUserDailyAct(patched, act, { todayDate: date });
  }

  return assignFreshDailyAct(user, date, actsById);
}

function computeStreaks(onTimeDates) {
  const set = new Set(onTimeDates);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const day of sorted) {
    if (prev) {
      const prevT = new Date(`${prev}T12:00:00`).getTime();
      const curT = new Date(`${day}T12:00:00`).getTime();
      if (curT - prevT === 86400000) run += 1;
      else run = 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = day;
  }

  // Current streak: walk back from today / yesterday
  const today = getUtcDateString(); // approximate; caller should pass local today via onTime set
  let current = 0;
  // Find latest on-time day and walk backwards
  if (sorted.length) {
    let cursor = sorted[sorted.length - 1];
    // If latest isn't today or yesterday relative to max in set, still count consecutive ending at latest
    while (set.has(cursor)) {
      current += 1;
      const t = new Date(`${cursor}T12:00:00`);
      t.setDate(t.getDate() - 1);
      cursor = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    }
  }

  return { currentStreak: current, longestStreak: longest, _todayHint: today };
}

function computeCurrentStreakFromToday(onTimeDates, todayDate) {
  const set = new Set(onTimeDates);
  let current = 0;
  let cursor = todayDate;
  // If today not completed on time, start from yesterday
  if (!set.has(todayDate)) {
    const t = new Date(`${todayDate}T12:00:00`);
    t.setDate(t.getDate() - 1);
    cursor = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
  while (set.has(cursor)) {
    current += 1;
    const t = new Date(`${cursor}T12:00:00`);
    t.setDate(t.getDate() - 1);
    cursor = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
  return current;
}

async function getImpact(deviceId, todayInput) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const rows = await listUserAssignmentRows(user.id);

  const completed = [];
  const stillOpen = [];
  const onTimeDates = [];
  const categories = new Set();

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const act = actsById.get(row.act_id);
    if (!act) continue;

    const mapped = mapUserDailyAct(row, act, { todayDate });
    if (row.completed) {
      completed.push(mapped);
      if (row.completed_on_assigned_day) onTimeDates.push(row.date);
      if (act.category) categories.add(act.category);
    } else if (row.date < todayDate) {
      stillOpen.push(mapped);
    }
  }

  const { longestStreak } = computeStreaks(onTimeDates);
  const currentStreak = computeCurrentStreakFromToday(onTimeDates, todayDate);
  const last = completed[0] || null;

  return {
    summary: {
      totalCompleted: completed.length,
      onTimeCompleted: onTimeDates.length,
      currentStreak,
      longestStreak,
      categoriesExperienced: categories.size,
      lastCompletedAt: last?.userDailyAct?.completedAt || null,
      lastActText: last?.act?.text || null,
      stillOpenCount: stillOpen.length,
    },
    completed,
    stillOpen,
  };
}

async function getCalendarMonth(deviceId, monthInput, todayInput) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const month = String(monthInput || todayDate.slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid month');

  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const rows = await listUserAssignmentRows(user.id);
  const days = {};

  for (const raw of rows) {
    const row = normalizeRow(raw);
    if (!row.date || !row.date.startsWith(month)) continue;
    if (!row.completed) continue;
    const act = actsById.get(row.act_id);
    days[row.date] = mapUserDailyAct(row, act, { todayDate });
  }

  return { month, days, todayDate };
}

async function completeAssignment(deviceId, assignmentDateInput, todayInput, { sourceHint = null } = {}) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput) || todayDate;
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, assignmentDate);
  if (!row) throw new Error('no daily act assigned for that day');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  if (row.completed) {
    return mapUserDailyAct(normalizeRow(row), act, { todayDate });
  }

  const now = new Date().toISOString();
  // Prefer client today date for "on assigned day" check (calendar day consistency).
  const completedOnAssignedDay = todayDate === assignmentDate;
  const completionSource = completedOnAssignedDay
    ? 'daily'
    : (sourceHint === 'still_open' ? 'still_open' : 'still_open');

  const updated = normalizeRow({
    ...row,
    completed: true,
    completed_at: now,
    completed_on_assigned_day: completedOnAssignedDay,
    completion_source: completionSource,
    notification_dismissed: true,
    notification_dismissed_at: row.notification_dismissed_at || now,
  });

  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  return mapUserDailyAct(updated, act, { todayDate });
}

async function completeDailyAct(deviceId, dateInput) {
  const today = resolveDate(dateInput);
  return completeAssignment(deviceId, today, today, { sourceHint: 'daily' });
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
    return mapUserDailyAct(normalizeRow(row), act, { todayDate: date });
  }

  const updated = normalizeRow({
    ...row,
    notification_dismissed: true,
    notification_dismissed_at: new Date().toISOString(),
  });

  await writeJson(userDailyActPath(user.id, date), updated, { overwrite: true });
  return mapUserDailyAct(updated, act, { todayDate: date });
}

async function saveReflection(deviceId, assignmentDateInput, todayInput, reflectionText) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput) || todayDate;
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, assignmentDate);
  if (!row) throw new Error('no daily act found');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  const text = String(reflectionText || '').trim().slice(0, 4000);
  const now = new Date().toISOString();
  const alreadyCompleted = !!row.completed;
  const completedOnAssignedDay = alreadyCompleted
    ? !!row.completed_on_assigned_day
    : todayDate === assignmentDate;

  // Reflection UI only appears after the user completes an act.
  // If the completion write has not propagated yet, complete + save in one write.
  const updated = normalizeRow({
    ...row,
    completed: true,
    completed_at: row.completed_at || now,
    completed_on_assigned_day: completedOnAssignedDay,
    completion_source: row.completion_source
      || (completedOnAssignedDay ? 'daily' : 'still_open'),
    notification_dismissed: true,
    notification_dismissed_at: row.notification_dismissed_at || now,
    reflection: text || null,
    reflection_at: text ? now : null,
  });

  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  return mapUserDailyAct(updated, act, { todayDate });
}

async function markViewed(deviceId, assignmentDateInput, todayInput) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput) || todayDate;
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, assignmentDate);
  if (!row) throw new Error('no daily act found');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  if (row.viewed) {
    return mapUserDailyAct(normalizeRow(row), act, { todayDate });
  }

  const updated = normalizeRow({
    ...row,
    viewed: true,
    viewed_at: new Date().toISOString(),
  });
  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  return mapUserDailyAct(updated, act, { todayDate });
}

async function trackInteraction(deviceId, assignmentDateInput, todayInput, interactionKey) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput) || todayDate;
  const key = String(interactionKey || '').trim();
  const allowed = new Set(['openedPractice', 'openedMap', 'openedDonate', 'openedInvite', 'openedProfile']);
  if (!allowed.has(key)) throw new Error('invalid interaction');

  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, assignmentDate);
  if (!row) throw new Error('no daily act found');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  const interactions = {
    ...(row.interactions && typeof row.interactions === 'object' ? row.interactions : {}),
    [key]: true,
    [`${key}At`]: new Date().toISOString(),
  };

  const updated = normalizeRow({ ...row, interactions });
  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  return mapUserDailyAct(updated, act, { todayDate });
}

async function getAssignment(deviceId, assignmentDateInput, todayInput) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput);
  if (!assignmentDate) throw new Error('assignment date required');
  if (assignmentDate > todayDate) {
    throw new Error('This Act hasn’t been revealed yet.');
  }

  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, assignmentDate);
  if (!row) throw new Error('no daily act found');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  return mapUserDailyAct(normalizeRow(row), act, { todayDate });
}

async function updateReflection(deviceId, assignmentDateInput, todayInput, reflectionText) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput) || todayDate;
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const row = await readUserDailyAct(user.id, assignmentDate);
  if (!row) throw new Error('no daily act found');
  if (!row.completed) throw new Error('act must be completed before editing reflection');

  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  const text = String(reflectionText || '').trim().slice(0, 4000);
  const now = new Date().toISOString();
  const updated = normalizeRow({
    ...row,
    reflection: text || null,
    reflection_at: text ? (row.reflection_at || now) : null,
  });

  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  return mapUserDailyAct(updated, act, { todayDate });
}

async function getJourney(deviceId, todayInput) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  await getOrAssignDailyAct(deviceId, todayDate);

  const catalog = loadCatalog();
  const actsById = new Map(catalog.map((act) => [act.id, act]));
  const rows = await listUserAssignmentRows(user.id);

  // Best assignment per act (prefer completed, then latest date).
  const byActId = new Map();
  for (const raw of rows) {
    const row = normalizeRow(raw);
    if (!row.act_id) continue;
    const prev = byActId.get(row.act_id);
    if (!prev) {
      byActId.set(row.act_id, row);
      continue;
    }
    if (row.completed && !prev.completed) {
      byActId.set(row.act_id, row);
      continue;
    }
    if (prev.completed && !row.completed) continue;
    if (String(row.date || '') > String(prev.date || '')) {
      byActId.set(row.act_id, row);
    }
  }

  const themeIndex = Object.fromEntries(THEMES.map((t, i) => [t.id, i]));
  const ordered = [...catalog].sort((a, b) => {
    const ta = themeIndex[resolveTheme(a.category).category] ?? 99;
    const tb = themeIndex[resolveTheme(b.category).category] ?? 99;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });

  const journey = [];
  let momentsOfPeace = 0;
  let sequence = 0;

  for (const act of ordered) {
    sequence += 1;
    const theme = resolveTheme(act.category);
    const row = byActId.get(act.id) || null;

    if (!row) {
      journey.push({
        key: act.id,
        actId: act.id,
        date: null,
        sequence,
        status: 'future',
        isToday: false,
        category: theme.category,
        categoryLabel: theme.categoryLabel,
      });
      continue;
    }

    const isFuture = row.date > todayDate;
    const isToday = row.date === todayDate;

    if (isFuture) {
      journey.push({
        key: act.id,
        actId: act.id,
        date: row.date,
        sequence,
        status: 'future',
        isToday: false,
        category: theme.category,
        categoryLabel: theme.categoryLabel,
      });
      continue;
    }

    if (row.completed) momentsOfPeace += 1;

    journey.push({
      key: act.id,
      actId: act.id,
      date: row.date,
      sequence,
      status: row.completed ? 'completed' : 'available',
      isToday,
      category: theme.category,
      categoryLabel: theme.categoryLabel,
      assignment: {
        id: row.id,
        revealedAt: row.assigned_at,
        completedAt: row.completed_at,
        reflection: row.reflection,
        reflectionAt: row.reflection_at,
      },
      act: mapAct(act),
    });
  }

  const themeCounts = Object.fromEntries(THEMES.map((t) => [t.id, 0]));
  for (const act of catalog) {
    const theme = resolveTheme(act.category);
    if (themeCounts[theme.category] != null) themeCounts[theme.category] += 1;
  }

  return {
    summary: {
      momentsOfPeace,
      todayDate,
      totalActs: journey.length,
    },
    themes: THEMES.map((t) => ({
      ...t,
      count: themeCounts[t.id] || 0,
    })),
    journey,
  };
}

/** Owner analytics — scans assignment blobs (real data only). */
async function buildDailyPeaceOwnerIntel() {
  assertBlobConfigured();
  const { list } = require('@vercel/blob');
  const { buildOwnerDatabaseRows } = require('./store');
  const actsById = new Map(loadCatalog().map((act) => [act.id, act]));
  const [{ blobs }, choirDb] = await Promise.all([
    list({ prefix: `${ROOT}/assignments/`, limit: 5000 }),
    buildOwnerDatabaseRows().catch(() => ({ rows: [] })),
  ]);

  const identityByUser = new Map(
    (choirDb.rows || []).map((r) => [r.userId, r])
  );

  const byUser = new Map();
  const actStats = new Map();

  for (const blob of blobs) {
    if (!blob.pathname.endsWith('.json')) continue;
    let row;
    try {
      row = normalizeRow(await readBlobJson(blob.pathname));
    } catch {
      continue;
    }
    const userId = row.user_id;
    if (!userId) continue;

    if (!byUser.has(userId)) {
      byUser.set(userId, {
        userId,
        totalCompleted: 0,
        onTimeCompleted: 0,
        completedLater: 0,
        stillOpen: 0,
        reflections: 0,
        lastCompletedAt: null,
        history: [],
      });
    }
    const u = byUser.get(userId);
    const act = actsById.get(row.act_id);
    const entry = {
      assignmentDate: row.date,
      actId: row.act_id,
      actText: act?.text || row.act_id,
      category: act?.category || null,
      status: row.completed ? 'completed' : 'still_open',
      completedAt: row.completed_at,
      completedOnAssignedDay: row.completed_on_assigned_day,
      reflection: row.reflection,
      completionSource: row.completion_source,
    };
    u.history.push(entry);

    if (row.completed) {
      u.totalCompleted += 1;
      if (row.completed_on_assigned_day) u.onTimeCompleted += 1;
      else u.completedLater += 1;
      if (row.reflection) u.reflections += 1;
      if (!u.lastCompletedAt || row.completed_at > u.lastCompletedAt) {
        u.lastCompletedAt = row.completed_at;
      }
    } else {
      u.stillOpen += 1;
    }

    if (!actStats.has(row.act_id)) {
      actStats.set(row.act_id, {
        actId: row.act_id,
        text: act?.text || row.act_id,
        category: act?.category || null,
        assigned: 0,
        completed: 0,
        onTime: 0,
        later: 0,
        reflections: 0,
      });
    }
    const a = actStats.get(row.act_id);
    a.assigned += 1;
    if (row.completed) {
      a.completed += 1;
      if (row.completed_on_assigned_day) a.onTime += 1;
      else a.later += 1;
      if (row.reflection) a.reflections += 1;
    }
  }

  const users = [...byUser.values()].map((u) => {
    u.history.sort((a, b) => String(b.assignmentDate).localeCompare(String(a.assignmentDate)));
    const onTimeDates = u.history
      .filter((h) => h.completedOnAssignedDay)
      .map((h) => h.assignmentDate);
    const { longestStreak } = computeStreaks(onTimeDates);
    const today = getUtcDateString();
    return {
      ...u,
      voiceName: identityByUser.get(u.userId)?.voiceName || null,
      voiceNumber: identityByUser.get(u.userId)?.voiceNumber ?? null,
      city: identityByUser.get(u.userId)?.city || null,
      country: identityByUser.get(u.userId)?.country || null,
      currentStreak: computeCurrentStreakFromToday(onTimeDates, today),
      longestStreak,
      history: u.history.slice(0, 200),
    };
  });

  users.sort((a, b) => (b.lastCompletedAt || '').localeCompare(a.lastCompletedAt || ''));

  const acts = [...actStats.values()].map((a) => ({
    ...a,
    completionRate: a.assigned ? Math.round((a.completed / a.assigned) * 1000) / 10 : 0,
  })).sort((a, b) => b.assigned - a.assigned);

  return {
    totals: {
      usersEngaged: users.length,
      totalCompletions: users.reduce((s, u) => s + u.totalCompleted, 0),
      onTimeCompletions: users.reduce((s, u) => s + u.onTimeCompleted, 0),
      reflections: users.reduce((s, u) => s + u.reflections, 0),
      stillOpen: users.reduce((s, u) => s + u.stillOpen, 0),
    },
    users,
    acts,
  };
}

module.exports = {
  getUtcDateString,
  resolveDate,
  parseDateStrict,
  getOrAssignDailyAct,
  completeDailyAct,
  completeAssignment,
  dismissDailyActNotification,
  saveReflection,
  markViewed,
  trackInteraction,
  getImpact,
  getCalendarMonth,
  getAssignment,
  getJourney,
  updateReflection,
  loadCatalog,
  buildDailyPeaceOwnerIntel,
  localDateFromIso,
};
