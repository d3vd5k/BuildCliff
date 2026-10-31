/**
 * Duration & number formatting per prompt section 9.3 and contract.md
 */

/**
 * Format duration in milliseconds:
 * 3m20s, 1m10s, 45s, 1h02m for >= 1h, 0s for 0, and <1s for < 1000ms but > 0.
 * Negative values keep the sign.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const num = Number(ms);
  if (num === 0) return '0s';

  const isNeg = num < 0;
  const absMs = Math.abs(num);

  if (absMs > 0 && absMs < 1000) {
    return isNeg ? '-<1s' : '<1s';
  }

  const totalSeconds = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const sign = isNeg ? '-' : '';

  if (hours > 0) {
    const mm = minutes.toString().padStart(2, '0');
    return `${sign}${hours}h${mm}m`;
  }
  if (minutes > 0) {
    return `${sign}${minutes}m${seconds}s`;
  }
  return `${sign}${seconds}s`;
}

/**
 * Signed delta: +3m20s or -45s.
 */
export function formatDelta(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const num = Number(ms);
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  const dur = formatDuration(Math.abs(num));
  return `${sign}${dur}`;
}

/**
 * Percentage format: 285.7% (one decimal).
 */
export function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(1)}%`;
}

/**
 * First 7 characters of a 40-char SHA.
 */
export function sha7(sha: string | null | undefined): string {
  if (!sha) return '—';
  return sha.slice(0, 7);
}

/**
 * Format USD: $118.54
 */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

/**
 * Format hours: 3.89 h
 */
export function formatHours(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(2)} h`;
}

/**
 * Relative time ago format with fallback
 */
export function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const now = Date.now();
    const diffMs = now - date.getTime();
    if (Number.isNaN(diffMs)) return isoString;

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

