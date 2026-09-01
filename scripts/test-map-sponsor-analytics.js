/**
 * Map sponsor analytics — click location aggregation tests (no network).
 */
const assert = require('assert');
const {
  mergeClickLocationsAgg,
  recordClickLocation,
  aggregateClickMapPoints,
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
  assert.strictEqual(row.clickLocations['visitor-a'].uniqueClickers, 1);

  recordClickLocation(row, 'visitor-a', {
    city: 'Lisbon',
    country: 'Portugal',
    latitude: 38.72,
    longitude: -9.14,
  });
  assert.strictEqual(Object.keys(row.clickLocations).length, 1);
  assert.strictEqual(row.clickLocations['visitor-a'].uniqueClickers, 1);
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
      uniqueClickers: 1,
    },
  });
  mergeClickLocationsAgg(target, {
    'visitor-a': {
      city: 'Lisbon',
      country: 'Portugal',
      latitude: 38.72,
      longitude: -9.14,
      uniqueClickers: 1,
    },
    'visitor-b': {
      city: 'Paris',
      country: 'France',
      latitude: 48.85,
      longitude: 2.35,
      uniqueClickers: 1,
    },
  });

  assert.strictEqual(Object.keys(target).length, 2);
  assert.strictEqual(target['visitor-a'].uniqueClickers, 1);
  assert.strictEqual(target['visitor-b'].uniqueClickers, 1);
}

function testAggregateClickMapPoints() {
  const points = aggregateClickMapPoints({
    'visitor-a': {
      city: 'Lisbon',
      country: 'Portugal',
      latitude: 38.7223,
      longitude: -9.1393,
      uniqueClickers: 1,
    },
    'visitor-b': {
      city: 'Lisbon',
      country: 'Portugal',
      latitude: 38.7224,
      longitude: -9.1392,
      uniqueClickers: 1,
    },
    'visitor-c': {
      city: 'Paris',
      country: 'France',
      latitude: 48.8566,
      longitude: 2.3522,
      uniqueClickers: 1,
    },
  });

  assert.strictEqual(points.length, 3);
  const lisbon = points.find((point) => point.city === 'Lisbon');
  const paris = points.find((point) => point.city === 'Paris');
  assert.strictEqual(lisbon.uniqueClickers, 1);
  assert.strictEqual(paris.uniqueClickers, 1);

  const clustered = aggregateClickMapPoints({
    'visitor-a': {
      city: 'Lisbon',
      country: 'Portugal',
      latitude: 38.7223,
      longitude: -9.1393,
      uniqueClickers: 1,
    },
    'visitor-b': {
      city: 'Lisbon',
      country: 'Portugal',
      latitude: 38.7223,
      longitude: -9.1393,
      uniqueClickers: 1,
    },
  });
  assert.strictEqual(clustered.length, 1);
  assert.strictEqual(clustered[0].uniqueClickers, 2);
}

testRecordClickLocation();
testRecordClickLocationRequiresCoordinates();
testMergeClickLocationsAgg();
testAggregateClickMapPoints();
console.log('map-sponsor-analytics tests passed');
