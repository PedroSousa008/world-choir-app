const { getSupabase, mapPledgeRow } = require('./lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabase();
    const eventId = req.query.eventId || 'world-choir-2027';

    const { data, error } = await supabase
      .from('pledges')
      .select('*')
      .eq('event_id', eventId)
      .order('voice_number', { ascending: true });

    if (error) {
      console.error('pledges fetch error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      pledges: (data || []).map(mapPledgeRow),
    });
  } catch (err) {
    console.error('api/pledges error:', err);
    return res.status(503).json({ error: err.message || 'Service unavailable' });
  }
};
