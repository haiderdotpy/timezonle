// Build public/data/schedule.json: seeded shuffle of target ids, stored as
// SHA-256(salt + cityId) hashes so the client never sees plain-text answers.
// Append-only: existing entries are kept in place; only new ids are appended.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEDULE_SALT, SCHEDULE_SEED, LAUNCH_DATE, hashCityId, seededShuffle } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TARGETS = path.join(ROOT, 'public', 'data', 'targets.json');
const OUT = path.join(ROOT, 'public', 'data', 'schedule.json');

const targets = JSON.parse(readFileSync(TARGETS, 'utf8')).ids;
// One entry per target, seeded-shuffled. With the full GeoNames dump this is
// thousands of days; the client wraps around with modulo so the game never
// runs out (documented in src/logic/schedule.ts).
const shuffled = seededShuffle(targets, SCHEDULE_SEED);
const fresh = shuffled.map((id) => hashCityId(SCHEDULE_SALT, id));

let hashes = fresh;
if (existsSync(OUT)) {
  const prev = JSON.parse(readFileSync(OUT, 'utf8'));
  if (prev.salt !== SCHEDULE_SALT) {
    console.error('Salt changed; refusing to merge schedules. Delete schedule.json to regenerate.');
    process.exit(1);
  }
  // Keep existing entries in place; append only hashes not already scheduled.
  const seen = new Set(prev.hashes);
  const additions = fresh.filter((hh) => !seen.has(hh));
  hashes = [...prev.hashes, ...additions];
  console.log(`append-only: kept ${prev.hashes.length}, appended ${additions.length}`);
} else {
  console.log(`new schedule: ${hashes.length} entries`);
}
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ salt: SCHEDULE_SALT, seed: SCHEDULE_SEED, launchDate: LAUNCH_DATE, hashes }, null, 2),
);
console.log(`wrote ${OUT}`);
