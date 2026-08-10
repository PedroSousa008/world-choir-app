const {
  getOrAssignDailyAct,
  completeDailyAct,
  completeAssignment,
  dismissDailyActNotification,
  saveReflection,
  markViewed,
  trackInteraction,
  getImpact,
  getCalendarMonth,
  getAssignment,
  resolveDate,
  parseDateStrict,
} = require('./_lib/daily-peace');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const deviceId = req.method === 'GET' ? req.query.deviceId : req.body?.deviceId;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    if (req.method === 'GET') {
      const view = String(req.query.view || 'today');
      const date = resolveDate(req.query.date);

      if (view === 'impact') {
        const result = await getImpact(deviceId, date);
        return res.status(200).json(result);
      }

      if (view === 'calendar') {
        const result = await getCalendarMonth(deviceId, req.query.month, date);
        return res.status(200).json(result);
      }

      if (view === 'assignment') {
        const result = await getAssignment(deviceId, req.query.assignmentDate, date);
        return res.status(200).json(result);
      }

      const result = await getOrAssignDailyAct(deviceId, date);
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const action = req.body?.action || 'complete';
      const date = resolveDate(req.body?.date);
      const assignmentDate = parseDateStrict(req.body?.assignmentDate) || date;

      if (action === 'dismiss-notification') {
        const result = await dismissDailyActNotification(deviceId, date);
        return res.status(200).json(result);
      }

      if (action === 'complete') {
        const result = await completeAssignment(deviceId, assignmentDate, date, {
          sourceHint: assignmentDate === date ? 'daily' : 'still_open',
        });
        return res.status(200).json(result);
      }

      // legacy
      if (action === 'complete-today') {
        const result = await completeDailyAct(deviceId, date);
        return res.status(200).json(result);
      }

      if (action === 'save-reflection') {
        const result = await saveReflection(
          deviceId,
          assignmentDate,
          date,
          req.body?.reflection
        );
        return res.status(200).json(result);
      }

      if (action === 'mark-viewed') {
        const result = await markViewed(deviceId, assignmentDate, date);
        return res.status(200).json(result);
      }

      if (action === 'track-interaction') {
        const result = await trackInteraction(
          deviceId,
          assignmentDate,
          date,
          req.body?.interaction
        );
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: 'unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/daily-peace error:', err);
    const message = err.message || 'Service unavailable';
    const status = message.includes('user not found')
      ? 404
      : message.includes('invalid') || message.includes('required') || message.includes('before')
        ? 400
        : 503;
    return res.status(status).json({ error: message });
  }
};
