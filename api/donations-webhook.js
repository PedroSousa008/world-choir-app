/**
 * Stripe webhook entrypoint — POST /api/donations-webhook
 * Forwards into the unified donations handler with action=webhook.
 */
const donationsHandler = require('./donations');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  req.query = { ...(req.query || {}), action: 'webhook' };
  return donationsHandler(req, res);
};
