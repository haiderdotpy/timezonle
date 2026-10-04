import { DAY_MS, LAUNCH_DATE_MS } from './constants.js';
import type { Clock } from './clock.js';
import { hashCityId } from './sha256.js';

/** 1-based puzzle number for `nowMs`. Day boundary is UTC midnight. */
export function getPuzzleNumber(nowMs: number, launchMs: number = LAUNCH_DATE_MS): number {
  return Math.floor((startOfUtcDay(nowMs) - startOfUtcDay(launchMs)) / DAY_MS) + 1;
}

export function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** YYYY-MM-DD of the puzzle date for a puzzle number. */
export function puzzleDateStr(puzzleNumber: number, launchMs: number = LAUNCH_DATE_MS): string {
  const ms = startOfUtcDay(launchMs) + (puzzleNumber - 1) * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's puzzle number using the injected clock. */
export function todayPuzzleNumber(clock: Clock, launchMs: number = LAUNCH_DATE_MS): number {
  return getPuzzleNumber(clock(), launchMs);
}

/** Milliseconds until next UTC midnight (for the countdown). */
export function msUntilNextPuzzle(clock: Clock): number {
  const now = clock();
  return startOfUtcDay(now) + DAY_MS - now;
}

export interface ScheduleData {
  salt: string;
  seed: number;
  hashes: string[];
}

/**
 * Resolve the target city id for a puzzle number by comparing hashes,
 * so the answer never appears as plain text in schedule.json.
 * The schedule wraps around with modulo so the game never runs out of
 * puzzles (with the full GeoNames dump a cycle is many years).
 * Returns null when unresolvable.
 */
export function resolveTargetId(
  schedule: ScheduleData,
  puzzleNumber: number,
  candidateIds: string[],
): string | null {
  if (schedule.hashes.length === 0) return null;
  const hash = schedule.hashes[(puzzleNumber - 1) % schedule.hashes.length];
  if (!hash) return null;
  for (const id of candidateIds) {
    if (hashCityId(schedule.salt, id) === hash) return id;
  }
  return null;
}

/** Parse ?puzzle=N (?debug=1 allows future puzzles). Returns null if absent/invalid. */
export function parsePuzzleOverride(
  search: string,
  todayNumber: number,
): { puzzleNumber: number; isOverride: boolean } | null {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const raw = q.get('puzzle');
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const debug = q.get('debug') === '1';
  if (n > todayNumber && !debug) return { puzzleNumber: todayNumber, isOverride: false };
  return { puzzleNumber: n, isOverride: n !== todayNumber };
}
