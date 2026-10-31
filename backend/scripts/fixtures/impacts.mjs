// Synthetic verification data only; this is not A's application/demo seeder.
export function createImpactFixture(project_id, { branch = 'main', now = Date.now() } = {}) {
  const start = now - 86400000;
  const at = index => new Date(start + index * 60000);
  const sha = index => index.toString(16).padStart(40, '0');
  const runId = index => `${project_id}_${String(index).padStart(4, '0')}`;
  const changes = [
    { dep: 'webpack', step: 'build', delta_ms: 40000 },
    { dep: 'lodash', step: 'install', delta_ms: 0 },
    { dep: 'prettier', step: 'build', delta_ms: 0 },
    { dep: 'puppeteer', step: 'install', delta_ms: 200000 },
    { dep: 'jest', step: 'test', delta_ms: 50000 },
    // The largest absolute impact is the speedup, not the smaller slowdown.
    { dep: 'typescript', step: 'build', delta_ms: -60000, other_step: 'install', other_delta_ms: 10000 },
  ];
  const durations = { checkout: 8000, install: 70000, build: 95000, test: 120000, deploy: 30000 };
  const commits = [];
  const runs = [];
  const bumps = [];
  for (let epoch = 0; epoch <= changes.length; epoch++) {
    const change = changes[epoch - 1];
    if (change) {
      durations[change.step] += change.delta_ms;
      if (change.other_step) durations[change.other_step] += change.other_delta_ms;
      bumps.push({
        dep: change.dep, step: change.step, delta_ms: change.delta_ms, commit_sha: sha(epoch + 1),
        compare: { a: runId(epoch * 10 - 1), b: runId(epoch * 10) },
      });
    }
    commits.push({
      project_id, sha: sha(epoch + 1), parent: epoch === 0 ? null : sha(epoch),
      author: 'Impact verification', message: change ? `Upgrade ${change.dep}` : 'Baseline',
      committed_at: new Date(at(epoch * 10).getTime() - 1000),
      files_changed: change ? ['package-lock.json'] : [], lines_changed: change ? 100 : 0,
      dep_changes: change ? [{ name: change.dep, from: '1.0.0', to: '2.0.0' }] : [],
      diff_summary: change ? `Upgrade ${change.dep} and regenerate the lockfile.` : null,
      demo_replay: change?.dep === 'puppeteer',
    });
    for (let index = epoch * 10; index < (epoch + 1) * 10; index++) {
      const steps = Object.entries(durations).map(([name, duration_ms]) => ({ name, duration_ms, status: 'success' }));
      runs.push({
        project_id, branch, run_id: runId(index), commit_sha: sha(epoch + 1),
        status: 'success', started_at: at(index), steps,
        total_ms: steps.reduce((sum, step) => sum + step.duration_ms, 0),
        demo_replay: change?.dep === 'puppeteer',
      });
    }
  }
  return {
    project: {
      project_id, name: 'Impact verification', default_branch: branch,
      assumptions: { runner_cost_per_min_usd: 0.008, engineer_cost_per_hour_usd: 60, blocking_fraction: 0.5 },
    },
    commits, runs, bumps,
  };
}
