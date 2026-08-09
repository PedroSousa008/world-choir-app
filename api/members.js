const {
  corsHeaders,
  isOwnerAuthConfigured,
  verifyOwnerCredentials,
  setMembersSessionCookie,
  clearMembersSessionCookie,
  getMembersSessionFromRequest,
  requireMembersOwner,
  requireMembersSession,
  changeOwnerPassword,
  changeOwnerEmail,
  getEffectiveOwnerEmail,
} = require('./_lib/auth');
const {
  listInfluencers,
  createInfluencer,
  updateInfluencer,
  verifyInfluencerCredentials,
  findInfluencerById,
  changeInfluencerPassword,
  changeInfluencerEmail,
  getOperationsOverview,
  publicInfluencer,
} = require('./_lib/members-store');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || '';

  try {
    if (action === 'login' && req.method === 'POST') {
      if (!isOwnerAuthConfigured()) {
        return res.status(503).json({ error: 'Members authentication is not configured' });
      }

      const { email, password, roleHint } = req.body || {};
      const normalizedEmail = String(email || '').trim().toLowerCase();

      if (!normalizedEmail || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const ownerEmail = await getEffectiveOwnerEmail();
      const tryingOwner = roleHint === 'owner' || normalizedEmail === ownerEmail;

      if (tryingOwner) {
        const result = await verifyOwnerCredentials({ email, password });
        if (!result.ok) {
          return res.status(401).json({ error: result.error || 'Invalid credentials' });
        }
        setMembersSessionCookie(res, { role: 'owner' });
        return res.status(200).json({
          ok: true,
          role: 'owner',
          email: ownerEmail,
        });
      }

      const influencerResult = await verifyInfluencerCredentials({ email, password });
      if (!influencerResult.ok) {
        return res.status(401).json({ error: influencerResult.error || 'Invalid credentials' });
      }

      setMembersSessionCookie(res, {
        role: 'influencer',
        influencerId: influencerResult.influencer.id,
        email: influencerResult.influencer.email,
      });

      return res.status(200).json({
        ok: true,
        role: 'influencer',
        influencer: influencerResult.influencer,
      });
    }

    if (action === 'logout' && req.method === 'POST') {
      clearMembersSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    if (action === 'session' && req.method === 'GET') {
      const session = getMembersSessionFromRequest(req);
      if (!session) return res.status(401).json({ authenticated: false });

      if (session.role === 'owner') {
        const email = await getEffectiveOwnerEmail();
        return res.status(200).json({ authenticated: true, role: 'owner', email });
      }

      const influencer = await findInfluencerById(session.influencerId);
      if (!influencer || influencer.active === false) {
        clearMembersSessionCookie(res);
        return res.status(401).json({ authenticated: false });
      }

      return res.status(200).json({
        authenticated: true,
        role: 'influencer',
        influencer: publicInfluencer(influencer),
      });
    }

    if (action === 'overview' && req.method === 'GET') {
      if (!requireMembersOwner(req, res)) return;
      const [overview, influencers] = await Promise.all([
        getOperationsOverview(),
        listInfluencers(),
      ]);
      return res.status(200).json({ overview, influencers });
    }

    if (action === 'create-influencer' && req.method === 'POST') {
      if (!requireMembersOwner(req, res)) return;
      const result = await createInfluencer(req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'update-influencer' && req.method === 'POST') {
      if (!requireMembersOwner(req, res)) return;
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Influencer id is required' });
      const result = await updateInfluencer(id, updates, { allowEmailChange: true });
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'owner-change-password' && req.method === 'POST') {
      if (!requireMembersOwner(req, res)) return;
      const result = await changeOwnerPassword(req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json({ ok: true });
    }

    if (action === 'owner-change-email' && req.method === 'POST') {
      if (!requireMembersOwner(req, res)) return;
      const result = await changeOwnerEmail(req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'influencer-profile' && req.method === 'GET') {
      const session = requireMembersSession(req, res);
      if (!session) return;
      if (session.role !== 'influencer') {
        return res.status(403).json({ error: 'Influencer access only' });
      }
      const influencer = await findInfluencerById(session.influencerId);
      if (!influencer) return res.status(404).json({ error: 'Profile not found' });
      return res.status(200).json({ influencer: publicInfluencer(influencer) });
    }

    if (action === 'influencer-update-profile' && req.method === 'POST') {
      const session = requireMembersSession(req, res);
      if (!session) return;
      if (session.role !== 'influencer') {
        return res.status(403).json({ error: 'Influencer access only' });
      }

      const allowed = {
        displayName: req.body?.displayName,
        foundationName: req.body?.foundationName,
        mission: req.body?.mission,
        biography: req.body?.biography,
        whyStarted: req.body?.whyStarted,
        howItWorks: req.body?.howItWorks,
        country: req.body?.country,
        primaryCategory: req.body?.primaryCategory,
        categories: req.body?.categories,
      };

      const result = await updateInfluencer(session.influencerId, allowed);
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'influencer-change-password' && req.method === 'POST') {
      const session = requireMembersSession(req, res);
      if (!session) return;
      if (session.role !== 'influencer') {
        return res.status(403).json({ error: 'Influencer access only' });
      }
      const result = await changeInfluencerPassword(session.influencerId, req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json({ ok: true });
    }

    if (action === 'influencer-change-email' && req.method === 'POST') {
      const session = requireMembersSession(req, res);
      if (!session) return;
      if (session.role !== 'influencer') {
        return res.status(403).json({ error: 'Influencer access only' });
      }
      const result = await changeInfluencerEmail(session.influencerId, req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    return res.status(404).json({ error: 'Unknown members action' });
  } catch (err) {
    console.error(`api/members (${action}) error:`, err);
    return res.status(500).json({ error: err.message || 'Request failed' });
  }
};
