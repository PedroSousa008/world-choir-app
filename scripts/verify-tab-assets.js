#!/usr/bin/env node
/**
 * Drift guard: ensure world-choir-nav.js TAB_ASSETS versions match real HTML.
 * Soft-fails with warnings (does not block deploy) unless --strict.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
const navPath = path.join(root, 'js', 'world-choir-nav.js');
const strict = process.argv.includes('--strict');

const PAGE_MAP = {
  home: 'index.html',
  map: 'map.html',
  donate: 'donate.html',
  profile: 'profile.html',
  memory: 'memory.html',
  'daily-acts': 'daily-acts.html',
};

function extractAssets(html) {
  const out = new Set();
  const re = /(?:href|src)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1];
    if (u.startsWith('http') || u.startsWith('//')) continue;
    u = u.replace(/^\.\//, '');
    out.add(u);
  }
  return out;
}

function extractTabAssets(navSrc) {
  const block = navSrc.match(/const TAB_ASSETS = \{([\s\S]*?)\n  \};/);
  if (!block) return null;
  const tabs = {};
  const tabRe = /(\w[\w-]*)\s*:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = tabRe.exec(block[1]))) {
    const id = m[1];
    const urls = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    tabs[id] = urls;
  }
  return tabs;
}

const nav = fs.readFileSync(navPath, 'utf8');
const tabs = extractTabAssets(nav);
if (!tabs) {
  console.error('Could not parse TAB_ASSETS');
  process.exit(strict ? 1 : 0);
}

let mismatches = 0;
for (const [tab, page] of Object.entries(PAGE_MAP)) {
  const htmlPath = path.join(root, page);
  if (!fs.existsSync(htmlPath)) continue;
  const pageAssets = extractAssets(fs.readFileSync(htmlPath, 'utf8'));
  const listed = (tabs[tab] || []).filter((u) => u.includes('.js') || u.includes('.css'));
  for (const url of listed) {
    if (url.startsWith('http') || url.startsWith('/api')) continue;
    const bare = url.replace(/^\//, '');
    // Prefetch may intentionally omit some page assets; flag when listed URL is absent from page
    const match = [...pageAssets].some((a) => a === bare || a.endsWith(bare) || bare.endsWith(a));
    if (!match) {
      // Check if same path different version exists on page
      const pathOnly = bare.split('?')[0];
      const alt = [...pageAssets].find((a) => a.split('?')[0] === pathOnly);
      if (alt && alt !== bare) {
        console.warn(`[TAB_ASSETS drift] ${tab}: prefetch has ${bare} but page uses ${alt}`);
        mismatches += 1;
      }
    }
  }
}

if (mismatches) {
  console.warn(`TAB_ASSETS: ${mismatches} version drift warning(s). Update public/js/world-choir-nav.js TAB_ASSETS.`);
  if (strict) process.exit(1);
} else {
  console.log('TAB_ASSETS: no version drift detected vs primary HTML pages.');
}
