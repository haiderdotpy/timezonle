import { STORAGE_KEY, STORAGE_VERSION, MAX_GUESSES } from '../logic/constants.js';
import { blankStats, normalizeStats, type Stats, type GameRecord } from '../logic/stats.js';

export interface SaveData {
  v: number;
  games: Record<number, GameRecord>;
  stats: Stats;
}

export function blankSave(): SaveData {
  return { v: STORAGE_VERSION, games: {}, stats: blankStats() };
}

/** Migrate any stored shape to the current schema. Unknown versions reset stats but keep playable. */
export function migrate(raw: unknown): SaveData {
  const blank = blankSave();
  if (!raw || typeof raw !== 'object') return blank;
  const r = raw as Record<string, unknown>;
  if (typeof r.v !== 'number') {
    // Pre-versioned save: attempt to salvage games/stats.
    return {
      v: STORAGE_VERSION,
      games: sanitizeGames(r.games),
      stats: normalizeStats((r.stats as Partial<Stats>) ?? null),
    };
  }
  if (r.v === STORAGE_VERSION) {
    return { v: STorageVersion(), games: sanitizeGames(r.games), stats: normalizeStats(r.stats as Partial<Stats>) };
  }
  // Future/unknown version: safest is to start fresh rather than misinterpret.
  return blank;
}

function STorageVersion(): number {
  return STORAGE_VERSION;
}

function sanitizeGames(g: unknown): Record<number, GameRecord> {
  if (!g || typeof g !== 'object') return {};
  const out: Record<number, GameRecord> = {};
  for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
    const n = parseInt(k, 10);
    if (!Number.isFinite(n) || n < 1) continue;
    if (!v || typeof v !== 'object') continue;
    const rec = v as Record<string, unknown>;
    if (!Array.isArray(rec.guesses)) continue;
    const guesses = (rec.guesses as unknown[]).filter((x): x is string => typeof x === 'string');
    const status = rec.status === 'won' || rec.status === 'lost' ? rec.status : 'playing';
    out[n] = { guesses: guesses.slice(0, MAX_GUESSES), status };
  }
  return out;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface StoreResult {
  save: SaveData;
  /** True when persistence is unavailable and state is in-memory only. */
  ephemeral: boolean;
}

/**
 * All storage access is wrapped in try/catch. On any failure we fall back
 * to in-memory state and the UI shows a notice that stats won't persist.
 */
export function loadSave(storage: StorageLike | null | undefined): StoreResult {
  if (!storage) return { save: blankSave(), ephemeral: true };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { save: blankSave(), ephemeral: false };
    return { save: migrate(JSON.parse(raw)), ephemeral: false };
  } catch {
    return { save: blankSave(), ephemeral: true };
  }
}

export function persistSave(storage: StorageLike | null | undefined, save: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Subscribe to cross-tab sync via the storage event. Returns unsubscribe. */
export function onExternalChange(cb: (save: SaveData) => void): () => void {
  const handler = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    try {
      cb(migrate(e.newValue ? JSON.parse(e.newValue) : blankSave()));
    } catch {
      /* ignore malformed external writes */
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function serializeExport(save: SaveData): string {
  return JSON.stringify(save, null, 2);
}

export function parseImport(text: string): SaveData {
  return migrate(JSON.parse(text));
}
