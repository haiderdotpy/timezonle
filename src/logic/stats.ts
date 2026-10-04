import { MAX_GUESSES } from './constants.js';

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameRecord {
  guesses: string[];
  status: GameStatus;
}

export interface Stats {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  lastWonPuzzle: number | null;
  /** distribution[i] = wins in (i+1) guesses; index MAX_GUESSES = losses. */
  distribution: number[];
}

export function blankStats(): Stats {
  return { played: 0, won: 0, streak: 0, maxStreak: 0, lastWonPuzzle: null, distribution: new Array(MAX_GUESSES + 1).fill(0) };
}

/** Normalize a stats object loaded from storage (handles short/long arrays). */
export function normalizeStats(s: Partial<Stats> | null | undefined): Stats {
  const b = blankStats();
  if (!s || typeof s !== 'object') return b;
  const dist = Array.isArray(s.distribution) ? [...s.distribution] : [];
  while (dist.length < MAX_GUESSES + 1) dist.push(0);
  return {
    played: num(s.played, 0),
    won: num(s.won, 0),
    streak: num(s.streak, 0),
    maxStreak: num(s.maxStreak, 0),
    lastWonPuzzle: typeof s.lastWonPuzzle === 'number' ? s.lastWonPuzzle : null,
    distribution: dist.slice(0, MAX_GUESSES + 1).map((x) => (typeof x === 'number' && x >= 0 ? Math.floor(x) : 0)),
  };
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d;
}

/**
 * Streak is valid only if lastWonPuzzle >= todayNumber - 1.
 * Evaluate on load and on display, not just on win.
 */
export function validStreak(stats: Stats, todayNumber: number): number {
  if (stats.lastWonPuzzle == null) return 0;
  return stats.lastWonPuzzle >= todayNumber - 1 ? stats.streak : 0;
}

export function withValidStreak(stats: Stats, todayNumber: number): Stats {
  const s = { ...stats, distribution: [...stats.distribution] };
  s.streak = validStreak(stats, todayNumber);
  return s;
}

/** Record a finished game. `won` + number of guesses determine distribution slot. */
export function recordFinishedGame(
  stats: Stats,
  puzzleNumber: number,
  won: boolean,
  guessCount: number,
): Stats {
  const s: Stats = { ...stats, distribution: [...stats.distribution] };
  s.played += 1;
  if (won) {
    s.won += 1;
    const prev = s.lastWonPuzzle;
    s.streak = prev != null && prev === puzzleNumber - 1 ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.lastWonPuzzle = puzzleNumber;
    const slot = Math.min(Math.max(guessCount, 1), MAX_GUESSES) - 1;
    s.distribution[slot] += 1;
  } else {
    s.streak = 0;
    s.distribution[MAX_GUESSES] += 1;
  }
  return s;
}

export function winRate(stats: Stats): number {
  return stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
}
