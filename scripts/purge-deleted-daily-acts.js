#!/usr/bin/env node
/**
 * Purge incomplete Daily Acts assignments whose act_id was removed from the
 * live catalog. Completed assignments are kept so user history remains.
 *
 * Also pauses Owner partnerships that still point at a deleted catalog act.
 *
 * Usage:
 *   node scripts/purge-deleted-daily-acts.js
 *   node scripts/purge-deleted-daily-acts.js --dry-run
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const ROOT = path.join(__dirname, '..');
loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env'));

const DRY_RUN = process.argv.includes('--dry-run');
const deleted = require(path.join(ROOT, 'scripts/data/dap-deleted-act-ids.json'));
const DELETED = new Set(deleted.ids || []);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN is required');
  process.exit(1);
}

if (!DELETED.size) {
  console.error('No deleted act IDs found');
  process.exit(1);
}

async function listAll(prefix) {
  const { list } = require('@vercel/blob');
  const out = [];
  let cursor;
  do {
    const page = await list({
      prefix,
      limit: 1000,
      cursor,
    });
    out.push(...(page.blobs || []));
    cursor = page.cursor;
  } while (cursor);
  return out;
}

async function main() {
  const { del } = require('@vercel/blob');
  const { readBlobJson, writeJson } = require(path.join(ROOT, 'api/_lib/store'));

  const assignmentPrefix = 'wc-data/daily-peace/assignments/';
  const blobs = await listAll(assignmentPrefix);
  console.log(`Scanned ${blobs.length} assignment blobs. Deleted act IDs: ${DELETED.size}. Dry run: ${DRY_RUN}`);

  let keptCompleted = 0;
  let deletedIncomplete = 0;
  let skippedOther = 0;
  let errors = 0;

  for (const blob of blobs) {
    if (!blob.pathname.endsWith('.json')) continue;
    let row;
    try {
      row = await readBlobJson(blob.pathname);
    } catch (err) {
      errors += 1;
      console.warn('read failed', blob.pathname, err.message || err);
      continue;
    }
    const actId = row?.act_id;
    if (!DELETED.has(actId)) {
      skippedOther += 1;
      continue;
    }
    if (row.completed === true) {
      keptCompleted += 1;
      continue;
    }
    deletedIncomplete += 1;
    if (!DRY_RUN) {
      try {
        await del(blob.pathname);
      } catch (err) {
        errors += 1;
        console.warn('delete failed', blob.pathname, err.message || err);
      }
    }
  }

  // Partnerships pointing at deleted catalog acts should not stay assignable.
  const partnerships = await listAll('wc-data/daily-peace/partnerships/');
  let partnershipsUpdated = 0;
  for (const blob of partnerships) {
    if (!blob.pathname.endsWith('.json')) continue;
    if (blob.pathname.endsWith('/index.json')) continue;
    if (blob.pathname.includes('/media/')) continue;
    let p;
    try {
      p = await readBlobJson(blob.pathname);
    } catch {
      continue;
    }
    if (!p?.actId || !DELETED.has(p.actId)) continue;
    if (p.partnershipType === 'company_created') continue;
    partnershipsUpdated += 1;
    if (DRY_RUN) continue;
    const updated = {
      ...p,
      status: p.status === 'cancelled' ? p.status : 'paused',
      actId: null,
      notes: [p.notes, `Catalog act ${p.actId} removed ${new Date().toISOString().slice(0, 10)}; partnership paused.`]
        .filter(Boolean)
        .join('\n'),
      updatedAt: new Date().toISOString(),
    };
    await writeJson(blob.pathname, updated, { overwrite: true });
  }

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    keptCompleted,
    deletedIncomplete,
    skippedOther,
    partnershipsUpdated,
    errors,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
