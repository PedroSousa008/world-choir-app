/**
 * Public map sponsor records for the World Choir Map sponsor bar.
 *
 * Returns only the public subset required for rendering. Private contract fields
 * must be added to Owner storage and mapped here when the management system ships.
 */
const { corsHeaders } = require('./_lib/auth');

/** @type {Array<{ id: string, companyName: string, logo: string, websiteUrl: string, isActive: boolean, displayOrder: number }>} */
const MAP_SPONSORS = [];

function publicSponsorRecord(sponsor) {
  return {
    id: sponsor.id,
    companyName: sponsor.companyName,
    logo: sponsor.logo,
    websiteUrl: sponsor.websiteUrl || '',
    displayOrder: sponsor.displayOrder ?? 0,
  };
}

module.exports = async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sponsors = MAP_SPONSORS
    .filter((s) => s.isActive !== false)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map(publicSponsorRecord);

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  return res.status(200).json({ sponsors });
};
