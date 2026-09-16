#!/usr/bin/env node
/**
 * Unit tests — overall partnership analytics (dedupe + series + partners).
 */
const path = require('path');

const mem = { files: new Map() };
const storePath = path.resolve(__dirname, '../api/_lib/store.js');
require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: {
    assertBlobConfigured: () => {},
    readBlobJson: async (p) => {
      if (!mem.files.has(p)) throw new Error('missing');
      return JSON.parse(JSON.stringify(mem.files.get(p)));
    },
    writeJson: async (p, data) => {
      mem.files.set(p, JSON.parse(JSON.stringify(data)));
      return data;
    },
  },
};

const analytics = require('../api/_lib/pass-the-world-partnership-analytics');

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function main() {
  mem.files.clear();

  // Same visitor Mon + Tue → overall reach 1, daily reach 1 each day
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'impression',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    country: 'Portugal',
    city: 'Lisbon',
    clientNow: '2026-09-16T12:00:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'impression',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    country: 'Portugal',
    city: 'Lisbon',
    clientNow: '2026-09-17T12:00:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'impression',
    configurationId: 'cfg_a',
    visitorId: 'v2',
    country: 'Spain',
    city: 'Madrid',
    clientNow: '2026-09-17T13:00:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'click',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    clientNow: '2026-09-17T14:00:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'engage',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    engagedMs: 20000,
    clientNow: '2026-09-16T12:05:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'engage',
    configurationId: 'cfg_a',
    visitorId: 'v2',
    engagedMs: 40000,
    clientNow: '2026-09-17T13:05:00.000Z',
  });

  // Second partner company on 17 Sep
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'impression',
    configurationId: 'cfg_b',
    visitorId: 'v3',
    country: 'France',
    city: 'Paris',
    clientNow: '2026-09-17T15:00:00.000Z',
  });

  const overall = await analytics.getPartnershipOverallAnalytics({
    now: new Date('2026-09-17T20:00:00.000Z'),
    periods: [
      {
        configurationId: 'cfg_a',
        startedAt: '2026-09-16T10:00:00.000Z',
        endedAt: '2026-09-17T14:00:00.000Z',
      },
      {
        configurationId: 'cfg_b',
        startedAt: '2026-09-17T14:30:00.000Z',
        endedAt: null,
      },
    ],
    partnerGroups: [
      {
        partnerId: 'ptr_a',
        label: 'Partner A',
        mapLogoUrl: 'https://example.com/a.png',
        configurationIds: ['cfg_a'],
        dateRange: {
          startAt: '2026-09-16T10:00:00.000Z',
          endAt: '2026-09-17T14:00:00.000Z',
          startDate: '2026-09-16',
          endDate: '2026-09-17',
          open: false,
        },
      },
      {
        partnerId: 'ptr_b',
        label: 'Partner B',
        mapLogoUrl: 'https://example.com/b.png',
        configurationIds: ['cfg_b'],
        dateRange: {
          startAt: '2026-09-17T14:30:00.000Z',
          endAt: null,
          startDate: '2026-09-17',
          endDate: null,
          open: true,
        },
      },
    ],
  });

  assert(overall.overall.partnershipReach === 3, 'overall reach dedupes across days (v1,v2,v3)');
  assert(overall.overall.uniqueCountriesReached === 3, 'overall countries deduped');
  assert(overall.overall.uniqueCitiesReached === 3, 'overall cities deduped');
  assert(overall.overall.linkImageClicks === 1, 'overall clicks aggregate');
  assert(overall.overall.uniqueLinkImageClickers === 1, 'overall unique clickers');
  assert(overall.overall.partnershipActiveDays === 2, 'two active days');
  assert(overall.overall.averageTimeOnPassTheWorldLabel === '30s', 'weighted avg engage time');

  assert(overall.series7d.length === 7, 'graph has exactly 7 days');
  const day16 = overall.series7d.find((d) => d.date === '2026-09-16');
  const day17 = overall.series7d.find((d) => d.date === '2026-09-17');
  const day15 = overall.series7d.find((d) => d.date === '2026-09-15');
  assert(day16 && day16.values.reach === 1, 'daily reach Mon = 1');
  assert(day17 && day17.values.reach === 3, 'daily reach Tue merges both partners');
  assert(day15 && day15.unavailable === true, 'pre-epoch day unavailable not zero');

  assert(overall.partnerships.length === 2, 'two partner identities');
  const a = overall.partnerships.find((p) => p.partnerId === 'ptr_a');
  const b = overall.partnerships.find((p) => p.partnerId === 'ptr_b');
  assert(a.metrics.partnershipReach === 2, 'partner A reach');
  assert(b.metrics.partnershipReach === 1, 'partner B reach');
  assert(a.activeDays === 2, 'partner A active days');
  assert(b.activeDays === 1, 'partner B active days');

  // Single partner → still returns one group (UI shows empty comparison)
  const single = await analytics.getPartnershipOverallAnalytics({
    now: new Date('2026-09-17T20:00:00.000Z'),
    periods: [{
      configurationId: 'cfg_a',
      startedAt: '2026-09-16T10:00:00.000Z',
      endedAt: null,
    }],
    partnerGroups: [{
      partnerId: 'ptr_a',
      label: 'Only One',
      configurationIds: ['cfg_a'],
      dateRange: { startDate: '2026-09-16', endDate: null, open: true },
    }],
  });
  assert(single.partnershipCount === 1, 'single partner count');

  console.log('\nptw-partnership-overall tests passed');
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
