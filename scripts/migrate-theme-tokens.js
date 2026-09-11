#!/usr/bin/env node
/**
 * Migrate common hardcoded dark-only surface/text colours to semantic theme tokens.
 * Skips owner/admin CSS. Idempotent for already-migrated values.
 */
const fs = require('fs');
const path = require('path');

const CSS_DIR = path.join(__dirname, '..', 'public', 'css');
const SKIP = /^(owner|foundation-control|admin)/i;

const REPLACERS = [
  // Backgrounds
  [/background:\s*#000000\b/gi, 'background: var(--bg-primary)'],
  [/background:\s*#000\b/gi, 'background: var(--bg-primary)'],
  [/background-color:\s*#000000\b/gi, 'background-color: var(--bg-primary)'],
  [/background-color:\s*#000\b/gi, 'background-color: var(--bg-primary)'],
  [/background:\s*#0a0a0a\b/gi, 'background: var(--bg-secondary)'],
  [/background:\s*#070708\b/gi, 'background: var(--mem-card-bg)'],
  [/background:\s*#050505\b/gi, 'background: var(--bg-secondary)'],
  [/background:\s*#0c0c0e\b/gi, 'background: var(--bg-secondary)'],
  [/background:\s*#111\b/gi, 'background: var(--bg-secondary)'],
  [/background:\s*#111111\b/gi, 'background: var(--bg-secondary)'],
  // Text that matches global tokens
  [/color:\s*#f4f4f6\b/gi, 'color: var(--text-primary)'],
  [/color:\s*#a8abb8\b/gi, 'color: var(--text-secondary)'],
  [/color:\s*#8a8e9a\b/gi, 'color: var(--text-muted)'],
  [/color:\s*#8a8d97\b/gi, 'color: var(--text-muted)'],
  // Common white/off-white text (not on gradient buttons — those keep #fff)
  [/color:\s*#ffffff\b/gi, 'color: var(--text-primary)'],
  [/color:\s*#fff\b(?!;)/gi, 'color: var(--text-primary)'],
  [/color:\s*#f2efe8\b/gi, 'color: var(--df-warm)'],
  // Borders
  [/border(?:-color)?:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.06\s*\)/gi, 'border-color: var(--border-subtle)'],
  [/border:\s*1px solid rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.06\s*\)/gi, 'border: 1px solid var(--border-subtle)'],
  [/border:\s*1px solid rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.08\s*\)/gi, 'border: 1px solid var(--df-line)'],
  [/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.06\s*\)/gi, 'var(--border-subtle)'],
  [/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.08\s*\)/gi, 'var(--df-line)'],
];

// Restore intentional white text on coloured CTA surfaces after bulk replace
const RESTORE = [
  [
    /(\.btn-primary[^{]*\{[^}]*?)color:\s*var\(--text-primary\)/gis,
    '$1color: #fff',
  ],
  [
    /(\.btn-hero[^{]*\{[^}]*?)color:\s*var\(--text-primary\)/gis,
    '$1color: #fff',
  ],
];

function processFile(filePath) {
  const name = path.basename(filePath);
  if (!name.endsWith('.css') || SKIP.test(name)) return false;
  let src = fs.readFileSync(filePath, 'utf8');
  const before = src;
  for (const [re, rep] of REPLACERS) {
    src = src.replace(re, rep);
  }
  for (const [re, rep] of RESTORE) {
    src = src.replace(re, rep);
  }
  if (src !== before) {
    fs.writeFileSync(filePath, src);
    return true;
  }
  return false;
}

const changed = [];
for (const name of fs.readdirSync(CSS_DIR)) {
  const full = path.join(CSS_DIR, name);
  if (fs.statSync(full).isFile() && processFile(full)) changed.push(name);
}
console.log(changed.length ? `Updated:\n- ${changed.join('\n- ')}` : 'No CSS changes');
