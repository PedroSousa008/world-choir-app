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
    const deviceId = req.query.deviceId;
    const eventId = req.query.eventId || 'world-choir-2027';

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('anonymous_device_id', String(deviceId).trim())
      .maybeSingle();

    if (userError) {
      return res.status(500).json({ error: userError.message });
    }

    if (!user) {
      return res.status(200).json({ pledge: null });
    }

    const { data: pledge, error: pledgeError } = await supabase
      .from('pledges')
      .select('*')
      .eq('user_id', user.id)
      .eq('event_id', eventId)
      .maybeSingle();

    if (pledgeError) {
      return res.status(500).json({ error: pledgeError.message });
    }

    return res.status(200).json({ pledge: mapPledgeRow(pledge) });
  } catch (err) {
    console.error('api/my-pledge error:', err);
    return res.status(503).json({ error: err.message || 'Service unavailable' });
  }
};
