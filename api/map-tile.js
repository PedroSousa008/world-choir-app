/**
 * Proxies Carto dark_nolabels raster tiles with the server-side API key.
 */
const { corsHeaders } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.CARTO_API_KEY?.trim();
  if (!key) {
    return res.status(503).json({ error: 'Map tiles not configured' });
  }

  const z = String(req.query.z || '').trim();
  const x = String(req.query.x || '').trim();
  const y = String(req.query.y || '').trim();
  const scale = req.query.r === '@2x' ? '@2x' : '';

  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return res.status(400).json({ error: 'Invalid tile coordinates' });
  }

  const subdomain = ['a', 'b', 'c', 'd'][(Number(x) + Number(y)) % 4];
  const upstream = `https://${subdomain}.basemaps.cartocdn.com/dark_nolabels/${z}/${x}/${y}${scale}.png?key=${encodeURIComponent(key)}`;

  try {
    const upstreamRes = await fetch(upstream, {
      headers: { Accept: 'image/png,image/*,*/*' },
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: 'Tile unavailable' });
    }

    const buffer = Buffer.from(await upstreamRes.arrayBuffer());
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('api/map-tile error:', err);
    return res.status(502).json({ error: 'Tile fetch failed' });
  }
};
