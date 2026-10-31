// Engine interface (contract section 6).
// Wires Member B's detection engine implementation (index.mjs)
// to Member A's shared MongoDB database handle and SSE stream emitter.

import { getDb } from '../db/index.js';
import { emit } from '../services/streamService.js';
import { createEngine } from './index.mjs';

let engineInstance = null;
let boundDb = null;

/**
 * Returns the singleton engine instance bound to the active database connection
 * and SSE emitter. If the database connection was closed or changed, rebinds.
 */
export function getEngine() {
  const db = getDb();
  if (!engineInstance || boundDb !== db) {
    boundDb = db;
    engineInstance = createEngine({
      db,
      emit: (eventName, data, dataProjectId) => emit(eventName, data, dataProjectId),
    });
  }
  return engineInstance;
}

/**
 * Runs change-point detection + attribution for a project.
 * Upserts findings by finding_id (idempotent). Returns { created, updated }.
 * Called by A after each accepted run.
 */
export async function detect(projectId) {
  return getEngine().detect(projectId);
}

/**
 * Recomputes cost on active findings after assumptions change.
 * Emits `finding.updated`. Returns { updated }.
 * Called by A after PATCH /projects/:id/assumptions.
 */
export async function recomputeCosts(projectId) {
  const updated = await getEngine().recomputeCosts(projectId);
  return { updated };
}

/**
 * Rebuilds dependency_impacts with $merge, then emits `impacts.updated`.
 * Returns { computed }.
 * Called by A after accepted commits and after demo reset.
 */
export async function recomputeImpacts(projectId) {
  const computed = await getEngine().recomputeImpacts(projectId);
  return { computed };
}

/**
 * Resumes pending explanations at startup or for a project.
 * Returns number of queued tasks.
 */
export async function resumeExplanations(projectId) {
  return getEngine().resumeExplanations(projectId);
}

/**
 * Drains all in-flight detection and explanation tasks during graceful shutdown.
 */
export async function drainExplanations() {
  if (!engineInstance) return;
  return engineInstance.drainExplanations();
}
