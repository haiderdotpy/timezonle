import { getOffsetMinutes, observesDST } from './offset.js';
import { USE_ACTUAL_OFFSET_ON_DATE } from './constants.js';

export interface CityLike {
  id: string;
  name: string;
  asciiName?: string;
  country?: string;
  admin1?: string;
  tz: string;
  lat: number;
  lon: number;
  pop: number;
  isCapital: boolean;
  /** Coastal flag (within 50 km of coastline). Present for target cities. */
  coastal?: boolean | null;
}

export type Feedback =
  | { kind: 'higher' }
  | { kind: 'lower' }
  | { kind: 'correct' }
  | {
      kind: 'same';
      /** Target relative to guess: north/south, or within 1 degree latitude. */
      ns: 'north' | 'south' | 'same-latitude';
      /** Present from the 2nd same-offset miss onward. */
      ew?: 'east' | 'west' | 'same-longitude';
      /** Extra hints, one per miss from the 3rd same-offset miss onward. */
      hints: string[];
    };

export interface FeedbackOptions {
  useActualOffset?: boolean;
}

export function populationBracket(pop: number): string {
  if (pop < 500_000) return 'under 500k';
  if (pop < 2_000_000) return '500k–2M';
  if (pop < 10_000_000) return '2M–10M';
  return '10M+';
}

function yearOf(puzzleDate: Date | string): number {
  const d = typeof puzzleDate === 'string' ? new Date(puzzleDate + 'T00:00:00.000Z') : puzzleDate;
  return d.getUTCFullYear();
}

/**
 * Pure feedback function.
 *
 * @param guess guessed city
 * @param target hidden target city
 * @param puzzleDate puzzle date (Date or YYYY-MM-DD)
 * @param sameOffsetMissesBefore number of previous wrong guesses that were in
 *        the same timezone offset as the target (0-based). The current guess
 *        counts as miss number `sameOffsetMissesBefore + 1` for hint staging.
 */
export function getFeedback(
  guess: CityLike,
  target: CityLike,
  puzzleDate: Date | string,
  sameOffsetMissesBefore: number = 0,
  opts: FeedbackOptions = {},
): Feedback {
  const useActual = opts.useActualOffset ?? USE_ACTUAL_OFFSET_ON_DATE;
  if (guess.id === target.id) return { kind: 'correct' };

  const gOff = getOffsetMinutes(guess.tz, puzzleDate, useActual);
  const tOff = getOffsetMinutes(target.tz, puzzleDate, useActual);
  if (tOff > gOff) return { kind: 'higher' };
  if (tOff < gOff) return { kind: 'lower' };

  // Same offset, wrong city.
  const missNumber = sameOffsetMissesBefore + 1;
  const dLat = target.lat - guess.lat;
  const ns: 'north' | 'south' | 'same-latitude' =
    Math.abs(dLat) <= 1 ? 'same-latitude' : dLat > 0 ? 'north' : 'south';

  let ew: 'east' | 'west' | 'same-longitude' | undefined;
  if (missNumber >= 2) {
    const dLon = target.lon - guess.lon;
    ew = Math.abs(dLon) <= 1 ? 'same-longitude' : dLon > 0 ? 'east' : 'west';
  }

  const hints: string[] = [];
  if (missNumber >= 3) {
    const all = buildHintList(target, yearOf(puzzleDate));
    hints.push(...all.slice(0, missNumber - 2));
  }
  return { kind: 'same', ns, ew, hints };
}

/** Ordered extra-hint list: coastal, capital, DST, population, first letter. */
export function buildHintList(target: CityLike, year: number): string[] {
  const out: string[] = [];
  if (target.coastal !== undefined && target.coastal !== null) {
    out.push(target.coastal ? 'Target is coastal' : 'Target is inland');
  } else {
    out.push(target.isCapital ? 'Target is a national capital' : 'Target is not a national capital');
    // fall through: keep order stable by inserting capital hint first below
    return finishHints(target, year, out, true);
  }
  out.push(target.isCapital ? 'Target is a national capital' : 'Target is not a national capital');
  return finishHints(target, year, out, false);
}

function finishHints(target: CityLike, year: number, out: string[], skipped: boolean): string[] {
  void skipped;
  let dst: boolean;
  try {
    dst = observesDST(target.tz, year);
  } catch {
    dst = false;
  }
  out.push(dst ? 'Target observes daylight saving time' : 'Target does not observe daylight saving time');
  out.push(`Target population: ${populationBracket(target.pop)}`);
  const first = (target.name || '').charAt(0).toUpperCase();
  if (first) out.push(`Target starts with “${first}”`);
  return out;
}

/** Emoji for the "Copy result" share grid, one per guess. */
export function feedbackEmoji(fb: Feedback): string {
  if (fb.kind === 'correct') return '🟩';
  if (fb.kind === 'higher') return '⬆️';
  if (fb.kind === 'lower') return '⬇️';
  // same zone: compass once direction is shown (always, from 1st miss), else yellow square
  return '🧭';
}

export function sameZoneEmoji(): string {
  return '🟨';
}
