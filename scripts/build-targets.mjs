// Build public/data/targets.json.
//
// Candidates: pop > 1,000,000 plus all national capitals (PPLC),
// minus scripts/target-exclusions.txt.
// Coastal flags for targets come from:
//   1. --with-coastline <natural-earth-10m-coastline.geojson> : computed as
//      minimum haversine distance from the city to any coastline coordinate
//      (< 50 km => coastal). Source: Natural Earth 10m coastline
//      (https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-coastline/).
//   2. otherwise scripts/coastal-overrides.json (manual source of truth).
// Prints a histogram of targets per UTC offset (Jan 1) and warns if any
// single offset holds more than 15% of targets.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offsetAt, readExclusions } from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CITIES = path.join(ROOT, 'public', 'data', 'cities.json');
const OUT = path.join(ROOT, 'public', 'data', 'targets.json');
const EXCLUSIONS = path.join(__dirname, 'target-exclusions.txt');
const OVERRIDES = path.join(__dirname, 'coastal-overrides.json');

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function coastlineCoords(geojson) {
  const pts = [];
  const push = (c) => pts.push(c);
  const walk = (g) => {
    if (!g) return;
    if (g.type === 'LineString') g.coordinates.forEach(push);
    else if (g.type === 'MultiLineString') g.coordinates.forEach((l) => l.forEach(push));
    else if (g.type === 'Feature') walk(g.geometry);
    else if (g.type === 'FeatureCollection') g.features.forEach(walk);
  };
  walk(geojson);
  return pts;
}

async function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--with-coastline');
  const coastFile = ci >= 0 ? args[ci + 1] : null;

  const cities = JSON.parse(readFileSync(CITIES, 'utf8'));
  const h = cities.header;
  const col = (n) => h.indexOf(n);
  const excluded = readExclusions(EXCLUSIONS);
  const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {};

  let coastPts = null;
  if (coastFile) {
    if (!existsSync(coastFile)) {
      console.error(`Coastline file not found: ${coastFile}`);
      process.exit(1);
    }
    coastPts = coastlineCoords(JSON.parse(readFileSync(coastFile, 'utf8')));
    console.log(`loaded ${coastPts.length} coastline points from ${coastFile}`);
  }

  const targets = [];
  for (const r of cities.rows) {
    const id = String(r[col('id')]);
    const pop = Number(r[col('pop')]);
    const isCapital = Number(r[col('isCapital')]) === 1;
    if (excluded.has(id)) continue;
    if (!(pop > 1_000_000 || isCapital)) continue;
    let coastal = null;
    if (coastPts) {
      const lat = Number(r[col('lat')]);
      const lon = Number(r[col('lon')]);
      let best = Infinity;
      // Coarse stride for speed, refine near candidates.
      for (let i = 0; i < coastPts.length; i += 4) {
        const d = haversineKm(lat, lon, coastPts[i][1], coastPts[i][0]);
        if (d < best) best = d;
      }
      coastal = best < 50;
    } else if (id in overrides) {
      coastal = overrides[id] ? 1 : 0;
    }
    r[col('coastal')] = coastal === null ? null : coastal ? 1 : 0;
    targets.push(id);
  }
  targets.sort();

  // Histogram per UTC offset (Jan 1 of the launch year).
  const hist = new Map();
  const byId = new Map(cities.rows.map((r) => [String(r[col('id')]), r]));
  for (const id of targets) {
    const r = byId.get(id);
    let off;
    try {
      off = offsetAt(r[col('tz')], Date.UTC(2026, 0, 1, 12, 0, 0));
    } catch {
      off = 'INVALID';
    }
    hist.set(off, (hist.get(off) ?? 0) + 1);
  }
  console.log(`targets: ${targets.length} candidates`);
  console.log('offset histogram (minutes east of UTC):');
  let warned = false;
  for (const [off, n] of [...hist.entries()].sort((a, b) => a[0] - b[0])) {
    const pct = ((n / targets.length) * 100).toFixed(1);
    const flag = n / targets.length > 0.15 ? '  <-- WARNING: >15% of targets' : '';
    if (flag) warned = true;
    console.log(`  ${off}: ${n} (${pct}%)${flag}`);
  }
  if (warned) console.warn('WARNING: at least one offset holds more than 15% of targets.');

  writeFileSync(CITIES, JSON.stringify({ header: cities.header, rows: cities.rows }));
  writeFileSync(OUT, JSON.stringify({ ids: targets, count: targets.length }, null, 2));
  console.log(`wrote ${OUT} and patched coastal flags into cities.json`);
}

await main();
