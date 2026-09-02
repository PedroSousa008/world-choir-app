#!/usr/bin/env node
/**
 * Lightweight a11y guardrails for World Choir public theme.
 * Fails if --text-muted contrast on black drops below WCAG AA (4.5:1).
 */
const fs = require('fs');
const path = require('path');

function luminance(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const channels = [16, 8, 0].map((s) => ((n >> s) & 255) / 255);
  const toLin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = channels.map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const css = fs.readFileSync(path.join(__dirname, '../public/css/world-choir-theme.css'), 'utf8');
const muted = css.match(/--text-muted:\s*(#[0-9a-fA-F]{6})/);
if (!muted) {
  console.error('FAIL: --text-muted not found');
  process.exit(1);
}
const ratio = contrast(muted[1], '#000000');
if (ratio < 4.5) {
  console.error(`FAIL: --text-muted ${muted[1]} contrast ${ratio.toFixed(2)}:1 < 4.5:1`);
  process.exit(1);
}
const a11y = path.join(__dirname, '../public/js/world-choir-a11y.js');
if (!fs.existsSync(a11y)) {
  console.error('FAIL: world-choir-a11y.js missing');
  process.exit(1);
}
console.log(`OK: --text-muted ${muted[1]} = ${ratio.toFixed(2)}:1 on black`);
console.log('OK: world-choir-a11y.js present');
