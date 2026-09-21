/**
 * Stripe Connect (Express) for Creator Foundations.
 * Destination charges send ~93.5% to the foundation connected account;
 * World Choir keeps 6.5% as application_fee on the platform account.
 */
const {
  findInfluencerById,
  updateInfluencerStripeConnect,
} = require('./members-store');
const { getStripe, paymentsConfigured, PLATFORM_FEE_PERCENT } = require('./donations');

/** Country display name → ISO2 for Stripe Express account creation. */
const COUNTRY_ISO2 = {
  Afghanistan: 'AF', Albania: 'AL', Algeria: 'DZ', Andorra: 'AD', Angola: 'AO',
  Argentina: 'AR', Armenia: 'AM', Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ',
  Bahrain: 'BH', Bangladesh: 'BD', Belarus: 'BY', Belgium: 'BE', Belize: 'BZ',
  Benin: 'BJ', Bhutan: 'BT', Bolivia: 'BO', 'Bosnia and Herzegovina': 'BA',
  Botswana: 'BW', Brazil: 'BR', Brunei: 'BN', Bulgaria: 'BG', 'Burkina Faso': 'BF',
  Burundi: 'BI', 'Cabo Verde': 'CV', Cambodia: 'KH', Cameroon: 'CM', Canada: 'CA',
  'Central African Republic': 'CF', Chad: 'TD', Chile: 'CL', China: 'CN',
  Colombia: 'CO', Comoros: 'KM', Congo: 'CG', 'Costa Rica': 'CR', Croatia: 'HR',
  Cuba: 'CU', Cyprus: 'CY', Czechia: 'CZ', 'Czech Republic': 'CZ',
  'Democratic Republic of the Congo': 'CD', Denmark: 'DK', Djibouti: 'DJ',
  Dominica: 'DM', 'Dominican Republic': 'DO', Ecuador: 'EC', Egypt: 'EG',
  'El Salvador': 'SV', 'Equatorial Guinea': 'GQ', Eritrea: 'ER', Estonia: 'EE',
  Eswatini: 'SZ', Ethiopia: 'ET', Fiji: 'FJ', Finland: 'FI', France: 'FR',
  Gabon: 'GA', Gambia: 'GM', Georgia: 'GE', Germany: 'DE', Ghana: 'GH',
  Greece: 'GR', Guatemala: 'GT', Guinea: 'GN', 'Guinea-Bissau': 'GW',
  Guyana: 'GY', Haiti: 'HT', Honduras: 'HN', Hungary: 'HU', Iceland: 'IS',
  India: 'IN', Indonesia: 'ID', Iran: 'IR', Iraq: 'IQ', Ireland: 'IE',
  Israel: 'IL', Italy: 'IT', "Côte d'Ivoire": 'CI', 'Ivory Coast': 'CI',
  Jamaica: 'JM', Japan: 'JP', Jordan: 'JO', Kazakhstan: 'KZ', Kenya: 'KE',
  Kiribati: 'KI', Kuwait: 'KW', Kyrgyzstan: 'KG', Laos: 'LA', Latvia: 'LV',
  Lebanon: 'LB', Lesotho: 'LS', Liberia: 'LR', Libya: 'LY', Liechtenstein: 'LI',
  Lithuania: 'LT', Luxembourg: 'LU', Madagascar: 'MG', Malawi: 'MW',
  Malaysia: 'MY', Maldives: 'MV', Mali: 'ML', Malta: 'MT', 'Marshall Islands': 'MH',
  Mauritania: 'MR', Mauritius: 'MU', Mexico: 'MX', Micronesia: 'FM', Moldova: 'MD',
  Monaco: 'MC', Mongolia: 'MN', Montenegro: 'ME', Morocco: 'MA', Mozambique: 'MZ',
  Myanmar: 'MM', Namibia: 'NA', Nauru: 'NR', Nepal: 'NP', Netherlands: 'NL',
  'New Zealand': 'NZ', Nicaragua: 'NI', Niger: 'NE', Nigeria: 'NG',
  'North Korea': 'KP', 'North Macedonia': 'MK', Norway: 'NO', Oman: 'OM',
  Pakistan: 'PK', Palau: 'PW', Palestine: 'PS', Panama: 'PA',
  'Papua New Guinea': 'PG', Paraguay: 'PY', Peru: 'PE', Philippines: 'PH',
  Poland: 'PL', Portugal: 'PT', Qatar: 'QA', Romania: 'RO', Russia: 'RU',
  Rwanda: 'RW', 'Saint Kitts and Nevis': 'KN', 'Saint Lucia': 'LC',
  'Saint Vincent and the Grenadines': 'VC', Samoa: 'WS', 'San Marino': 'SM',
  'Sao Tome and Principe': 'ST', 'Saudi Arabia': 'SA', Senegal: 'SN', Serbia: 'RS',
  Seychelles: 'SC', 'Sierra Leone': 'SL', Singapore: 'SG', Slovakia: 'SK',
  Slovenia: 'SI', 'Solomon Islands': 'SB', Somalia: 'SO', 'South Africa': 'ZA',
  'South Korea': 'KR', 'South Sudan': 'SS', Spain: 'ES', 'Sri Lanka': 'LK',
  Sudan: 'SD', Suriname: 'SR', Sweden: 'SE', Switzerland: 'CH', Syria: 'SY',
  Taiwan: 'TW', Tajikistan: 'TJ', Tanzania: 'TZ', Thailand: 'TH',
  'Timor-Leste': 'TL', Togo: 'TG', Tonga: 'TO', 'Trinidad and Tobago': 'TT',
  Tunisia: 'TN', Turkey: 'TR', Turkmenistan: 'TM', Tuvalu: 'TV', Uganda: 'UG',
  Ukraine: 'UA', 'United Arab Emirates': 'AE', 'United Kingdom': 'GB',
  Scotland: 'GB', 'United States': 'US', 'United States of America': 'US',
  Uruguay: 'UY', Uzbekistan: 'UZ', Vanuatu: 'VU', 'Vatican City': 'VA',
  Venezuela: 'VE', Vietnam: 'VN', Yemen: 'YE', Zambia: 'ZM', Zimbabwe: 'ZW',
};

function countryToIso2(countryName) {
  const raw = String(countryName || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_ISO2[raw] || null;
}

function appOrigin(req) {
  const fromEnv = String(
    process.env.APP_ORIGIN
    || process.env.WORLD_CHOIR_APP_ORIGIN
    || ''
  ).trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(
    req?.headers?.['x-forwarded-host']
    || req?.headers?.host
    || 'world-choir-app.vercel.app'
  ).split(',')[0].trim();
  return `${proto}://${host}`;
}

function isPayoutsReady(row) {
  if (!row) return false;
  return Boolean(
    row.stripeConnectAccountId
    && row.stripeConnectChargesEnabled === true
    && row.stripeConnectPayoutsEnabled === true
  );
}

function publicConnectStatus(row) {
  const accountId = row?.stripeConnectAccountId || null;
  const ready = isPayoutsReady(row);
  return {
    configured: paymentsConfigured(),
    connected: Boolean(accountId),
    ready,
    status: ready
      ? 'active'
      : (accountId ? (row.stripeConnectStatus || 'pending') : 'not_connected'),
    chargesEnabled: row?.stripeConnectChargesEnabled === true,
    payoutsEnabled: row?.stripeConnectPayoutsEnabled === true,
    detailsSubmitted: row?.stripeConnectDetailsSubmitted === true,
    accountId: accountId ? `…${String(accountId).slice(-6)}` : null,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    foundationSharePercent: 100 - PLATFORM_FEE_PERCENT,
    updatedAt: row?.stripeConnectUpdatedAt || null,
    note: ready
      ? 'Payouts are connected. Donor payments automatically send your share to this account and World Choir’s platform fee to World Choir.'
      : (accountId
        ? 'Finish Stripe onboarding so this Foundation can receive donations.'
        : 'Connect a Stripe payout account to receive donations for this Foundation.'),
  };
}

async function persistAccountSnapshot(foundationId, account) {
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  const status = chargesEnabled && payoutsEnabled
    ? 'active'
    : (detailsSubmitted ? 'pending' : 'onboarding');
  return updateInfluencerStripeConnect(foundationId, {
    stripeConnectAccountId: account.id,
    stripeConnectChargesEnabled: chargesEnabled,
    stripeConnectPayoutsEnabled: payoutsEnabled,
    stripeConnectDetailsSubmitted: detailsSubmitted,
    stripeConnectStatus: status,
    stripeConnectUpdatedAt: new Date().toISOString(),
  });
}

async function syncConnectAccount(foundationId) {
  const row = await findInfluencerById(foundationId);
  if (!row) {
    return { ok: false, error: 'Foundation not found' };
  }
  if (!paymentsConfigured()) {
    return {
      ok: true,
      ...publicConnectStatus(row),
      configured: false,
      note: 'Stripe keys are not configured on the platform yet.',
    };
  }
  if (!row.stripeConnectAccountId) {
    return { ok: true, ...publicConnectStatus(row) };
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(row.stripeConnectAccountId);
  const updated = await persistAccountSnapshot(foundationId, account);
  return { ok: true, ...publicConnectStatus(updated.influencer || row) };
}

async function ensureExpressAccount(foundationId) {
  const row = await findInfluencerById(foundationId);
  if (!row) {
    const err = new Error('Foundation not found');
    err.code = 'FOUNDATION_NOT_FOUND';
    throw err;
  }
  if (!paymentsConfigured()) {
    const err = new Error('Payments are not configured yet.');
    err.code = 'PAYMENTS_NOT_CONFIGURED';
    throw err;
  }

  if (row.stripeConnectAccountId) {
    return { row, accountId: row.stripeConnectAccountId, created: false };
  }

  const iso = countryToIso2(row.country);
  if (!iso) {
    const labeled = String(row.country || '').trim();
    const err = new Error(
      labeled
        ? `We could not map “${labeled}” to a Stripe country. Pick a country from the Account list, save, then try again.`
        : 'Set your Foundation country in Settings → Account, save, then connect payouts.'
    );
    err.code = 'COUNTRY_REQUIRED';
    throw err;
  }

  const stripe = getStripe();
  let account;
  try {
    account = await stripe.accounts.create({
      type: 'express',
      country: iso,
      email: String(row.email || '').trim() || undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: String(row.foundationName || row.displayName || 'Creator Foundation').slice(0, 100),
        product_description: 'Donations received through World Choir for this Creator Foundation.',
        url: 'https://world-choir-app.vercel.app/donate.html',
      },
      metadata: {
        foundationId: String(foundationId),
        worldChoirApp: '1',
      },
    });
  } catch (stripeErr) {
    const msg = String(stripeErr?.message || stripeErr || 'Stripe account create failed');
    const err = new Error(
      /connect/i.test(msg)
        ? `Stripe Connect is not fully enabled on the platform account yet. (${msg})`
        : msg
    );
    err.code = stripeErr?.code || 'STRIPE_ACCOUNT_CREATE_FAILED';
    throw err;
  }

  await persistAccountSnapshot(foundationId, account);
  const refreshed = await findInfluencerById(foundationId);
  return { row: refreshed || row, accountId: account.id, created: true };
}

async function createOnboardingLink(foundationId, req) {
  try {
    const { accountId } = await ensureExpressAccount(foundationId);
    const origin = appOrigin(req);
    const stripe = getStripe();
    const link = await stripe.accountLinks.create({
      account: accountId,
      // Query on the page URL (not inside the hash) so FCC hash routing stays intact.
      refresh_url: `${origin}/members.html?connect=refresh#settings`,
      return_url: `${origin}/members.html?connect=return#settings`,
      type: 'account_onboarding',
    });
    return {
      ok: true,
      url: link.url,
      accountId,
      expiresAt: link.expires_at ? new Date(link.expires_at * 1000).toISOString() : null,
    };
  } catch (err) {
    if (err.code === 'COUNTRY_REQUIRED' || err.code === 'PAYMENTS_NOT_CONFIGURED' || err.code === 'FOUNDATION_NOT_FOUND') {
      throw err;
    }
    const wrapped = new Error(err.message || 'Could not create Stripe onboarding link.');
    wrapped.code = err.code || 'CONNECT_ONBOARD_FAILED';
    throw wrapped;
  }
}

async function createExpressDashboardLink(foundationId) {
  const row = await findInfluencerById(foundationId);
  if (!row?.stripeConnectAccountId) {
    const err = new Error('Connect payouts first.');
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  const stripe = getStripe();
  const login = await stripe.accounts.createLoginLink(row.stripeConnectAccountId);
  return { ok: true, url: login.url };
}

async function getConnectBalances(foundationId) {
  const row = await findInfluencerById(foundationId);
  if (!row?.stripeConnectAccountId || !isPayoutsReady(row)) {
    return {
      available: false,
      note: 'Connect and finish Stripe onboarding to see balances.',
      availableBalance: null,
      pendingBalance: null,
      currency: 'EUR',
    };
  }
  if (!paymentsConfigured()) {
    return {
      available: false,
      note: 'Stripe keys are not configured on the platform yet.',
      availableBalance: null,
      pendingBalance: null,
      currency: 'EUR',
    };
  }

  const stripe = getStripe();
  const balance = await stripe.balance.retrieve({
    stripeAccount: row.stripeConnectAccountId,
  });

  const sumBuckets = (buckets = []) => {
    const byCurrency = {};
    buckets.forEach((b) => {
      const cur = String(b.currency || 'eur').toUpperCase();
      byCurrency[cur] = (byCurrency[cur] || 0) + Number(b.amount || 0);
    });
    const preferred = byCurrency.EUR != null ? 'EUR' : Object.keys(byCurrency)[0];
    if (!preferred) return { amount: 0, currency: 'EUR' };
    return { amount: byCurrency[preferred] / 100, currency: preferred };
  };

  const available = sumBuckets(balance.available);
  const pending = sumBuckets(balance.pending);
  return {
    available: true,
    note: null,
    availableBalance: available.amount,
    pendingBalance: pending.amount,
    currency: available.currency || pending.currency || 'EUR',
  };
}

module.exports = {
  countryToIso2,
  appOrigin,
  isPayoutsReady,
  publicConnectStatus,
  syncConnectAccount,
  ensureExpressAccount,
  createOnboardingLink,
  createExpressDashboardLink,
  getConnectBalances,
};
