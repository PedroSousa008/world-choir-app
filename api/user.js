const { getSupabase } = require('./lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabase();
    const { deviceId } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    const { data, error } = await supabase.rpc('ensure_user', {
      p_device_id: String(deviceId).trim(),
    });

    if (error) {
      console.error('ensure_user error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      user: {
        id: data.id,
        anonymous_device_id: data.anonymous_device_id,
        created_at: data.created_at,
      },
    });
  } catch (err) {
    console.error('api/user error:', err);
    return res.status(503).json({ error: err.message || 'Service unavailable' });
  }
};
