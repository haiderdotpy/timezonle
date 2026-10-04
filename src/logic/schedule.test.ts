import { describe, expect, it } from 'vitest';
import {
  getPuzzleNumber,
  puzzleDateStr,
  msUntilNextPuzzle,
  resolveTargetId,
} from './schedule.js';
import { hashCityId } from './sha256.js';
import { LAUNCH_DATE_MS, DAY_MS } from './constants.js';

describe('puzzle number', () => {
  it('is 1 on launch day and rolls over at UTC midnight', () => {
    expect(getPuzzleNumber(LAUNCH_DATE_MS)).toBe(1);
    expect(getPuzzleNumber(LAUNCH_DATE_MS + DAY_MS - 1)).toBe(1);
    expect(getPuzzleNumber(LAUNCH_DATE_MS + DAY_MS)).toBe(2);
    // One millisecond before midnight stays on day 1.
    expect(getPuzzleNumber(Date.UTC(2026, 9, 4, 23, 59, 59, 999))).toBe(1);
    expect(getPuzzleNumber(Date.UTC(2026, 9, 5, 0, 0, 0, 0))).toBe(2);
  });

  it('maps puzzle numbers to date strings', () => {
    expect(puzzleDateStr(1)).toBe('2026-10-04');
    expect(puzzleDateStr(2)).toBe('2026-10-05');
  });

  it('counts down to next UTC midnight with injected clock', () => {
    const clock = (): number => Date.UTC(2026, 4, 1, 12, 0, 0);
    expect(msUntilNextPuzzle(clock)).toBe(12 * 3600 * 1000);
  });
});

describe('hashed schedule lookup', () => {
  it('returns the right target and no duplicates', () => {
    const salt = 'test-salt';
    const ids = ['a', 'b', 'c'];
    const schedule = { salt, seed: 1, hashes: ids.map((id) => hashCityId(salt, id)) };
    expect(resolveTargetId(schedule, 1, ids)).toBe('a');
    expect(resolveTargetId(schedule, 2, ids)).toBe('b');
    expect(resolveTargetId(schedule, 3, ids)).toBe('c');
    // Schedule wraps around with modulo so puzzles never run out.
    expect(resolveTargetId(schedule, 4, ids)).toBe('a');
    expect(resolveTargetId({ ...schedule, hashes: [] }, 1, ids)).toBeNull();
    expect(new Set(schedule.hashes).size).toBe(schedule.hashes.length);
  });

  it('does not leak the plain id', () => {
    const h = hashCityId('s', 'some-city');
    expect(h).not.toContain('some-city');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
