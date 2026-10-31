import {
  buildDetectionPipeline, BASELINE_WINDOW, CONFIRM_WINDOW, MIN_JUMP_MS, MIN_JUMP_PCT,
} from './windows.mjs';
import { breakdown, deltaPct, percentile } from './math.mjs';
import { rankSuspects } from './attribution.mjs';
import { scoreConfidence } from './confidence.mjs';
import { createExplanationWorker } from './explanations.mjs';
import { calculateCost, createCosts } from './costs.mjs';
import { commitsBetween, createCompare } from './compare.mjs';
import { createImpacts } from './impacts.mjs';
import { invalid, notFound } from './errors.mjs';

function publicFinding(document) {
  if (!document) return null;
  const { _id, ...finding } = document;
  return finding;
}

export function createEngine({ db, emit = () => {}, llm = {} }) {
  const findings = db.collection('findings');
  const costs = createCosts({ db, emit });
  const comparison = createCompare({ db });
  const impacts = createImpacts({ db, emit });
  const explanations = createExplanationWorker({ db, emit, llm });
  const pending = new Map();
  let ready;

  function initialize() {
    ready ??= findings.createIndex({ finding_id: 1 }, { unique: true });
    return ready;
  }

  async function requireProject(project_id) {
    const project = await db.collection('projects').findOne({ project_id });
    if (!project) notFound('project', project_id);
    return project;
  }

  async function listFindings({ project_id = 'demo-app', branch = 'main', status, step } = {}) {
    await requireProject(project_id);
    if (status !== undefined && !['active', 'resolved'].includes(status)) invalid('Invalid finding status', 'status');
    const query = { project_id, branch, ...(status ? { status } : {}), ...(step ? { step } : {}) };
    const documents = await findings.find(query, { projection: { _id: 0 } })
      .sort({ detected_at: -1, finding_id: 1 }).toArray();
    return { project_id, count: documents.length, findings: documents };
  }

  async function latestFinding({ project_id = 'demo-app', branch = 'main', step } = {}) {
    await requireProject(project_id);
    const finding = await findings.findOne(
      { project_id, branch, status: 'active', ...(step ? { step } : {}) },
      { projection: { _id: 0 }, sort: { detected_at: -1, finding_id: 1 } },
    );
    return { project_id, has_active_regression: finding !== null, finding };
  }

  async function getFinding(finding_id) {
    const finding = await findings.findOne({ finding_id }, { projection: { _id: 0 } });
    if (!finding) notFound('finding', finding_id);
    return finding;
  }

  async function detectProject(project_id) {
    await initialize();
    const project = await requireProject(project_id);
    await explanations.resume(project_id);
    const candidates = await db.collection('runs').aggregate(buildDetectionPipeline({ project_id })).toArray();
    const runs = await db.collection('runs').find({ project_id, status: 'success' })
      .sort({ started_at: 1, run_id: 1 }).toArray();
    const byId = new Map(runs.map(run => [run.run_id, run]));
    const runsPerWeek = await costs.getRunsPerWeek(project_id);
    let created = 0;
    let updated = 0;
    let previous;

    for (const candidate of candidates) {
      // A baseline that still straddles an accepted cliff can manufacture
      // another split on the same noisy plateau. Require an additional jump
      // from that cliff's confirmed plateau, not merely its mixed baseline.
      if (previous && previous.branch === candidate.branch && previous.step === candidate.step
          && candidate.ordinal < previous.ordinal + BASELINE_WINDOW
          && (candidate.after_ms - previous.after_ms < MIN_JUMP_MS
            || candidate.after_ms < previous.after_ms * (1 + MIN_JUMP_PCT / 100))) continue;
      previous = candidate;
      const finding_id = `${project_id}:${candidate.branch}:${candidate.step}:${candidate.run_id}`;
      if (await findings.findOne({ finding_id }, { projection: { _id: 1 } })) continue;
      const baselineRuns = candidate.before.map(run => byId.get(run.run_id));
      const afterRuns = candidate.after.map(run => byId.get(run.run_id));
      const before = candidate.before.map(run => run.duration_ms);
      const after = candidate.after.map(run => run.duration_ms);
      const lastGood = candidate.before.at(-1);
      const commits = await commitsBetween(db, project_id, lastGood.commit_sha, candidate.commit_sha);
      const suspects = rankSuspects(commits, candidate.step);
      const before_ms = Math.round(candidate.before_ms);
      const after_ms = Math.round(candidate.after_ms);
      const delta_ms = after_ms - before_ms;
      const finding = {
        finding_id, project_id, branch: candidate.branch, step: candidate.step,
        status: 'active', detected_at: new Date(), demo_replay: candidate.demo_replay,
        change_point: {
          run_id: candidate.run_id, started_at: candidate.started_at, commit_sha: candidate.commit_sha,
        },
        last_good_run_id: lastGood.run_id,
        before_ms, after_ms, delta_ms, delta_pct: deltaPct(before_ms, after_ms),
        runs_before: before.length, runs_after: after.length,
        breakdown: { before_ms: breakdown(baselineRuns), after_ms: breakdown(afterRuns) },
        commits_in_range: commits.length, culprit_sha: suspects[0]?.sha ?? null, suspects,
        confidence: scoreConfidence({ before, after, suspects, step: candidate.step }),
        cost: calculateCost(delta_ms, runsPerWeek, project.assumptions), llm: null,
      };
      let insertedId = null;
      try {
        const result = await findings.updateOne({ finding_id }, { $setOnInsert: finding }, { upsert: true });
        if (result.upsertedCount === 1) insertedId = result.upsertedId;
      } catch (error) {
        if (error.code !== 11000) throw error;
        // Another engine instance won the unique-key upsert.
      }
      if (insertedId === null) continue;
      created++;
      await emit('finding.created', finding);
      const topCommit = commits.find(commit => commit.sha === finding.culprit_sha) ?? null;
      explanations.schedule({ ...finding, _id: insertedId }, topCommit);
    }

    const active = await findings.find({ project_id, status: 'active' }).toArray();
    for (const finding of active) {
      const stepRuns = runs.filter(run => run.branch === finding.branch
        && run.steps.some(step => step.name === finding.step && (!step.status || step.status === 'success')));
      const split = stepRuns.findIndex(run => run.run_id === finding.change_point.run_id);
      if (split < BASELINE_WINDOW || stepRuns.length - split < CONFIRM_WINDOW) continue;
      const duration = run => run.steps.find(step => step.name === finding.step).duration_ms;
      const baselineP75 = percentile(stepRuns.slice(split - BASELINE_WINDOW, split).map(duration), 0.75);
      if (stepRuns.slice(-CONFIRM_WINDOW).every(run => duration(run) < baselineP75)) {
        const resolved = await findings.findOneAndUpdate(
          { finding_id: finding.finding_id, status: 'active' },
          { $set: { status: 'resolved' } }, { returnDocument: 'after' },
        );
        if (resolved) {
          updated++;
          await emit('finding.updated', publicFinding(resolved));
        }
      }
    }
    await impacts.recomputeImpacts(project_id);
    return { created, updated };
  }

  function detect(project_id = 'demo-app') {
    // Queue, rather than drop, calls arriving during detection. In particular the
    // fifth replay run must be examined even if run four is still processing.
    const previous = pending.get(project_id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => detectProject(project_id));
    pending.set(project_id, next);
    const cleanup = () => { if (pending.get(project_id) === next) pending.delete(project_id); };
    next.then(cleanup, cleanup);
    return next;
  }

  async function drainExplanations() {
    // A stops accepting ingest before shutdown. Include detections still
    // running/queued, since they can create more explanation work while draining.
    let failure = null;
    while (pending.size) {
      for (const result of await Promise.allSettled([...pending.values()])) {
        if (result.status === 'rejected') failure ??= { error: result.reason };
      }
    }
    try { await explanations.drain(); }
    catch (error) { failure ??= { error }; }
    if (failure) throw failure.error;
  }

  return {
    detect, listFindings, latestFinding, getFinding,
    resumeExplanations: explanations.resume, drainExplanations,
    recomputeCosts: costs.recomputeCosts,
    getRunsPerWeek: costs.getRunsPerWeek,
    compare: comparison.compare,
    recomputeImpacts: impacts.recomputeImpacts,
    listImpacts: impacts.listImpacts,
  };
}
