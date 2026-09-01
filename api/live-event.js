/**
 * Global live event — server time + authoritative song-start transition.
 */
const { corsHeaders } = require('./_lib/auth');
const { jsonStorageError } = require('./_lib/store');
const {
  DEFAULT_EVENT_ID,
  readLiveEventState,
  recordVideoEnded,
  getLiveEventSchedule,
} = require('./_lib/live-event-state');

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const eventId = String(req.query?.eventId || req.body?.eventId || DEFAULT_EVENT_ID).trim();

  try {
    if (req.method === 'GET') {
      const serverNow = new Date().toISOString();
      const state = await readLiveEventState(eventId);
      const schedule = getLiveEventSchedule();

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        serverNow,
        schedule,
        actualLiveSongStartUtc: state.actualLiveSongStartUtc,
        videoEndedRecordedAt: state.videoEndedRecordedAt,
      });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const action = String(body?.action || '').trim();

      if (action === 'video-ended') {
        const serverNow = new Date().toISOString();
        const { state, created } = await recordVideoEnded(eventId, serverNow);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          ok: true,
          created,
          serverNow,
          actualLiveSongStartUtc: state.actualLiveSongStartUtc,
        });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/live-event error:', err);
    const payload = await jsonStorageError(err);
    const status = payload.storageUnavailable ? 503 : 500;
    return res.status(status).json(payload);
  }
};
