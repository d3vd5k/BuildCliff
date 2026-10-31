import { describe, it, expect } from 'vitest';
import { median, calcDelta, isNearZero } from '../src/lib/stats';

describe('stats helpers', () => {
  it('computes median for odd and even arrays', () => {
    expect(median([10, 20, 30])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([])).toBe(0);
  });

  it('computes delta and percentage', () => {
    const res = calcDelta(70000, 270000);
    expect(res.deltaMs).toBe(200000);
    expect(res.deltaPct).toBe(285.7);
  });

  it('identifies near-zero rows correctly (<5000ms threshold)', () => {
    expect(isNearZero(2000)).toBe(true);
    expect(isNearZero(-1500)).toBe(true);
    expect(isNearZero(20000)).toBe(false);
  });
});

