#!/usr/bin/env node
/**
 * Parity harness: client aggregation over /api/pledges vs /api/pledges?aggregate=1
 *
 * Usage:
 *   node scripts/parity-map-aggregate.js
 *   BASE_URL=https://world-choir-app.vercel.app node scripts/parity-map-aggregate.js
 *   node scripts/parity-map-aggregate.js --fixture=/path/to/pledges.json
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || process.env.PARITY_BASE_URL || 'http://127.0.0.1:3000';
const EVENT_ID = process.env.EVENT_ID || 'world-choir-2027';

function clientAggregate(mappedPledges, eventId) {
  const eventPledges = (mappedPledges || []).filter(
    (p) => p && (p.event_id === eventId || p.eventId === eventId)
  );
  const seenUsers = new Set();
  const unique = [];
  for (const p of eventPledges) {
    if (!p.user_id || seenUsers.has(p.user_id)) continue;
    seenUsers.add(p.user_id);
    unique.push(p);
  }

  const withLocation = unique.filter((p) => p.city && p.country);
  const stats = {
    voices: unique.length,
    cities: new Set(withLocation.map((p) => `${p.city}|${p.country}`)).size,
    countries: new Set(withLocation.map((p) => p.country)).size,
  };

  const cityMap = {};
  for (const p of unique) {
    if (p.latitude == null || p.longitude == null || !p.city || !p.country) continue;
    const key = `${p.city}|${p.country}`;
    if (!cityMap[key]) {
      cityMap[key] = {
        city: p.city,
        country: p.country,
        latitude: p.latitude,
        longitude: p.longitude,
        count: 0,
      };
    }
    cityMap[key].count += 1;
  }
  return { stats, cities: Object.values(cityMap) };
}

function cityKey(c) {
  return `${c.city}|${c.country}`;
}

function compare(oldAgg, newAgg) {
  const errors = [];
  for (const k of ['voices', 'cities', 'countries']) {
    if (oldAgg.stats[k] !== newAgg.stats[k]) {
      errors.push(`stats.${k}: old=${oldAgg.stats[k]} new=${newAgg.stats[k]}`);
    }
  }

  const oldMap = new Map(oldAgg.cities.map((c) => [cityKey(c), c]));
  const newMap = new Map(newAgg.cities.map((c) => [cityKey(c), c]));

  if (oldMap.size !== newMap.size) {
    errors.push(`city count: old=${oldMap.size} new=${newMap.size}`);
  }

  for (const [key, oldCity] of oldMap) {
    const neu = newMap.get(key);
    if (!neu) {
      errors.push(`missing city in NEW: ${key}`);
      continue;
    }
    if (neu.count !== oldCity.count) {
      errors.push(`${key} count: old=${oldCity.count} new=${neu.count}`);
    }
    if (neu.latitude !== oldCity.latitude || neu.longitude !== oldCity.longitude) {
      errors.push(
        `${key} coords: old=${oldCity.latitude},${oldCity.longitude} new=${neu.latitude},${neu.longitude}`
      );
    }
    if (neu.city !== oldCity.city || neu.country !== oldCity.country) {
      errors.push(`${key} labels mismatch`);
    }
  }

  for (const key of newMap.keys()) {
    if (!oldMap.has(key)) errors.push(`extra city in NEW: ${key}`);
  }

  // Ordering: Object.values insertion order should match for first-writer coords
  const oldOrder = oldAgg.cities.map(cityKey).join('||');
  const newOrder = newAgg.cities.map(cityKey).join('||');
  if (oldOrder !== newOrder) {
    errors.push('city insertion order differs (may affect deterministic rendering)');
  }

  return errors;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} → ${res.status} ${text.slice(0, 200)}`);
  return { json: JSON.parse(text), bytes: Buffer.byteLength(text, 'utf8') };
}

function loadFixture(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(raw) ? raw : raw.pledges || [];
}

function syntheticCases() {
  const cases = [];

  cases.push({
    name: 'one-pledge',
    pledges: [
      {
        id: '1', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 1,
        city: 'Lisbon', country: 'Portugal', latitude: 38.7, longitude: -9.1,
      },
    ],
  });

  cases.push({
    name: 'multi-same-city',
    pledges: [
      {
        id: '1', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 1,
        city: 'Lisbon', country: 'Portugal', latitude: 38.7, longitude: -9.1,
      },
      {
        id: '2', user_id: 'u2', event_id: EVENT_ID, voiceNumber: 2,
        city: 'Lisbon', country: 'Portugal', latitude: 38.71, longitude: -9.12,
      },
    ],
  });

  cases.push({
    name: 'same-city-name-diff-country',
    pledges: [
      {
        id: '1', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 1,
        city: 'Paris', country: 'France', latitude: 48.8, longitude: 2.3,
      },
      {
        id: '2', user_id: 'u2', event_id: EVENT_ID, voiceNumber: 2,
        city: 'Paris', country: 'United States', latitude: 33.6, longitude: -95.5,
      },
    ],
  });

  cases.push({
    name: 'missing-coords-counts-in-stats-not-markers',
    pledges: [
      {
        id: '1', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 1,
        city: 'Lisbon', country: 'Portugal', latitude: 38.7, longitude: -9.1,
      },
      {
        id: '2', user_id: 'u2', event_id: EVENT_ID, voiceNumber: 2,
        city: 'Porto', country: 'Portugal', latitude: null, longitude: null,
      },
    ],
  });

  cases.push({
    name: 'duplicate-user-first-wins',
    pledges: [
      {
        id: '1', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 1,
        city: 'Braga', country: 'Portugal', latitude: 41.5, longitude: -8.4,
      },
      {
        id: '1b', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 99,
        city: 'Lisbon', country: 'Portugal', latitude: 38.7, longitude: -9.1,
      },
    ],
  });

  cases.push({
    name: 'unicode-city',
    pledges: [
      {
        id: '1', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 1,
        city: 'São Paulo', country: 'Brazil', latitude: -23.5, longitude: -46.6,
      },
    ],
  });

  cases.push({
    name: 'whitespace-sensitive-keys',
    pledges: [
      {
        id: '1', user_id: 'u1', event_id: EVENT_ID, voiceNumber: 1,
        city: 'Lisbon', country: 'Portugal', latitude: 1, longitude: 1,
      },
      {
        id: '2', user_id: 'u2', event_id: EVENT_ID, voiceNumber: 2,
        city: 'Lisbon ', country: 'Portugal', latitude: 2, longitude: 2,
      },
    ],
  });

  return cases;
}

async function main() {
  const args = process.argv.slice(2);
  const fixtureArg = args.find((a) => a.startsWith('--fixture='));
  const localOnly = args.includes('--local-only');

  // Local store algorithm vs inlined client algorithm (synthetic)
  const {
    computeMapAggregateFromMappedPledges,
  } = require(path.join(__dirname, '..', 'api/_lib/store.js'));

  let failed = 0;
  console.log('=== Synthetic parity (store helper vs client mirror) ===');
  for (const c of syntheticCases()) {
    const oldAgg = clientAggregate(c.pledges, EVENT_ID);
    const newAgg = computeMapAggregateFromMappedPledges(c.pledges, EVENT_ID);
    const errors = compare(oldAgg, newAgg);
    if (errors.length) {
      failed += 1;
      console.log(`FAIL ${c.name}`);
      errors.forEach((e) => console.log('  ', e));
    } else {
      console.log(`OK   ${c.name}`);
    }
  }

  if (fixtureArg) {
    const file = fixtureArg.split('=')[1];
    const pledges = loadFixture(file);
    const oldAgg = clientAggregate(pledges, EVENT_ID);
    const newAgg = computeMapAggregateFromMappedPledges(pledges, EVENT_ID);
    const errors = compare(oldAgg, newAgg);
    console.log(`\n=== Fixture ${file} ===`);
    if (errors.length) {
      failed += 1;
      errors.forEach((e) => console.log('FAIL', e));
    } else {
      console.log('OK fixture parity', oldAgg.stats);
    }
  }

  if (!localOnly) {
    console.log(`\n=== Live API parity (${BASE}) ===`);
    try {
      const full = await fetchJson(`${BASE}/api/pledges?eventId=${encodeURIComponent(EVENT_ID)}`);
      const agg = await fetchJson(
        `${BASE}/api/pledges?eventId=${encodeURIComponent(EVENT_ID)}&aggregate=1`
      );
      const oldAgg = clientAggregate(full.json.pledges || [], EVENT_ID);
      const newAgg = {
        stats: agg.json.stats,
        cities: agg.json.cities || [],
      };
      const errors = compare(oldAgg, newAgg);
      console.log('full bytes', full.bytes, 'records', (full.json.pledges || []).length);
      console.log('aggregate bytes', agg.bytes, 'cities', (agg.json.cities || []).length);
      console.log('old stats', oldAgg.stats);
      console.log('new stats', newAgg.stats);
      if (errors.length) {
        failed += 1;
        errors.forEach((e) => console.log('FAIL', e));
      } else {
        console.log('OK live API parity');
        const reduction = full.bytes
          ? (((full.bytes - agg.bytes) / full.bytes) * 100).toFixed(1)
          : 'n/a';
        console.log(`payload reduction: ${reduction}%`);
      }
    } catch (err) {
      console.log('SKIP live API:', err.message);
      console.log('(Run with a deployed BASE_URL after aggregate endpoint ships, or --local-only)');
    }
  }

  if (failed) {
    console.error(`\nPARITY FAILED (${failed})`);
    process.exit(1);
  }
  console.log('\nALL PARITY CHECKS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
