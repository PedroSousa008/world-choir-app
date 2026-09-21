/**
 * Shared payments readiness — keys, webhooks, Connect, fees, foundation Connect counts.
 * Single source of truth for Owner Admin + Foundation Payouts clarity.
 */
const {
  paymentsConfigured,
  getStripePublishableKey,
  getStripeWebhookSecret,
  getStripe,
  PLATFORM_FEE_PERCENT,
  stripeFeePercent,
  stripeFeeFixedCents,
} = require('./donations');
const { listInfluencerIds, findInfluencerById } = require('./members-store');

function checkStatus(ok, warn = false) {
  if (ok) return 'ok';
  if (warn) return 'warn';
  return 'fail';
}

function overallLevel(checks) {
  if (checks.some((c) => c.status === 'fail')) return 'not_ready';
  if (checks.some((c) => c.status === 'warn')) return 'almost_ready';
  return 'ready';
}

function levelLabel(level) {
  if (level === 'ready') return 'Payments ready';
  if (level === 'almost_ready') return 'Almost ready';
  return 'Not ready';
}

function levelSummary(level, checks, foundations) {
  if (level === 'ready') {
    if (foundations.ready === 0 && foundations.total > 0) {
      return 'Platform payments are live. Foundations still need to connect payouts to accept donations.';
    }
    if (foundations.total === 0) {
      return 'Platform payments are live. Create a Creator Foundation, then have them connect payouts.';
    }
    return 'Keys, webhooks, Connect, and fees are in place. Live donations can flow.';
  }
  if (level === 'almost_ready') {
    const missing = checks.filter((c) => c.status === 'warn').map((c) => c.label);
    return `Almost there — still need: ${missing.join(', ') || 'finish remaining Stripe setup'}.`;
  }
  const missing = checks.filter((c) => c.status === 'fail').map((c) => c.label);
  return `Payments blocked — fix: ${missing.join(', ') || 'Stripe configuration'}.`;
}

async function countFoundationConnect() {
  const ids = await listInfluencerIds().catch(() => []);
  let ready = 0;
  let pending = 0;
  let notConnected = 0;
  let total = 0;

  await Promise.all(ids.map(async (id) => {
    const row = await findInfluencerById(id).catch(() => null);
    if (!row || row.active === false) return;
    total += 1;
    const hasAccount = Boolean(row.stripeConnectAccountId);
    const isReady = hasAccount
      && row.stripeConnectChargesEnabled === true
      && row.stripeConnectPayoutsEnabled === true;
    if (isReady) ready += 1;
    else if (hasAccount) pending += 1;
    else notConnected += 1;
  }));

  return { total, ready, pending, notConnected };
}

async function probeConnectPlatform() {
  if (!paymentsConfigured()) {
    return {
      status: 'fail',
      detail: 'Stripe keys must be set before Connect can be verified.',
    };
  }
  try {
    const stripe = getStripe();
    await stripe.accounts.list({ limit: 1 });
    return {
      status: 'ok',
      detail: 'Stripe Connect API is reachable for connected accounts.',
    };
  } catch (err) {
    const msg = String(err?.message || err || 'Connect probe failed');
    if (/signed up for Connect|platform profile|complete your platform|Connect/i.test(msg)) {
      return { status: 'fail', detail: msg };
    }
    return {
      status: 'warn',
      detail: msg,
    };
  }
}

/**
 * @returns {Promise<object>} payments readiness payload
 */
async function buildPaymentsStatus() {
  const keysOk = paymentsConfigured();
  const publishable = getStripePublishableKey();
  const liveMode = Boolean(publishable && publishable.startsWith('pk_live_'));
  const testMode = Boolean(publishable && publishable.startsWith('pk_test_'));
  const webhookOk = Boolean(getStripeWebhookSecret());

  const [foundations, connectProbe] = await Promise.all([
    countFoundationConnect(),
    probeConnectPlatform(),
  ]);

  // If any foundation already connected, Connect platform is proven even if probe warns.
  const connectStatus = foundations.ready > 0 || foundations.pending > 0
    ? 'ok'
    : connectProbe.status;
  const connectDetail = foundations.ready > 0 || foundations.pending > 0
    ? `Connect is working — ${foundations.ready + foundations.pending} foundation account(s) on Stripe.`
    : connectProbe.detail;

  const checks = [
    {
      id: 'keys',
      label: 'Stripe keys',
      status: checkStatus(keysOk),
      detail: keysOk
        ? (liveMode ? 'Live publishable + secret keys configured.' : (testMode ? 'Test keys configured.' : 'Stripe keys configured.'))
        : 'Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY on Vercel.',
    },
    {
      id: 'webhook',
      label: 'Webhooks',
      status: checkStatus(webhookOk),
      detail: webhookOk
        ? 'STRIPE_WEBHOOK_SECRET is set (endpoint should hit /api/donations?action=webhook).'
        : 'Add STRIPE_WEBHOOK_SECRET so successful payments can be confirmed reliably.',
    },
    {
      id: 'connect',
      label: 'Stripe Connect',
      status: connectStatus,
      detail: connectDetail,
    },
    {
      id: 'fees',
      label: 'Fee split',
      status: 'ok',
      detail: `World Choir ${PLATFORM_FEE_PERCENT}% · card processing ~${stripeFeePercent()}% + €${(stripeFeeFixedCents() / 100).toFixed(2)} (passed through to foundations).`,
    },
  ];

  // Foundations not connected is operational, not a platform block — warn only when platform is otherwise ready.
  const foundationCheck = {
    id: 'foundations',
    label: 'Foundation payouts',
    status: foundations.total === 0
      ? 'warn'
      : (foundations.ready > 0 ? 'ok' : 'warn'),
    detail: foundations.total === 0
      ? 'No active foundations yet.'
      : `${foundations.ready} ready · ${foundations.pending} finishing onboarding · ${foundations.notConnected} not connected.`,
  };
  checks.push(foundationCheck);

  // Platform-critical checks only for overall level (exclude foundations count from blocking "ready").
  const platformChecks = checks.filter((c) => c.id !== 'foundations');
  let level = overallLevel(platformChecks);
  // If platform ready but no foundation can accept donations yet → almost_ready for ops clarity.
  if (level === 'ready' && foundations.ready === 0) {
    level = 'almost_ready';
  }

  return {
    generatedAt: new Date().toISOString(),
    level,
    label: levelLabel(level),
    summary: levelSummary(level, platformChecks, foundations),
    platformReady: overallLevel(platformChecks) === 'ready',
    liveMode,
    testMode,
    checks,
    fees: {
      platformFeePercent: PLATFORM_FEE_PERCENT,
      foundationSharePercent: 100 - PLATFORM_FEE_PERCENT,
      stripeFeePercent: stripeFeePercent(),
      stripeFeeFixedCents: stripeFeeFixedCents(),
      stripeFeeFixed: stripeFeeFixedCents() / 100,
      note: 'Card processing is deducted from the donation so World Choir nets its platform fee.',
    },
    foundations,
    webhookEndpoint: '/api/donations?action=webhook',
  };
}

module.exports = {
  buildPaymentsStatus,
  levelLabel,
};
