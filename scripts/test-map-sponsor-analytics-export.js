/**
 * Sponsor analytics HTML export — unit tests (no network).
 */
const assert = require('assert');
const {
  buildMapSponsorAnalyticsReportHtml,
  buildMapSponsorAnalyticsExportFilename,
} = require('../api/_lib/map-sponsors-analytics-export');

const sampleAnalytics = {
  sponsor: {
    companyName: 'Nike',
    companyWebsiteUrl: 'https://nike.com',
    companyLogoUrl: null,
    isActive: true,
    country: 'United States',
    activatedAt: '2026-08-12T00:00:00.000Z',
    contractEndDate: null,
    agreementTypeLabel: 'Sponsorship',
  },
  range: { label: '30 Days', from: '2026-08-03', to: '2026-09-01' },
  summary: {
    impressions: 1200,
    uniqueReach: 800,
    websiteClicks: 45,
    uniqueClickers: 32,
    ctrUnique: 2.7,
    daysActive: 20,
  },
  comparison: {
    impressions: 12,
    uniqueReach: 8,
    websiteClicks: -5,
    uniqueClickers: -3,
    ctrUnique: 1,
    periodLabel: 'previous 30 days',
  },
  countries: [{ country: 'Portugal', impressions: 100, clicks: 5, ctr: 5 }],
  clickLocations: [{
    city: 'Lisbon',
    country: 'Portugal',
    latitude: 38.72,
    longitude: -9.14,
    uniqueClickers: 1,
  }],
  clickMapPoints: [{
    city: 'Lisbon',
    country: 'Portugal',
    latitude: 38.72,
    longitude: -9.14,
    uniqueClickers: 1,
  }],
  events: [],
  timeSeries: [{ date: '2026-08-10', impressions: 50, uniqueReach: 40, clicks: 2, ctr: 4 }],
  highlights: null,
  commercial: { eventsSupported: 0, hasMonetaryValue: false },
  countriesReached: 1,
  dataStatus: 'Collecting',
  lastUpdated: '2026-09-01T12:00:00.000Z',
};

async function testReportHtml() {
  const html = await buildMapSponsorAnalyticsReportHtml(sampleAnalytics, {
    origin: 'https://world-choir-app.vercel.app',
  });
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Sponsor Analytics Report'));
  assert.ok(html.includes('Nike'));
  assert.ok(html.includes('Exported'));
  assert.ok(html.includes('Performance Summary'));
  assert.ok(html.includes('Unique Clickers by Location'));
  assert.ok(html.includes('Lisbon'));
  assert.ok(html.includes('World Choir'));
}

function testFilename() {
  const filename = buildMapSponsorAnalyticsExportFilename(sampleAnalytics);
  assert.match(filename, /^world-choir-sponsor-analytics-nike-\d{4}-\d{2}-\d{2}\.html$/);
}

(async () => {
  await testReportHtml();
  testFilename();
  console.log('map-sponsor-analytics-export tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
