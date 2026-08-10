const {
  corsHeaders,
  isOwnerAuthConfigured,
  setMembersSessionCookie,
  clearMembersSessionCookie,
  getMembersSessionFromRequest,
  requireMembersSession,
  getEffectiveOwnerEmail,
} = require('./_lib/auth');
const {
  updateInfluencer,
  verifyInfluencerCredentials,
  findInfluencerById,
  changeInfluencerPassword,
  changeInfluencerEmail,
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
      // /members is Influencer-only. Owner Control Center is /owner.
      const { email, password } = req.body || {};
      const normalizedEmail = String(email || '').trim().toLowerCase();

      if (!normalizedEmail || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (isOwnerAuthConfigured()) {
        const ownerEmail = await getEffectiveOwnerEmail();
        if (ownerEmail && normalizedEmail === ownerEmail) {
          return res.status(401).json({
            error: 'Owner access is at /owner — this page is for Influencer login only.',
          });
        }
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

      // Legacy Owner cookies on /members are cleared — Owner uses /owner only.
      if (session.role === 'owner') {
        clearMembersSessionCookie(res);
        return res.status(401).json({
          authenticated: false,
          error: 'Owner sessions use /owner. This page is for Influencers.',
        });
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
      return res.status(410).json({ error: 'Owner overview moved to /owner (Control Center).' });
    }

    if (action === 'create-influencer' && req.method === 'POST') {
      return res.status(410).json({
        error: 'Create Influencer Foundations from Owner Control Center (/owner).',
      });
    }

    if (action === 'update-influencer' && req.method === 'POST') {
      return res.status(410).json({
        error: 'Owner influencer management moved to /owner (Control Center).',
      });
    }

    if (action === 'owner-change-password' && req.method === 'POST') {
      return res.status(410).json({ error: 'Owner account settings are at /owner.' });
    }

    if (action === 'owner-change-email' && req.method === 'POST') {
      return res.status(410).json({ error: 'Owner account settings are at /owner.' });
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
