// Duration + display formatting shared by the CLI and the server.
// Per contract: durations are integer milliseconds; UI/CLI format them.

/**
 * Format milliseconds as a human string: 70000 -> "1m10s", 30000 -> "30s".
 * Hours included when present: 3720000 -> "1h2m0s".
 */
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const totalSeconds = Math.floor(Number(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

/** Signed delta: 200000 -> "+3m20s", -5000 -> "-5s". */
export function formatDelta(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  const sign = ms >= 0 ? '+' : '-';
  return sign + formatDuration(Math.abs(ms));
}

/** First 7 chars of a 40-char SHA, or a placeholder. */
export function formatSha(sha) {
  return sha ? sha.slice(0, 7) : '—';
}

/** Format a percentage with one decimal: 285.714 -> "285.7%". */
export function formatPct(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return '—';
  return `${Number(pct).toFixed(1)}%`;
}

/** Format USD: 118.54 -> "$118.54". */
export function formatUsd(usd) {
  if (usd == null || Number.isNaN(Number(usd))) return '—';
  return `$${Number(usd).toFixed(2)}`;
}

/** Format hours: 3.89 -> "3.89h". */
export function formatHours(h) {
  if (h == null || Number.isNaN(Number(h))) return '—';
  return `${Number(h).toFixed(2)}h`;
}
