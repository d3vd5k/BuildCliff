import { Router } from 'express';
import { getDb } from '../db/index.js';
import { sendError } from '../utils/errors.js';
import {
  DEMO_PROJECT_ID,
  DEFAULT_BRANCH,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from '@buildcliff/shared';

export const runsRouter = Router();

/** Format a run document for the API response (contract section 4.3). */
function formatRun(run) {
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

// GET /api/runs?project_id=demo-app&branch=main&since=...&limit=200
// Returns runs in ascending started_at order (oldest first), including failed runs.
runsRouter.get('/', async (req, res) => {
  try {
    const db = getDb();
    const projectId = req.query.project_id || req.query.project || DEMO_PROJECT_ID;
    const branch = req.query.branch || DEFAULT_BRANCH;

    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const filter = { project_id: projectId, branch };
    if (req.query.since) {
      const sinceDate = new Date(req.query.since);
      if (!Number.isNaN(sinceDate.getTime())) {
        filter.started_at = { $gte: sinceDate };
      }
    }

    const runs = await db.collection('runs')
      .find(filter)
      .sort({ started_at: 1 }) // ascending: oldest first
      .limit(limit)
      .toArray();

    res.json({
      project_id: projectId,
      branch,
      count: runs.length,
      runs: runs.map(formatRun),
    });
  } catch (err) {
    console.error('[runs]', err);
    sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});
