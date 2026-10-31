import { breakdown, deltaPct } from './math.mjs';
import { invalid, notFound } from './errors.mjs';

// Only a proven parent chain is a commit range. Timestamps alone can include
// unrelated branches, particularly when a repository has incomplete ingest.
export async function commitsBetween(db, project_id, fromSha, toSha) {
  if (!fromSha || !toSha || fromSha === toSha) return [];
  const commits = db.collection('commits');
  const path = [];
  const visited = new Set();
  let sha = toSha;
  while (sha && sha !== fromSha) {
    if (visited.has(sha)) return [];
    visited.add(sha);
    const commit = await commits.findOne({ project_id, sha }, { projection: { _id: 0 } });
    if (!commit) return [];
    path.push(commit);
    sha = commit.parent;
  }
  return sha === fromSha ? path.reverse() : [];
}

function side(label, runIds, steps) {
  return {
    label,
    run_ids: runIds,
    total_ms: Object.values(steps).reduce((sum, value) => sum + value, 0),
    steps_ms: steps,
  };
}

function difference(a_ms, b_ms) {
  return { a_ms, b_ms, delta_ms: b_ms - a_ms, delta_pct: deltaPct(a_ms, b_ms) };
}

function response(project_id, mode, a, b, commits, suspects = []) {
  const ranks = new Map(suspects.map((suspect) => [suspect.sha, suspect.rank]));
  const steps = new Set([...Object.keys(a.steps_ms), ...Object.keys(b.steps_ms)]);
  return {
    mode,
    project_id,
    a,
    b,
    diff: [...steps].map((step) => ({
      step,
      ...difference(a.steps_ms[step] ?? 0, b.steps_ms[step] ?? 0),
    })).sort((left, right) => right.delta_ms - left.delta_ms || left.step.localeCompare(right.step)),
    total: difference(a.total_ms, b.total_ms),
    commits_between: commits.map((commit) => ({
      sha: commit.sha,
      author: commit.author,
      message: commit.message,
      committed_at: commit.committed_at,
      is_suspect: ranks.has(commit.sha),
      suspect_rank: ranks.get(commit.sha) ?? null,
    })),
    dependency_changes: commits.flatMap((commit) => (commit.dep_changes ?? []).map((change) => ({
      name: change.name,
      from: change.from,
      to: change.to,
      commit_sha: commit.sha,
    }))),
  };
}

export function createCompare({ db }) {
  async function compare({ project_id = 'demo-app', branch = 'main', finding_id, a, b } = {}) {
    const hasFinding = finding_id !== undefined && finding_id !== null;
    const hasA = a !== undefined && a !== null;
    const hasB = b !== undefined && b !== null;
    if (hasFinding && (hasA || hasB)) invalid('Use finding_id or both a and b, not both modes', 'finding_id');
    if (hasA !== hasB) invalid('Both a and b run IDs are required', hasA ? 'b' : 'a');
    for (const [field, value] of [['project_id', project_id], ['branch', branch], ['finding_id', finding_id], ['a', a], ['b', b]]) {
      if (value !== undefined && value !== null && (typeof value !== 'string' || !value.trim())) {
        invalid(`${field} must be a non-empty string`, field);
      }
    }
    const project = await db.collection('projects').findOne({ project_id }, { projection: { _id: 0 } });
    if (!project) notFound('project', project_id);

    if (hasA && hasB) {
      const runs = db.collection('runs');
      const [before, after] = await Promise.all([
        runs.findOne({ project_id, branch, run_id: a }, { projection: { _id: 0 } }),
        runs.findOne({ project_id, branch, run_id: b }, { projection: { _id: 0 } }),
      ]);
      if (!before) notFound('run', a);
      if (!after) notFound('run', b);
      let commits = await commitsBetween(db, project_id, before.commit_sha, after.commit_sha);
      if (!commits.length && before.commit_sha !== after.commit_sha) {
        commits = await commitsBetween(db, project_id, after.commit_sha, before.commit_sha);
      }
      return response(project_id, 'runs',
        side(a, [a], breakdown([before])),
        side(b, [b], breakdown([after])),
        commits,
      );
    }

    const query = { project_id, branch };
    if (hasFinding) query.finding_id = finding_id;
    else query.status = 'active';
    const finding = await db.collection('findings').findOne(query, {
      projection: { _id: 0 },
      sort: { detected_at: -1, finding_id: 1 },
    });
    if (!finding) notFound('finding', finding_id ?? 'latest');

    // A step's successful sequence is the detector's sequence, not merely the
    // project's runs: a skipped/failed step cannot consume a baseline slot.
    const runs = await db.collection('runs').find({
      project_id,
      branch,
      status: 'success',
      steps: { $elemMatch: { name: finding.step, status: { $nin: ['failed', 'skipped'] } } },
    }, { projection: { _id: 0 } }).sort({ started_at: 1, run_id: 1 }).toArray();
    const index = runs.findIndex((run) => run.run_id === finding.change_point.run_id);
    if (index < 0) notFound('run', finding.change_point.run_id);
    const before = runs.slice(Math.max(0, index - 10), index);
    const after = runs.slice(index, index + 5);
    if (before.length !== 10 || after.length !== 5) {
      invalid('The finding requires its complete 10-before/5-after successful-run window', 'finding_id');
    }
    const commits = await commitsBetween(db, project_id, before.at(-1).commit_sha, after[0].commit_sha);
    return response(project_id, 'finding',
      side('Typical before (10 runs)', before.map((run) => run.run_id), finding.breakdown?.before_ms ?? breakdown(before)),
      side('Typical after (5 runs)', after.map((run) => run.run_id), finding.breakdown?.after_ms ?? breakdown(after)),
      commits,
      finding.suspects,
    );
  }

  return { compare };
}
