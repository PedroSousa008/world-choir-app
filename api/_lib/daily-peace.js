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

function assignmentDateFromPath(pathname) {
  const match = String(pathname || '').match(/(\d{4}-\d{2}-\d{2})\.json$/);
  return match ? match[1] : null;
}

async function readUserDailyAct(userId, date) {
  try {
    const row = await readBlobJson(userDailyActPath(userId, date));
    if (row && !row.date) row.date = date;
    return row;
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
          const row = await readBlobJson(blob.pathname);
          if (!row) return null;
          const pathDate = assignmentDateFromPath(blob.pathname);
          if (pathDate) row.date = pathDate;
          return row;
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
  const direct = THEMES.find((t) => t.id === catalogCategory);
  if (direct) {
    return { category: direct.id, categoryLabel: direct.label };
  }
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
    partnership_id: row.partnership_id || null,
    sponsor_impression_logged: !!row.sponsor_impression_logged,
  };
}

async function attachSponsorshipToMapped(mapped, row) {
  try {
    const { getSponsorshipForAssignmentRow } = require('./daily-peace-partnerships');
    const sponsorship = await getSponsorshipForAssignmentRow(row);
    if (sponsorship) {
      return { ...mapped, sponsorship };
    }
  } catch {
    /* ignore */
  }
  return mapped;
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
      revealedAt: n.date,
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
  const {
    resolveSponsorshipForNewAssignment,
    recordSponsorEvent,
  } = require('./daily-peace-partnerships');

  let chosen = null;
  let partnershipId = null;

  const sponsored = await resolveSponsorshipForNewAssignment(user, date);
  if (sponsored?.act) {
    chosen = sponsored.act;
    partnershipId = sponsored.partnershipId;
  }

  if (!chosen) {
    const recentActIds = [
      ...recentExtraIds,
      ...(await listRecentUserActIds(user.id, date)),
    ];
    chosen = pickActForUser(user.id, date, recentActIds);
  }

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
    partnership_id: partnershipId,
    sponsor_impression_logged: false,
  };

  try {
    await writeJson(userDailyActPath(user.id, date), row, { overwrite: true });
  } catch {
    const raced = await readUserDailyAct(user.id, date);
    if (raced) {
      const racedAct = actsById.get(raced.act_id);
      if (racedAct) {
        const mapped = mapUserDailyAct(raced, racedAct, { todayDate: date });
        return attachSponsorshipToMapped(mapped, normalizeRow(raced));
      }
    }
    throw new Error('Could not assign daily act. Please try again.');
  }

  if (partnershipId) {
    try {
      await recordSponsorEvent({
        partnershipId,
        userId: user.id,
        eventType: 'daily_act_assigned',
        date,
        city: user.city || null,
        country: user.country || null,
      });
    } catch (err) {
      console.error('sponsor assigned event failed:', err);
    }
  }

  const mapped = mapUserDailyAct(row, chosen, { todayDate: date });
  return attachSponsorshipToMapped(mapped, row);
}

async function bindLiveSponsorship(row, user) {
  if (!row) return row;
  try {
    const { resolveLivePartnership, recordSponsorEvent } = require('./daily-peace-partnerships');
    const partnership = await resolveLivePartnership(row);
    if (!partnership) return row;
    const alreadyLinked = row.partnership_id === partnership.id;
    const next = normalizeRow({ ...row, partnership_id: partnership.id });
    if (!alreadyLinked) {
      await writeJson(userDailyActPath(user.id, next.date), next, { overwrite: true });
      await recordSponsorEvent({
        partnershipId: partnership.id,
        userId: user.id,
        eventType: 'daily_act_assigned',
        date: next.date,
        city: user.city || null,
        country: user.country || null,
      });
      if (next.viewed) {
        await recordSponsorEvent({
          partnershipId: partnership.id,
          userId: user.id,
          eventType: 'daily_act_viewed',
          date: next.date,
          city: user.city || null,
          country: user.country || null,
        });
      }
      if (next.completed) {
        await recordSponsorEvent({
          partnershipId: partnership.id,
          userId: user.id,
          eventType: 'daily_act_completed',
          date: next.date,
          city: user.city || null,
          country: user.country || null,
        });
      }
    }
    return next;
  } catch (err) {
    console.error('bind live sponsorship failed:', err);
    return row;
  }
}

async function emitSponsorEvent(row, user, eventType) {
  const partnershipId = row?.partnership_id;
  if (!partnershipId) return;
  try {
    const { recordSponsorEvent } = require('./daily-peace-partnerships');
    await recordSponsorEvent({
      partnershipId,
      userId: user.id,
      eventType,
      date: row.date,
      city: user.city || null,
      country: user.country || null,
    });
  } catch (err) {
    console.error(`sponsor ${eventType} event failed:`, err);
  }
}

async function getOrAssignDailyAct(deviceId, dateInput) {
  assertBlobConfigured();
  const date = resolveDate(dateInput);
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const existing = await readUserDailyAct(user.id, date);
  const { getAllActsById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();

  if (existing) {
    const act = actsById.get(existing.act_id);
    if (!act) {
      const mapped = await assignFreshDailyAct(user, date, actsById, [existing.act_id]);
      return mapped;
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
    const linked = await bindLiveSponsorship(patched, user);
    const mapped = mapUserDailyAct(linked, act, { todayDate: date });
    return attachSponsorshipToMapped(mapped, linked);
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

  const { getAllActsById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
  const knownThemeIds = new Set(THEMES.map((theme) => theme.id));
  const rows = await listUserAssignmentRows(user.id);

  const completed = [];
  const stillOpen = [];
  const onTimeDates = [];
  const experiencedThemes = new Set();
  let partnerDailyActsCompleted = 0;

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const act = actsById.get(row.act_id);
    if (!act) continue;

    const mapped = mapUserDailyAct(row, act, { todayDate });
    if (row.completed) {
      completed.push(mapped);
      if (row.completed_on_assigned_day) onTimeDates.push(row.date);
      const themeId = mapped?.act?.category || resolveTheme(act.category).category;
      if (knownThemeIds.has(themeId)) experiencedThemes.add(themeId);
      if (row.partnership_id) partnerDailyActsCompleted += 1;
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
      partnerDailyActsCompleted,
      hasCompletedPartnerDailyAct: partnerDailyActsCompleted >= 1,
      onTimeCompleted: onTimeDates.length,
      currentStreak,
      longestStreak,
      categoriesExperienced: experiencedThemes.size,
      themesExperienced: experiencedThemes.size,
      requiredThemeCount: THEMES.length,
      hasCompletedAllPeaceThemes: experiencedThemes.size >= THEMES.length,
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

  const { getAllActsById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  const linked = await bindLiveSponsorship(normalizeRow(row), user);

  if (linked.completed) {
    const mapped = mapUserDailyAct(linked, act, { todayDate });
    return attachSponsorshipToMapped(mapped, linked);
  }

  const now = new Date().toISOString();
  const completedOnAssignedDay = todayDate === assignmentDate;
  const completionSource = completedOnAssignedDay
    ? 'daily'
    : (sourceHint === 'still_open' ? 'still_open' : 'still_open');

  const updated = normalizeRow({
    ...linked,
    completed: true,
    completed_at: now,
    completed_on_assigned_day: completedOnAssignedDay,
    completion_source: completionSource,
    notification_dismissed: true,
    notification_dismissed_at: linked.notification_dismissed_at || now,
  });

  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  await emitSponsorEvent(updated, user, 'daily_act_completed');

  const mapped = mapUserDailyAct(updated, act, { todayDate });
  return attachSponsorshipToMapped(mapped, updated);
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

  const { getAllActsById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
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

  const { getAllActsById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  const linked = await bindLiveSponsorship(normalizeRow(row), user);

  if (linked.viewed) {
    const mapped = mapUserDailyAct(linked, act, { todayDate });
    return attachSponsorshipToMapped(mapped, linked);
  }

  const updated = normalizeRow({
    ...linked,
    viewed: true,
    viewed_at: new Date().toISOString(),
  });
  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  await emitSponsorEvent(updated, user, 'daily_act_viewed');

  const mapped = mapUserDailyAct(updated, act, { todayDate });
  return attachSponsorshipToMapped(mapped, updated);
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

  const { getAllActsById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  const linked = await bindLiveSponsorship(normalizeRow(row), user);
  const mapped = mapUserDailyAct(linked, act, { todayDate });
  return attachSponsorshipToMapped(mapped, linked);
}

async function trackSponsorLogoImpression(deviceId, assignmentDateInput, todayInput) {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput) || todayDate;
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const existing = normalizeRow(await readUserDailyAct(user.id, assignmentDate));
  if (!existing) return { ok: true, logged: false };
  const row = await bindLiveSponsorship(existing, user);
  if (!row.partnership_id) {
    return { ok: true, logged: false };
  }
  if (row.sponsor_impression_logged) {
    return { ok: true, logged: false, duplicate: true };
  }

  const { getAllActsById, recordSponsorEvent } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  await recordSponsorEvent({
    partnershipId: row.partnership_id,
    userId: user.id,
    eventType: 'sponsor_logo_impression',
    date: assignmentDate,
    city: user.city || null,
    country: user.country || null,
  });

  const updated = { ...row, sponsor_impression_logged: true };
  await writeJson(userDailyActPath(user.id, assignmentDate), updated, { overwrite: true });
  const mapped = mapUserDailyAct(updated, act, { todayDate });
  return attachSponsorshipToMapped(mapped, updated);
}

async function trackSponsorLogoClick(deviceId, assignmentDateInput, todayInput, platform = 'web') {
  assertBlobConfigured();
  const todayDate = resolveDate(todayInput);
  const assignmentDate = parseDateStrict(assignmentDateInput) || todayDate;
  const user = await findUserByDevice(deviceId);
  if (!user) throw new Error('user not found');

  const existing = normalizeRow(await readUserDailyAct(user.id, assignmentDate));
  if (!existing) throw new Error('no daily act found');
  const row = await bindLiveSponsorship(existing, user);
  if (!row.partnership_id) throw new Error('no sponsored act for this assignment');

  const { getAllActsById, recordSponsorEvent, getPartnershipById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
  const act = actsById.get(row.act_id);
  if (!act) throw new Error('assigned act not found in catalog');

  await recordSponsorEvent({
    partnershipId: row.partnership_id,
    userId: user.id,
    eventType: 'sponsor_logo_clicked',
    date: assignmentDate,
    city: user.city || null,
    country: user.country || null,
    platform,
  });
  await recordSponsorEvent({
    partnershipId: row.partnership_id,
    userId: user.id,
    eventType: 'external_destination_opened',
    date: assignmentDate,
    city: user.city || null,
    country: user.country || null,
    platform,
  });

  const partnership = await getPartnershipById(row.partnership_id);
  const mapped = mapUserDailyAct(row, act, { todayDate });
  const withSponsor = await attachSponsorshipToMapped(mapped, row);
  return {
    ...withSponsor,
    redirectUrl: partnership?.companyWebsiteUrl || null,
  };
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

  const { getAllActsById } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
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

  const { getAllActsById, loadAllPartnerships, publicSponsorship, sponsorshipRecord } = require('./daily-peace-partnerships');
  const actsById = await getAllActsById();
  const catalog = [...actsById.values()];
  const rows = await listUserAssignmentRows(user.id);
  const liveByActId = new Map();
  const partnershipById = new Map();
  try {
    for (const p of await loadAllPartnerships()) {
      partnershipById.set(p.id, p);
      const live = publicSponsorship(p);
      if (live && p.actId) {
        liveByActId.set(p.actId, {
          ...live,
          startDate: p.startDate || null,
          endDate: p.endDate || null,
        });
      }
    }
  } catch {
    /* partnerships optional */
  }

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

    const journeyItem = {
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
        revealedAt: row.date,
        completedAt: row.completed_at,
        reflection: row.reflection,
        reflectionAt: row.reflection_at,
        partnershipId: row.partnership_id || null,
      },
      act: mapAct(act),
    };

    const linked = row.partnership_id ? partnershipById.get(row.partnership_id) : null;
    const historical = linked && linked.status !== 'draft' ? sponsorshipRecord(linked) : null;
    const live = liveByActId.get(act.id);
    const liveInWindow = live
      && (!live.startDate || row.date >= live.startDate)
      && (!live.endDate || row.date <= live.endDate);
    const sponsorship = historical || (liveInWindow ? live : null);
    if (sponsorship) {
      journeyItem.sponsorship = {
        partnershipId: sponsorship.partnershipId,
        companyName: sponsorship.companyName,
        companyLogoUrl: sponsorship.companyLogoUrl || null,
        companyWebsiteUrl: sponsorship.companyWebsiteUrl || null,
        partnershipType: sponsorship.partnershipType,
        assignmentMethod: sponsorship.assignmentMethod,
      };
    }

    journey.push(journeyItem);
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
  const { getAllActsById, loadAllPartnerships } = require('./daily-peace-partnerships');
  const [actsById, partnerships, { blobs }, choirDb] = await Promise.all([
    getAllActsById(),
    loadAllPartnerships().catch(() => []),
    list({ prefix: `${ROOT}/assignments/`, limit: 5000 }),
    buildOwnerDatabaseRows().catch(() => ({ rows: [] })),
  ]);
  const partnershipById = new Map((partnerships || []).map((p) => [p.id, p]));

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
    const partnership = row.partnership_id ? partnershipById.get(row.partnership_id) : null;
    const entry = {
      assignmentDate: row.date,
      actId: row.act_id,
      actText: act?.text || row.act_id,
      category: act?.category || null,
      status: row.completed ? 'completed' : 'still_open',
      completedAt: row.completed_at,
      completedOnAssignedDay: row.completed_on_assigned_day,
      reflection: row.reflection,
      reflectionAt: row.reflection_at,
      completionSource: row.completion_source,
      partnershipId: row.partnership_id || null,
      companyName: partnership?.companyName || null,
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
  trackSponsorLogoImpression,
  trackSponsorLogoClick,
  getImpact,
  getCalendarMonth,
  getAssignment,
  getJourney,
  updateReflection,
  loadCatalog,
  buildDailyPeaceOwnerIntel,
  localDateFromIso,
  resolveTheme,
  categoryLabel,
  listUserAssignmentRows,
  THEMES,
};
