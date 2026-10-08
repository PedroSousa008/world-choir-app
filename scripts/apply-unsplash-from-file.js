#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'api/data/daily-act-images.json');
const TXT_PATH = path.join(ROOT, 'docs/daily-act-unsplash-assignments.txt');
const CSV_PATH = path.join(ROOT, 'docs/daily-act-unsplash-assignments.csv');
const INPUT = process.argv[2] || path.join(__dirname, 'unsplash-batch-latest.txt');

function extractPhotoId(pageUrl) {
  const slug = pageUrl.match(/unsplash\.com\/photos\/([^/?#]+)/i)?.[1] || '';
  const m = slug.match(/-([A-Za-z0-9_-]{7,15})$/);
  return m ? m[1] : slug;
}

function buildImageUrl(rawOg) {
  if (!rawOg) return null;
  try {
    const u = new URL(rawOg);
    u.search = '';
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'crop');
    u.searchParams.set('w', '900');
    u.searchParams.set('h', '1200');
    u.searchParams.set('q', '80');
    return u.toString();
  } catch {
    return rawOg;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveOgImage(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'WorldChoirApp/1.0 (daily-act image assignment)',
      Accept: 'text/html',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const ogMatch =
    html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  let og = ogMatch?.[1] || null;
  if (!og) {
    const img = html.match(/https:\/\/(?:plus\.)?images\.unsplash\.com\/[A-Za-z0-9_=?&%./-]+/);
    og = img?.[0] || null;
  }
  return buildImageUrl(og);
}

async function main() {
  const raw = fs.readFileSync(INPUT, 'utf8');
  const rows = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      return { actId: parts[0], pageUrl: parts[1] || '', text: parts[2] || '' };
    })
    .filter((r) => r.actId && /^https?:\/\//i.test(r.pageUrl));

  for (const r of rows) r.photoId = extractPhotoId(r.pageUrl);

  const byPhoto = new Map();
  for (const r of rows) {
    if (!byPhoto.has(r.photoId)) byPhoto.set(r.photoId, []);
    byPhoto.get(r.photoId).push(r.actId);
  }
  const withinBatchDupes = [...byPhoto.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([photoId, actIds]) => ({ photoId, actIds }));

  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  const existingByPhoto = new Map();
  for (const [id, row] of Object.entries(map.images || {})) {
    const pid = row.unsplashPhotoId || extractPhotoId(row.foreignLandingUrl || '');
    if (pid) existingByPhoto.set(pid, id);
  }

  const skipActs = new Set();
  const reportDupes = [];
  for (const d of withinBatchDupes) {
    const [keep, ...rest] = d.actIds;
    reportDupes.push({ photoId: d.photoId, keep, skipped: rest, reason: 'repeated in this batch' });
    for (const id of rest) skipActs.add(id);
  }

  for (const r of rows) {
    if (skipActs.has(r.actId)) continue;
    const existing = existingByPhoto.get(r.photoId);
    if (existing && existing !== r.actId) {
      skipActs.add(r.actId);
      reportDupes.push({
        photoId: r.photoId,
        keep: existing,
        skipped: [r.actId],
        reason: 'same photo already used',
      });
    }
  }

  const toApply = rows.filter((r) => !skipActs.has(r.actId));
  console.log(`Parsed ${rows.length}; applying ${toApply.length}; skipping ${skipActs.size}`);
  if (reportDupes.length) {
    console.log('DUPLICATES:');
    for (const d of reportDupes) {
      console.log(`  ${d.photoId}: keep ${d.keep}, skip ${d.skipped.join(', ')} (${d.reason})`);
    }
  }

  const resolved = [];
  const failed = [];
  for (const r of toApply) {
    try {
      const imageUrl = await resolveOgImage(r.pageUrl);
      if (!imageUrl) throw new Error('no og:image');
      const probe = await fetch(imageUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'WorldChoirApp/1.0', Range: 'bytes=0-1023' },
        redirect: 'follow',
      });
      if (!probe.ok && probe.status !== 206) throw new Error(`image HTTP ${probe.status}`);
      resolved.push({ ...r, imageUrl });
      console.log('OK', r.actId, r.photoId);
    } catch (err) {
      failed.push({ actId: r.actId, error: err.message });
      console.log('FAIL', r.actId, err.message);
    }
    await sleep(250);
  }

  const usedUrls = new Set(
    Object.entries(map.images)
      .filter(([id]) => !resolved.some((r) => r.actId === id))
      .map(([, row]) => row.imageUrl)
  );

  let applied = 0;
  for (const r of resolved) {
    if (usedUrls.has(r.imageUrl)) {
      console.log('URL conflict for', r.actId, '— skipping');
      skipActs.add(r.actId);
      reportDupes.push({
        photoId: r.photoId,
        keep: '[existing CDN url]',
        skipped: [r.actId],
        reason: 'same image CDN URL already used',
      });
      continue;
    }
    usedUrls.add(r.imageUrl);
    const prev = map.images[r.actId] || {};
    map.images[r.actId] = {
      imageUrl: r.imageUrl,
      imageBucket: prev.imageBucket || 'unsplash-curated',
      source: 'unsplash',
      author: '',
      title: '',
      query: 'owner-curated',
      foreignLandingUrl: r.pageUrl,
      unsplashPhotoId: r.photoId,
      curated: true,
    };
    applied += 1;
  }

  map.version = Number(map.version || 0) + 1;
  map.source = 'Mixed: owner-curated Unsplash + Openverse/Wikimedia fallbacks';
  map.generatedAt = new Date().toISOString();
  map.count = Object.keys(map.images).length;
  map.uniqueUrls = new Set(Object.values(map.images).map((r) => r.imageUrl)).size;
  if (map.uniqueUrls !== map.count) {
    throw new Error(`Uniqueness failed: ${map.uniqueUrls}/${map.count}`);
  }
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');

  const fill = Object.fromEntries(
    resolved.filter((r) => map.images[r.actId]?.foreignLandingUrl === r.pageUrl).map((r) => [r.actId, r.pageUrl])
  );

  const txt = fs
    .readFileSync(TXT_PATH, 'utf8')
    .split('\n')
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 3 || !/^dap-\d+$/.test(parts[0])) return line;
      const id = parts[0];
      if (!fill[id]) return line;
      parts[1] = fill[id];
      return parts.join(' | ');
    })
    .join('\n');
  fs.writeFileSync(TXT_PATH, txt);

  const csvLines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
  const outCsv = csvLines
    .map((line, i) => {
      if (i === 0 || !line.trim()) return line;
      const cols = [];
      let cur = '';
      let inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') {
          if (inQ && line[j + 1] === '"') {
            cur += '"';
            j++;
          } else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cols.push(cur);
          cur = '';
        } else cur += ch;
      }
      cols.push(cur);
      while (cols.length < 6) cols.push('');
      const id = cols[0];
      if (fill[id]) cols[3] = fill[id];
      return cols.map((c) => (/[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',');
    })
    .join('\n');
  fs.writeFileSync(CSV_PATH, outCsv.endsWith('\n') ? outCsv : `${outCsv}\n`);

  const curated = Object.values(map.images).filter((r) => r.curated).length;
  const summary = {
    parsed: rows.length,
    applied,
    curatedTotal: curated,
    skippedDuplicates: [...skipActs],
    duplicates: reportDupes,
    failed,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
