#!/usr/bin/env node
/**
 * One-shot ops: delete an invalid pledged voice (e.g. Madrid, Portugal).
 *
 * Usage:
 *   node scripts/delete-invalid-pledge.js --userId=<uuid> --eventId=world-choir-2027
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=');
      return [k, rest.join('=') || 'true'];
    })
);

const eventId = args.eventId || 'world-choir-2027';
const userId = args.userId || '2149832e-5d33-4d30-b648-b4167cac09a4';

async function main() {
  const { deletePledgeVoice, readPledge } = require('../api/_lib/store');
  const before = await readPledge(eventId, userId);
  if (!before) {
    console.error('Pledge not found', { eventId, userId });
    process.exit(1);
  }
  console.log('Deleting:', {
    voice: before.voice_number,
    city: before.city,
    country: before.country,
    userId: before.user_id,
  });
  const result = await deletePledgeVoice({ eventId, userId });
  console.log('Deleted OK:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
