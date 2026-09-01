/**
 * Map sponsor analytics — click location aggregation tests (no network).
 */
const assert = require('assert');
const {
  mergeClickLocationsAgg,
  recordClickLocation,
} = require('../api/_lib/map-sponsors-analytics');

function testRecordClickLocation() {
  const row = { clickLocations: {} };
  recordClickLocation(row, 'visitor-a', {
    city: 'Lisbon',
    country: 'Portugal',
    latitude: 38.72,
    longitude: -9.14,
  });
  assert.strictEqual(Object.keys(row.clickLocations).length, 1);
  assert.strictEqual(row.clickLocations['visitor-a'].clicks, 1);

  recordClickLocation(row, 'visitor-a', {
    city: 'Lisbon',
    country: 'Portugal',
    latitude: 38.72,
    longitude: -9.14,
  });
  assert.strictEqual(row.clickLocations['visitor-a'].clicks, 2);
}

function testRecordClickLocationRequiresCoordinates() {
  const row = { clickLocations: {} };
  recordClickLocation(row, 'visitor-b', {
    city: 'Unknown',
    country: 'Portugal',
    latitude: null,
    longitude: null,
  });
  assert.strictEqual(Object.keys(row.clickLocations).length, 0);
}

function testMergeClickLocationsAgg() {
  const target = {};
  mergeClickLocationsAgg(target, {
    'visitor-a': {
      city: 'Lisbon',
      country: 'Portugal',
      latitude: 38.72,
      longitude: -9.14,
      clicks: 2,
    },
  });
  mergeClickLocationsAgg(target, {
    'visitor-a': {
      city: 'Lisbon',
      country: 'Portugal',
      latitude: 38.72,
      longitude: -9.14,
      clicks: 1,
    },
    'visitor-b': {
      city: 'Paris',
      country: 'France',
      latitude: 48.85,
      longitude: 2.35,
      clicks: 1,
    },
  });

  assert.strictEqual(Object.keys(target).length, 2);
  assert.strictEqual(target['visitor-a'].clicks, 3);
  assert.strictEqual(target['visitor-b'].clicks, 1);
}

testRecordClickLocation();
testRecordClickLocationRequiresCoordinates();
testMergeClickLocationsAgg();
console.log('map-sponsor-analytics tests passed');
