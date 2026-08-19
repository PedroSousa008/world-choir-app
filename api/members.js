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
const { putPrivateBinary, mediaProxyUrl, assertBlobConfigured } = require('./_lib/store');
const { randomUUID } = require('crypto');

const IMAGE_MIME_RE = /^image\/[a-z0-9.+-]+$/i;
const IMAGE_EXT_MAP = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
  bmp: 'bmp',
  tiff: 'tiff',
  tif: 'tiff',
  heic: 'heic',
  heif: 'heif',
  svg: 'svg',
  'svg+xml': 'svg',
  ico: 'ico',
  'x-icon': 'ico',
  jfif: 'jpg',
  pjpeg: 'jpg',
  pjp: 'jpg',
};
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
  findTeamLoginAcrossFoundations,
  updateTeamPermissions,
  markNotificationRead,
  markAllNotificationsRead,
  saveDrafts,
  appendActivity,
  rolePermissions,
} = require('./_lib/foundation-workspace');
const { listInfluencerIds } = require('./_lib/members-store');

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
      if (influencerResult.ok) {
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

      // Try team member login across all foundations
      const allIds = await listInfluencerIds();
      const teamResult = await findTeamLoginAcrossFoundations(normalizedEmail, password, allIds);
      if (teamResult.ok) {
        setMembersSessionCookie(res, {
          role: 'influencer',
          influencerId: teamResult.foundationId,
          email: teamResult.member.email,
          teamMemberId: teamResult.member.id,
          teamRole: 'team_member',
        });
        return res.status(200).json({
          ok: true,
          role: 'team_member',
          influencer: null,
          teamMember: teamResult.member,
          foundationId: teamResult.foundationId,
        });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
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
        role: session.teamRole || 'influencer',
        influencer: publicInfluencer(influencer),
        teamMemberId: session.teamMemberId || null,
        teamRole: session.teamRole || null,
      });
    }

    /* ─── Foundation Control Center (scoped) ─── */

    if (action === 'control-center' && req.method === 'GET') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      const range = String(req.query.range || 'all');
      const role = session.teamRole || 'owner';
      const data = await buildFoundationControlCenter(session.influencerId, {
        range,
        role,
        teamMemberId: session.teamMemberId || null,
      });
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

      const { dataUrl, kind, fileName } = req.body || {};
      const field = kind === 'cover' ? 'cover' : (kind === 'project' ? 'project' : 'profile');
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        return res.status(400).json({ error: 'Choose an image from your device' });
      }

      const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
      if (!match) {
        return res.status(400).json({ error: 'Could not read that image file' });
      }

      let contentType = String(match[1] || '').trim().toLowerCase();
      if (contentType === 'image/jpg') contentType = 'image/jpeg';
      if (contentType === 'application/octet-stream' || !contentType) {
        const name = String(fileName || '').toLowerCase();
        const extGuess = name.split('.').pop();
        if (extGuess && IMAGE_EXT_MAP[extGuess]) {
          contentType = extGuess === 'svg' ? 'image/svg+xml' : `image/${extGuess === 'jpg' ? 'jpeg' : extGuess}`;
        }
      }

      if (!IMAGE_MIME_RE.test(contentType)) {
        return res.status(400).json({ error: 'That file is not a supported image' });
      }

      const subtype = contentType.replace(/^image\//, '');
      const ext = IMAGE_EXT_MAP[subtype] || subtype.replace(/[^a-z0-9]/gi, '') || 'img';
      const buffer = Buffer.from(match[2], 'base64');
      const maxBytes = 4 * 1024 * 1024;
      if (!buffer.length) {
        return res.status(400).json({ error: 'Image file was empty' });
      }
      if (buffer.length > maxBytes) {
        return res.status(400).json({ error: 'Image must be under 4 MB' });
      }

      assertBlobConfigured();
      const pathname = `wc-data/members/media/${session.influencerId}/${field}-${randomUUID()}.${ext}`;
      await putPrivateBinary(pathname, buffer, contentType, { overwrite: true });
      const url = mediaProxyUrl(pathname);

      return res.status(200).json({ ok: true, url, path: pathname, kind: field });
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

    if (action === 'team-permissions' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (session.teamRole) {
        return res.status(403).json({ error: 'Only the Foundation owner can manage permissions' });
      }
      const { memberId, permissions } = req.body || {};
      if (!memberId || !permissions) {
        return res.status(400).json({ error: 'Member id and permissions required' });
      }
      const result = await updateTeamPermissions(session.influencerId, memberId, permissions);
      if (!result.ok) return res.status(400).json({ error: result.error });
      await appendActivity(session.influencerId, {
        action: 'team_permissions_updated',
        label: 'Team permissions updated',
        detail: result.member.name || result.member.email,
        actor: actorLabel(session),
        relatedType: 'team',
        relatedId: memberId,
      });
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

    if (action === 'team-member-change-password' && req.method === 'POST') {
      const session = requireFoundationSession(req, res);
      if (!session) return;
      if (!session.teamMemberId) {
        return res.status(403).json({ error: 'This action is for team members only. Owners use influencer-change-password.' });
      }
      const { currentPassword, newPassword, confirmPassword } = req.body || {};
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'All password fields are required' });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'New passwords do not match' });
      }
      if (String(newPassword).length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }
      const bcrypt = require('bcryptjs');
      const { readWorkspace, writeWorkspace } = require('./_lib/foundation-workspace');
      const ws = await readWorkspace(session.influencerId);
      const member = ws.team.find((t) => t.id === session.teamMemberId);
      if (!member || !member.passwordHash) {
        return res.status(404).json({ error: 'Team member not found' });
      }
      const currentMatch = await bcrypt.compare(String(currentPassword), member.passwordHash);
      if (!currentMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      member.passwordHash = await bcrypt.hash(String(newPassword), 12);
      member.updatedAt = new Date().toISOString();
      await writeWorkspace(ws);
      return res.status(200).json({ ok: true });
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
