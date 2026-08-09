const { corsHeaders } = require('./_lib/auth');
const { getPublicCreatorFoundationsCatalog } = require('./_lib/members-store');

/**
 * Public Creator Foundations catalog for the Donate tab.
 * Built from Owner-created influencers + verified donations ledger.
 */
module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const catalog = await getPublicCreatorFoundationsCatalog();
    return res.status(200).json(catalog);
  } catch (err) {
    console.error('api/creator-foundations error:', err);
    // Honest empty catalog — never invent foundations or totals.
    return res.status(200).json({
      version: 3,
      dataPolicy: {
        production: true,
        rule:
          'Display only creator-provided facts and platform-calculated stats from verified records. Never invent numbers.',
        source: 'fallback-empty',
      },
      platform: {
        name: 'Creator Foundations',
        feePercent: 10,
        feePurpose:
          'Operational costs that keep World Choir running and the Creator Foundations platform secure and transparent.',
      },
      currency: 'EUR',
      supportedCurrencies: ['EUR', 'USD', 'GBP'],
      suggestedAmounts: [5, 10, 25, 50, 100],
      foundations: [],
      donations: [],
      error: 'Catalog temporarily unavailable',
    });
  }
};
