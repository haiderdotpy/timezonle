import { describe, expect, it } from 'vitest';
import { getFeedback, buildHintList, type CityLike } from './feedback.js';

const DATE = '2026-03-10';

function city(partial: Partial<CityLike> & { id: string }): CityLike {
  return {
    name: partial.id,
    tz: 'UTC',
    lat: 0,
    lon: 0,
    pop: 1_000_000,
    isCapital: false,
    coastal: false,
    ...partial,
  } as CityLike;
}

describe('feedback', () => {
  it('reports higher when the target is further east', () => {
    const guess = city({ id: 'g', tz: 'UTC' });
    const target = city({ id: 't', tz: 'Europe/Paris' }); // UTC+1 in March
    expect(getFeedback(guess, target, DATE, 0)).toEqual({ kind: 'higher' });
  });

  it('reports lower when the target is further west', () => {
    const guess = city({ id: 'g', tz: 'Europe/Paris' });
    const target = city({ id: 't', tz: 'UTC' });
    expect(getFeedback(guess, target, DATE, 0)).toEqual({ kind: 'lower' });
  });

  it('never exposes a numeric difference', () => {
    const fb = getFeedback(
      city({ id: 'g', tz: 'UTC' }),
      city({ id: 't', tz: 'Australia/Sydney' }),
      DATE,
      0,
    );
    expect(JSON.stringify(fb)).not.toMatch(/[0-9]{2,}/);
  });

  it('distinguishes fractional offsets (+5:30 vs +5:45)', () => {
    const kolkata = city({ id: 'k', tz: 'Asia/Kolkata' });
    const kathmandu = city({ id: 'm', tz: 'Asia/Kathmandu' });
    expect(getFeedback(kolkata, kathmandu, DATE, 0)).toEqual({ kind: 'higher' });
    expect(getFeedback(kathmandu, kolkata, DATE, 0)).toEqual({ kind: 'lower' });
  });

  it('1st same-offset miss shows N/S only', () => {
    const guess = city({ id: 'g', tz: 'UTC', lat: 0, lon: 0 });
    const target = city({ id: 't', tz: 'UTC', lat: 10, lon: 50 });
    const fb = getFeedback(guess, target, DATE, 0);
    expect(fb.kind).toBe('same');
    if (fb.kind !== 'same') return;
    expect(fb.ns).toBe('north');
    expect(fb.ew).toBeUndefined();
    expect(fb.hints).toEqual([]);
  });

  it('2nd same-offset miss also shows E/W', () => {
    const guess = city({ id: 'g', tz: 'UTC', lat: 0, lon: 0 });
    const target = city({ id: 't', tz: 'UTC', lat: -5, lon: 30 });
    const fb = getFeedback(guess, target, DATE, 1);
    if (fb.kind !== 'same') throw new Error('expected same');
    expect(fb.ns).toBe('south');
    expect(fb.ew).toBe('east');
    expect(fb.hints).toEqual([]);
  });

  it('latitude/longitude ties within 1 degree', () => {
    const guess = city({ id: 'g', tz: 'UTC', lat: 10, lon: 10 });
    const target = city({ id: 't', tz: 'UTC', lat: 10.5, lon: 10.9 });
    const fb = getFeedback(guess, target, DATE, 1);
    if (fb.kind !== 'same') throw new Error('expected same');
    expect(fb.ns).toBe('same-latitude');
    expect(fb.ew).toBe('same-longitude');
  });

  it('exact match wins', () => {
    const c = city({ id: 'x', tz: 'UTC' });
    expect(getFeedback(c, c, DATE, 3)).toEqual({ kind: 'correct' });
  });

  it('unlocks one extra hint per miss from the 3rd miss, in order', () => {
    const guess = city({ id: 'g', tz: 'UTC', lat: 0, lon: 0 });
    const target = city({
      id: 't', name: 'Paris', tz: 'UTC', lat: 5, lon: 5,
      pop: 11_000_000, isCapital: true, coastal: false,
    });
    const third = getFeedback(guess, target, DATE, 2);
    const fourth = getFeedback(guess, target, DATE, 3);
    const fifth = getFeedback(guess, target, DATE, 4);
    if (third.kind !== 'same' || fourth.kind !== 'same' || fifth.kind !== 'same') {
      throw new Error('expected same');
    }
    expect(third.hints).toHaveLength(1);
    expect(fourth.hints).toHaveLength(2);
    expect(fifth.hints).toHaveLength(3);
    // Order: coastal, capital, DST, population, first letter.
    expect(third.hints[0]).toMatch(/inland/i);
    expect(fourth.hints[1]).toMatch(/capital/i);
    expect(fifth.hints[2]).toMatch(/daylight/i);
    expect(buildHintList(target, 2026)[3]).toMatch(/10M\+/);
    expect(buildHintList(target, 2026)[4]).toMatch(/P/);
  });

  it('DST on vs off changes feedback via useActualOffset flag', () => {
    // In July: New York is UTC-4 (DST), Phoenix is UTC-7 (no DST).
    const ny = city({ id: 'ny', tz: 'America/New_York' });
    const phx = city({ id: 'phx', tz: 'America/Phoenix' });
    const july = '2026-07-15';
    expect(getFeedback(phx, ny, july, 0, { useActualOffset: true })).toEqual({ kind: 'higher' });
    // With standard offsets both would be UTC-7 vs UTC-5... still higher; use a sharper case:
    // London (DST +1) vs Kolkata (+5:30 fixed): actual differs from standard for London.
    const london = city({ id: 'lon', tz: 'Europe/London' });
    const lagos = city({ id: 'lag', tz: 'Africa/Lagos' }); // fixed +1
    // January: both +1/+0? London +0, Lagos +1 -> higher. July: both +1 -> same zone.
    expect(getFeedback(london, lagos, '2026-01-15', 0, { useActualOffset: true }).kind).toBe('higher');
    const julyFb = getFeedback(london, lagos, '2026-07-15', 0, { useActualOffset: true });
    expect(julyFb.kind).toBe('same');
  });
});
