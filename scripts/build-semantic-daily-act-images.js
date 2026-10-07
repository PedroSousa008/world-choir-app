#!/usr/bin/env node
/**
 * Build api/data/daily-act-images.json with one unique, semantically matched
 * Openverse / Wikimedia Commons photo per Daily Act ID.
 *
 * Run: node scripts/build-semantic-daily-act-images.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'api/data/daily-acts-of-peace.json');
const OUT_PATH = path.join(ROOT, 'api/data/daily-act-images.json');
const CACHE_PATH = path.join(ROOT, 'scripts/.cache-daily-act-image-pools.json');
const UA = 'WorldChoirApp/1.0 (daily-acts semantic image builder; contact@worldchoir.app)';

/** Hand-curated high-signal URLs for nursing / elderly acts (verified Wikimedia). */
const NURSING_SEED = [
  {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/db/Grandmother_and_granddaughter.jpg',
    title: 'Grandmother and granddaughter',
    source: 'wikimedia',
    query: 'seed-intergenerational',
  },
  {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Grandfather_and_child.jpg',
    title: 'Grandfather and child',
    source: 'wikimedia',
    query: 'seed-intergenerational',
  },
  {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Grandfather_and_child_3.jpg',
    title: 'Grandfather and child 3',
    source: 'wikimedia',
    query: 'seed-intergenerational',
  },
  {
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Grandfather_and_child_4.jpg',
    title: 'Grandfather and child 4',
    source: 'wikimedia',
    query: 'seed-intergenerational',
  },
  {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/e/e9/Smiling_girl_giving_double_V-sign_while_planting_rice_with_grandmother.jpg',
    title: 'Girl with grandmother planting rice',
    source: 'wikimedia',
    query: 'seed-intergenerational',
  },
  {
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/1/10/Smiling_girl_in_the_rice_fields_with_her_grandmother_in_Laos.jpg',
    title: 'Girl with grandmother in Laos',
    source: 'wikimedia',
    query: 'seed-intergenerational',
  },
  {
    imageUrl: 'https://live.staticflickr.com/624/21091195293_8990d65ed9_b.jpg',
    title: 'Elderly man smiling',
    source: 'flickr',
    query: 'elderly man smiling',
  },
  {
    imageUrl: 'https://live.staticflickr.com/3030/2658283615_cab8af9a50_b.jpg',
    title: 'Portrait smiling old man in hat. Mexico',
    source: 'flickr',
    query: 'elderly man smiling',
  },
];

/** Ordered rules: first match wins. */
const RULES = [
  {
    id: 'nursing-elderly',
    test: /\b(nursing home|senior living|elderly|older person|older people|grandparent|grandparents|resident who rarely|residents)\b/i,
    queries: [
      'elderly man smiling',
      'elderly woman smiling',
      'grandfather with grandchild',
      'grandmother and child',
      'senior citizen portrait',
      'old man young person',
      'intergenerational friendship',
    ],
  },
  {
    id: 'animal-shelter',
    test: /\b(animal shelter|rescue animal|shelter dog|shelter cat|\bdog\b|\bcat\b|\bpet\b|\banimal\b)/i,
    queries: ['rescue dog shelter', 'cat shelter volunteer', 'adopting a pet', 'dog being petted'],
  },
  {
    id: 'music-choir',
    test: /\b(song|sing|choir|music|practice the song|listen to music)\b/i,
    queries: ['choir singing together', 'people singing', 'musician performing', 'choir rehearsal'],
  },
  {
    id: 'food-meal',
    test: /\b(food|meal|cook|bake|recipe|eat|lunch|dinner|breakfast|cuisine|culture)\b/i,
    queries: ['friends sharing a meal', 'home cooked dinner table', 'people eating together', 'cooking together kitchen'],
  },
  {
    id: 'garden-plant',
    test: /\b(plant|garden|tree|seed|flower|nature|planet|earth|litter|recycle|environment)\b/i,
    queries: ['planting a tree', 'hands gardening soil', 'community garden volunteers', 'watering plants'],
  },
  {
    id: 'writing-letter',
    test: /\b(write|letter|note|journal|postcard|card)\b/i,
    queries: ['writing a handwritten letter', 'person journaling notebook', 'postcard writing desk'],
  },
  {
    id: 'phone-message',
    test: /\b(message|text|call|phone|email|check on)\b/i,
    queries: ['person smiling with phone', 'phone call conversation', 'texting on smartphone'],
  },
  {
    id: 'listening-story',
    test: /\b(listen|story|stories|tell you|conversation|talk with|talking)\b/i,
    queries: ['two people talking closely', 'friends deep conversation', 'listening attentively'],
  },
  {
    id: 'children-school',
    test: /\b(child|children|kid|school|classroom|teacher)\b/i,
    queries: ['children laughing outdoors', 'teacher with students', 'kids playing outside'],
  },
  {
    id: 'family',
    test: /\b(family|parent|mother|father|sibling|household)\b/i,
    queries: ['family together at home', 'parents and children smiling', 'family helping at home'],
  },
  {
    id: 'friendship',
    test: /\b(friend|friends|reconnect|catch up|old friend)\b/i,
    queries: ['two friends hugging', 'friends laughing together', 'friends reuniting cafe'],
  },
  {
    id: 'neighbor-community',
    test: /\b(neighbor|neighbour|community|local|street|neighborhood)\b/i,
    queries: ['friendly neighbors talking', 'community gathering outdoors', 'people helping neighborhood'],
  },
  {
    id: 'thank-gratitude',
    test: /\b(thank|gratitude|appreciate|grateful)\b/i,
    queries: ['thank you flowers gift', 'grateful handshake smile', 'appreciation gratitude'],
  },
  {
    id: 'donate-give',
    test: /\b(donat|give|gift|charity|foundation|support|budget)\b/i,
    queries: ['donating clothes charity', 'volunteer packing donations', 'giving a gift kindness'],
  },
  {
    id: 'volunteer-help',
    test: /\b(help|volunteer|assist|lend|chore|task)\b/i,
    queries: ['volunteers helping community', 'helping hands together', 'person helping someone'],
  },
  {
    id: 'walk-outdoors',
    test: /\b(walk|hike|outside|outdoors|park|fresh air)\b/i,
    queries: ['people walking in park', 'peaceful outdoor walk', 'friends walking nature'],
  },
  {
    id: 'smile-stranger',
    test: /\b(smile|stranger|hello|greet|wave)\b/i,
    queries: ['warm smile portrait', 'people greeting warmly', 'friendly hello smile'],
  },
  {
    id: 'apology-forgive',
    test: /\b(apolog|forgiv|honest|courage|admit)\b/i,
    queries: ['sincere conversation two people', 'honest talk friends', 'emotional conversation care'],
  },
  {
    id: 'calm-presence',
    test: /\b(breathe|meditat|quiet|silence|present|mindful|pause|reflect)\b/i,
    queries: ['person meditating calm', 'peaceful quiet moment nature', 'mindfulness outdoors'],
  },
  {
    id: 'clean-tidy',
    test: /\b(clean|tidy|organize|declutter|space)\b/i,
    queries: ['cleaning home tidying', 'organizing a room', 'fresh clean living space'],
  },
  {
    id: 'work-career',
    test: /\b(job|interview|work|career|colleague|coworker)\b/i,
    queries: ['mentorship conversation work', 'colleagues helping each other', 'job interview support'],
  },
  {
    id: 'learning',
    test: /\b(learn|read|book|study|understand|explore)\b/i,
    queries: ['person reading a book', 'studying with notebook', 'library reading quietly'],
  },
  {
    id: 'photo-memory',
    test: /\b(photo|memory|memories|picture)\b/i,
    queries: ['looking through old photos', 'family photo album', 'sharing photographs together'],
  },
  {
    id: 'board-games',
    test: /\b(board game|cards|game|play)\b/i,
    queries: ['playing board games together', 'friends playing cards', 'people laughing board game'],
  },
  {
    id: 'map-world',
    test: /\b(map|world|voices|countries|globe)\b/i,
    queries: ['world map travel', 'hands holding globe', 'people around the world'],
  },
  {
    id: 'joy-fun',
    test: /\b(fun|joy|laugh|surprise|celebrate|playful)\b/i,
    queries: ['friends laughing joy', 'celebration happiness people', 'playful moment outdoors'],
  },
  {
    id: 'kindness-gesture',
    test: /\b(kind|gesture|care|compassion|peace)\b/i,
    queries: ['act of kindness people', 'caring gesture hands', 'compassion helping others'],
  },
];

const CATEGORY_FALLBACK = {
  'connection-kindness': { id: 'kindness-gesture', queries: ['act of kindness people', 'warm human connection'] },
  connection: { id: 'friendship', queries: ['two friends talking', 'human connection'] },
  kindness: { id: 'kindness-gesture', queries: ['kindness gesture caring'] },
  compassion: { id: 'volunteer-help', queries: ['compassion helping others'] },
  generosity: { id: 'donate-give', queries: ['generous giving donation'] },
  understanding: { id: 'listening-story', queries: ['listening understanding conversation'] },
  presence: { id: 'calm-presence', queries: ['peaceful presence mindfulness'] },
  community: { id: 'neighbor-community', queries: ['community people together'] },
  family: { id: 'family', queries: ['family together home'] },
  reconnecting: { id: 'friendship', queries: ['friends reconnecting'] },
  planet: { id: 'garden-plant', queries: ['nature care environment'] },
  self: { id: 'calm-presence', queries: ['self care peaceful moment'] },
  communication: { id: 'listening-story', queries: ['people communicating'] },
  helping: { id: 'volunteer-help', queries: ['helping someone volunteer'] },
  courage: { id: 'apology-forgive', queries: ['brave honest conversation'] },
  joy: { id: 'joy-fun', queries: ['joyful people laughing'] },
  beyond: { id: 'learning', queries: ['curiosity learning discovery'] },
  bigger: { id: 'volunteer-help', queries: ['making a difference community'] },
  'special-choir': { id: 'music-choir', queries: ['choir singing together'] },
  practice: { id: 'music-choir', queries: ['music practice singing'] },
  'foundation-discovery': { id: 'donate-give', queries: ['charity foundation support'] },
  'supporting-change': { id: 'volunteer-help', queries: ['social change volunteers'] },
  'in-app-discovery': { id: 'map-world', queries: ['world map exploration'] },
};

const TITLE_REJECT =
  /geograph|barn|tractor|running event|philosophy|wellcome|cartoon|diagram|logo|map\.|painting|drawing|engraving|statue|sculpture|building|facility|architecture|postcard|ca\.\s*1[89]|18\d\d|19[0-4]\d|svg|qr.?code|screenshot|icon|chart|graph|flag of|coat of arms|pdf/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classify(act) {
  const text = `${act.text || ''} ${act.explanation || ''}`;
  for (const rule of RULES) {
    if (rule.test.test(text)) return { id: rule.id, queries: rule.queries };
  }
  return (
    CATEGORY_FALLBACK[act.category] || {
      id: 'kindness-gesture',
      queries: ['people kindness peace', 'human connection warm'],
    }
  );
}

function cleanUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim().split('?')[0];
  u = u.replace(/_[sqtmn]\.(jpg|jpeg|png)$/i, '_b.$1');
  u = u.replace(/_z\.(jpg|jpeg|png)$/i, '_b.$1');
  return u;
}

function isUsable(imageUrl, title, meta = {}) {
  if (!imageUrl) return false;
  const lower = imageUrl.toLowerCase();
  if (/\.(svg|gif|pdf|tif|tiff)(\?|$)/i.test(lower)) return false;
  if (TITLE_REJECT.test(title || '') || TITLE_REJECT.test(lower)) return false;
  if (meta.width && meta.width < 600) return false;
  if (meta.height && meta.height < 500) return false;
  return (
    /live\.staticflickr\.com|upload\.wikimedia\.org|images\.unsplash\.com|cdn\.pixabay\.com|images\.pexels\.com/i.test(
      imageUrl
    ) || /\.(jpe?g|png|webp)$/i.test(lower)
  );
}

async function fetchJson(url, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (res.status === 429 || res.status === 403) {
      const wait = 8000 + attempt * 6000;
      console.warn(`  rate-limited (${res.status}), waiting ${wait}ms…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Anonymous Openverse: page_size must be <= 20
      if (res.status === 401 && /page_size/i.test(body)) {
        throw new Error(`page_size error: ${body.slice(0, 80)}`);
      }
      throw new Error(`HTTP ${res.status} ${body.slice(0, 100)}`);
    }
    return res.json();
  }
  throw new Error(`Gave up on ${url}`);
}

async function searchOpenverse(query, pages = 2) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const url =
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
      `&page=${page}&page_size=20` +
      `&license=by,by-sa,by-nd,by-nc,by-nc-sa,by-nc-nd,cc0,pdm` +
      `&aspect_ratio=tall,square&size=large,medium`;
    try {
      const data = await fetchJson(url);
      for (const r of data.results || []) {
        const imageUrl = cleanUrl(r.url);
        const title = r.title || '';
        if (!isUsable(imageUrl, title, { width: r.width, height: r.height })) continue;
        out.push({
          imageUrl,
          title: title.slice(0, 120),
          author: r.creator || '',
          source: r.source || 'openverse',
          foreignLandingUrl: r.foreign_landing_url || '',
          query,
        });
      }
      if (!(data.results || []).length) break;
    } catch (err) {
      console.warn(`  Openverse "${query}" p${page}: ${err.message}`);
      break;
    }
    await sleep(700);
  }
  return out;
}

async function searchWikimedia(query, limit = 20) {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
    `&generator=search&gsrnamespace=6&gsrlimit=${limit}` +
    `&gsrsearch=${encodeURIComponent(query)}` +
    `&prop=imageinfo&iiprop=url|size|mime|user`;
  try {
    const data = await fetchJson(url);
    const out = [];
    for (const page of Object.values(data.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      if (info.mime && !/^image\/(jpeg|png|webp)$/i.test(info.mime)) continue;
      const imageUrl = cleanUrl(info.url);
      const title = page.title || '';
      if (!isUsable(imageUrl, title, { width: info.width, height: info.height })) continue;
      out.push({
        imageUrl,
        title: title.replace(/^File:/, '').slice(0, 120),
        author: info.user || '',
        source: 'wikimedia',
        foreignLandingUrl: page.title
          ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`
          : '',
        query,
      });
    }
    return out;
  } catch (err) {
    console.warn(`  Wikimedia "${query}": ${err.message}`);
    return [];
  }
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return { pools: {} };
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function buildPoolForQueries(bucketId, queries, needed, cache) {
  if (cache.pools[bucketId] && cache.pools[bucketId].length >= needed) {
    console.log(`  cache hit ${bucketId}: ${cache.pools[bucketId].length}`);
    return cache.pools[bucketId].slice();
  }

  const seen = new Set();
  const pool = [];

  if (bucketId === 'nursing-elderly') {
    for (const item of NURSING_SEED) {
      if (seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      pool.push({ ...item, author: item.author || '' });
    }
  }

  for (const q of queries) {
    const ov = await searchOpenverse(q, 2);
    for (const item of ov) {
      if (seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      pool.push(item);
    }
    if (pool.length >= needed) break;

    await sleep(500);
    const wm = await searchWikimedia(q, 20);
    await sleep(800);
    for (const item of wm) {
      if (seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      pool.push(item);
    }
    if (pool.length >= needed) break;
  }

  cache.pools[bucketId] = pool;
  saveCache(cache);
  return pool.slice();
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const acts = (catalog.acts || []).filter((a) => a.active !== false);
  console.log(`Acts: ${acts.length}`);

  const classified = acts.map((act) => ({ act, bucket: classify(act) }));
  const byBucket = new Map();
  for (const row of classified) {
    if (!byBucket.has(row.bucket.id)) {
      byBucket.set(row.bucket.id, { queries: row.bucket.queries, acts: [] });
    }
    byBucket.get(row.bucket.id).acts.push(row.act);
  }

  console.log('Buckets:');
  for (const [id, info] of [...byBucket.entries()].sort((a, b) => b[1].acts.length - a[1].acts.length)) {
    console.log(`  ${id}: ${info.acts.length}`);
  }

  const cache = loadCache();
  const usedUrls = new Set();
  const bucketPools = new Map();

  // Fetch nursing first so it gets the best matches before rate limits
  const orderedBuckets = [
    ...[...byBucket.keys()].filter((id) => id === 'nursing-elderly'),
    ...[...byBucket.keys()].filter((id) => id !== 'nursing-elderly'),
  ];

  for (const id of orderedBuckets) {
    const info = byBucket.get(id);
    const needed = info.acts.length + 10;
    console.log(`Fetching pool for ${id} (need ~${needed})…`);
    let pool = await buildPoolForQueries(id, info.queries, needed, cache);
    if (pool.length < needed) {
      const extra = await buildPoolForQueries(
        `${id}__extra`,
        [`${id.replace(/-/g, ' ')} people photograph`, 'people kindness photograph'],
        needed - pool.length + 5,
        cache
      );
      const seen = new Set(pool.map((p) => p.imageUrl));
      for (const item of extra) {
        if (seen.has(item.imageUrl)) continue;
        seen.add(item.imageUrl);
        pool.push(item);
      }
    }
    bucketPools.set(id, pool);
    console.log(`  → ${pool.length} candidates`);
  }

  // Smaller buckets first so sparse themes keep their best matches.
  // Within nursing-elderly, prioritize explicit nursing-home / elderly acts.
  const nursingPriority = new Set(['dap-506', 'dap-505', 'dap-499', 'dap-128', 'dap-032', 'dap-053', 'dap-416', 'dap-439']);
  const assignOrder = [...classified].sort((a, b) => {
    const sizeDiff = byBucket.get(a.bucket.id).acts.length - byBucket.get(b.bucket.id).acts.length;
    if (sizeDiff) return sizeDiff;
    const ap = nursingPriority.has(a.act.id) ? 0 : 1;
    const bp = nursingPriority.has(b.act.id) ? 0 : 1;
    return ap - bp;
  });

  const images = {};
  const leftovers = [];
  const nursingTitleOk =
    /\b(elderly|senior|grandmother|grandfather|old man|old woman|grandchild|granddaughter|grandson|intergenerational)\b/i;

  function takeFromPool(pool, { requireNursingTitle = false } = {}) {
    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      if (!item?.imageUrl || usedUrls.has(item.imageUrl)) continue;
      if (requireNursingTitle && !nursingTitleOk.test(item.title || '') && !/^seed-/.test(item.query || '')) {
        continue;
      }
      pool.splice(i, 1);
      usedUrls.add(item.imageUrl);
      return item;
    }
    // Fallback: any remaining unused item in pool
    while (pool.length) {
      const item = pool.shift();
      if (!item?.imageUrl || usedUrls.has(item.imageUrl)) continue;
      usedUrls.add(item.imageUrl);
      return item;
    }
    return null;
  }

  for (const row of assignOrder) {
    const pool = bucketPools.get(row.bucket.id) || [];
    const item = takeFromPool(pool, { requireNursingTitle: row.bucket.id === 'nursing-elderly' });
    if (!item) {
      leftovers.push(row);
      continue;
    }
    images[row.act.id] = {
      imageUrl: item.imageUrl,
      imageBucket: row.bucket.id,
      source: item.source,
      author: item.author || '',
      title: (item.title || '').slice(0, 120),
      query: item.query || row.bucket.queries[0],
      foreignLandingUrl: item.foreignLandingUrl || '',
    };
  }

  if (leftovers.length) {
    console.log(`Filling ${leftovers.length} leftovers…`);
    const mega = [];
    for (const pool of bucketPools.values()) mega.push(...pool);
    const emergency = await buildPoolForQueries(
      '__emergency',
      [
        'people kindness',
        'human connection',
        'friends outdoors',
        'community volunteers',
        'peaceful people',
        'helping others',
        'warm portrait smile',
        'family love',
      ],
      leftovers.length + 50,
      cache
    );
    mega.push(...emergency);
    for (const row of leftovers) {
      const item = takeFromPool(mega);
      if (!item) throw new Error(`Could not assign unique image for ${row.act.id}`);
      images[row.act.id] = {
        imageUrl: item.imageUrl,
        imageBucket: row.bucket.id,
        source: item.source,
        author: item.author || '',
        title: (item.title || '').slice(0, 120),
        query: item.query || row.bucket.queries[0],
        foreignLandingUrl: item.foreignLandingUrl || '',
        fallbackFill: true,
      };
    }
  }

  const urls = Object.values(images).map((i) => i.imageUrl);
  const unique = new Set(urls);
  if (unique.size !== acts.length) {
    throw new Error(`Uniqueness failed: ${unique.size} unique of ${acts.length}`);
  }
  if (Object.keys(images).length !== acts.length) {
    throw new Error(`Coverage failed: ${Object.keys(images).length} of ${acts.length}`);
  }

  const out = {
    version: 5,
    source: 'Openverse + Wikimedia Commons (semantic match per act text)',
    generatedAt: new Date().toISOString(),
    count: acts.length,
    uniqueUrls: unique.size,
    images,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Unique: ${unique.size}/${acts.length}`);

  for (const id of ['dap-506', 'dap-505', 'dap-499', 'dap-128', 'dap-032']) {
    const row = images[id];
    if (!row) continue;
    console.log(`${id} [${row.imageBucket}] ${row.title} → ${row.imageUrl.slice(0, 100)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
