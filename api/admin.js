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
const { buildOwnerDatabaseRows, jsonStorageError } = require('./_lib/store');
const {
  buildOwnerControlCenter,
  searchOwnerControlCenter,
} = require('./_lib/owner-intel');
const { buildDailyPeaceOwnerIntel } = require('./_lib/daily-peace');
const {
  buildOwnerPartnershipsLibrary,
  getPartnershipDetail,
  createPartnership,
  updatePartnership,
  publishPartnership,
  setPartnershipStatus,
  uploadPartnershipLogo,
  exportPartnershipReportCsv,
  findSpecificDateConflict,
} = require('./_lib/daily-peace-partnerships');
const {
  buildPassTheWorldOwnerIntel,
  exportPassTheWorldCsv,
} = require('./_lib/pass-the-world-owner');
const {
  buildPromiseMemoryIntel,
  getPromiseDetail,
  createFolder,
  renameFolder,
  deleteFolder,
  addPromisesToFolder,
  removePromisesFromFolder,
  exportPromiseMemory,
} = require('./_lib/promise-memory-owner');
const {
  listInfluencers,
  createInfluencer,
  updateInfluencer,
  resetInfluencerPasswordByEmail,
} = require('./_lib/members-store');
const {
  buildOwnerSponsorsLibrary,
  getSponsorById,
  createMapSponsor,
  updateMapSponsor,
  setMapSponsorStatus,
  deleteMapSponsor,
  reorderMapSponsors,
  uploadMapSponsorLogo,
  uploadMapSponsorDocument,
  deleteMapSponsorDocument,
  readMapSponsorDocument,
} = require('./_lib/map-sponsors-owner');
const { getMapSponsorAnalytics } = require('./_lib/map-sponsors-analytics');
const {
  buildMapSponsorAnalyticsReportHtml,
  buildMapSponsorAnalyticsExportFilename,
} = require('./_lib/map-sponsors-analytics-export');

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

    if (action === 'daily-peace' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildDailyPeaceOwnerIntel();
      return res.status(200).json(data);
    }

    if (action === 'pass-the-world' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const range = String(req.query.range || '30d');
      const roundId = req.query.roundId ? String(req.query.roundId) : null;
      const data = await buildPassTheWorldOwnerIntel({ range, roundId });
      return res.status(200).json(data);
    }

    if (action === 'pass-the-world-export' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const kind = String(req.query.kind || 'rounds');
      const range = String(req.query.range || 'all');
      const intel = await buildPassTheWorldOwnerIntel({ range });
      const csv = exportPassTheWorldCsv(intel, kind);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pass-the-world-${kind}.csv"`);
      return res.status(200).send(csv);
    }

    if (action === 'promise-memory' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildPromiseMemoryIntel({
        eventId: req.query.eventId,
        country: req.query.country,
        city: req.query.city,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        q: req.query.q,
        sort: req.query.sort,
        page: req.query.page,
        pageSize: req.query.pageSize,
        folderId: req.query.folderId,
        cityQuery: req.query.cityQuery,
        cityPage: req.query.cityPage,
      });
      return res.status(200).json(data);
    }

    if (action === 'promise-memory-detail' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Promise id required' });
      const detail = await getPromiseDetail(id);
      if (!detail) return res.status(404).json({ error: 'Promise not found' });
      return res.status(200).json(detail);
    }

    if (action === 'promise-memory-export' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const result = await exportPromiseMemory(req.query || {});
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-Export-Part', String(result.meta.part));
      res.setHeader('X-Export-Total-Parts', String(result.meta.totalParts));
      res.setHeader('X-Export-Total', String(result.meta.total));
      return res.status(200).send(result.body);
    }

    if (action === 'promise-memory-folder' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { op, folderId, name, promiseIds } = req.body || {};
      if (op === 'create') {
        const folder = await createFolder(name);
        return res.status(200).json({ ok: true, folder });
      }
      if (op === 'rename') {
        if (!folderId) return res.status(400).json({ error: 'folderId required' });
        const folder = await renameFolder(folderId, name);
        return res.status(200).json({ ok: true, folder });
      }
      if (op === 'delete') {
        if (!folderId) return res.status(400).json({ error: 'folderId required' });
        await deleteFolder(folderId);
        return res.status(200).json({ ok: true });
      }
      if (op === 'add') {
        if (!folderId) return res.status(400).json({ error: 'folderId required' });
        const folder = await addPromisesToFolder(folderId, promiseIds || []);
        return res.status(200).json({ ok: true, folder });
      }
      if (op === 'remove') {
        if (!folderId) return res.status(400).json({ error: 'folderId required' });
        const folder = await removePromisesFromFolder(folderId, promiseIds || []);
        return res.status(200).json({ ok: true, folder });
      }
      return res.status(400).json({ error: 'Unknown folder operation' });
    }

    if (action === 'daily-peace-partnerships' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildOwnerPartnershipsLibrary();
      return res.status(200).json(data);
    }

    if (action === 'daily-peace-partnership' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Partnership id required' });
      const data = await getPartnershipDetail(id);
      return res.status(200).json(data);
    }

    if (action === 'daily-peace-partnership-export' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Partnership id required' });
      const detail = await getPartnershipDetail(id);
      const csv = exportPartnershipReportCsv(detail);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="partnership-${id.slice(0, 8)}.csv"`);
      return res.status(200).send(csv);
    }

    if (action === 'daily-peace-date-conflict' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const date = req.query.date;
      const excludeId = req.query.excludeId || null;
      if (!date) return res.status(400).json({ error: 'date required' });
      const conflict = await findSpecificDateConflict(date, excludeId);
      return res.status(200).json({ conflict: conflict ? { id: conflict.id, companyName: conflict.companyName } : null });
    }

    if (action === 'create-daily-peace-partnership' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const partnership = await createPartnership(req.body || {});
      return res.status(200).json({ ok: true, partnership });
    }

    if (action === 'update-daily-peace-partnership' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Partnership id required' });
      const partnership = await updatePartnership(id, updates);
      return res.status(200).json({ ok: true, partnership });
    }

    if (action === 'publish-daily-peace-partnership' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Partnership id required' });
      const partnership = await publishPartnership(id);
      return res.status(200).json({ ok: true, partnership });
    }

    if (action === 'set-daily-peace-partnership-status' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, status } = req.body || {};
      if (!id || !status) return res.status(400).json({ error: 'Partnership id and status required' });
      const partnership = await setPartnershipStatus(id, status);
      return res.status(200).json({ ok: true, partnership });
    }

    if (action === 'upload-daily-peace-partnership-logo' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, dataUrl, fileName } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Partnership id required' });
      const partnership = await uploadPartnershipLogo(id, dataUrl, fileName);
      return res.status(200).json({ ok: true, partnership });
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

    if (action === 'reset-influencer-password' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { email, newPassword } = req.body || {};
      const result = await resetInfluencerPasswordByEmail({ email, newPassword });
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.status(200).json(result);
    }

    if (action === 'list-influencers' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const influencers = await listInfluencers();
      return res.status(200).json({ influencers });
    }

    if (action === 'map-sponsors' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const data = await buildOwnerSponsorsLibrary();
      return res.status(200).json(data);
    }

    if (action === 'map-sponsor' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const sponsor = await getSponsorById(id);
      if (!sponsor) return res.status(404).json({ error: 'Company not found' });
      return res.status(200).json({ sponsor });
    }

    if (action === 'map-sponsor-analytics' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const analytics = await getMapSponsorAnalytics(id, {
        range: req.query.range,
        from: req.query.from,
        to: req.query.to,
      });
      return res.status(200).json(analytics);
    }

    if (action === 'map-sponsor-analytics-export' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const analytics = await getMapSponsorAnalytics(id, {
        range: req.query.range,
        from: req.query.from,
        to: req.query.to,
      });
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'world-choir-app.vercel.app';
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const origin = `${proto}://${host}`;
      const html = await buildMapSponsorAnalyticsReportHtml(analytics, { origin });
      const filename = buildMapSponsorAnalyticsExportFilename(analytics);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(html);
    }

    if (action === 'create-map-sponsor' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const sponsor = await createMapSponsor(req.body || {});
      return res.status(200).json({ ok: true, sponsor });
    }

    if (action === 'update-map-sponsor' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const sponsor = await updateMapSponsor(id, updates);
      return res.status(200).json({ ok: true, sponsor });
    }

    if (action === 'set-map-sponsor-status' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, isActive } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const sponsor = await setMapSponsorStatus(id, isActive !== false && isActive !== 0 && isActive !== '0');
      return res.status(200).json({ ok: true, sponsor });
    }

    if (action === 'delete-map-sponsor' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const result = await deleteMapSponsor(id);
      return res.status(200).json({ ok: true, ...result });
    }

    if (action === 'reorder-map-sponsors' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { orderedIds } = req.body || {};
      const data = await reorderMapSponsors(orderedIds);
      return res.status(200).json({ ok: true, ...data });
    }

    if (action === 'upload-map-sponsor-logo' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, dataUrl, fileName } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const sponsor = await uploadMapSponsorLogo(id, dataUrl, fileName);
      return res.status(200).json({ ok: true, sponsor });
    }

    if (action === 'upload-map-sponsor-document' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, dataUrl, fileName, description } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Sponsor id required' });
      const sponsor = await uploadMapSponsorDocument(id, dataUrl, fileName, description);
      return res.status(200).json({ ok: true, sponsor });
    }

    if (action === 'delete-map-sponsor-document' && req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const { id, documentId } = req.body || {};
      if (!id || !documentId) return res.status(400).json({ error: 'Sponsor id and document id required' });
      const sponsor = await deleteMapSponsorDocument(id, documentId);
      return res.status(200).json({ ok: true, sponsor });
    }

    if (action === 'download-map-sponsor-document' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (!requireOwner(req, res)) return;
      const { id, documentId } = req.query;
      if (!id || !documentId) return res.status(400).json({ error: 'Sponsor id and document id required' });
      const { buffer, contentType, fileName } = await readMapSponsorDocument(id, documentId);
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${String(fileName || 'document').replace(/"/g, '')}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.status(200).send(buffer);
    }

    return res.status(404).json({ error: 'Unknown admin action' });
  } catch (err) {
    console.error(`api/admin (${action}) error:`, err);
    const payload = await jsonStorageError(err);
    const status = payload.storageUnavailable ? 503 : 500;
    return res.status(status).json(payload);
  }
};
