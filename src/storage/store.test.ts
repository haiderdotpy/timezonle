import { describe, expect, it, vi } from 'vitest';
import { loadSave, persistSave, migrate, blankSave, serializeExport, parseImport } from './store.js';
import { STORAGE_KEY } from '../logic/constants.js';

function memStorage(initial?: Record<string, string>): Storage {
  const m = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as unknown as Storage;
}

describe('storage', () => {
  it('returns a blank save when empty', () => {
    const { save, ephemeral } = loadSave(memStorage());
    expect(ephemeral).toBe(false);
    expect(save.v).toBe(1);
    expect(save.games).toEqual({});
  });

  it('recovers from corrupted JSON with in-memory fallback', () => {
    const s = memStorage({ [STORAGE_KEY]: 'not-json{{{' });
    const { save, ephemeral } = loadSave(s);
    expect(ephemeral).toBe(true);
    expect(save.games).toEqual({});
  });

  it('falls back when storage is unavailable or throws', () => {
    const { ephemeral } = loadSave(null);
    expect(ephemeral).toBe(true);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    expect(loadSave(throwing).ephemeral).toBe(true);
    expect(persistSave(throwing, blankSave())).toBe(false);
  });

  it('round-trips saves', () => {
    const s = memStorage();
    const save = blankSave();
    save.games[5] = { guesses: ['a', 'b'], status: 'playing' };
    expect(persistSave(s, save)).toBe(true);
    const loaded = loadSave(s);
    expect(loaded.save.games[5].guesses).toEqual(['a', 'b']);
  });

  it('migrates legacy and unknown shapes', () => {
    // Missing version: salvage stats/games.
    const legacy = migrate({ games: { 3: { guesses: ['x'], status: 'won' } }, stats: { played: 1 } });
    expect(legacy.v).toBe(1);
    expect(legacy.games[3].guesses).toEqual(['x']);
    // Unknown future version: reset.
    expect(migrate({ v: 99, games: {}, stats: {} }).stats.played).toBe(0);
    // Garbage in, blank out.
    expect(migrate(null).games).toEqual({});
    expect(migrate('zzz').games).toEqual({});
  });

  it('exports and imports as JSON', () => {
    const save = blankSave();
    save.games[1] = { guesses: ['a'], status: 'won' };
    const text = serializeExport(save);
    const back = parseImport(text);
    expect(back.games[1].guesses).toEqual(['a']);
    expect(() => parseImport('{{{')).toThrow();
  });

  it('sanitizes bad game records on migrate', () => {
    const m = migrate({ v: 1, games: { nope: 1, 2: { guesses: 'x' }, 3: { guesses: [1, 'a'], status: 'bogus' } }, stats: {} });
    expect(m.games[3].guesses).toEqual(['a']);
    expect(m.games[3].status).toBe('playing');
    expect(m.games[2]).toBeUndefined();
  });

  it('void expression keeps linter quiet', () => {
    expect(vi.fn().mock.calls.length).toBe(0);
  });
});
