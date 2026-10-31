// Core ingest logic, shared by the HTTP routes and the replay driver.
// Idempotency: insert the event first (unique event_id index is the source of
// truth). E11000 duplicate-key → 200 duplicate. Validation happens before any
// write so clients get clean 400s with dotted field paths.
// After an accepted run: fire-and-forget detect(). After a commit: recomputeImpacts().

import { getDb } from '../db/index.js';
import {
  runEventId,
  commitEventId,
  DEFAULT_BRANCH,
} from '@buildcliff/shared';
import { detect, recomputeImpacts } from '../engine/index.js';

const DUPLICATE_CODE = 11000; // MongoDB duplicate-key error

// --- Validation: returns first error { field, message } or null ---

function validateRun(body) {
  if (!body || typeof body !== 'object') return { field: null, message: 'Request body is required' };
  if (!body.project_id) return { field: 'project_id', message: 'Missing required field: project_id' };
  if (!body.run_id) return { field: 'run_id', message: 'Missing required field: run_id' };
  if (!body.commit_sha) return { field: 'commit_sha', message: 'Missing required field: commit_sha' };
  if (body.started_at == null) return { field: 'started_at', message: 'Missing required field: started_at' };
  const startedDate = new Date(body.started_at);
  if (Number.isNaN(startedDate.getTime())) return { field: 'started_at', message: 'Invalid date: started_at' };
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return { field: 'steps', message: 'Missing or empty required field: steps' };
  }
  for (let i = 0; i < body.steps.length; i++) {
    const step = body.steps[i];
    if (!step.name) return { field: `steps.${i}.name`, message: `Missing required field: steps.${i}.name` };
    if (typeof step.duration_ms !== 'number' || step.duration_ms < 0 || !Number.isFinite(step.duration_ms)) {
      return { field: `steps.${i}.duration_ms`, message: `Invalid value: steps.${i}.duration_ms (must be a non-negative number)` };
    }
  }
  if (body.status && !['success', 'failed'].includes(body.status)) {
    return { field: 'status', message: 'Invalid value: status (must be "success" or "failed")' };
  }
  return null;
}

function validateCommit(body) {
  if (!body || typeof body !== 'object') return { field: null, message: 'Request body is required' };
  if (!body.project_id) return { field: 'project_id', message: 'Missing required field: project_id' };
  if (!body.sha) return { field: 'sha', message: 'Missing required field: sha' };
  if (!body.author) return { field: 'author', message: 'Missing required field: author' };
  if (!body.message) return { field: 'message', message: 'Missing required field: message' };
  if (body.committed_at == null) return { field: 'committed_at', message: 'Missing required field: committed_at' };
  const committedDate = new Date(body.committed_at);
  if (Number.isNaN(committedDate.getTime())) return { field: 'committed_at', message: 'Invalid date: committed_at' };
  if (body.dep_changes && !Array.isArray(body.dep_changes)) {
    return { field: 'dep_changes', message: 'Invalid value: dep_changes (must be an array)' };
  }
  return null;
}

// --- Helpers ---

function computeTotalMs(steps) {
  return steps.reduce((sum, s) => sum + s.duration_ms, 0);
}

function normalizeSteps(steps) {
  return steps.map((s) => ({
    name: s.name,
    duration_ms: s.duration_ms,
    status: s.status || 'success',
  }));
}

function duplicateBody(eventId, idLabel, idValue, msg = 'duplicate ignored') {
  return { status: 'duplicate', event_id: eventId, [idLabel]: idValue, message: msg };
}

// --- Public API ---

/**
 * Ingest a run. Returns { status, body } where status is the HTTP status code.
 * @param {object} body - The request body.
 * @param {object} [options] - { demoReplay: true } when called by the replay driver.
 */
export async function ingestRun(body, options = {}) {
  // Validate first so 400s don't require a DB connection.
  const error = validateRun(body);
  if (error) return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: error.message, field: error.field } } };

  const db = getDb();

  const projectId = body.project_id;
  const runId = body.run_id;
  const eventId = body.event_id || runEventId(projectId, runId);
  const branch = body.branch || DEFAULT_BRANCH;
  const status = body.status || 'success';
  const source = options.demoReplay ? 'replay' : body.source || 'api';
  const startedAt = new Date(body.started_at);
  const steps = normalizeSteps(body.steps);
  const totalMs = body.total_ms != null ? body.total_ms : computeTotalMs(steps);

  // Idempotency: insert the event first (unique index on event_id).
  const eventDoc = {
    event_id: eventId,
    project_id: projectId,
    type: 'run',
    received_at: new Date(),
    payload: body,
  };
  try {
    await db.collection('events').insertOne(eventDoc);
  } catch (err) {
    if (err.code === DUPLICATE_CODE) {
      return { status: 200, body: duplicateBody(eventId, 'run_id', runId) };
    }
    throw err;
  }

  // Insert the run document.
  const runDoc = {
    run_id: runId,
    event_id: eventId,
    project_id: projectId,
    branch,
    commit_sha: body.commit_sha,
    status,
    started_at: startedAt,
    total_ms: totalMs,
    steps,
    source,
    demo_replay: !!options.demoReplay,
    ingested_at: new Date(),
  };
  try {
    await db.collection('runs').insertOne(runDoc);
  } catch (err) {
    // Rollback the event so a retry is clean.
    await db.collection('events').deleteOne({ event_id: eventId }).catch(() => {});
    if (err.code === DUPLICATE_CODE) {
      return { status: 200, body: duplicateBody(eventId, 'run_id', runId) };
    }
    throw err;
  }

  // Fire-and-forget: trigger detection (contract section 4.2 / 6).
  detect(projectId).catch((e) => console.error('[ingest] detect failed:', e.message));

  return { status: 201, body: { status: 'accepted', event_id: eventId, run_id: runId } };
}

/**
 * Ingest a commit. Returns { status, body }.
 * @param {object} body - The request body.
 * @param {object} [options] - { demoReplay: true } when called by the replay driver.
 */
export async function ingestCommit(body, options = {}) {
  // Validate first so 400s don't require a DB connection.
  const error = validateCommit(body);
  if (error) return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: error.message, field: error.field } } };

  const db = getDb();

  const projectId = body.project_id;
  const sha = body.sha;
  const eventId = body.event_id || commitEventId(projectId, sha);
  const committedAt = new Date(body.committed_at);

  const eventDoc = {
    event_id: eventId,
    project_id: projectId,
    type: 'commit',
    received_at: new Date(),
    payload: body,
  };
  try {
    await db.collection('events').insertOne(eventDoc);
  } catch (err) {
    if (err.code === DUPLICATE_CODE) {
      return { status: 200, body: duplicateBody(eventId, 'sha', sha) };
    }
    throw err;
  }

  const commitDoc = {
    sha,
    project_id: projectId,
    parent: body.parent ?? null,
    author: body.author,
    message: body.message,
    committed_at: committedAt,
    files_changed: body.files_changed || [],
    dep_changes: body.dep_changes || [],
    lines_changed: body.lines_changed ?? 0,
    diff_summary: body.diff_summary ?? null,
    demo_replay: !!options.demoReplay,
  };
  try {
    await db.collection('commits').insertOne(commitDoc);
  } catch (err) {
    await db.collection('events').deleteOne({ event_id: eventId }).catch(() => {});
    if (err.code === DUPLICATE_CODE) {
      return { status: 200, body: duplicateBody(eventId, 'sha', sha) };
    }
    throw err;
  }

  // Fire-and-forget: recompute dependency impacts (contract section 4.2 / 6).
  recomputeImpacts(projectId).catch((e) => console.error('[ingest] recomputeImpacts failed:', e.message));

  return { status: 201, body: { status: 'accepted', event_id: eventId, sha } };
}
