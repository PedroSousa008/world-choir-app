const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapPledgeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    event_id: row.event_id,
    voiceNumber: row.voice_number,
    voiceName: row.voice_name,
    display_name: row.voice_name,
    city: row.city,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    pledged_at: row.pledged_at,
    updated_at: row.updated_at,
  };
}

module.exports = { getSupabase, mapPledgeRow };
