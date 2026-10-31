import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatDelta,
  formatPct,
  sha7,
  formatUsd,
  formatHours,
} from '../src/lib/format';

describe('formatDuration', () => {
  it('formats standard milliseconds into minutes and seconds', () => {
    expect(formatDuration(200000)).toBe('3m20s');
    expect(formatDuration(70000)).toBe('1m10s');
    expect(formatDuration(45000)).toBe('45s');
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(500)).toBe('<1s');
  });

  it('formats >= 1 hour as 1h02m', () => {
    expect(formatDuration(3720000)).toBe('1h02m');
  });

  it('keeps sign for negative values', () => {
    expect(formatDuration(-45000)).toBe('-45s');
    expect(formatDuration(-500)).toBe('-<1s');
  });

  it('handles null/undefined gracefully', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
  });
});

describe('formatDelta', () => {
  it('adds plus sign for positive deltas and minus for negative', () => {
    expect(formatDelta(200000)).toBe('+3m20s');
    expect(formatDelta(-45000)).toBe('-45s');
    expect(formatDelta(0)).toBe('0s');
  });
});

describe('formatPct', () => {
  it('formats percentage with one decimal', () => {
    expect(formatPct(285.714)).toBe('285.7%');
    expect(formatPct(42.1)).toBe('42.1%');
  });
});

describe('sha7', () => {
  it('slices first 7 characters', () => {
    expect(sha7('a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6')).toBe('a3f9c1d');
    expect(sha7(null)).toBe('—');
  });
});

describe('formatUsd and formatHours', () => {
  it('formats currency and hours with 2 decimals', () => {
    expect(formatUsd(118.54)).toBe('$118.54');
    expect(formatHours(3.89)).toBe('3.89 h');
  });
});

