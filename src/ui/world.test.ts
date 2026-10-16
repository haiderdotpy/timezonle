import { describe, expect, it } from 'vitest';
import { toFraction, mapImageUrl } from './world.js';

describe('map overlay geometry', () => {
  it('maps lon/lat corners and center to box fractions', () => {
    expect(toFraction(-180, 90)).toEqual([0, 0]);
    expect(toFraction(180, -90)).toEqual([1, 1]);
    expect(toFraction(0, 0)).toEqual([0.5, 0.5]);
  });

  it('places a known city correctly (Berlin 52.52N, 13.4E)', () => {
    const [fx, fy] = toFraction(13.4, 52.52);
    expect(fx).toBeCloseTo(0.537, 3);
    expect(fy).toBeCloseTo(0.208, 3);
  });

  it('derives the picture URL from the data base', () => {
    expect(mapImageUrl('data')).toBe('world-map.jpg');
    expect(mapImageUrl('./data')).toBe('./world-map.jpg');
    expect(mapImageUrl('/app/data')).toBe('/app/world-map.jpg');
  });
});
