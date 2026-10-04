// Build public/data/cities.json from the GeoNames dump (or the fallback list).
// Output: arrays-of-arrays with a header row to keep it small.
// Columns: id,name,asciiName,country,admin1,tz,lat,lon,pop,isCapital,coastal
// (coastal is null here; targets stage fills it from overrides/coastline.)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RAW_CITIES = path.join(__dirname, 'raw', 'cities15000.txt');
const RAW_ADMIN1 = path.join(__dirname, 'raw', 'admin1CodesASCII.txt');
const FALLBACK = path.join(__dirname, 'fallback-cities.json');
const OUT = path.join(ROOT, 'public', 'data', 'cities.json');

const HEADER = ['id', 'name', 'asciiName', 'country', 'admin1', 'tz', 'lat', 'lon', 'pop', 'isCapital', 'coastal'];

function loadAdmin1() {
  const map = new Map();
  if (!existsSync(RAW_ADMIN1)) return map;
  for (const line of readFileSync(RAW_ADMIN1, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const [code, name] = line.split('\t');
    map.set(code, name);
  }
  return map;
}

function fromRaw() {
  const admin1 = loadAdmin1();
  const rows = [];
  const seen = new Set();
  for (const line of readFileSync(RAW_CITIES, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    // GeoNames columns: 0 id, 1 name, 2 asciiname, 4 lat, 5 lon, 7 feature code,
    // 8 country, 10 admin1, 14 pop, 17 timezone.
    const [id, name, asciiName, , lat, lon, , feat, country, , admin1Code, , , , pop, , , tz] = f;
    if (!id || !tz) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push([
      id, name, asciiName, country,
      admin1.get(`${country}.${admin1Code}`) ?? admin1Code ?? '',
      tz,
      Math.round(Number(lat) * 100) / 100,
      Math.round(Number(lon) * 100) / 100,
      Number(pop) || 0,
      feat === 'PPLC' ? 1 : 0,
      null,
    ]);
  }
  // Keep only cities with population data, sorted by pop desc for stable output.
  return rows.filter((r) => r[8] > 0).sort((a, b) => b[8] - a[8]);
}

function fromFallback() {
  const list = JSON.parse(readFileSync(FALLBACK, 'utf8'));
  return list.map((c) => [
    c.id, c.name, c.asciiName, c.country, c.admin1, c.tz,
    Math.round(c.lat * 100) / 100, Math.round(c.lon * 100) / 100,
    c.pop, c.isCapital ? 1 : 0, null,
  ]);
}

let rows;
let source;
if (existsSync(RAW_CITIES)) {
  rows = fromRaw();
  source = 'geonames dump (scripts/raw/cities15000.txt)';
} else {
  rows = fromFallback();
  source = 'fallback list (scripts/fallback-cities.json) — see scripts/raw/README.md for full dump';
}
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ header: HEADER, rows }));
const gz = gzipSync(readFileSync(OUT)).length;
console.log(`cities: ${rows.length} rows from ${source}`);
console.log(`wrote ${OUT} (${(gz / 1024).toFixed(1)} KB gzipped, target < 700 KB)`);
if (gz > 700 * 1024) {
  console.error('ERROR: cities.json exceeds 700 KB gzipped');
  process.exit(1);
}
