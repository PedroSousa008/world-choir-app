/**
 * Map basemap readiness — never exposes API keys.
 * Vector (MapLibre + Carto Dark Matter / Positron) is the preferred look.
 * Raster proxy is a same-style fallback only.
 */
const { corsHeaders } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hasCartoKey = Boolean(process.env.CARTO_API_KEY?.trim());

  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  return res.status(200).json({
    // Keep `provider: 'carto'` for older clients, but never force a raster downgrade.
    provider: 'carto',
    preferredMode: 'vector',
    rasterProxy: true,
    keyed: hasCartoKey,
    styles: {
      dark: 'dark-matter-nolabels',
      light: 'positron-nolabels',
    },
  });
};
