import { describe, expect, it } from 'vitest';
import {
  blankStats,
  recordFinishedGame,
  validStreak,
  withValidStreak,
} from './stats.js';

describe('stats', () => {
  it('tracks streak across consecutive days', () => {
    let s = blankStats();
    s = recordFinishedGame(s, 10, true, 3);
    expect(s.streak).toBe(1);
    s = recordFinishedGame(s, 11, true, 2);
    expect(s.streak).toBe(2);
    expect(s.maxStreak).toBe(2);
    expect(s.played).toBe(2);
    expect(s.won).toBe(2);
    expect(s.distribution[2]).toBe(1); // won in 3 guesses
    expect(s.distribution[1]).toBe(1); // won in 2 guesses
  });

  it('resets streak after a skipped day', () => {
    let s = blankStats();
    s = recordFinishedGame(s, 10, true, 3);
    s = recordFinishedGame(s, 12, true, 1); // skipped 11
    expect(s.streak).toBe(1);
  });

  it('resets streak on a loss and counts it in distribution', () => {
    let s = blankStats();
    s = recordFinishedGame(s, 10, true, 3);
    s = recordFinishedGame(s, 11, false, 8);
    expect(s.streak).toBe(0);
    expect(s.played).toBe(2);
    expect(s.won).toBe(1);
    expect(s.distribution[8]).toBe(1);
  });

  it('invalidates a stale streak on load/display (lastWonPuzzle < today - 1)', () => {
    let s = blankStats();
    s = recordFinishedGame(s, 10, true, 3);
    expect(validStreak(s, 11)).toBe(1); // still valid the next day
    expect(validStreak(s, 12)).toBe(0); // skipped a day
    expect(withValidStreak(s, 12).streak).toBe(0);
  });
});
