/**
 * Proxies Carto nolabels raster tiles (dark / light).
 * Uses CARTO_API_KEY when set; otherwise the public Carto CDN (same look).
 * Never leaves maps blank for a missing key.
 */
const { corsHeaders } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const z = String(req.query.z || '').trim();
  const x = String(req.query.x || '').trim();
  const y = String(req.query.y || '').trim();
  const scale = req.query.r === '@2x' ? '@2x' : '';

  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return res.status(400).json({ error: 'Invalid tile coordinates' });
  }

  const zi = Number(z);
  const xi = Number(x);
  const yi = Number(y);
  if (zi < 0 || zi > 22 || xi < 0 || yi < 0) {
    return res.status(400).json({ error: 'Tile coordinates out of range' });
  }

  const subdomain = ['a', 'b', 'c', 'd'][(xi + yi) % 4];
  const theme = String(req.query.theme || 'dark').trim() === 'light' ? 'light' : 'dark';
  const style = theme === 'light' ? 'light_nolabels' : 'dark_nolabels';
  const key = process.env.CARTO_API_KEY?.trim();
  const keyQs = key ? `?key=${encodeURIComponent(key)}` : '';
  const upstream = `https://${subdomain}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}${scale}.png${keyQs}`;

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
