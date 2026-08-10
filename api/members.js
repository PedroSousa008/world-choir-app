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
const { putPublicBinary, assertBlobConfigured } = require('./_lib/store');
const { randomUUID } = require('crypto');
const {
  buildFoundationControlCenter,
  searchFoundationControlCenter,
} = require('./_lib/foundation-intel');
const {
  upsertProject,
  setProjectStatus,
  upsertUpdate,
  upsertTeamMember,
  removeTeamMember,
  markNotificationRead,
  markAllNotificationsRead,
  saveDrafts,
  appendActivity,
  rolePermissions,
} = require('./_lib/foundation-workspace');

function requireFoundationSession(req, res) {
  const session = requireMembersSession(req, res);
  if (!session) return null;
  if (session.role !== 'influencer' || !session.influencerId) {
    res.status(403).json({ error: 'Foundation access only' });
    return null;
  }
  return session;
}

function actorLabel(session) {
  return session.teamRole ? `Team · ${session.teamRole}` : 'Foundation Owner';
}

function can(session, permission) {
  const role = session.teamRole || 'owner';
  return !!rolePermissions(role)[permission];
}

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || '';

  try {
    if (action === 'login' && req.method === 'POST') {
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

    /* ─── Foundation Control Center (scoped) ─── */

    if (action === 'control-center' && req.method === 'GET') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      const range = String(req.query.range || 'all');
      const role = session.teamRole || 'owner';
      const data = await buildFoundationControlCenter(session.influencerId, { range, role });
      if (!data.ok) return res.status(404).json({ error: data.error || 'Not found' });
      return res.status(200).json(data);
    }

    if (action === 'search' && req.method === 'GET') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      const data = await buildFoundationControlCenter(session.influencerId, {
        range: 'all',
        role: session.teamRole || 'owner',
      });
      if (!data.ok) return res.status(404).json({ error: data.error || 'Not found' });
      const results = searchFoundationControlCenter(data, req.query.q || '');
      return res.status(200).json({ query: req.query.q || '', results });
    }

    if (action === 'influencer-profile' && req.method === 'GET') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      const influencer = await findInfluencerById(session.influencerId);
      if (!influencer) return res.status(404).json({ error: 'Profile not found' });
      return res.status(200).json({ influencer: publicInfluencer(influencer) });
    }

    if (action === 'upload-image' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'editFoundation')) {
        return res.status(403).json({ error: 'Your role cannot upload Foundation media' });
      }

      const { dataUrl, kind } = req.body || {};
      const field = kind === 'cover' ? 'cover' : (kind === 'project' ? 'project' : 'profile');
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Choose an image from your device' });
      }

      const match = /^data:(image\/(jpeg|jpg|png|webp|gif));base64,(.+)$/i.exec(dataUrl);
      if (!match) {
        return res.status(400).json({ error: 'Use a JPG, PNG, WebP, or GIF image' });
      }

      const contentType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
      const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
      const buffer = Buffer.from(match[3], 'base64');
      const maxBytes = 2.5 * 1024 * 1024;
      if (buffer.length > maxBytes) {
        return res.status(400).json({ error: 'Image must be under 2.5 MB' });
      }

      assertBlobConfigured();
      const pathname = `wc-data/members/media/${session.influencerId}/${field}-${randomUUID()}.${ext}`;
      const url = await putPublicBinary(pathname, buffer, contentType, { overwrite: true });

      return res.status(200).json({ ok: true, url, kind: field });
    }

    if (action === 'influencer-update-profile' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'editFoundation')) {
        return res.status(403).json({ error: 'Your role cannot edit Foundation content' });
      }

      const allowed = {
        displayName: req.body?.displayName,
        foundationName: req.body?.foundationName,
        mission: req.body?.mission,
        biography: req.body?.biography,
        whyStarted: req.body?.whyStarted,
        howItWorks: req.body?.howItWorks,
        shortDescription: req.body?.shortDescription,
        story: req.body?.story,
        website: req.body?.website,
        profileImage: req.body?.profileImage,
        coverImage: req.body?.coverImage,
        cardShortMission: req.body?.cardShortMission,
        country: req.body?.country,
        primaryCategory: req.body?.primaryCategory,
        categories: req.body?.categories,
        socialLinks: req.body?.socialLinks,
      };

      const result = await updateInfluencer(session.influencerId, allowed);
      if (!result.ok) return res.status(400).json({ error: result.error });
      await appendActivity(session.influencerId, {
        action: 'foundation_updated',
        label: 'Foundation profile updated',
        detail: result.influencer.foundationName || result.influencer.displayName,
        actor: actorLabel(session),
        relatedType: 'foundation',
        relatedId: session.influencerId,
      });
      return res.status(200).json(result);
    }

    if (action === 'save-drafts' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'editFoundation')) {
        return res.status(403).json({ error: 'Your role cannot edit drafts' });
      }
      const result = await saveDrafts(session.influencerId, req.body || {});
      return res.status(200).json(result);
    }

    if (action === 'project-upsert' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'createProjects')) {
        return res.status(403).json({ error: 'Your role cannot manage projects' });
      }
      const result = await upsertProject(session.influencerId, req.body || {}, actorLabel(session));
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'project-status' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'createProjects')) {
        return res.status(403).json({ error: 'Your role cannot manage projects' });
      }
      const { id, status } = req.body || {};
      if (!id || !status) return res.status(400).json({ error: 'Project id and status required' });
      const result = await setProjectStatus(session.influencerId, id, status, actorLabel(session));
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'update-upsert' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'publishUpdates')) {
        return res.status(403).json({ error: 'Your role cannot manage updates' });
      }
      const result = await upsertUpdate(session.influencerId, req.body || {}, actorLabel(session));
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'team-upsert' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'manageTeam')) {
        return res.status(403).json({ error: 'Your role cannot manage the team' });
      }
      const result = await upsertTeamMember(session.influencerId, req.body || {}, actorLabel(session));
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'team-remove' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!can(session, 'manageTeam')) {
        return res.status(403).json({ error: 'Your role cannot manage the team' });
      }
      const result = await removeTeamMember(session.influencerId, req.body?.id, actorLabel(session));
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'notifications-read' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (req.body?.all) {
        await markAllNotificationsRead(session.influencerId);
        return res.status(200).json({ ok: true });
      }
      const result = await markNotificationRead(session.influencerId, req.body?.id);
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'influencer-change-password' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (session.teamRole) {
        return res.status(403).json({ error: 'Team members cannot change the Foundation owner password' });
      }
      const result = await changeInfluencerPassword(session.influencerId, req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      await appendActivity(session.influencerId, {
        action: 'security_password',
        label: 'Password changed',
        actor: actorLabel(session),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'influencer-change-email' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (session.teamRole) {
        return res.status(403).json({ error: 'Team members cannot change the Foundation owner email' });
      }
      const result = await changeInfluencerEmail(session.influencerId, req.body || {});
      if (!result.ok) return res.status(400).json({ error: result.error });
      await appendActivity(session.influencerId, {
        action: 'security_email',
        label: 'Email changed',
        detail: result.email,
        actor: actorLabel(session),
      });
      return res.status(200).json(result);
    }

    // Legacy owner routes — moved to /owner
    if ([
      'overview', 'create-influencer', 'update-influencer',
      'owner-change-password', 'owner-change-email',
    ].includes(action)) {
      return res.status(410).json({ error: 'Owner tools moved to /owner (Control Center).' });
    }

    return res.status(404).json({ error: 'Unknown members action' });
  } catch (err) {
    console.error(`api/members (${action}) error:`, err);
    return res.status(500).json({ error: err.message || 'Request failed' });
  }
};
