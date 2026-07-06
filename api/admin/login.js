const {
  corsHeaders,
  verifyOwnerCredentials,
  setOwnerSessionCookie,
  isOwnerAuthConfigured,
} = require('../lib/auth');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isOwnerAuthConfigured()) {
    return res.status(503).json({ error: 'Owner authentication is not configured' });
  }

  try {
    const { email, password, relationshipDate } = req.body || {};
    const result = await verifyOwnerCredentials({ email, password, relationshipDate });

    if (!result.ok) {
      return res.status(401).json({ error: result.error || 'Invalid owner credentials' });
    }

    setOwnerSessionCookie(res);
    return res.status(200).json({ ok: true, role: 'owner' });
  } catch (err) {
    console.error('api/admin/login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
};
