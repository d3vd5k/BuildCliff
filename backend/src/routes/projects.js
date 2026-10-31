import { Router } from 'express';
import { getDb } from '../db/index.js';
import { sendError } from '../utils/errors.js';
import { recomputeCosts } from '../engine/index.js';

export const projectsRouter = Router();

/** Derived metric: runs in the last 14 days / 2 (contract section 2.1). */
async function computeRunsPerWeek(db, projectId) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const count = await db.collection('runs').countDocuments({
    project_id: projectId,
    started_at: { $gte: fourteenDaysAgo },
  });
  return Math.round((count / 2) * 10) / 10; // one decimal
}

// GET /api/projects/:project_id
projectsRouter.get('/:project_id', async (req, res) => {
  try {
    const db = getDb();
    const projectId = req.params.project_id;
    const project = await db.collection('projects').findOne({ project_id: projectId });
    if (!project) {
      return sendError(res, 'NOT_FOUND', `Project not found: ${projectId}`, null);
    }
    const runsPerWeek = await computeRunsPerWeek(db, projectId);
    res.json({
      project_id: project.project_id,
      name: project.name,
      default_branch: project.default_branch,
      assumptions: project.assumptions,
      runs_per_week: runsPerWeek,
    });
  } catch (err) {
    console.error('[projects/get]', err);
    sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});

// PATCH /api/projects/:project_id/assumptions  (any subset)
projectsRouter.patch('/:project_id/assumptions', async (req, res) => {
  try {
    const db = getDb();
    const projectId = req.params.project_id;
    const body = req.body || {};

    // Validate each provided field and build the $set update.
    const updates = {};
    const isNonNegative = (v) => typeof v === 'number' && v >= 0;
    const isFraction = (v) => typeof v === 'number' && v >= 0 && v <= 1;

    if (body.runner_cost_per_min_usd != null && !isNonNegative(body.runner_cost_per_min_usd)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid value: runner_cost_per_min_usd (must be >= 0)', 'runner_cost_per_min_usd');
    }
    if (body.runner_cost_per_min_usd != null) updates['assumptions.runner_cost_per_min_usd'] = body.runner_cost_per_min_usd;

    if (body.engineer_cost_per_hour_usd != null && !isNonNegative(body.engineer_cost_per_hour_usd)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid value: engineer_cost_per_hour_usd (must be >= 0)', 'engineer_cost_per_hour_usd');
    }
    if (body.engineer_cost_per_hour_usd != null) updates['assumptions.engineer_cost_per_hour_usd'] = body.engineer_cost_per_hour_usd;

    if (body.blocking_fraction != null && !isFraction(body.blocking_fraction)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid value: blocking_fraction (must be between 0 and 1)', 'blocking_fraction');
    }
    if (body.blocking_fraction != null) updates['assumptions.blocking_fraction'] = body.blocking_fraction;

    if (Object.keys(updates).length === 0) {
      return sendError(res, 'VALIDATION_ERROR', 'No valid assumption fields provided', null);
    }

    const result = await db.collection('projects').updateOne(
      { project_id: projectId },
      { $set: updates }
    );
    if (result.matchedCount === 0) {
      return sendError(res, 'NOT_FOUND', `Project not found: ${projectId}`, null);
    }

    // Trigger cost recomputation on active findings (contract section 4.7 / 6).
    let findingsRecomputed = 0;
    try {
      const recomputed = await recomputeCosts(projectId);
      findingsRecomputed = recomputed.updated || 0;
    } catch (e) {
      console.error('[projects/patch] recomputeCosts failed:', e.message);
    }

    const project = await db.collection('projects').findOne({ project_id: projectId });
    res.json({
      project_id: projectId,
      assumptions: project.assumptions,
      findings_recomputed: findingsRecomputed,
    });
  } catch (err) {
    console.error('[projects/patch]', err);
    sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});
