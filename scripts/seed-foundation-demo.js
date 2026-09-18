#!/usr/bin/env node
/**
 * Apply or clear temporary Foundation demo seed against Blob storage.
 * Usage:
 *   node scripts/seed-foundation-demo.js
 *   node scripts/seed-foundation-demo.js --clear
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  text.split(/\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

const root = path.join(__dirname, '..');
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is missing. Pull env or set it before seeding.');
    process.exit(1);
  }
  const clear = process.argv.includes('--clear');
  const {
    seedFoundationDemoData,
    clearFoundationDemoData,
  } = require('../api/_lib/foundation-demo-seed');

  const result = clear
    ? await clearFoundationDemoData()
    : await seedFoundationDemoData();

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
