// Demo replay and reset service (contract section 4.8, 5, 6).
// Handles /api/demo/replay and /api/demo/reset.
// Drives replay through the normal ingestRun and ingestCommit path.

import { getDb } from '../db/index.js';
import { emit } from './streamService.js';
import { ingestRun, ingestCommit } from './ingestService.js';
import { buildReplayFixture } from '../seed/generate.js';
import { recomputeImpacts, drainExplanations } from '../engine/index.js';
import {
  DEMO_PROJECT_ID,
  DEFAULT_BRANCH,
  REPLAY_INTERVAL_MS,
  REPLAY_TOTAL_STEPS,
} from '@buildcliff/shared';

let activeReplay = null; // { projectId, promise, cancelTimer, progress }

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (activeReplay) activeReplay.cancelTimer = () => { clearTimeout(timer); resolve(); };
  });
}

/**
 * Returns current replay status for a project.
 */
export async function getDemoStatus(projectId = DEMO_PROJECT_ID) {
  const db = getDb();
  const replayInProgress = Boolean(activeReplay && activeReplay.projectId === projectId);
  const replayRunsCount = await db.collection('runs').countDocuments({
    project_id: projectId,
    demo_replay: true,
  });
  const replayApplied = replayRunsCount >= 5;
  return {
    project_id: projectId,
    replay_in_progress: replayInProgress,
    replay_applied: replayApplied,
    progress: activeReplay?.progress || null,
  };
}

/**
 * Starts demo replay in the background.
 * Returns { status: 'started', total_steps: 6, interval_ms: 1500 } on success.
 * Throws with code REPLAY_IN_PROGRESS or REPLAY_ALREADY_APPLIED.
 */
export async function startReplay(projectId = DEMO_PROJECT_ID) {
  const db = getDb();

  if (activeReplay && activeReplay.projectId === projectId) {
    const err = new Error('A replay is already in progress');
    err.code = 'REPLAY_IN_PROGRESS';
    throw err;
  }

  const existingCount = await db.collection('runs').countDocuments({
    project_id: projectId,
    demo_replay: true,
  });
  if (existingCount > 0) {
    const err = new Error('Replay has already been applied. Reset first.');
    err.code = 'REPLAY_ALREADY_APPLIED';
    throw err;
  }

  const fixture = buildReplayFixture();
  const branch = DEFAULT_BRANCH;

  const replayState = {
    projectId,
    progress: null,
    cancelTimer: null,
    promise: null,
  };

  replayState.promise = (async () => {
    try {
      // Find latest commit to set parent SHA
      const lastCommit = await db.collection('commits')
        .find({ project_id: projectId })
        .sort({ committed_at: -1 })
        .limit(1)
        .next();

      const commitDoc = {
        ...fixture.commit,
        parent: lastCommit ? lastCommit.sha : null,
        committed_at: new Date(),
      };

      // Step 1: Commit ingest
      replayState.progress = {
        step_index: 1,
        total_steps: REPLAY_TOTAL_STEPS,
        kind: 'commit',
        id: commitDoc.sha,
      };
      await ingestCommit(commitDoc, { demoReplay: true });
      emit('demo.progress', replayState.progress, projectId);

      // Find highest sequential run ID
      const lastRun = await db.collection('runs')
        .find({ project_id: projectId })
        .sort({ run_id: -1 })
        .limit(1)
        .next();

      let lastIndex = 120;
      if (lastRun?.run_id) {
        const match = lastRun.run_id.match(/_(\d+)$/);
        if (match) lastIndex = parseInt(match[1], 10);
      }

      // Steps 2 to 6: 5 slow runs spaced by REPLAY_INTERVAL_MS
      for (let i = 0; i < fixture.runs.length; i++) {
        await sleep(REPLAY_INTERVAL_MS);

        const runIndex = lastIndex + 1 + i;
        const runId = `run_${String(runIndex).padStart(4, '0')}`;
        const runDoc = {
          ...fixture.runs[i],
          run_id: runId,
          project_id: projectId,
          branch,
          commit_sha: commitDoc.sha,
          started_at: new Date(),
        };

        const stepIndex = i + 2;
        replayState.progress = {
          step_index: stepIndex,
          total_steps: REPLAY_TOTAL_STEPS,
          kind: 'run',
          id: runId,
        };

        await ingestRun(runDoc, { demoReplay: true });
        emit('demo.progress', replayState.progress, projectId);
      }
    } catch (err) {
      console.error('[demo] replay execution error:', err);
      emit('demo.error', { message: err.message }, projectId);
    } finally {
      if (activeReplay === replayState) {
        activeReplay = null;
      }
    }
  })();

  activeReplay = replayState;

  return {
    status: 'started',
    total_steps: REPLAY_TOTAL_STEPS,
    interval_ms: REPLAY_INTERVAL_MS,
  };
}

/**
 * Resets demo state by removing all demo_replay documents.
 */
export async function resetDemo(projectId = DEMO_PROJECT_ID) {
  if (activeReplay && activeReplay.projectId === projectId) {
    const err = new Error('Cannot reset while replay is in progress');
    err.code = 'REPLAY_IN_PROGRESS';
    throw err;
  }

  const db = getDb();

  // Drain any in-flight background detector/explanation work before deleting
  await drainExplanations();

  const [runsRes, commitsRes, eventsRes, findingsRes, impactsRes] = await Promise.all([
    db.collection('runs').deleteMany({ project_id: projectId, demo_replay: true }),
    db.collection('commits').deleteMany({ project_id: projectId, demo_replay: true }),
    db.collection('events').deleteMany({
      project_id: projectId,
      $or: [
        { 'payload.demo_replay': true },
        { 'payload.source': 'replay' },
      ],
    }),
    db.collection('findings').deleteMany({ project_id: projectId, demo_replay: true }),
    db.collection('dependency_impacts').deleteMany({ project_id: projectId, demo_replay: true }),
  ]);

  // Rebuild impact table after removal
  try {
    await recomputeImpacts(projectId);
  } catch (err) {
    console.warn('[demo] reset recomputeImpacts warning:', err.message);
  }

  emit('demo.reset', {}, projectId);

  return {
    status: 'reset',
    deleted: {
      runs: runsRes.deletedCount,
      commits: commitsRes.deletedCount,
      events: eventsRes.deletedCount,
      findings: findingsRes.deletedCount,
      dependency_impacts: impactsRes.deletedCount,
    },
  };
}

/**
 * Shutdown hook to await any active replay job.
 */
export async function drainReplay() {
  if (!activeReplay) return;
  if (typeof activeReplay.cancelTimer === 'function') {
    activeReplay.cancelTimer();
  }
  try {
    await activeReplay.promise;
  } catch {
    // Ignore shutdown cancellation errors
  }
  activeReplay = null;
}
