const { jsonStorageError, findUserByDevice } = require('./_lib/store');
const {
  listMemoryPhotos,
  createMemoryPhoto,
  getMemoryPhoto,
  getUserProgress,
  saveUserProgress,
  getPostStatus,
} = require('./_lib/memory-photos');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const eventId = String(req.query?.eventId || 'world-choir-2027').trim();
      const deviceId = String(req.query?.deviceId || '').trim();
      const view = String(req.query?.view || 'feed').trim();
      const live = String(req.query?.live || '') === '1' || view === 'live';
      const afterCreatedAt = req.query?.afterCreatedAt
        ? String(req.query.afterCreatedAt)
        : null;
      const afterId = req.query?.afterId ? String(req.query.afterId) : '';
      const limit = req.query?.limit ? Number(req.query.limit) : 30;

      if (view === 'status') {
        if (!deviceId) {
          return res.status(200).json({
            canPost: false,
            postedToday: false,
            onCooldown: false,
            progress: null,
          });
        }
        const status = await getPostStatus({ deviceId, eventId });
        const user = await findUserByDevice(deviceId);
        const progress = user?.id ? await getUserProgress(eventId, user.id) : null;
        return res.status(200).json({ ...status, progress });
      }

      let progress = null;
      let resumePhoto = null;
      let feedAfterCreatedAt = afterCreatedAt;
      let feedAfterId = afterId;

      if (deviceId) {
        const user = await findUserByDevice(deviceId);
        if (user?.id) {
          progress = await getUserProgress(eventId, user.id);
        }
      }

      // Initial load (no explicit cursor, not a live poll): resume after high-water mark.
      if (!live && !afterCreatedAt && progress?.lastConsumedCreatedAt) {
        resumePhoto = await getMemoryPhoto(eventId, progress.lastConsumedPhotoId);
        // Expired resume photo → start at first still-alive unseen item after cursor.
        feedAfterCreatedAt = progress.lastConsumedCreatedAt;
        feedAfterId = progress.lastConsumedPhotoId || '';
      }

      const feed = await listMemoryPhotos({
        eventId,
        afterCreatedAt: feedAfterCreatedAt,
        afterId: feedAfterId,
        limit,
      });

      // If resume photo expired and we have upcoming, client treats first upcoming as current.
      if (resumePhoto == null && !live && !afterCreatedAt && progress?.lastConsumedCreatedAt) {
        // leave resumePhoto null — client starts at items[0]
      }

      const status = deviceId
        ? await getPostStatus({ deviceId, eventId })
        : { canPost: false, postedToday: false, onCooldown: false };

      return res.status(200).json({
        items: feed.items,
        nextCursor: feed.nextCursor,
        resumePhoto,
        progress,
        canPost: Boolean(status.canPost),
        postedToday: Boolean(status.postedToday),
        onCooldown: Boolean(status.onCooldown),
        nextAllowedAt: status.nextAllowedAt || null,
        photoTtlHours: 24,
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});
      const action = String(body.action || 'create').trim();
      const deviceId = String(body.deviceId || '').trim();
      const eventId = String(body.eventId || 'world-choir-2027').trim();

      if (!deviceId) {
        return res.status(401).json({ error: 'Sign in required.', code: 'NO_DEVICE' });
      }

      if (action === 'progress') {
        const user = await findUserByDevice(deviceId);
        if (!user?.id) {
          return res.status(401).json({ error: 'Join World Choir first.', code: 'NO_USER' });
        }
        const saved = await saveUserProgress({
          eventId,
          userId: user.id,
          lastConsumedPhotoId: body.lastConsumedPhotoId,
          lastConsumedCreatedAt: body.lastConsumedCreatedAt,
        });
        return res.status(200).json({ progress: saved });
      }

      if (action === 'create') {
        try {
          const photo = await createMemoryPhoto({
            deviceId,
            eventId,
            dataUrl: body.dataUrl,
            caption: body.caption,
            fileName: body.fileName,
          });
          return res.status(201).json({ photo });
        } catch (err) {
          const code = err?.code;
          if (code === 'DAILY_MEMORY_LIMIT_REACHED') {
            return res.status(409).json({
              error: err.message,
              code,
              nextAllowedAt: err.nextAllowedAt || null,
            });
          }
          if (
            code === 'NO_USER'
            || code === 'NO_LOCATION'
            || code === 'INVALID_IMAGE'
            || code === 'IMAGE_TOO_LARGE'
            || code === 'CAPTION_TOO_LONG'
          ) {
            return res.status(400).json({ error: err.message, code });
          }
          throw err;
        }
      }

      return res.status(400).json({ error: 'Unsupported action.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/memory-photos error:', err);
    if (err?.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({
        error: err.message || 'Request failed',
        code: err.code,
      });
    }
    const payload = await jsonStorageError(err);
    return res.status(err?.statusCode || 503).json(payload);
  }
};
