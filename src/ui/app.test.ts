import { describe, expect, it } from 'vitest';
import { buildShareText, chipLabel, feedbacksFor, shareEmojiFor } from './app.js';
import type { Feedback } from '../logic/feedback.js';
import type { City } from '../data/loaders.js';

const paris: City = {
  id: 'p', name: 'Paris', asciiName: 'Paris', country: 'FR', admin1: 'Île-de-France',
  tz: 'Europe/Paris', lat: 48.85, lon: 2.35, pop: 11_000_000, isCapital: true, coastal: false,
};
const lagos: City = {
  id: 'l', name: 'Lagos', asciiName: 'Lagos', country: 'NG', admin1: 'Lagos',
  tz: 'Africa/Lagos', lat: 6.45, lon: 3.39, pop: 15_000_000, isCapital: false, coastal: true,
};
const reykjavik: City = {
  id: 'r', name: 'Reykjavik', asciiName: 'Reykjavik', country: 'IS', admin1: 'Reykjavik',
  tz: 'Atlantic/Reykjavik', lat: 64.15, lon: -21.94, pop: 140_000, isCapital: true, coastal: true,
};

describe('share text', () => {
  it('builds Timezonle #N X/8 with one emoji per stored guess', () => {
    const byId = new Map([['l', lagos], ['r', reykjavik], ['p', paris]]);
    // July: Reykjavik (+0) vs Lagos (+1): higher; Paris (+2 DST) vs Lagos: lower.
    const fbs = feedbacksFor(['r', 'p', 'l'], byId, lagos, '2026-07-15');
    expect(fbs.map((f) => f.kind)).toEqual(['higher', 'lower', 'correct']);
    const text = buildShareText(42, fbs);
    const lines = text.split('\n');
    expect(lines[0]).toBe('Timezonle #42 3/8');
    expect(lines[1]).toBe('⬆️⬇️🟩');
  });

  it('uses compass once direction unlocks, yellow square for first same-zone miss', () => {
    const byId = new Map([['x', { ...lagos, id: 'x', lat: 0, lon: 0 }], ['l', lagos]]);
    const fbs = feedbacksFor(['x'], byId, lagos, '2026-07-15');
    expect(fbs[0].kind).toBe('same');
    expect(shareEmojiFor(fbs[0])).toBe('🟨');
    const fbs2 = feedbacksFor(['x', 'x2'], byId, { ...lagos }, '2026-07-15');
    void fbs2;
  });

  it('lost games show X/8', () => {
    const text = buildShareText(7, [{ kind: 'higher' }, { kind: 'lower' }]);
    expect(text.startsWith('Timezonle #7 X/8')).toBe(true);
  });

  it('chip labels never show numbers or country', () => {
    const fb: Feedback = { kind: 'same', ns: 'north', ew: 'east', hints: [] };
    const { text } = chipLabel(fb);
    expect(text).toMatch(/north/);
    expect(text).not.toMatch(/[0-9]/);
  });
});
