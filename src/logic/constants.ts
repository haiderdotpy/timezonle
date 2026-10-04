// Shared constants. Single source of truth for launch date, hashing salt,
// shuffle seed, and game tuning. Mirror of values used by scripts/ pipeline.

/** First puzzle day, UTC midnight. */
export const LAUNCH_DATE_UTC = '2026-01-01T00:00:00.000Z';
export const LAUNCH_DATE_MS = Date.parse(LAUNCH_DATE_UTC);

/** Salt for SHA-256(salt + cityId) schedule hashing. Must match scripts/schedule-salt. */
export const SCHEDULE_SALT = 'timezonle-salt-v1';

/** Fixed seed for the seeded shuffle in scripts/build-schedule.mjs */
export const SCHEDULE_SEED = 20260101;

export const MAX_GUESSES = 8;

/**
 * When true (default), offsets are evaluated at 12:00 UTC on the puzzle date
 * (real DST-aware offset). When false, the standard (non-DST) offset is used.
 */
export const USE_ACTUAL_OFFSET_ON_DATE = true;

export const STORAGE_KEY = 'timezonle:save';
export const STORAGE_VERSION = 1;

export const DAY_MS = 86_400_000;
