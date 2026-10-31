// Engine interface (contract section 6). Member B implements these; Member A
// calls them fire-and-forget after ingest, assumptions changes and reset.
// Every function must be safe to call repeatedly and concurrently.
// These stubs log and no-op so A's ingest/replay/demo flow works end-to-end
// before B lands the real detector. B replaces the bodies (not the signatures).

const log = (...args) => console.log('[engine]', ...args);

/**
 * Runs change-point detection + attribution for a project.
 * Upserts findings by finding_id (idempotent). Returns { created, updated }.
 * Called by A after each accepted run.
 */
export async function detect(projectId) {
  log(`detect("${projectId}") — stub, not yet implemented by B`);
  return { created: 0, updated: 0 };
}

/**
 * Recomputes cost on active findings after assumptions change.
 * Emits `finding.updated`. Returns { updated }.
 * Called by A after PATCH /projects/:id/assumptions.
 */
export async function recomputeCosts(projectId) {
  log(`recomputeCosts("${projectId}") — stub, not yet implemented by B`);
  return { updated: 0 };
}

/**
 * Rebuilds dependency_impacts with $merge, then emits `impacts.updated`.
 * Returns { computed }.
 * Called by A after accepted commits and after demo reset.
 */
export async function recomputeImpacts(projectId) {
  log(`recomputeImpacts("${projectId}") — stub, not yet implemented by B`);
  return { computed: 0 };
}
