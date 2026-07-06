const { corsHeaders, requireOwner } = require('../lib/auth');
const { buildOwnerDatabaseRows } = require('../lib/store');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!requireOwner(req, res)) return;

  try {
    const data = await buildOwnerDatabaseRows();
    return res.status(200).json(data);
  } catch (err) {
    console.error('api/admin/database error:', err);
    return res.status(500).json({ error: 'Failed to load database' });
  }
};
