const {
  corsHeaders,
  verifyOwnerCredentials,
  setOwnerSessionCookie,
  clearOwnerSessionCookie,
  requireOwner,
  changeOwnerPassword,
  isOwnerAuthConfigured,
  getSessionFromRequest,
} = require('./lib/auth');
const { buildOwnerDatabaseRows } = require('./lib/store');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || '';

  try {
    if (action === 'login' && req.method === 'POST') {
      if (!isOwnerAuthConfigured()) {
        return res.status(503).json({ error: 'Owner authentication is not configured' });
      }
      const { email, password, relationshipDate } = req.body || {};
      const result = await verifyOwnerCredentials({ email, password, relationshipDate });
      if (!result.ok) {
        return res.status(401).json({ error: result.error || 'Invalid owner credentials' });
      }
      setOwnerSessionCookie(res);
      return res.status(200).json({ ok: true, role: 'owner' });
    }

    if (action === 'logout' && req.method === 'POST') {
      clearOwnerSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    if (action === 'session' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const session = getSessionFromRequest(req);
      if (!session) return res.status(401).json({ authenticated: false });
      return res.status(200).json({ authenticated: true, role: 'owner' });
    }

    if (action === 'database' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildOwnerDatabaseRows();
      return res.status(200).json(data);
    }

    if (action === 'change-password' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { currentPassword, newPassword, confirmPassword } = req.body || {};
      const result = await changeOwnerPassword({ currentPassword, newPassword, confirmPassword });
      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'Could not change password' });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: 'Unknown admin action' });
  } catch (err) {
    console.error(`api/admin (${action}) error:`, err);
    return res.status(500).json({ error: 'Request failed' });
  }
};
