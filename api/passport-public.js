const { loadPublicPassportByUserId } = require('./_lib/passport-data');
const {
  resolveUserIdByPublicToken,
  getPublicBaseUrl,
} = require('./_lib/wallet/wallet-store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = String(req.query?.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'token required' });
  }

  try {
    const userId = await resolveUserIdByPublicToken(token);
    if (!userId) {
      return res.status(404).json({ error: 'Passport not found' });
    }

    const passport = await loadPublicPassportByUserId(userId);
    if (!passport) {
      return res.status(404).json({ error: 'Passport not found' });
    }

    const baseUrl = getPublicBaseUrl(req);
    return res.status(200).json({
      ok: true,
      passport: {
        voiceNumber: passport.voiceNumberFormatted,
        country: passport.country,
        city: passport.city,
        eventTitle: passport.eventTitle,
        memberSince: passport.memberSinceFormatted,
      },
      links: {
        app: `${baseUrl}/passport.html`,
        publicPage: `${baseUrl}/passport/${encodeURIComponent(token)}`,
      },
    });
  } catch (err) {
    console.error('[passport-public]', err);
    return res.status(500).json({ error: 'Could not load Passport' });
  }
};
