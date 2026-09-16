const {
  listPledges,
  getPledgesMeta,
  getMapAggregate,
  mapPledgeRow,
  jsonStorageError,
} = require('./_lib/store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const eventId = req.query.eventId || 'world-choir-2027';

    if (req.query.meta === '1') {
      // Short CDN cache absorbs poll storms; clients still see updates within ~1–2s.
      res.setHeader(
        'Cache-Control',
        'public, s-maxage=1, stale-while-revalidate=2, max-age=0'
      );
      const meta = await getPledgesMeta(eventId);
      return res.status(200).json(meta);
    }

    // Map aggregate — mirrors client getMapStats/getAggregatedCities over /api/pledges.
    if (req.query.aggregate === '1') {
      res.setHeader(
        'Cache-Control',
        'public, s-maxage=2, stale-while-revalidate=5, max-age=0'
      );
      const aggregate = await getMapAggregate(eventId);
      return res.status(200).json(aggregate);
    }

    // Full pledge list is heavy — keep uncached and discourage hot polling.
    res.setHeader('Cache-Control', 'private, no-store');
    const pledges = await listPledges(eventId);

    return res.status(200).json({
      pledges: pledges.map(mapPledgeRow),
    });
  } catch (err) {
    console.error('api/pledges error:', err);
    res.setHeader('Cache-Control', 'no-store');
    const payload = await jsonStorageError(err);
    return res.status(503).json(payload);
  }
};
