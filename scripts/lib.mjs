// Shared helpers for the data pipeline (Node ESM).
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

export const SCHEDULE_SALT = 'timezonle-salt-v1';
export const SCHEDULE_SEED = 20260101;
export const LAUNCH_DATE = '2026-10-04T00:00:00.000Z';

export function sha256Hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function hashCityId(salt, cityId) {
  return sha256Hex(`${salt}:${cityId}`);
}

/** Deterministic mulberry32 PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates shuffle (returns a new array). */
export function seededShuffle(arr, seed) {
  const out = [...arr];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function readExclusions(path) {
  if (!existsSync(path)) return new Set();
  const text = readFileSync(path, 'utf8');
  const set = new Set();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    set.add(t);
  }
  return set;
}

/** Offset in minutes for an IANA zone at a UTC instant (mirrors src/logic/offset.ts). */
export function offsetAt(tz, atUtcMs) {
  const date = new Date(atUtcMs);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type) => parseInt(parts.find((x) => x.type === type).value, 10);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asUTC - date.getTime()) / 60000);
}
