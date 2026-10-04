import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DATA = path.join(process.cwd(), 'public', 'data');

describe('pipeline outputs', () => {
  it('cities.json has header + rows with required columns', () => {
    const p = path.join(DATA, 'cities.json');
    expect(existsSync(p)).toBe(true);
    const c = JSON.parse(readFileSync(p, 'utf8'));
    for (const col of ['id', 'name', 'country', 'tz', 'lat', 'lon', 'pop', 'isCapital']) {
      expect(c.header).toContain(col);
    }
    expect(c.rows.length).toBeGreaterThan(0);
  });

  it('has no duplicate city ids', () => {
    const c = JSON.parse(readFileSync(path.join(DATA, 'cities.json'), 'utf8'));
    const i = c.header.indexOf('id');
    const ids = c.rows.map((r: unknown[]) => String(r[i]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every target exists in cities.json', () => {
    const c = JSON.parse(readFileSync(path.join(DATA, 'cities.json'), 'utf8'));
    const t = JSON.parse(readFileSync(path.join(DATA, 'targets.json'), 'utf8'));
    const ids = new Set(c.rows.map((r: unknown[]) => String(r[c.header.indexOf('id')])));
    for (const id of t.ids as string[]) expect(ids.has(String(id))).toBe(true);
  });

  it('every tz resolves in Intl', () => {
    const c = JSON.parse(readFileSync(path.join(DATA, 'cities.json'), 'utf8'));
    const ti = c.header.indexOf('tz');
    for (const r of c.rows as unknown[][]) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: r[ti] as string })).not.toThrow();
    }
  });

  it('schedule has no duplicate entries and a salt', () => {
    const s = JSON.parse(readFileSync(path.join(DATA, 'schedule.json'), 'utf8'));
    expect(s.salt).toBeTruthy();
    expect(new Set(s.hashes).size).toBe(s.hashes.length);
    expect(s.hashes.length).toBeGreaterThan(0);
  });
});
