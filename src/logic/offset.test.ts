import { describe, expect, it } from 'vitest';
import {
  getOffsetMinutesAt,
  getOffsetMinutes,
  observesDST,
  getStandardOffsetMinutes,
  formatOffset,
} from './offset.js';

describe('offset', () => {
  it('computes a whole-hour offset (New York standard time)', () => {
    expect(getOffsetMinutesAt('America/New_York', Date.UTC(2026, 0, 15, 12, 0, 0))).toBe(-300);
  });

  it('handles fractional offsets (+5:30 vs +5:45)', () => {
    const kolkata = getOffsetMinutesAt('Asia/Kolkata', Date.UTC(2026, 2, 10, 12, 0, 0));
    const kathmandu = getOffsetMinutesAt('Asia/Kathmandu', Date.UTC(2026, 2, 10, 12, 0, 0));
    expect(kolkata).toBe(330);
    expect(kathmandu).toBe(345);
    expect(kathmandu - kolkata).toBe(15);
  });

  it('evaluates at noon UTC on the puzzle date', () => {
    // Sydney in January is on DST (+11:00), in July +10:00.
    expect(getOffsetMinutes('Australia/Sydney', '2026-01-15')).toBe(660);
    expect(getOffsetMinutes('Australia/Sydney', '2026-07-15')).toBe(600);
  });

  it('standard offset ignores DST when useActual=false', () => {
    expect(getOffsetMinutes('America/New_York', '2026-07-15', false)).toBe(-300);
    expect(getOffsetMinutes('America/New_York', '2026-07-15', true)).toBe(-240);
  });

  it('detects DST observers vs non-observers', () => {
    expect(observesDST('America/New_York', 2026)).toBe(true);
    expect(observesDST('Asia/Kolkata', 2026)).toBe(false);
    expect(observesDST('America/Phoenix', 2026)).toBe(false);
  });

  it('standard offset is the non-DST one', () => {
    expect(getStandardOffsetMinutes('America/New_York', 2026)).toBe(-300);
    expect(getStandardOffsetMinutes('Australia/Sydney', 2026)).toBe(600);
    expect(getStandardOffsetMinutes('Asia/Kolkata', 2026)).toBe(330);
  });

  it('formats offsets', () => {
    expect(formatOffset(0)).toBe('UTC±0');
    expect(formatOffset(330)).toBe('UTC+5:30');
    expect(formatOffset(-240)).toBe('UTC-4');
    expect(formatOffset(345)).toBe('UTC+5:45');
    expect(formatOffset(525)).toBe('UTC+8:45');
  });
});
