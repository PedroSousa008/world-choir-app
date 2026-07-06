const { corsHeaders, clearOwnerSessionCookie } = require('../lib/auth');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  clearOwnerSessionCookie(res);
  return res.status(200).json({ ok: true });
};
