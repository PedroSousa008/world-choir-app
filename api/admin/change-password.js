const { corsHeaders, requireOwner, changeOwnerPassword } = require('../lib/auth');

module.exports = async function handler(req, res) {
  corsHeaders(res);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!requireOwner(req, res)) return;

  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    const result = await changeOwnerPassword({ currentPassword, newPassword, confirmPassword });

    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Could not change password' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('api/admin/change-password error:', err);
    return res.status(500).json({ error: 'Could not change password' });
  }
};
