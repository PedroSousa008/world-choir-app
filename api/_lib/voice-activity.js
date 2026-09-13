/**
 * Voice Activity — daily app activity + live presence (Vercel Blob).
 *
 * Daily activity and Live Now are separate:
 * - by-day/{YYYY-MM-DD}.json  → Voices active sometime that UTC calendar day
 * - live-index.json           → currently present Voices (heartbeat freshness)
 *
 * Owner queries convert the selected local calendar day (IANA timeZone) into a
 * UTC window and merge overlapping UTC day buckets.
 */
const {
  readBlobJson,
  writeJson,
  findUserByDevice,
  listPledges,
  assertBlobConfigured,
} = require('./store');

const ROOT = 'wc-data/voice-activity';
const LIVE_INDEX_PATH = `${ROOT}/live-index.json`;
const EVENT_ID = 'world-choir-2027';

const PRESENCE_TTL_MS = 60 * 1000;
const HEARTBEAT_MIN_WRITE_MS = 12 * 1000;
const LIVE_PRUNE_INTERVAL_MS = 20 * 1000;

let liveIndexCache = null;
let liveIndexCacheAt = 0;
let dayCache = new Map();
let rosterCache = null;
let rosterCacheAt = 0;
const ROSTER_CACHE_MS = 30 * 1000;

function dayPath(dateKey) {
  return `${ROOT}/by-day/${dateKey}.json`;
}

function presencePath(userId) {
  return `${ROOT}/presence/${userId}.json`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD in a given IANA time zone (or UTC). */
function dateKeyInTimeZone(dateInput, timeZone) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {
    /* fall through */
  }
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseDateKey(dateKey) {
  const m = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/**
 * Approximate local-day UTC bounds for an IANA zone using offset sampling.
 * Returns { startMs, endMs }.
 */
function localDayBoundsUtc(dateKey, timeZone) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const tz = String(timeZone || 'UTC').trim() || 'UTC';

  function offsetMinutesAt(utcMs) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
        hour: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(utcMs));
      const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
      const m = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
      if (!m) return 0;
      const sign = m[1] === '-' ? -1 : 1;
      return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
    } catch {
      return 0;
    }
  }

  // Noon UTC guess → refine with actual offset
  const guess = Date.UTC(parsed.y, parsed.mo - 1, parsed.d, 12, 0, 0);
  const off = offsetMinutesAt(guess);
  const startMs = Date.UTC(parsed.y, parsed.mo - 1, parsed.d, 0, 0, 0) - off * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

function utcDatesOverlappingLocalDay(dateKey, timeZone) {
  const bounds = localDayBoundsUtc(dateKey, timeZone);
  if (!bounds) return [dateKey];
  const keys = new Set();
  keys.add(dateKeyInTimeZone(new Date(bounds.startMs), 'UTC'));
  keys.add(dateKeyInTimeZone(new Date(bounds.endMs - 1), 'UTC'));
  // Also include the local key itself (heartbeat may write client-local day)
  keys.add(dateKey);
  return [...keys].filter(Boolean);
}

function overlapsWindow(firstIso, lastIso, startMs, endMs) {
  const first = Date.parse(firstIso || lastIso || '');
  const last = Date.parse(lastIso || firstIso || '');
  if (!Number.isFinite(first) && !Number.isFinite(last)) return false;
  const a = Number.isFinite(first) ? first : last;
  const b = Number.isFinite(last) ? last : first;
  return a < endMs && b >= startMs;
}

async function readDayBucket(dateKey) {
  if (!dateKey) return { date: dateKey, voices: {} };
  const cached = dayCache.get(dateKey);
  if (cached && Date.now() - cached.at < 8000) return cached.data;
  try {
    const data = await readBlobJson(dayPath(dateKey));
    const normalized = {
      date: dateKey,
      voices: data?.voices && typeof data.voices === 'object' ? data.voices : {},
      updatedAt: data?.updatedAt || null,
    };
    dayCache.set(dateKey, { at: Date.now(), data: normalized });
    return normalized;
  } catch {
    const empty = { date: dateKey, voices: {}, updatedAt: null };
    dayCache.set(dateKey, { at: Date.now(), data: empty });
    return empty;
  }
}

async function writeDayBucket(dateKey, bucket) {
  dayCache.set(dateKey, { at: Date.now(), data: bucket });
  await writeJson(dayPath(dateKey), {
    date: dateKey,
    voices: bucket.voices || {},
    updatedAt: new Date().toISOString(),
  }, { overwrite: true });
}

async function readLiveIndex({ fresh = false } = {}) {
  if (!fresh && liveIndexCache && Date.now() - liveIndexCacheAt < 4000) {
    return liveIndexCache;
  }
  try {
    const data = await readBlobJson(LIVE_INDEX_PATH);
    liveIndexCache = {
      voices: data?.voices && typeof data.voices === 'object' ? data.voices : {},
      updatedAt: data?.updatedAt || null,
    };
  } catch {
    liveIndexCache = { voices: {}, updatedAt: null };
  }
  liveIndexCacheAt = Date.now();
  return liveIndexCache;
}

async function writeLiveIndex(index) {
  liveIndexCache = index;
  liveIndexCacheAt = Date.now();
  await writeJson(LIVE_INDEX_PATH, {
    voices: index.voices || {},
    updatedAt: new Date().toISOString(),
  }, { overwrite: true });
}

function pruneLiveVoices(voices, nowMs = Date.now()) {
  const next = {};
  for (const [vn, row] of Object.entries(voices || {})) {
    const sessions = row?.sessions && typeof row.sessions === 'object' ? row.sessions : null;
    let last = Date.parse(row?.lastSeenAt || '');
    if (sessions) {
      for (const ts of Object.values(sessions)) {
        const t = Date.parse(ts);
        if (Number.isFinite(t) && (!Number.isFinite(last) || t > last)) last = t;
      }
    }
    if (!Number.isFinite(last) || nowMs - last > PRESENCE_TTL_MS) continue;
    next[vn] = {
      ...row,
      lastSeenAt: new Date(last).toISOString(),
    };
  }
  return next;
}

function isLiveEntry(row, nowMs = Date.now()) {
  if (!row) return false;
  const sessions = row.sessions && typeof row.sessions === 'object' ? row.sessions : null;
  if (sessions) {
    return Object.values(sessions).some((ts) => {
      const t = Date.parse(ts);
      return Number.isFinite(t) && nowMs - t <= PRESENCE_TTL_MS;
    });
  }
  const t = Date.parse(row.lastSeenAt || '');
  return Number.isFinite(t) && nowMs - t <= PRESENCE_TTL_MS;
}

async function loadVoiceRoster({ fresh = false } = {}) {
  if (!fresh && rosterCache && Date.now() - rosterCacheAt < ROSTER_CACHE_MS) {
    return rosterCache;
  }
  assertBlobConfigured();
  const pledges = await listPledges(EVENT_ID);
  const voices = (pledges || [])
    .filter((p) => p && Number(p.voice_number) > 0)
    .map((p) => ({
      voiceNumber: Number(p.voice_number),
      userId: p.user_id,
      city: p.city || null,
      country: p.country || null,
      joinedAt: p.pledged_at || p.updated_at || null,
      voiceName: p.voice_name || `Voice ${p.voice_number}`,
    }))
    .sort((a, b) => a.voiceNumber - b.voiceNumber);
  rosterCache = voices;
  rosterCacheAt = Date.now();
  return voices;
}

/**
 * Authenticated app heartbeat — upserts presence + daily activity.
 * Identity comes from deviceId → user → pledge (never trust client voice numbers).
 */
async function recordPresenceHeartbeat({
  deviceId,
  tabId = null,
  timeZone = 'UTC',
  localDate = null,
} = {}) {
  assertBlobConfigured();
  const id = String(deviceId || '').trim();
  if (!id) throw Object.assign(new Error('deviceId required'), { statusCode: 400 });

  const user = await findUserByDevice(id);
  if (!user) throw Object.assign(new Error('user not found'), { statusCode: 404 });

  const pledges = await listPledges(EVENT_ID);
  const pledge = (pledges || []).find((p) => p.user_id === user.id);
  if (!pledge || !Number(pledge.voice_number)) {
    return { ok: true, tracked: false, reason: 'no_voice' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const voiceNumber = Number(pledge.voice_number);
  const sessionKey = String(tabId || 'default').slice(0, 64);
  const tz = String(timeZone || 'UTC').trim() || 'UTC';

  // Presence blob (per user) — multi-tab sessions
  let presence = null;
  try {
    presence = await readBlobJson(presencePath(user.id));
  } catch {
    presence = null;
  }
  const prevSessions = presence?.sessions && typeof presence.sessions === 'object'
    ? { ...presence.sessions }
    : {};
  const lastWrite = Date.parse(presence?.updatedAt || presence?.lastSeenAt || '');
  const shouldSkipHeavyWrite = Number.isFinite(lastWrite)
    && (now.getTime() - lastWrite) < HEARTBEAT_MIN_WRITE_MS
    && prevSessions[sessionKey];

  prevSessions[sessionKey] = nowIso;
  // Drop stale sessions
  for (const [k, ts] of Object.entries(prevSessions)) {
    const t = Date.parse(ts);
    if (!Number.isFinite(t) || now.getTime() - t > PRESENCE_TTL_MS * 2) {
      delete prevSessions[k];
    }
  }

  const presenceRow = {
    userId: user.id,
    voiceNumber,
    city: pledge.city || null,
    country: pledge.country || null,
    sessions: prevSessions,
    lastSeenAt: nowIso,
    updatedAt: nowIso,
  };

  if (!shouldSkipHeavyWrite) {
    await writeJson(presencePath(user.id), presenceRow, { overwrite: true });
  }

  // Live index
  const live = await readLiveIndex({ fresh: true });
  const pruned = pruneLiveVoices(live.voices, now.getTime());
  pruned[String(voiceNumber)] = {
    userId: user.id,
    voiceNumber,
    city: pledge.city || null,
    country: pledge.country || null,
    sessions: prevSessions,
    lastSeenAt: nowIso,
  };
  if (!shouldSkipHeavyWrite || !live.voices?.[String(voiceNumber)]) {
    await writeLiveIndex({ voices: pruned, updatedAt: nowIso });
  } else {
    liveIndexCache = { voices: pruned, updatedAt: nowIso };
    liveIndexCacheAt = Date.now();
  }

  // Daily activity — write under UTC day + client local day (covers TZ edge cases)
  const utcDay = dateKeyInTimeZone(now, 'UTC');
  const clientDay = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)
    ? localDate
    : dateKeyInTimeZone(now, tz);
  const dayKeys = [...new Set([utcDay, clientDay].filter(Boolean))];

  for (const dayKey of dayKeys) {
    const bucket = await readDayBucket(dayKey);
    const key = String(voiceNumber);
    const prev = bucket.voices[key];
    if (prev && shouldSkipHeavyWrite) {
      // Still bump lastSeen in memory cache for owner reads in this instance
      bucket.voices[key] = {
        ...prev,
        lastSeenAt: nowIso,
        userId: user.id,
        city: pledge.city || null,
        country: pledge.country || null,
      };
      dayCache.set(dayKey, { at: Date.now(), data: bucket });
      continue;
    }
    bucket.voices[key] = {
      userId: user.id,
      voiceNumber,
      city: pledge.city || null,
      country: pledge.country || null,
      firstSeenAt: prev?.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
    };
    await writeDayBucket(dayKey, bucket);
  }

  return {
    ok: true,
    tracked: true,
    voiceNumber,
    lastSeenAt: nowIso,
    ttlMs: PRESENCE_TTL_MS,
  };
}

async function clearPresenceSession({ deviceId, tabId = null } = {}) {
  assertBlobConfigured();
  const user = await findUserByDevice(String(deviceId || '').trim());
  if (!user) return { ok: true };
  const pledges = await listPledges(EVENT_ID);
  const pledge = (pledges || []).find((p) => p.user_id === user.id);
  if (!pledge) return { ok: true };

  const voiceNumber = Number(pledge.voice_number);
  const sessionKey = String(tabId || 'default').slice(0, 64);
  let presence = null;
  try {
    presence = await readBlobJson(presencePath(user.id));
  } catch {
    return { ok: true };
  }
  const sessions = { ...(presence?.sessions || {}) };
  delete sessions[sessionKey];
  const remaining = Object.entries(sessions).filter(([, ts]) => {
    const t = Date.parse(ts);
    return Number.isFinite(t) && Date.now() - t <= PRESENCE_TTL_MS;
  });
  const nowIso = new Date().toISOString();
  if (!remaining.length) {
    await writeJson(presencePath(user.id), {
      ...presence,
      sessions: {},
      lastSeenAt: presence.lastSeenAt || nowIso,
      updatedAt: nowIso,
      offlineAt: nowIso,
    }, { overwrite: true });
    const live = await readLiveIndex({ fresh: true });
    const pruned = pruneLiveVoices(live.voices);
    delete pruned[String(voiceNumber)];
    await writeLiveIndex({ voices: pruned, updatedAt: nowIso });
  } else {
    const sessionsObj = Object.fromEntries(remaining);
    let last = 0;
    for (const ts of Object.values(sessionsObj)) {
      const t = Date.parse(ts);
      if (t > last) last = t;
    }
    await writeJson(presencePath(user.id), {
      ...presence,
      sessions: sessionsObj,
      lastSeenAt: new Date(last).toISOString(),
      updatedAt: nowIso,
    }, { overwrite: true });
    const live = await readLiveIndex({ fresh: true });
    const pruned = pruneLiveVoices(live.voices);
    pruned[String(voiceNumber)] = {
      userId: user.id,
      voiceNumber,
      city: pledge.city || null,
      country: pledge.country || null,
      sessions: sessionsObj,
      lastSeenAt: new Date(last).toISOString(),
    };
    await writeLiveIndex({ voices: pruned, updatedAt: nowIso });
  }
  return { ok: true };
}

async function loadActivityMapForLocalDay(dateKey, timeZone) {
  const bounds = localDayBoundsUtc(dateKey, timeZone);
  const utcKeys = utcDatesOverlappingLocalDay(dateKey, timeZone);
  const map = new Map();
  for (const key of utcKeys) {
    const bucket = await readDayBucket(key);
    for (const [vn, row] of Object.entries(bucket.voices || {})) {
      if (bounds && !overlapsWindow(row.firstSeenAt, row.lastSeenAt, bounds.startMs, bounds.endMs)) {
        // Still allow exact day-key membership written for this local date
        if (key !== dateKey) continue;
      }
      const num = Number(vn);
      const prev = map.get(num);
      if (!prev) {
        map.set(num, { ...row, voiceNumber: num });
        continue;
      }
      const first = [prev.firstSeenAt, row.firstSeenAt].filter(Boolean).sort()[0];
      const last = [prev.lastSeenAt, row.lastSeenAt].filter(Boolean).sort().slice(-1)[0];
      map.set(num, { ...prev, ...row, firstSeenAt: first, lastSeenAt: last, voiceNumber: num });
    }
  }
  return { map, bounds };
}

function formatShortDate(iso, timeZone) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function formatTime(iso, timeZone) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

function statusForVoice({
  voiceNumber,
  activityRow,
  liveRow,
  isToday,
  nowMs,
}) {
  if (isToday && isLiveEntry(liveRow, nowMs)) return 'live';
  if (activityRow) return 'active';
  return 'inactive';
}

/**
 * Owner grid + KPI payload (paginated, filterable).
 */
async function buildVoiceActivityPage({
  date,
  timeZone = 'UTC',
  offset = 0,
  limit = 2000,
  country = '',
  city = '',
  activity = 'all',
  search = '',
  todayDate = null,
} = {}) {
  assertBlobConfigured();
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  const dateKey = String(date || dateKeyInTimeZone(new Date(), tz));
  if (!parseDateKey(dateKey)) throw Object.assign(new Error('invalid date'), { statusCode: 400 });

  const ownerToday = todayDate || dateKeyInTimeZone(new Date(), tz);
  const isToday = dateKey === ownerToday;
  const nowMs = Date.now();

  const [roster, liveIndex, activityPack] = await Promise.all([
    loadVoiceRoster(),
    readLiveIndex({ fresh: true }),
    loadActivityMapForLocalDay(dateKey, tz),
  ]);

  const liveVoices = pruneLiveVoices(liveIndex.voices, nowMs);
  // Persist prune occasionally
  if (Object.keys(liveVoices).length !== Object.keys(liveIndex.voices || {}).length) {
    writeLiveIndex({ voices: liveVoices, updatedAt: new Date().toISOString() }).catch(() => {});
  }

  const bounds = activityPack.bounds;
  const endMs = bounds?.endMs ?? Date.parse(`${dateKey}T23:59:59.999Z`);

  const eligible = roster.filter((v) => {
    if (!v.joinedAt) return true;
    const joined = Date.parse(v.joinedAt);
    if (!Number.isFinite(joined)) return true;
    return joined < endMs;
  });

  const countrySet = new Set();
  const cityByCountry = new Map();
  for (const v of eligible) {
    if (v.country) {
      countrySet.add(v.country);
      if (!cityByCountry.has(v.country)) cityByCountry.set(v.country, new Set());
      if (v.city) cityByCountry.get(v.country).add(v.city);
    }
  }

  const countryFilter = String(country || '').trim();
  const cityFilter = String(city || '').trim();
  const activityFilter = String(activity || 'all').trim();
  const searchNum = String(search || '').replace(/[^\d]/g, '');

  let liveCount = 0;
  let activeCount = 0;

  const annotated = eligible.map((v) => {
    const activityRow = activityPack.map.get(v.voiceNumber) || null;
    const liveRow = liveVoices[String(v.voiceNumber)] || null;
    const status = statusForVoice({
      voiceNumber: v.voiceNumber,
      activityRow,
      liveRow,
      isToday,
      nowMs,
    });
    if (status === 'live') liveCount += 1;
    if (status === 'live' || status === 'active') activeCount += 1;
    return { ...v, status, activityRow, liveRow };
  });

  // Live count is always "now" even on historical dates
  const liveNowCount = Object.keys(liveVoices).length;

  let filtered = annotated;
  if (countryFilter) filtered = filtered.filter((v) => v.country === countryFilter);
  if (cityFilter) filtered = filtered.filter((v) => v.city === cityFilter);
  if (searchNum) {
    filtered = filtered.filter((v) => String(v.voiceNumber).startsWith(searchNum));
  }
  if (activityFilter === 'live') {
    filtered = filtered.filter((v) => v.status === 'live');
  } else if (activityFilter === 'active') {
    filtered = filtered.filter((v) => v.status === 'active');
  } else if (activityFilter === 'inactive') {
    filtered = filtered.filter((v) => v.status === 'inactive');
  }

  // KPI active = unique actives on selected day among eligible (ignore UI filters)
  const kpiActive = annotated.filter((v) => v.status === 'active' || v.status === 'live').length;
  const kpiLive = isToday ? liveCount : liveNowCount;
  const kpiEligible = eligible.length;
  const kpiInactive = Math.max(0, kpiEligible - kpiActive);
  const activityRate = kpiEligible > 0 ? (kpiActive / kpiEligible) * 100 : 0;

  const safeLimit = Math.min(Math.max(Number(limit) || 2000, 100), 5000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const page = filtered.slice(safeOffset, safeOffset + safeLimit);

  const cells = page.map((v) => ({
    v: v.voiceNumber,
    s: v.status,
  }));

  const cities = countryFilter
    ? [...(cityByCountry.get(countryFilter) || [])].sort((a, b) => a.localeCompare(b))
    : [...new Set([...cityByCountry.values()].flatMap((s) => [...s]))].sort((a, b) => a.localeCompare(b));

  return {
    date: dateKey,
    timeZone: tz,
    isToday,
    syncedAt: new Date().toISOString(),
    presenceTtlMs: PRESENCE_TTL_MS,
    kpis: {
      totalVoices: kpiEligible,
      active: kpiActive,
      liveNow: kpiLive,
      activityRate,
      inactive: kpiInactive,
      liveNowIsCurrent: !isToday,
    },
    filters: {
      countries: [...countrySet].sort((a, b) => a.localeCompare(b)),
      cities,
      country: countryFilter || null,
      city: cityFilter || null,
      activity: activityFilter,
      search: searchNum || null,
    },
    grid: {
      offset: safeOffset,
      limit: safeLimit,
      total: filtered.length,
      showingFrom: filtered.length ? safeOffset + 1 : 0,
      showingTo: Math.min(safeOffset + safeLimit, filtered.length),
      columnsHint: 100,
      cells,
    },
    summary: {
      totalEligible: kpiEligible,
      active: kpiActive,
      activePct: activityRate,
      liveNow: kpiLive,
      liveNowPct: kpiEligible > 0 ? (kpiLive / kpiEligible) * 100 : 0,
      inactive: kpiInactive,
      inactivePct: kpiEligible > 0 ? (kpiInactive / kpiEligible) * 100 : 0,
    },
  };
}

async function getVoiceActivityDetail({
  voiceNumber,
  date,
  timeZone = 'UTC',
  todayDate = null,
} = {}) {
  assertBlobConfigured();
  const vn = Number(voiceNumber);
  if (!Number.isFinite(vn) || vn < 1) {
    throw Object.assign(new Error('voiceNumber required'), { statusCode: 400 });
  }
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  const dateKey = String(date || dateKeyInTimeZone(new Date(), tz));
  const ownerToday = todayDate || dateKeyInTimeZone(new Date(), tz);
  const isToday = dateKey === ownerToday;
  const nowMs = Date.now();

  const roster = await loadVoiceRoster();
  const voice = roster.find((v) => v.voiceNumber === vn);
  if (!voice) throw Object.assign(new Error('Voice not found'), { statusCode: 404 });

  const [liveIndex, activityPack] = await Promise.all([
    readLiveIndex({ fresh: true }),
    loadActivityMapForLocalDay(dateKey, tz),
  ]);
  const liveVoices = pruneLiveVoices(liveIndex.voices, nowMs);
  const activityRow = activityPack.map.get(vn) || null;
  const liveRow = liveVoices[String(vn)] || null;
  const status = statusForVoice({
    voiceNumber: vn,
    activityRow,
    liveRow,
    isToday,
    nowMs,
  });

  const first = activityRow?.firstSeenAt || null;
  const last = activityRow?.lastSeenAt || liveRow?.lastSeenAt || null;

  let activityLabel = 'No activity';
  let activityRange = null;
  if (status === 'live') {
    activityRange = {
      from: formatTime(first || last, tz),
      to: 'Now',
    };
    activityLabel = activityRange.from
      ? `${activityRange.from} – Now`
      : 'Now';
  } else if (status === 'active' && first) {
    activityRange = {
      from: formatTime(first, tz),
      to: formatTime(last, tz),
    };
    activityLabel = activityRange.from === activityRange.to
      ? activityRange.from
      : `${activityRange.from} – ${activityRange.to}`;
  }

  // Last active ever: prefer live/activity, else scan recent UTC days lightly via presence
  let lastActiveLabel = '—';
  if (status === 'live') lastActiveLabel = 'Now';
  else if (last) {
    const lastDay = dateKeyInTimeZone(last, tz);
    if (lastDay === ownerToday) lastActiveLabel = formatTime(last, tz) || 'Today';
    else lastActiveLabel = formatShortDate(last, tz) || last;
  }

  return {
    voiceNumber: vn,
    voiceName: voice.voiceName,
    userId: voice.userId,
    status,
    statusLabel: status === 'live' ? 'Live Now' : status === 'active' ? 'Active' : 'Not Active',
    country: voice.country,
    city: voice.city,
    joinedAt: voice.joinedAt,
    joinedLabel: formatShortDate(voice.joinedAt, tz),
    lastActiveAt: last,
    lastActiveLabel,
    firstActivityAt: first,
    activityOnDateLabel: activityLabel,
    activityRange,
    selectedDate: dateKey,
    isToday,
    syncedAt: new Date().toISOString(),
  };
}

async function listAvailableActivityDates({ timeZone = 'UTC', limit = 120 } = {}) {
  // Without listing every blob (expensive), expose today going back N days.
  // Days with zero activity still valid (show empty grid).
  const tz = String(timeZone || 'UTC').trim() || 'UTC';
  const dates = [];
  const now = new Date();
  for (let i = 0; i < limit; i += 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(dateKeyInTimeZone(d, tz));
  }
  return { dates: [...new Set(dates)], today: dateKeyInTimeZone(now, tz), timeZone: tz };
}

module.exports = {
  PRESENCE_TTL_MS,
  dateKeyInTimeZone,
  recordPresenceHeartbeat,
  clearPresenceSession,
  buildVoiceActivityPage,
  getVoiceActivityDetail,
  listAvailableActivityDates,
  loadVoiceRoster,
  readLiveIndex,
  pruneLiveVoices,
};
