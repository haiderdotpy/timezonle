import { USE_ACTUAL_OFFSET_ON_DATE } from './constants.js';

/**
 * Offset of an IANA zone in minutes east of UTC, evaluated at the given
 * instant (milliseconds since epoch), via Intl.DateTimeFormat.
 */
export function getOffsetMinutesAt(tz: string, atUtcMs: number): number {
  const date = new Date(atUtcMs);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`Missing ${type} part for tz ${tz}`);
    return parseInt(p.value, 10);
  };
  let hour = get('hour');
  // Some environments emit "24" for midnight.
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  // Round to nearest minute to avoid second-level truncation artifacts.
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** Noon UTC on the puzzle date (YYYY-MM-DD). */
export function noonUtcMs(puzzleDate: Date | string): number {
  const d = typeof puzzleDate === 'string' ? new Date(puzzleDate + 'T00:00:00.000Z') : puzzleDate;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
}

/**
 * Offset in minutes for a zone on a puzzle date.
 * @param useActual default from USE_ACTUAL_OFFSET_ON_DATE; false => standard offset.
 */
export function getOffsetMinutes(
  tz: string,
  puzzleDate: Date | string,
  useActual: boolean = USE_ACTUAL_OFFSET_ON_DATE,
): number {
  if (useActual) return getOffsetMinutesAt(tz, noonUtcMs(puzzleDate));
  return getStandardOffsetMinutes(tz, yearOf(puzzleDate));
}

function yearOf(puzzleDate: Date | string): number {
  const d = typeof puzzleDate === 'string' ? new Date(puzzleDate + 'T00:00:00.000Z') : puzzleDate;
  return d.getUTCFullYear();
}

/** Offset on Jan 1 (noon UTC) of the given year. */
export function janOffset(tz: string, year: number): number {
  return getOffsetMinutesAt(tz, Date.UTC(year, 0, 1, 12, 0, 0));
}

/** Offset on Jul 1 (noon UTC) of the given year. */
export function julOffset(tz: string, year: number): number {
  return getOffsetMinutesAt(tz, Date.UTC(year, 6, 1, 12, 0, 0));
}

/** True when the zone's offset differs between Jan 1 and Jul 1 of that year. */
export function observesDST(tz: string, year: number): boolean {
  return janOffset(tz, year) !== julOffset(tz, year);
}

/**
 * Standard (non-DST) offset heuristic: the smaller of the Jan/Jul offsets.
 * Correct for the common case where DST adds +30/+60/+120 minutes
 * (northern hemisphere: Jan is standard; southern: Jul is standard and smaller).
 * Documented limitation: zones with "negative DST" (e.g. Africa/Casablanca
 * during Ramadan) may resolve to the DST offset instead.
 */
export function getStandardOffsetMinutes(tz: string, year: number): number {
  return Math.min(janOffset(tz, year), julOffset(tz, year));
}

/** Format minutes-east-of-UTC as e.g. "UTC+5:30", "UTC-4", "UTC". */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'UTC±0';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

export function tzResolves(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
