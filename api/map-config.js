/**
 * Returns which map tile provider is active (never exposes the API key).
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
    provider: hasCartoKey ? 'carto' : 'esri',
  });
};
