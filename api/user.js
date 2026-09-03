const {
  ensureUser,
  setUserOnboardingCompleted,
  setSongWeSangLetterFlags,
  jsonStorageError,
} = require('./_lib/store');

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    anonymous_device_id: user.anonymous_device_id,
    created_at: user.created_at,
    hasCompletedWorldChoirOnboarding: user.hasCompletedWorldChoirOnboarding === true,
    songWeSangLetterStarted: user.songWeSangLetterStarted === true,
    songWeSangLetterCompleted: user.songWeSangLetterCompleted === true,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { deviceId, action } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    if (action === 'complete-onboarding') {
      const user = await setUserOnboardingCompleted(deviceId, true);
      return res.status(200).json({ user: publicUser(user) });
    }

    if (action === 'mark-song-we-sang-letter-started') {
      const user = await setSongWeSangLetterFlags(deviceId, { started: true });
      return res.status(200).json({ user: publicUser(user) });
    }

    if (action === 'mark-song-we-sang-letter-completed') {
      const user = await setSongWeSangLetterFlags(deviceId, { completed: true });
      return res.status(200).json({ user: publicUser(user) });
    }

    const user = await ensureUser(deviceId);
    return res.status(200).json({ user: publicUser(user) });
  } catch (err) {
    console.error('api/user error:', err);
    const payload = await jsonStorageError(err);
    return res.status(503).json(payload);
  }
};
