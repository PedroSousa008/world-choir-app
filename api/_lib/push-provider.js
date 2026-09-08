/**
 * Push providers: Web Push (VAPID) + Expo Push API.
 *
 * Env:
 * - WEB_PUSH_VAPID_PUBLIC_KEY
 * - WEB_PUSH_VAPID_PRIVATE_KEY
 * - WEB_PUSH_VAPID_SUBJECT (mailto: or https:)
 * - EXPO_ACCESS_TOKEN (optional, for Expo push)
 * - PUSH_DISPATCH_ENABLED ("true" to allow live sends; off = dry-run)
 */
const webpush = require('web-push');
const { markSubscriptionInvalid } = require('./push-subscriptions');

function vapidConfigured() {
  return !!(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY
    && process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  );
}

function expoConfigured() {
  // Expo Push works without a token for low volume; token recommended for production.
  return true;
}

function isDispatchEnabled() {
  const flag = String(process.env.PUSH_DISPATCH_ENABLED || '').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  // Default: enable when VAPID keys exist.
  return vapidConfigured();
}

function getProviderStatus() {
  const web = vapidConfigured();
  return {
    pushConfigured: web || !!process.env.EXPO_ACCESS_TOKEN,
    dispatchEnabled: isDispatchEnabled(),
    providers: {
      web_push: { status: web ? 'operational' : 'not_configured' },
      expo: { status: process.env.EXPO_ACCESS_TOKEN ? 'operational' : 'available_without_token' },
      apns: { status: 'via_expo' },
      fcm: { status: 'via_expo_or_web_push' },
    },
    vapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null,
  };
}

function configureWebPush() {
  if (!vapidConfigured()) return false;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:owner@worldchoir.app';
  webpush.setVapidDetails(
    subject,
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  );
  return true;
}

function buildPayload(campaign) {
  const dest = campaign.destination_type || 'home';
  const pathMap = {
    home: '/',
    daily_act: '/profile.html?tab=daily-acts',
    pass_the_world: '/map.html?focus=pass-the-world',
    world_chain: campaign.destination_payload?.chainId
      ? `/world-chain.html?id=${encodeURIComponent(campaign.destination_payload.chainId)}`
      : '/world-chain.html',
    passport: '/passport.html',
    practice: '/?focus=practice',
    donate: '/donate.html',
    live_moment: '/?live=1',
    post_event: '/memory.html',
    custom: campaign.destination_payload?.path
      ? `/${String(campaign.destination_payload.path).replace(/^\//, '')}`
      : '/',
    none: '/',
  };
  const url = pathMap[dest] || '/';
  return {
    title: campaign.title,
    body: campaign.message,
    url,
    topic: campaign.topic,
    campaignId: campaign.id,
    sound: campaign.sound_key || 'default',
    priority: campaign.priority || 'normal',
  };
}

async function sendWebPush(sub, payload) {
  if (!configureWebPush()) {
    return { ok: false, error: 'web_push_not_configured', permanent: false };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      JSON.stringify(payload),
      {
        TTL: 60 * 60 * 12,
        urgency: payload.priority === 'critical_event' ? 'high' : 'normal',
      }
    );
    return { ok: true, provider: 'web_push' };
  } catch (err) {
    const statusCode = err.statusCode || err.status;
    const permanent = statusCode === 404 || statusCode === 410;
    if (permanent) {
      await markSubscriptionInvalid(sub.id, `http_${statusCode}`).catch(() => null);
    }
    return {
      ok: false,
      provider: 'web_push',
      error: String(err.body || err.message || 'web_push_failed').slice(0, 200),
      permanent,
      statusCode,
    };
  }
}

async function sendExpoPush(subs, payload) {
  const messages = subs.map((s) => ({
    to: s.expoPushToken,
    title: payload.title,
    body: payload.body,
    data: {
      url: payload.url,
      topic: payload.topic,
      campaignId: payload.campaignId,
    },
    sound: payload.sound === 'silent' ? null : 'default',
    priority: payload.priority === 'critical_event' ? 'high' : 'default',
  }));

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  const data = await res.json().catch(() => ({}));
  const tickets = Array.isArray(data?.data) ? data.data : [];
  const results = [];
  for (let i = 0; i < subs.length; i += 1) {
    const ticket = tickets[i] || {};
    if (ticket.status === 'ok') {
      results.push({ ok: true, provider: 'expo', subscriptionId: subs[i].id });
    } else {
      const errMsg = ticket.message || data?.errors?.[0]?.message || `expo_http_${res.status}`;
      const permanent = /DeviceNotRegistered|InvalidCredentials/i.test(String(errMsg));
      if (permanent) {
        await markSubscriptionInvalid(subs[i].id, errMsg).catch(() => null);
      }
      results.push({
        ok: false,
        provider: 'expo',
        subscriptionId: subs[i].id,
        error: String(errMsg).slice(0, 200),
        permanent,
      });
    }
  }
  return results;
}

/**
 * Send to a mixed list of subscription rows.
 * Respects PUSH_DISPATCH_ENABLED — when off, returns dry-run successes without contacting providers.
 */
async function dispatchToSubscriptions(subscriptions, campaign, { dryRun } = {}) {
  const payload = buildPayload(campaign);
  const enabled = dryRun === true ? false : isDispatchEnabled();
  const results = [];

  if (!enabled) {
    for (const sub of subscriptions) {
      results.push({
        ok: true,
        dryRun: true,
        provider: sub.provider,
        subscriptionId: sub.id,
      });
    }
    return { results, payload, dryRun: true, dispatchEnabled: false };
  }

  const web = subscriptions.filter((s) => s.provider === 'web_push');
  const expo = subscriptions.filter((s) => s.provider === 'expo');

  for (const sub of web) {
    // eslint-disable-next-line no-await-in-loop
    const r = await sendWebPush(sub, payload);
    results.push({ ...r, subscriptionId: sub.id });
  }

  const EXPO_BATCH = 100;
  for (let i = 0; i < expo.length; i += EXPO_BATCH) {
    const chunk = expo.slice(i, i + EXPO_BATCH);
    // eslint-disable-next-line no-await-in-loop
    const chunkResults = await sendExpoPush(chunk, payload);
    results.push(...chunkResults);
  }

  return { results, payload, dryRun: false, dispatchEnabled: true };
}

module.exports = {
  vapidConfigured,
  expoConfigured,
  isDispatchEnabled,
  getProviderStatus,
  buildPayload,
  dispatchToSubscriptions,
  configureWebPush,
};
