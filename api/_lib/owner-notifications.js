/**
 * Owner Notifications — campaign store, validation, analytics, dispatch boundary.
 *
 * Push delivery: no FCM/APNs/web-push provider is wired yet.
 * Send/schedule persist campaigns and audit events; dispatch records
 * `dispatchMode: 'recorded_only'` until a provider + queue are connected.
 *
 * Denominator note: rates use Delivered when > 0; otherwise Sent
 * (`metrics.denominator = 'delivered' | 'sent'`).
 */

const { listAllUsers, listAllPledges, writeJson, readBlobJson, listBlobs } = require('./store');
const { getAudienceReachSummary } = require('./push-subscriptions');
const { getProviderStatus, isDispatchEnabled } = require('./push-provider');
const { enqueueCampaignSend, processDueCampaigns } = require('./notification-dispatch');

const ROOT = 'wc-data/owner/notifications';
const INDEX_PATH = `${ROOT}/campaigns-index.json`;
const AUDIT_PATH = `${ROOT}/audit.json`;

const NOTIFICATION_TOPICS = Object.freeze({
  DAILY_ACTS: {
    key: 'daily_acts',
    label: 'Daily Acts of Peace',
    defaultDestination: 'daily_act',
    defaultSound: 'soft_bell',
    intendedAction: 'daily_act_complete',
    analyticsGroup: 'engagement',
  },
  PASS_THE_WORLD: {
    key: 'pass_the_world',
    label: 'Pass the World',
    defaultDestination: 'pass_the_world',
    defaultSound: 'chime',
    intendedAction: 'pass_the_world_participate',
    analyticsGroup: 'engagement',
  },
  WORLD_CHAIN: {
    key: 'world_chain',
    label: 'World Chain',
    defaultDestination: 'world_chain',
    defaultSound: 'heartbeat',
    intendedAction: 'world_chain_participate',
    analyticsGroup: 'engagement',
  },
  PASSPORT: {
    key: 'passport',
    label: 'Passport Stamps',
    defaultDestination: 'passport',
    defaultSound: 'celebration',
    intendedAction: 'passport_open',
    analyticsGroup: 'engagement',
  },
  PRACTICE: {
    key: 'practice',
    label: 'Practice the Song',
    defaultDestination: 'practice',
    defaultSound: 'choir_breath',
    intendedAction: 'practice_start',
    analyticsGroup: 'engagement',
  },
  DONATIONS: {
    key: 'donations',
    label: 'Donations',
    defaultDestination: 'donate',
    defaultSound: 'soft_bell',
    intendedAction: 'donation_complete',
    analyticsGroup: 'giving',
  },
  LIVE_MOMENT: {
    key: 'live_moment',
    label: 'Live Moment',
    defaultDestination: 'live_moment',
    defaultSound: 'live_moment',
    intendedAction: 'live_moment_enter',
    analyticsGroup: 'event',
  },
  POST_EVENT: {
    key: 'post_event',
    label: 'Post Event',
    defaultDestination: 'post_event',
    defaultSound: 'human_hum',
    intendedAction: 'post_event_action',
    analyticsGroup: 'event',
  },
  OTHERS: {
    key: 'others',
    label: 'Others',
    defaultDestination: 'home',
    defaultSound: 'default',
    intendedAction: null,
    analyticsGroup: 'other',
  },
});

const TOPIC_BY_KEY = Object.freeze(
  Object.fromEntries(Object.values(NOTIFICATION_TOPICS).map((t) => [t.key, t]))
);

const NOTIFICATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
});

const NOTIFICATION_ORIGIN = Object.freeze({
  MANUAL: 'manual',
  AUTOMATION: 'automation',
  SYSTEM: 'system',
});

const NOTIFICATION_PRIORITY = Object.freeze({
  NORMAL: 'normal',
  IMPORTANT: 'important',
  CRITICAL_EVENT: 'critical_event',
});

const TIMEZONE_MODE = Object.freeze({
  GLOBAL_UTC: 'global_utc',
  RECIPIENT_LOCAL: 'recipient_local',
});

const CHANNEL = Object.freeze({
  PUSH: 'push',
  IN_APP: 'in_app',
  PUSH_AND_IN_APP: 'push_and_in_app',
});

/**
 * Sound keys only — no fabricated audio assets.
 * Platform notification sounds require native bundles (iOS/Android).
 * TODO: add platform-compatible assets under assets/sounds/notifications/
 * and map keys in Expo/app.json + Android res/raw.
 */
const NOTIFICATION_SOUNDS = Object.freeze([
  { key: 'default', label: 'Default', assetReady: false },
  { key: 'soft_bell', label: 'Soft Bell', assetReady: false },
  { key: 'heartbeat', label: 'Heartbeat', assetReady: false },
  { key: 'choir_breath', label: 'Choir Breath', assetReady: false },
  { key: 'human_hum', label: 'Human Hum', assetReady: false },
  { key: 'chime', label: 'Chime', assetReady: false },
  { key: 'celebration', label: 'Celebration', assetReady: false },
  { key: 'live_moment', label: 'Live Moment', assetReady: false },
  { key: 'silent', label: 'Silent', assetReady: true },
]);

const DESTINATION_TYPES = Object.freeze([
  { key: 'home', label: 'Home', route: 'index.html' },
  { key: 'daily_act', label: 'Daily Act of Peace', route: 'profile.html?tab=daily-acts' },
  { key: 'pass_the_world', label: 'Pass the World', route: 'map.html?focus=pass-the-world' },
  { key: 'world_chain', label: 'World Chain', route: 'world-chain.html' },
  { key: 'passport', label: 'Passport', route: 'passport.html' },
  { key: 'practice', label: 'Practice', route: 'index.html?focus=practice' },
  { key: 'donate', label: 'Donate', route: 'donate.html' },
  { key: 'live_moment', label: 'Live Moment', route: 'index.html?live=1' },
  { key: 'post_event', label: 'Post Event', route: 'memory.html' },
  { key: 'custom', label: 'Custom destination', route: null },
  { key: 'none', label: 'No destination', route: null },
]);

const DESTINATION_BY_KEY = Object.freeze(
  Object.fromEntries(DESTINATION_TYPES.map((d) => [d.key, d]))
);

const AUDIENCE_FILTER_KEYS = Object.freeze([
  'country',
  'city',
  'joined_before',
  'joined_after',
  'completed_daily_act_today',
  'practiced_song',
  'has_passport_activity',
  'participated_world_chain',
  'participated_pass_the_world',
  'donated',
  'previous_event_participant',
  'notifications_enabled',
  'topic_preference',
]);

const FATIGUE_DEFAULTS = Object.freeze({
  maxPerUserPerDay: 3,
  minGapHours: 4,
  topicCooldownHours: {
    donations: 72,
  },
  quietHoursLocal: { start: 22, end: 7 },
  liveMomentOverride: true,
});

const RANGES = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: null,
});

const LARGE_SEND_CONFIRM_THRESHOLD = 10000;
const GLOBAL_SEND_TYPE_CONFIRM_THRESHOLD = 50000;

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = 'n') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

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

function rate(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  if (d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

function pickDenominator(metrics) {
  const delivered = Number(metrics?.delivered_count) || 0;
  const sent = Number(metrics?.sent_count) || 0;
  if (delivered > 0) return { value: delivered, kind: 'delivered' };
  return { value: sent, kind: 'sent' };
}

function ratesFromMetrics(metrics) {
  const den = pickDenominator(metrics);
  return {
    openRate: rate(metrics?.opened_count, den.value),
    clickRate: rate(metrics?.clicked_count, den.value),
    actionRate: rate(metrics?.action_completed_count, den.value),
    deliveryRate: rate(metrics?.delivered_count, metrics?.sent_count),
    denominator: den.kind,
  };
}

function performanceBadge(actionRate, topicBaseline) {
  if (actionRate == null) return 'Average';
  const base = topicBaseline != null ? topicBaseline : 10;
  if (actionRate >= base * 1.4) return 'Excellent';
  if (actionRate >= base * 0.9) return 'Good';
  if (actionRate >= base * 0.5) return 'Average';
  return 'Low';
}

function rangeWindow(rangeKey, now = new Date()) {
  const days = RANGES[rangeKey] ?? RANGES['30d'];
  if (days == null) {
    return { start: null, end: now, previousStart: null, previousEnd: null };
  }
  const end = now;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  const previousEnd = new Date(start);
  const previousStart = new Date(start);
  previousStart.setUTCDate(previousStart.getUTCDate() - days);
  return { start, end, previousStart, previousEnd };
}

function inWindow(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  return true;
}

function isSafeInternalPath(path) {
  const p = String(path || '').trim();
  if (!p) return false;
  if (/^https?:\/\//i.test(p)) return false;
  if (p.includes('://') || p.startsWith('//')) return false;
  if (p.includes('..')) return false;
  return /^[a-z0-9][a-z0-9._/?#&=%-]*$/i.test(p);
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
  const payload = {
    version: 1,
    campaigns: index.campaigns || [],
    updatedAt: nowIso(),
  };
  await writeJson(INDEX_PATH, payload);
  return payload;
}

async function readAudit() {
  try {
    const data = await readBlobJson(AUDIT_PATH);
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

async function appendAudit(event) {
  const events = await readAudit();
  events.unshift({
    id: uid('audit'),
    at: nowIso(),
    ...event,
  });
  await writeJson(AUDIT_PATH, { events: events.slice(0, 2000), updatedAt: nowIso() });
}

function normalizeAudience(raw) {
  const mode = raw?.mode === 'custom' ? 'custom' : 'everyone';
  const filters = {};
  if (mode === 'custom' && raw?.filters && typeof raw.filters === 'object') {
    for (const key of AUDIENCE_FILTER_KEYS) {
      if (raw.filters[key] !== undefined && raw.filters[key] !== null && raw.filters[key] !== '') {
        filters[key] = raw.filters[key];
      }
    }
  }
  return { mode, filters };
}

function normalizeCampaignInput(body = {}, existing = null) {
  const topicKey = String(body.topic || existing?.topic || 'others').trim();
  if (!TOPIC_BY_KEY[topicKey]) {
    const err = new Error('Invalid notification topic');
    err.statusCode = 400;
    throw err;
  }
  const topicMeta = TOPIC_BY_KEY[topicKey];
  const title = String(body.title ?? existing?.title ?? '').trim();
  const message = String(body.message ?? existing?.message ?? '').trim();
  const destinationType = String(
    body.destination_type ?? existing?.destination_type ?? topicMeta.defaultDestination
  ).trim();
  if (!DESTINATION_BY_KEY[destinationType]) {
    const err = new Error('Invalid destination');
    err.statusCode = 400;
    throw err;
  }
  let destinationPayload = body.destination_payload ?? existing?.destination_payload ?? {};
  if (typeof destinationPayload !== 'object' || destinationPayload == null) destinationPayload = {};
  if (destinationType === 'custom') {
    const path = String(destinationPayload.path || '').trim();
    if (!isSafeInternalPath(path)) {
      const err = new Error('Custom destination must be a safe internal app path (no external URLs)');
      err.statusCode = 400;
      throw err;
    }
    destinationPayload = { ...destinationPayload, path };
  }
  const soundKey = String(body.sound_key ?? existing?.sound_key ?? topicMeta.defaultSound).trim();
  if (!NOTIFICATION_SOUNDS.some((s) => s.key === soundKey)) {
    const err = new Error('Invalid sound key');
    err.statusCode = 400;
    throw err;
  }
  const priority = String(body.priority ?? existing?.priority ?? NOTIFICATION_PRIORITY.NORMAL).trim();
  if (!Object.values(NOTIFICATION_PRIORITY).includes(priority)) {
    const err = new Error('Invalid priority');
    err.statusCode = 400;
    throw err;
  }
  const channel = String(body.channel ?? existing?.channel ?? CHANNEL.PUSH).trim();
  if (!Object.values(CHANNEL).includes(channel)) {
    const err = new Error('Invalid channel');
    err.statusCode = 400;
    throw err;
  }
  // In-app channel scaffolded; only push + recorded_only dispatch is supported now.
  const timezoneMode = String(
    body.timezone_mode ?? existing?.timezone_mode ?? TIMEZONE_MODE.GLOBAL_UTC
  ).trim();
  if (!Object.values(TIMEZONE_MODE).includes(timezoneMode)) {
    const err = new Error('Invalid timezone mode');
    err.statusCode = 400;
    throw err;
  }
  const origin = String(body.origin ?? existing?.origin ?? NOTIFICATION_ORIGIN.MANUAL).trim();
  if (!Object.values(NOTIFICATION_ORIGIN).includes(origin)) {
    const err = new Error('Invalid origin');
    err.statusCode = 400;
    throw err;
  }

  return {
    topic: topicKey,
    title,
    message,
    destination_type: destinationType,
    destination_payload: destinationPayload,
    sound_key: soundKey,
    priority,
    channel,
    timezone_mode: timezoneMode,
    origin,
    audience: normalizeAudience(body.audience ?? existing?.audience),
    intended_action: body.intended_action ?? existing?.intended_action ?? topicMeta.intendedAction,
    campaign_id: body.campaign_id ?? existing?.campaign_id ?? null,
    variant_id: body.variant_id ?? existing?.variant_id ?? null,
    variant_name: body.variant_name ?? existing?.variant_name ?? null,
    template_id: body.template_id ?? existing?.template_id ?? null,
    context: body.context && typeof body.context === 'object'
      ? body.context
      : (existing?.context || {}),
    scheduled_at: body.scheduled_at !== undefined ? body.scheduled_at : existing?.scheduled_at || null,
  };
}

function validateContent(campaign, { requireContent = true } = {}) {
  if (requireContent) {
    if (!campaign.title || campaign.title.length < 2) {
      const err = new Error('Title is required');
      err.statusCode = 400;
      throw err;
    }
    if (!campaign.message || campaign.message.length < 2) {
      const err = new Error('Message is required');
      err.statusCode = 400;
      throw err;
    }
  }
  if (campaign.title && campaign.title.length > 120) {
    const err = new Error('Title is too long (max 120 characters)');
    err.statusCode = 400;
    throw err;
  }
  if (campaign.message && campaign.message.length > 500) {
    const err = new Error('Message is too long (max 500 characters)');
    err.statusCode = 400;
    throw err;
  }
}

function assertEditable(campaign) {
  const s = campaign.status;
  if (s === NOTIFICATION_STATUS.SENT || s === NOTIFICATION_STATUS.ARCHIVED) {
    const err = new Error('Sent notifications are historical records and cannot be edited');
    err.statusCode = 400;
    throw err;
  }
  if (s === NOTIFICATION_STATUS.SENDING) {
    const err = new Error('Notification is currently sending and is read-only');
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Audience estimate — aggregate counts only; never load full user dumps into the browser.
 * Filter support is best-effort with available pledge/user fields.
 */
async function estimateAudience(audienceDefinition) {
  const audience = normalizeAudience(audienceDefinition);
  try {
    const { resolveRecipients } = require('./push-subscriptions');
    const { recipients, totalActive } = await resolveRecipients(audience);
    if (totalActive > 0 || recipients.length > 0) {
      return {
        estimated: recipients.length,
        totalVoices: totalActive,
        notes: 'Estimate based on active push subscriptions (reachable devices).',
        filtersApplied: audience.mode === 'custom' ? Object.keys(audience.filters || {}) : [],
        source: 'push_subscriptions',
      };
    }
  } catch { /* fall through */ }

  const [users, pledges] = await Promise.all([
    listAllUsers().catch(() => []),
    listAllPledges().catch(() => []),
  ]);
  const totalVoices = Math.max(users.length, pledges.length);
  if (audience.mode === 'everyone') {
    return {
      estimated: totalVoices,
      totalVoices,
      notes: 'No push subscriptions yet — estimate falls back to registered voices. Enable notifications in the app to build reachable audience.',
      filtersApplied: [],
      source: 'users_pledges',
    };
  }

  const filters = audience.filters || {};
  const applied = Object.keys(filters);
  let pool = pledges.length ? pledges : users;

  if (filters.country) {
    const c = String(filters.country).trim().toLowerCase();
    pool = pool.filter((row) => String(row.country || '').trim().toLowerCase() === c);
  }
  if (filters.city) {
    const c = String(filters.city).trim().toLowerCase();
    pool = pool.filter((row) => String(row.city || '').trim().toLowerCase() === c);
  }
  const unsupported = applied.filter((k) => !['country', 'city'].includes(k));
  return {
    estimated: pool.length,
    totalVoices,
    notes: unsupported.length
      ? `Filters applied where data exists. Unsupported filters ignored for estimate: ${unsupported.join(', ')}.`
      : 'Estimate from pledge/user geo fields (no push subscriptions registered yet).',
    filtersApplied: applied.filter((k) => ['country', 'city'].includes(k)),
    unsupportedFilters: unsupported,
    source: 'users_pledges',
  };
}

/**
 * Fatigue / frequency validation — reusable service (not UI-only).
 */
function evaluateFatigue(campaigns, audience, { topic, now = new Date() } = {}) {
  const warnings = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const since = new Date(now.getTime() - dayMs);
  const recentSent = (campaigns || []).filter((c) => {
    if (c.status !== NOTIFICATION_STATUS.SENT && c.status !== NOTIFICATION_STATUS.SCHEDULED) return false;
    const at = c.sent_at || c.scheduled_at;
    return inWindow(at, since, now);
  });

  const sameAudienceApprox = recentSent.length;
  if (sameAudienceApprox >= FATIGUE_DEFAULTS.maxPerUserPerDay) {
    warnings.push({
      code: 'max_per_day',
      severity: 'warn',
      message: `This audience may receive ${sameAudienceApprox + 1} notifications within 24 hours.`,
    });
  }

  if (topic === 'donations') {
    const cooldownH = FATIGUE_DEFAULTS.topicCooldownHours.donations;
    const sinceTopic = new Date(now.getTime() - cooldownH * 3600 * 1000);
    const recentDonation = recentSent.some(
      (c) => c.topic === 'donations' && inWindow(c.sent_at || c.scheduled_at, sinceTopic, now)
    );
    if (recentDonation) {
      warnings.push({
        code: 'donations_cooldown',
        severity: 'warn',
        message: `Users were recently targeted by another Donations notification (cooldown ${cooldownH}h).`,
      });
    }
  }

  if (topic === 'live_moment' && FATIGUE_DEFAULTS.liveMomentOverride) {
    warnings.push({
      code: 'live_moment_override',
      severity: 'info',
      message: 'Live Moment sends may override normal frequency caps for synchronized event communications.',
    });
  }

  return {
    ok: !warnings.some((w) => w.severity === 'error'),
    warnings,
    settings: FATIGUE_DEFAULTS,
  };
}

function publicCampaign(row, { topicBaselines = {} } = {}) {
  const metrics = { ...emptyMetrics(), ...(row.metrics || {}) };
  const rates = ratesFromMetrics(metrics);
  const badge = performanceBadge(rates.actionRate, topicBaselines[row.topic]);
  const topic = TOPIC_BY_KEY[row.topic];
  return {
    id: row.id,
    topic: row.topic,
    topicLabel: topic?.label || row.topic,
    title: row.title,
    message: row.message,
    status: row.status,
    origin: row.origin,
    priority: row.priority,
    sound_key: row.sound_key,
    destination_type: row.destination_type,
    destination_payload: row.destination_payload,
    channel: row.channel,
    audience: row.audience,
    estimated_audience: row.estimated_audience,
    scheduled_at: row.scheduled_at,
    timezone_mode: row.timezone_mode,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    sent_at: row.sent_at,
    archived_at: row.archived_at,
    cancelled_at: row.cancelled_at,
    intended_action: row.intended_action,
    campaign_id: row.campaign_id,
    variant_id: row.variant_id,
    variant_name: row.variant_name,
    template_id: row.template_id,
    context: row.context || {},
    metrics,
    rates,
    performance: badge,
    dispatchMode: row.dispatchMode || null,
    providerStatus: row.providerStatus || null,
  };
}

function topicBaselinesFromCampaigns(campaigns) {
  const byTopic = {};
  for (const c of campaigns) {
    if (c.status !== NOTIFICATION_STATUS.SENT) continue;
    const rates = ratesFromMetrics(c.metrics || emptyMetrics());
    if (rates.actionRate == null) continue;
    if (!byTopic[c.topic]) byTopic[c.topic] = [];
    byTopic[c.topic].push(rates.actionRate);
  }
  const out = {};
  for (const [topic, arr] of Object.entries(byTopic)) {
    out[topic] = arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  return out;
}

function sumMetrics(rows) {
  const m = emptyMetrics();
  for (const row of rows) {
    const x = row.metrics || emptyMetrics();
    for (const k of Object.keys(m)) {
      if (k === 'denominator') continue;
      m[k] += Number(x[k]) || 0;
    }
  }
  const rates = ratesFromMetrics(m);
  m.denominator = rates.denominator;
  return { metrics: m, rates };
}

function deltaPct(current, previous) {
  if (previous == null || previous === 0) {
    if (current == null || current === 0) return null;
    return 100;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

async function buildAudienceCard() {
  try {
    return await getAudienceReachSummary();
  } catch {
    const [users, pledges] = await Promise.all([
      listAllUsers().catch(() => []),
      listAllPledges().catch(() => []),
    ]);
    const totalVoices = Math.max(users.length, pledges.length);
    return {
      totalVoices,
      notificationsEnabled: null,
      notificationsDisabled: null,
      appSubscriptionKnown: false,
      devicePermissionKnown: false,
      note: 'Could not load push subscription reach yet.',
    };
  }
}

function buildSystemHealth(campaigns) {
  const sent = campaigns.filter((c) => c.status === NOTIFICATION_STATUS.SENT);
  let delivered = 0;
  let failed = 0;
  for (const c of sent) {
    delivered += Number(c.metrics?.delivered_count) || 0;
    failed += Number(c.metrics?.failed_count) || 0;
  }
  const attempts = delivered + failed;
  const providers = getProviderStatus();
  const operational = providers.pushConfigured && providers.dispatchEnabled;
  return {
    status: operational ? 'operational' : (providers.pushConfigured ? 'configured_paused' : 'not_configured'),
    statusLabel: operational
      ? 'Push Service Operational'
      : (providers.pushConfigured
        ? 'Push Configured (dispatch paused)'
        : 'Push Service Not Configured'),
    providers: providers.providers,
    delivered,
    failed,
    deliveryRate: rate(delivered, attempts),
    note: operational
      ? 'Web Push is live. Cron drains scheduled and queued campaigns in batches.'
      : (providers.pushConfigured
        ? 'VAPID keys are present but PUSH_DISPATCH_ENABLED is off — sends stay dry-run.'
        : 'Set WEB_PUSH_VAPID_* keys and CRON_SECRET, then enable PUSH_DISPATCH_ENABLED.'),
    queue: {
      status: process.env.CRON_SECRET ? 'configured' : 'not_configured',
      note: process.env.CRON_SECRET
        ? 'Vercel Cron hits /api/cron-notifications every minute.'
        : 'Set CRON_SECRET and add the vercel.json cron entry.',
    },
    dispatchEnabled: providers.dispatchEnabled,
  };
}

function bestTimeToSend(campaigns, rangeKey) {
  // Without open/click event timestamps, return null honestly.
  const sent = campaigns.filter((c) => c.status === NOTIFICATION_STATUS.SENT && c.sent_at);
  if (!sent.length) {
    return {
      range: rangeKey,
      windowLabel: null,
      subtitle: 'Highest engagement across all topics',
      note: 'Best time will appear once open/click engagement events are recorded.',
      byTopic: {},
      byTimezone: {},
    };
  }
  const hours = new Array(24).fill(0);
  for (const c of sent) {
    const rates = ratesFromMetrics(c.metrics || emptyMetrics());
    const score = (rates.actionRate ?? rates.openRate ?? 0) * (Number(c.metrics?.sent_count) || 1);
    const h = new Date(c.sent_at).getUTCHours();
    hours[h] += score;
  }
  let bestH = 0;
  for (let i = 1; i < 24; i += 1) {
    if (hours[i] > hours[bestH]) bestH = i;
  }
  if (hours[bestH] <= 0) {
    return {
      range: rangeKey,
      windowLabel: null,
      subtitle: 'Highest engagement across all topics',
      note: 'Not enough engagement signal yet.',
      byTopic: {},
      byTimezone: {},
    };
  }
  const endH = (bestH + 2) % 24;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    range: rangeKey,
    windowLabel: `${pad(bestH)}:00 – ${pad(endH)}:00`,
    timezoneNote: 'UTC (local-time breakdown when timezone data is available)',
    subtitle: 'Highest engagement across all topics',
    byTopic: {},
    byTimezone: {},
  };
}

async function buildNotificationsOverview({ range = '30d' } = {}) {
  const index = await readIndex();
  const campaigns = index.campaigns || [];
  const window = rangeWindow(range);
  const baselines = topicBaselinesFromCampaigns(campaigns);

  const sentInRange = campaigns.filter(
    (c) => c.status === NOTIFICATION_STATUS.SENT && inWindow(c.sent_at, window.start, window.end)
  );
  const sentPrev = campaigns.filter(
    (c) =>
      c.status === NOTIFICATION_STATUS.SENT
      && inWindow(c.sent_at, window.previousStart, window.previousEnd)
  );

  const current = sumMetrics(sentInRange);
  const previous = sumMetrics(sentPrev);

  const kpis = {
    sent: {
      value: current.metrics.sent_count,
      deltaPct: deltaPct(current.metrics.sent_count, previous.metrics.sent_count),
    },
    openRate: {
      value: current.rates.openRate,
      deltaPct: deltaPct(current.rates.openRate, previous.rates.openRate),
    },
    clicks: {
      value: current.metrics.clicked_count,
      deltaPct: deltaPct(current.metrics.clicked_count, previous.metrics.clicked_count),
    },
    actionsCompleted: {
      value: current.metrics.action_completed_count,
      deltaPct: deltaPct(
        current.metrics.action_completed_count,
        previous.metrics.action_completed_count
      ),
    },
    denominatorNote: current.rates.denominator,
  };

  const topicAgg = Object.values(NOTIFICATION_TOPICS).map((t) => {
    const rows = sentInRange.filter((c) => c.topic === t.key);
    const { metrics, rates } = sumMetrics(rows);
    return {
      topic: t.key,
      label: t.label,
      sent: metrics.sent_count,
      openRate: rates.openRate,
      clickRate: rates.clickRate,
      actionRate: rates.actionRate,
      metrics,
    };
  });
  topicAgg.sort((a, b) => (b.actionRate ?? -1) - (a.actionRate ?? -1) || b.sent - a.sent);

  const totalSent = topicAgg.reduce((s, t) => s + t.sent, 0);
  const distribution = topicAgg.map((t) => ({
    topic: t.topic,
    label: t.label,
    sent: t.sent,
    pct: totalSent > 0 ? Math.round((t.sent / totalSent) * 1000) / 10 : 0,
  }));

  const recent = campaigns
    .filter((c) => c.status === NOTIFICATION_STATUS.SENT || c.status === NOTIFICATION_STATUS.FAILED)
    .sort((a, b) => String(b.sent_at || b.updated_at).localeCompare(String(a.sent_at || a.updated_at)))
    .slice(0, 8)
    .map((c) => publicCampaign(c, { topicBaselines: baselines }));

  const upcoming = campaigns
    .filter((c) => c.status === NOTIFICATION_STATUS.SCHEDULED)
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
    .slice(0, 10)
    .map((c) => publicCampaign(c, { topicBaselines: baselines }));

  const [audience, fatigueSample] = await Promise.all([
    buildAudienceCard(),
    Promise.resolve(evaluateFatigue(campaigns, { mode: 'everyone' }, { topic: 'others' })),
  ]);

  return {
    range,
    constants: {
      topics: Object.values(NOTIFICATION_TOPICS),
      statuses: Object.values(NOTIFICATION_STATUS),
      sounds: NOTIFICATION_SOUNDS,
      destinations: DESTINATION_TYPES,
      priorities: Object.values(NOTIFICATION_PRIORITY),
      channels: Object.values(CHANNEL),
      timezoneModes: Object.values(TIMEZONE_MODE),
      origins: Object.values(NOTIFICATION_ORIGIN),
      audienceFilters: AUDIENCE_FILTER_KEYS,
      largeSendConfirmThreshold: LARGE_SEND_CONFIRM_THRESHOLD,
      globalSendTypeConfirmThreshold: GLOBAL_SEND_TYPE_CONFIRM_THRESHOLD,
    },
    kpis,
    topicPerformance: topicAgg,
    topicDistribution: { totalSent, segments: distribution },
    recent,
    upcoming,
    audience,
    systemHealth: buildSystemHealth(campaigns),
    bestTime: bestTimeToSend(sentInRange, range),
    fatigueDefaults: FATIGUE_DEFAULTS,
    fatigueSample,
    provider: getProviderStatus(),
  };
}

async function listNotifications({
  status = 'all',
  topic = 'all',
  query = '',
  performance = 'all',
  page = 1,
  pageSize = 25,
  range = 'all',
} = {}) {
  const index = await readIndex();
  const baselines = topicBaselinesFromCampaigns(index.campaigns);
  const window = rangeWindow(range === 'all' ? 'all' : range);
  const q = String(query || '').trim().toLowerCase();
  let rows = index.campaigns.slice();

  if (status && status !== 'all') {
    if (status === 'automated') {
      rows = rows.filter((c) => c.origin === NOTIFICATION_ORIGIN.AUTOMATION || c.origin === NOTIFICATION_ORIGIN.SYSTEM);
    } else {
      rows = rows.filter((c) => c.status === status);
    }
  }
  if (topic && topic !== 'all') {
    rows = rows.filter((c) => c.topic === topic);
  }
  if (window.start || range !== 'all') {
    rows = rows.filter((c) => {
      const at = c.sent_at || c.scheduled_at || c.created_at;
      return inWindow(at, window.start, window.end);
    });
  }
  if (q) {
    rows = rows.filter(
      (c) =>
        String(c.title || '').toLowerCase().includes(q)
        || String(c.message || '').toLowerCase().includes(q)
    );
  }

  let publicRows = rows.map((c) => publicCampaign(c, { topicBaselines: baselines }));
  if (performance && performance !== 'all') {
    publicRows = publicRows.filter((c) => String(c.performance).toLowerCase() === String(performance).toLowerCase());
  }

  publicRows.sort((a, b) =>
    String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))
  );

  const total = publicRows.length;
  const safePage = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const start = (safePage - 1) * size;
  return {
    total,
    page: safePage,
    pageSize: size,
    items: publicRows.slice(start, start + size),
  };
}

async function getNotification(id) {
  const index = await readIndex();
  const row = index.campaigns.find((c) => c.id === id);
  if (!row) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  const baselines = topicBaselinesFromCampaigns(index.campaigns);
  const pub = publicCampaign(row, { topicBaselines: baselines });
  const m = pub.metrics;
  const den = pickDenominator(m);
  const funnel = [
    { key: 'targeted', label: 'Targeted', count: m.targeted_count },
    { key: 'sent', label: 'Sent', count: m.sent_count },
    { key: 'delivered', label: 'Delivered', count: m.delivered_count },
    { key: 'opened', label: 'Opened', count: m.opened_count },
    { key: 'clicked', label: 'Clicked', count: m.clicked_count },
    { key: 'action_completed', label: 'Action Completed', count: m.action_completed_count },
  ].map((step, i, arr) => {
    const prev = i === 0 ? step.count : arr[i - 1].count;
    return {
      ...step,
      pctOfDelivered: rate(step.count, den.value),
      pctOfPrevious: rate(step.count, prev),
    };
  });

  return {
    notification: pub,
    funnel,
    breakdowns: {
      country: [],
      platform: [],
      note: 'Country/platform breakdowns appear when per-delivery analytics events are recorded.',
    },
    negativeSignals: {
      permissionsDisabledWithin24h: m.permissions_disabled_24h || 0,
      language: 'Notification permissions disabled within 24h of send',
      note: 'Counts correlations only — do not treat as proven causation.',
    },
  };
}

async function saveNotification(body, actor) {
  const index = await readIndex();
  const id = body.id ? String(body.id) : null;
  let existing = id ? index.campaigns.find((c) => c.id === id) : null;
  if (id && !existing) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  if (existing) assertEditable(existing);

  const normalized = normalizeCampaignInput(body, existing);
  validateContent(normalized, { requireContent: body.requireContent !== false });

  const estimate = await estimateAudience(normalized.audience);
  const now = nowIso();
  let status = body.status || existing?.status || NOTIFICATION_STATUS.DRAFT;
  if (!Object.values(NOTIFICATION_STATUS).includes(status)) {
    status = NOTIFICATION_STATUS.DRAFT;
  }
  // Only allow draft/scheduled via save; send/schedule use dedicated endpoints.
  if (![NOTIFICATION_STATUS.DRAFT, NOTIFICATION_STATUS.SCHEDULED].includes(status)) {
    status = NOTIFICATION_STATUS.DRAFT;
  }

  if (status === NOTIFICATION_STATUS.SCHEDULED) {
    if (!normalized.scheduled_at || Number.isNaN(new Date(normalized.scheduled_at).getTime())) {
      const err = new Error('scheduled_at is required for scheduled notifications');
      err.statusCode = 400;
      throw err;
    }
  }

  const row = {
    ...(existing || {}),
    id: existing?.id || uid('notif'),
    ...normalized,
    status,
    estimated_audience: estimate.estimated,
    metrics: existing?.metrics || emptyMetrics(),
    created_at: existing?.created_at || now,
    updated_at: now,
    created_by: existing?.created_by || actor || 'owner',
    dispatchMode: existing?.dispatchMode || null,
    providerStatus: existing?.providerStatus || null,
  };

  if (existing) {
    index.campaigns = index.campaigns.map((c) => (c.id === row.id ? row : c));
  } else {
    index.campaigns.unshift(row);
  }
  await writeIndex(index);
  await appendAudit({
    action: existing ? 'edited' : 'created',
    actor: actor || 'owner',
    notificationId: row.id,
    meta: { status: row.status, topic: row.topic },
  });
  return publicCampaign(row);
}

async function duplicateNotification(id, actor) {
  const index = await readIndex();
  const existing = index.campaigns.find((c) => c.id === id);
  if (!existing) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  const now = nowIso();
  const copy = {
    ...existing,
    id: uid('notif'),
    status: NOTIFICATION_STATUS.DRAFT,
    title: existing.title,
    scheduled_at: null,
    sent_at: null,
    archived_at: null,
    cancelled_at: null,
    metrics: emptyMetrics(),
    created_at: now,
    updated_at: now,
    created_by: actor || 'owner',
    dispatchMode: null,
    providerStatus: null,
    campaign_id: existing.campaign_id || existing.id,
    variant_id: null,
    variant_name: null,
  };
  index.campaigns.unshift(copy);
  await writeIndex(index);
  await appendAudit({
    action: 'duplicated',
    actor: actor || 'owner',
    notificationId: copy.id,
    meta: { from: existing.id },
  });
  return publicCampaign(copy);
}

async function archiveNotification(id, actor) {
  const index = await readIndex();
  const existing = index.campaigns.find((c) => c.id === id);
  if (!existing) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  if (existing.status !== NOTIFICATION_STATUS.SENT && existing.status !== NOTIFICATION_STATUS.FAILED) {
    const err = new Error('Only sent/failed notifications should be archived');
    err.statusCode = 400;
    throw err;
  }
  existing.status = NOTIFICATION_STATUS.ARCHIVED;
  existing.archived_at = nowIso();
  existing.updated_at = existing.archived_at;
  await writeIndex(index);
  await appendAudit({
    action: 'archived',
    actor: actor || 'owner',
    notificationId: id,
  });
  return publicCampaign(existing);
}

async function deleteNotification(id, actor) {
  const index = await readIndex();
  const existing = index.campaigns.find((c) => c.id === id);
  if (!existing) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  const deletable = [NOTIFICATION_STATUS.DRAFT, NOTIFICATION_STATUS.CANCELLED];
  if (!deletable.includes(existing.status)) {
    const err = new Error('Only drafts and cancelled scheduled items can be permanently deleted. Archive sent notifications instead.');
    err.statusCode = 400;
    throw err;
  }
  index.campaigns = index.campaigns.filter((c) => c.id !== id);
  await writeIndex(index);
  await appendAudit({
    action: 'deleted',
    actor: actor || 'owner',
    notificationId: id,
    meta: { previousStatus: existing.status },
  });
  return { ok: true, id };
}

async function cancelNotification(id, actor) {
  const index = await readIndex();
  const existing = index.campaigns.find((c) => c.id === id);
  if (!existing) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  if (existing.status === NOTIFICATION_STATUS.SENDING) {
    // Emergency cancel only before provider ack — safe while recorded_only.
    existing.status = NOTIFICATION_STATUS.CANCELLED;
    existing.cancelled_at = nowIso();
    existing.updated_at = existing.cancelled_at;
  } else if (existing.status === NOTIFICATION_STATUS.SCHEDULED) {
    existing.status = NOTIFICATION_STATUS.CANCELLED;
    existing.cancelled_at = nowIso();
    existing.updated_at = existing.cancelled_at;
  } else {
    const err = new Error('Only scheduled (or in-flight) notifications can be cancelled');
    err.statusCode = 400;
    throw err;
  }
  await writeIndex(index);
  await appendAudit({
    action: 'cancelled',
    actor: actor || 'owner',
    notificationId: id,
  });
  return publicCampaign(existing);
}

async function scheduleNotification(body, actor) {
  const payload = { ...body, status: NOTIFICATION_STATUS.SCHEDULED };
  if (!payload.scheduled_at) {
    const err = new Error('scheduled_at is required');
    err.statusCode = 400;
    throw err;
  }
  const when = new Date(payload.scheduled_at);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    const err = new Error('Schedule time must be in the future');
    err.statusCode = 400;
    throw err;
  }
  const saved = await saveNotification(payload, actor);
  const index = await readIndex();
  const fatigue = evaluateFatigue(index.campaigns, saved.audience, { topic: saved.topic });
  await appendAudit({
    action: body.id ? 'rescheduled' : 'scheduled',
    actor: actor || 'owner',
    notificationId: saved.id,
    meta: { scheduled_at: saved.scheduled_at, timezone_mode: saved.timezone_mode },
  });
  return { notification: saved, fatigue };
}

/**
 * Dispatch boundary — enqueues a chunked send job (never blasts sync for large audiences).
 * Idempotent: re-calling on already-sent returns the existing row.
 */
async function sendNotification(body, actor, { confirmToken } = {}) {
  let index = await readIndex();
  let row;
  if (body.id) {
    row = index.campaigns.find((c) => c.id === body.id);
    if (!row) {
      const err = new Error('Notification not found');
      err.statusCode = 404;
      throw err;
    }
    if (row.status === NOTIFICATION_STATUS.SENT) {
      return {
        notification: publicCampaign(row),
        fatigue: evaluateFatigue(index.campaigns, row.audience, { topic: row.topic }),
        estimate: { estimated: row.estimated_audience },
        dispatch: {
          mode: row.dispatchMode || 'queued',
          devicesNotified: Number(row.metrics?.delivered_count) || 0,
          message: 'Already sent — returning existing campaign (idempotent).',
        },
      };
    }
    if (row.status === NOTIFICATION_STATUS.SENDING) {
      return {
        notification: publicCampaign(row),
        fatigue: evaluateFatigue(index.campaigns, row.audience, { topic: row.topic }),
        estimate: { estimated: row.estimated_audience },
        dispatch: {
          mode: 'queued',
          devicesNotified: Number(row.metrics?.delivered_count) || 0,
          message: 'Campaign is already sending — cron continues batch delivery.',
        },
      };
    }
    assertEditable(row);
  } else {
    const created = await saveNotification({ ...body, status: NOTIFICATION_STATUS.DRAFT }, actor);
    index = await readIndex();
    row = index.campaigns.find((c) => c.id === created.id);
  }

  validateContent(row, { requireContent: true });
  const estimate = await estimateAudience(row.audience);
  const fatigue = evaluateFatigue(index.campaigns, row.audience, { topic: row.topic });

  if (estimate.estimated >= LARGE_SEND_CONFIRM_THRESHOLD) {
    if (confirmToken !== 'SEND' && confirmToken !== true && confirmToken !== 'confirmed') {
      const err = new Error(
        estimate.estimated >= GLOBAL_SEND_TYPE_CONFIRM_THRESHOLD
          ? `Ready to notify ${estimate.estimated.toLocaleString()} Voices? Type SEND to confirm.`
          : `Ready to notify ${estimate.estimated.toLocaleString()} Voices? Confirmation required.`
      );
      err.statusCode = 400;
      err.code = 'CONFIRM_REQUIRED';
      err.estimated = estimate.estimated;
      err.requireTypeSend = estimate.estimated >= GLOBAL_SEND_TYPE_CONFIRM_THRESHOLD;
      throw err;
    }
  }

  // Prefer push-subscription reach for targeting confirmation messaging.
  const queued = await enqueueCampaignSend(row, {
    readIndex,
    writeIndex,
    appendAudit,
    emptyMetrics,
    actor: actor || 'owner',
  });

  return {
    notification: publicCampaign(queued.campaign || row),
    fatigue,
    estimate: { estimated: queued.dispatch?.devicesTargeted ?? estimate.estimated },
    dispatch: queued.dispatch,
  };
}

async function sendTestNotification(body, actor) {
  const title = String(body?.title || 'World Choir test').trim() || 'World Choir test';
  const message = String(body?.message || 'This is a test notification for the Owner device.').trim();
  const draft = await saveNotification({
    topic: body?.topic || 'others',
    title,
    message,
    destination_type: body?.destination_type || 'home',
    destination_payload: body?.destination_payload || {},
    sound_key: body?.sound_key || 'default',
    priority: 'normal',
    channel: 'push',
    audience: { mode: 'everyone', filters: {} },
    status: NOTIFICATION_STATUS.DRAFT,
    origin: NOTIFICATION_ORIGIN.SYSTEM,
  }, actor || 'owner');

  const index = await readIndex();
  const row = index.campaigns.find((c) => c.id === draft.id);
  const queued = await enqueueCampaignSend(row, {
    readIndex,
    writeIndex,
    appendAudit,
    emptyMetrics,
    actor: actor || 'owner',
    ownerTestOnly: true,
  });

  if (!(queued.dispatch?.devicesTargeted > 0)) {
    return {
      ok: false,
      message: 'No Owner test device registered. Open Owner → Notifications and click “Enable test pushes on this browser”, then try again.',
      actor: actor || null,
      notification: publicCampaign(queued.campaign || row),
    };
  }

  return {
    ok: true,
    message: queued.dispatch?.message || 'Test notification queued for Owner test device(s).',
    actor: actor || null,
    notification: publicCampaign(queued.campaign || row),
    dispatch: queued.dispatch,
  };
}

function getNotificationConstants() {
  return {
    topics: Object.values(NOTIFICATION_TOPICS),
    statuses: NOTIFICATION_STATUS,
    sounds: NOTIFICATION_SOUNDS,
    destinations: DESTINATION_TYPES,
    priorities: NOTIFICATION_PRIORITY,
    channels: CHANNEL,
    timezoneModes: TIMEZONE_MODE,
    origins: NOTIFICATION_ORIGIN,
    audienceFilters: AUDIENCE_FILTER_KEYS,
    fatigueDefaults: FATIGUE_DEFAULTS,
    intendedActions: [
      'daily_act_complete',
      'world_chain_participate',
      'practice_start',
      'donation_complete',
      'live_moment_enter',
      'passport_open',
      'pass_the_world_participate',
      'post_event_action',
    ],
  };
}

/** Pure helpers exported for unit tests */
function calcActionRate(actionCompleted, delivered, sent) {
  const den = delivered > 0 ? delivered : sent;
  return rate(actionCompleted, den);
}

async function runNotificationDispatchQueue(opts = {}) {
  return processDueCampaigns({
    readIndex,
    writeIndex,
    appendAudit,
    emptyMetrics,
    maxCampaigns: opts.maxCampaigns || 5,
    maxBatches: opts.maxBatches || 8,
  });
}

module.exports = {
  NOTIFICATION_TOPICS,
  TOPIC_BY_KEY,
  NOTIFICATION_STATUS,
  NOTIFICATION_ORIGIN,
  NOTIFICATION_PRIORITY,
  TIMEZONE_MODE,
  CHANNEL,
  NOTIFICATION_SOUNDS,
  DESTINATION_TYPES,
  AUDIENCE_FILTER_KEYS,
  FATIGUE_DEFAULTS,
  LARGE_SEND_CONFIRM_THRESHOLD,
  GLOBAL_SEND_TYPE_CONFIRM_THRESHOLD,
  ratesFromMetrics,
  calcActionRate,
  evaluateFatigue,
  isSafeInternalPath,
  normalizeAudience,
  normalizeCampaignInput,
  validateContent,
  estimateAudience,
  buildNotificationsOverview,
  listNotifications,
  getNotification,
  saveNotification,
  duplicateNotification,
  archiveNotification,
  deleteNotification,
  cancelNotification,
  scheduleNotification,
  sendNotification,
  sendTestNotification,
  runNotificationDispatchQueue,
  getNotificationConstants,
  performanceBadge,
  pickDenominator,
};
