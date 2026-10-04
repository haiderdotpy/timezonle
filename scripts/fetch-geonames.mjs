// Download GeoNames dumps. If network is blocked, prints manual steps and
// falls back to scripts/raw/ (see scripts/raw/README.md).
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(__dirname, 'raw');
const URLS = {
  'cities15000.zip': 'https://download.geonames.org/export/dump/cities15000.zip',
  'admin1CodesASCII.txt': 'https://download.geonames.org/export/dump/admin1CodesASCII.txt',
};

async function main() {
  mkdirSync(RAW, { recursive: true });
  let failed = false;
  for (const [file, url] of Object.entries(URLS)) {
    const dest = path.join(RAW, file);
    if (existsSync(dest)) {
      console.log(`exists: ${dest} (skipping)`);
      continue;
    }
    console.log(`fetching ${url} ...`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`wrote ${dest}`);
    } catch (err) {
      failed = true;
      console.error(`FAILED to download ${url}: ${err.message}`);
    }
  }
  if (failed) {
    console.error(`
Network download failed. Manual steps:
  1. Download cities15000.zip and admin1CodesASCII.txt from
     https://download.geonames.org/export/dump/
  2. Unzip and place them at scripts/raw/cities15000.txt and
     scripts/raw/admin1CodesASCII.txt
  3. Run: npm run data:all
The pipeline will use scripts/fallback-cities.json until the raw dump is present.`);
    process.exitCode = 1;
  }
}

await main();
