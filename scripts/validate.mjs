// Validate the pipeline outputs. Exit non-zero on any failure (CI gate).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'public', 'data');

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL: ${msg}`);
};

for (const f of ['cities.json', 'targets.json', 'schedule.json']) {
  if (!existsSync(path.join(DATA, f))) fail(`missing public/data/${f} (run npm run data:all)`);
}
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}

const cities = JSON.parse(readFileSync(path.join(DATA, 'cities.json'), 'utf8'));
const targets = JSON.parse(readFileSync(path.join(DATA, 'targets.json'), 'utf8'));
const schedule = JSON.parse(readFileSync(path.join(DATA, 'schedule.json'), 'utf8'));

// Shape: header row + array rows.
if (!Array.isArray(cities.header) || !Array.isArray(cities.rows)) fail('cities.json must have {header, rows}');
const col = (n) => cities.header.indexOf(n);
for (const c of ['id', 'name', 'country', 'tz', 'lat', 'lon', 'pop', 'isCapital']) {
  if (col(c) === -1) fail(`cities.json missing column ${c}`);
}

// No duplicate ids.
const ids = cities.rows.map((r) => String(r[col('id')]));
if (new Set(ids).size !== ids.length) fail('duplicate city ids in cities.json');

// Every target exists in cities.json.
const idSet = new Set(ids);
const targetIds = targets.ids ?? targets;
for (const id of targetIds) {
  if (!idSet.has(String(id))) fail(`target ${id} missing from cities.json`);
}

// Every tz resolves in Intl.
for (const r of cities.rows) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: r[col('tz')] });
  } catch {
    fail(`unresolvable tz ${r[col('tz')]} for city ${r[col('id')]}`);
  }
}

// No duplicate schedule entries.
if (!Array.isArray(schedule.hashes)) fail('schedule.json must have hashes array');
else if (new Set(schedule.hashes).size !== schedule.hashes.length) {
  fail('duplicate entries in schedule.json');
}
if (!schedule.salt) fail('schedule.json missing salt');

if (failures > 0) {
  console.error(`${failures} validation failure(s)`);
  process.exit(1);
}
console.log(`OK: ${ids.length} cities, ${targetIds.length} targets, ${schedule.hashes.length} scheduled days`);
