#!/usr/bin/env node
/**
 * Unit tests — Pass the World partnership daily analytics helpers.
 */
const path = require('path');

const mem = {
  files: new Map(),
};

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

  // Tracking meta starts on first event
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'impression',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    country: 'Brazil',
    city: 'Rio de Janeiro',
    clientNow: '2026-09-16T18:00:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'impression',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    country: 'Brazil',
    city: 'Rio de Janeiro',
    clientNow: '2026-09-16T18:05:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'impression',
    configurationId: 'cfg_a',
    visitorId: 'v2',
    country: 'Portugal',
    city: 'Lisbon',
    clientNow: '2026-09-16T18:10:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'click',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    clientNow: '2026-09-16T18:11:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'click',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    clientNow: '2026-09-16T18:12:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'engage',
    configurationId: 'cfg_a',
    visitorId: 'v1',
    engagedMs: 15000,
    clientNow: '2026-09-16T18:13:00.000Z',
  });
  await analytics.recordPartnershipAnalyticsEvent({
    eventType: 'engage',
    configurationId: 'cfg_a',
    visitorId: 'v2',
    engagedMs: 45000,
    clientNow: '2026-09-16T18:14:00.000Z',
  });

  const day = await analytics.getPartnershipDayAnalytics({
    date: '2026-09-16',
    now: new Date('2026-09-16T20:00:00.000Z'),
    segments: [{
      configurationId: 'cfg_a',
      startedAt: '2026-09-16T17:12:00.000Z',
      endedAt: '2026-09-16T17:43:00.000Z',
      mapLogoUrl: 'https://example.com/map.png',
      subtitle: 'Partner A',
    }],
  });

  assert(day.available === true, 'tracked day is available');
  assert(day.metrics.partnershipReach === 2, 'reach counts unique visitors');
  assert(day.metrics.partnershipImpressions === 2, 'second impression for v1 within cooldown is deduped');
  assert(day.metrics.linkImageClicks === 2, 'link clicks count all clicks');
  assert(day.metrics.uniqueLinkImageClickers === 1, 'unique clickers');
  assert(day.metrics.uniqueCountriesReached === 2, 'distinct countries');
  assert(day.metrics.uniqueCitiesReached === 2, 'distinct cities');
  assert(day.metrics.averageTimeOnPassTheWorldLabel === '30s', 'average engaged time');
  assert(day.timeline.activeLabel === '31 minutes', 'active duration for 17:12–17:43');
  assert(day.timeline.intervals.length === 1, 'one timeline interval');

  // Pre-tracking date is unavailable (not fake zeros)
  const old = await analytics.getPartnershipDayAnalytics({
    date: '2026-09-10',
    now: new Date('2026-09-16T20:00:00.000Z'),
    segments: [{
      configurationId: 'cfg_a',
      startedAt: '2026-09-10T10:00:00.000Z',
      endedAt: '2026-09-10T12:00:00.000Z',
      mapLogoUrl: 'https://example.com/map.png',
    }],
  });
  assert(old.unavailable === true, 'pre-tracking date unavailable');
  assert(old.metrics == null, 'no fabricated metrics before tracking');
  assert(old.timeline.intervals.length === 1, 'timeline still from history');

  // Multiple ON intervals sum active time only
  const multi = analytics.buildDayIntervals([
    { configurationId: 'cfg_a', startedAt: '2026-09-16T09:00:00.000Z', endedAt: '2026-09-16T10:00:00.000Z' },
    { configurationId: 'cfg_a', startedAt: '2026-09-16T15:00:00.000Z', endedAt: '2026-09-16T17:30:00.000Z' },
  ], '2026-09-16', new Date('2026-09-16T20:00:00.000Z'));
  const multiMs = multi.reduce((s, i) => s + i.ms, 0);
  assert(multiMs === 3.5 * 3600 * 1000, 'multi intervals sum to 3h30m');
  assert(multi.length === 2, 'keeps separate intervals');

  // Off day after tracking started → real zeros (not "not collected")
  const off = await analytics.getPartnershipDayAnalytics({
    date: '2026-09-16',
    now: new Date('2026-09-16T20:00:00.000Z'),
    segments: [],
  });
  assert(off.timeline.intervals.length === 0, 'off day has empty timeline');
  assert(off.unavailable !== true, 'off day after epoch is still available');
  assert(off.metrics && off.metrics.partnershipReach === 0, 'off day shows zero metrics');

  // Ship day with active intervals but no events yet → zeros, not unavailable
  mem.files.clear();
  const liveEmpty = await analytics.getPartnershipDayAnalytics({
    date: '2026-09-16',
    now: new Date('2026-09-16T18:20:00.000Z'),
    segments: [{
      configurationId: 'cfg_live',
      startedAt: '2026-09-16T18:07:00.000Z',
      endedAt: null,
      mapLogoUrl: 'https://example.com/map.png',
      subtitle: 'Emirates',
    }],
  });
  assert(liveEmpty.unavailable !== true, 'live ship day without events is available');
  assert(liveEmpty.available === true, 'live ship day available flag');
  assert(liveEmpty.live === true, 'open interval is live');
  assert(liveEmpty.metrics && liveEmpty.metrics.partnershipReach === 0, 'zeros when no traffic yet');
  assert(liveEmpty.metrics.partnershipImpressions === 0, 'zero impressions');
  assert(Boolean(mem.files.get('wc-data/pass-the-world/partnership/analytics/meta.json')?.trackingSince), 'Owner read seeds trackingSince');

  console.log('\nptw-partnership-analytics tests passed');
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
