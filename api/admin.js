const {
  corsHeaders,
  verifyOwnerCredentials,
  setOwnerSessionCookie,
  clearOwnerSessionCookie,
  requireOwner,
  changeOwnerPassword,
  changeOwnerEmail,
  isOwnerAuthConfigured,
  getSessionFromRequest,
  getEffectiveOwnerEmail,
} = require('./_lib/auth');
const { buildOwnerDatabaseRows } = require('./_lib/store');
const {
  buildOwnerControlCenter,
  searchOwnerControlCenter,
} = require('./_lib/owner-intel');
const {
  listInfluencers,
  createInfluencer,
  updateInfluencer,
} = require('./_lib/members-store');

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
      const { email, password } = req.body || {};
      const result = await verifyOwnerCredentials({ email, password });
      if (!result.ok) {
        return res.status(401).json({ error: result.error || 'Invalid owner credentials' });
      }
      setOwnerSessionCookie(res);
      const ownerEmail = await getEffectiveOwnerEmail();
      return res.status(200).json({ ok: true, role: 'owner', email: ownerEmail });
    }

    if (action === 'logout' && req.method === 'POST') {
      clearOwnerSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    if (action === 'session' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const session = getSessionFromRequest(req);
      if (!session) return res.status(401).json({ authenticated: false });
      const email = await getEffectiveOwnerEmail();
      return res.status(200).json({ authenticated: true, role: 'owner', email });
    }

    if (action === 'database' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildOwnerDatabaseRows();
      return res.status(200).json(data);
    }

    if (action === 'control-center' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildOwnerControlCenter();
      return res.status(200).json(data);
    }

    if (action === 'search' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildOwnerControlCenter();
      const results = searchOwnerControlCenter(data, req.query.q || '');
      return res.status(200).json({ query: req.query.q || '', results });
    }

    if (action === 'change-password' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const result = await changeOwnerPassword(req.body || {});
      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'Could not change password' });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'change-email' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const result = await changeOwnerEmail(req.body || {});
      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'Could not change email' });
      }
      return res.status(200).json(result);
    }

    if (action === 'create-influencer' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const result = await createInfluencer(req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'update-influencer' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Influencer id is required' });
      const result = await updateInfluencer(id, updates, { allowEmailChange: true });
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'list-influencers' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const influencers = await listInfluencers();
      return res.status(200).json({ influencers });
    }

    return res.status(404).json({ error: 'Unknown admin action' });
  } catch (err) {
    console.error(`api/admin (${action}) error:`, err);
    return res.status(500).json({ error: err.message || 'Request failed' });
  }
};
