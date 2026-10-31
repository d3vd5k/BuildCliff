// Response formatters shared by routes and the stream service.
// Convert raw Mongo documents to the API response shapes (contract sections 4.3).

/** Format a run document for the API (contract section 4.3). */
export function formatRun(run) {
  return {
    run_id: run.run_id,
    commit_sha: run.commit_sha,
    status: run.status,
    started_at: run.started_at instanceof Date ? run.started_at.toISOString() : run.started_at,
    total_ms: run.total_ms,
    demo_replay: run.demo_replay ?? false,
    steps: (run.steps || []).map((s) => ({
      name: s.name,
      duration_ms: s.duration_ms,
      status: s.status || 'success',
    })),
  };
}

/** Convert a BSON Date (or ISO string) to an ISO 8601 UTC string. */
export function toIso(date) {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString();
  return date;
}
