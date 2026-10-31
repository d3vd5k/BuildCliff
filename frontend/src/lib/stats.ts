/**
 * Statistical and calculation helpers
 */

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calcDelta(before: number, after: number): { deltaMs: number; deltaPct: number } {
  const deltaMs = after - before;
  const deltaPct = before > 0 ? (deltaMs / before) * 100 : 0;
  return {
    deltaMs,
    deltaPct: Math.round(deltaPct * 10) / 10,
  };
}

export function isNearZero(deltaMs: number, threshold = 5000): boolean {
  return Math.abs(deltaMs) < threshold;
}

