import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildDetectionPipeline } from '../src/engine/windows.mjs';
import { createImpacts } from '../src/engine/impacts.mjs';

// This is a disposable prototype dataset, not A's production/demo seeder.
// Always start a private MongoDB process; never connect to Atlas or user data.
const START = Date.parse('2026-10-01T00:00:00Z');
const sha = n => n.toString(16).padStart(40, '0');
const baseline = { checkout: 8000, install: 70000, build: 95000, test: 120000, deploy: 30000 };
const at = n => new Date(START + n * 60_000);

function run(project_id, n, durations, { commit = 1, branch = 'main', status = 'success', skipped = false } = {}) {
  const steps = Object.entries(durations).map(([name, duration_ms]) => ({
    name, duration_ms, status: skipped ? 'skipped' : 'success',
  }));
  return {
    project_id, branch, run_id: `${project_id}:${branch}:${n}`, commit_sha: sha(commit),
    status, started_at: at(n), steps,
    total_ms: steps.reduce((sum, step) => sum + step.duration_ms, 0), demo_replay: false,
  };
}

async function prototypeDetector(db) {
  const project_id = 'prototype-detector';
  const candidates = branch => db.collection('runs')
    .aggregate(buildDetectionPipeline({ project_id, branch })).toArray();
  const stable = Array.from({ length: 10 }, (_, n) => run(project_id, n, { install: 70000 }));
  await db.collection('runs').insertMany(stable);
  assert.equal((await candidates('main')).length, 0);
  const progression = [{ successful_slow_runs: 0, qualifying_splits: 0 }];
  for (let n = 0; n < 4; n++) {
    await db.collection('runs').insertOne(run(project_id, n + 10, { install: 270000 }, { commit: 2 }));
    const found = await candidates('main');
    assert.equal(found.length, 0, 'four slow runs are insufficient');
    progression.push({ successful_slow_runs: n + 1, qualifying_splits: found.length });
  }
  await db.collection('runs').insertMany([
    run(project_id, 14, { install: 270000 }, { commit: 2, status: 'failed' }),
    run(project_id, 15, { install: 270000 }, { commit: 2, skipped: true }),
    run(project_id, 16, { install: 270000 }, { commit: 2, branch: 'other' }),
  ]);
  assert.equal((await candidates('main')).length, 0, 'failed, skipped, and other-branch runs cannot confirm');
  await db.collection('runs').insertOne(run(project_id, 17, { install: 270000 }, { commit: 2 }));
  const [cliff, ...extra] = await candidates('main');
  assert.equal(extra.length, 0);
  assert.equal(cliff.run_id, `${project_id}:main:10`);
  assert.equal(cliff.before_ms, 70000);
  assert.equal(cliff.after_ms, 270000);
  assert.equal(cliff.after_ms - cliff.before_ms, 200000);
  assert.equal(cliff.baseline_p75, 70000);
  assert.equal(cliff.before.length, 10);
  assert.equal(cliff.after.length, 5);
  progression.push({ successful_slow_runs: 5, qualifying_splits: 1 });
  console.log('\nDetector confirmation progression');
  console.table(progression);
  console.log(`Cliff: ${cliff.run_id}; ${cliff.before_ms} -> ${cliff.after_ms} ms; baseline p75 ${cliff.baseline_p75} ms`);

  // Fixed-seed jitter and isolated spikes must not create a persistent cliff.
  let seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const negatives = [
    ['jitter', Array.from({ length: 30 }, () => Math.round(70000 * (0.9 + random() * 0.2)))],
    ['isolated-spike', [...Array(10).fill(70000), 270000, ...Array(9).fill(70000)]],
    ['one-unseparated', [...Array(10).fill(70000), 270000, 270000, 70000, 270000, 270000]],
    ['below-absolute', [...Array(10).fill(10000), ...Array(5).fill(29999)]],
    ['below-relative', [...Array(10).fill(100000), ...Array(5).fill(124999)]],
  ];
  for (const [branch, durations] of negatives) {
    await db.collection('runs').insertMany(durations.map((duration, n) => run(project_id, n, { install: duration }, { branch })));
    assert.equal((await candidates(branch)).length, 0, branch);
  }
  console.log('Negative cases passed: seeded ±10% jitter, isolated spike, one unseparated sample, both threshold boundaries.');
}

async function prototypeImpacts(db) {
  const project_id = 'prototype-impacts';
  await db.collection('projects').insertOne({ project_id, default_branch: 'main' });
  const commits = [{ project_id, sha: sha(1), parent: null, committed_at: at(-1), dep_changes: [] }];
  const runs = [];
  const durations = { ...baseline };
  const changes = [
    { dep: 'webpack', step: 'build', delta: 40000 },
    { dep: 'lodash', step: 'install', delta: 0 },
    { dep: 'prettier', step: 'build', delta: 0 },
    { dep: 'puppeteer', step: 'install', delta: 200000 },
    { dep: 'jest', step: 'test', delta: 50000 },
    { dep: 'typescript', step: 'build', delta: -30000 },
  ];
  for (let epoch = 0; epoch <= changes.length; epoch++) {
    if (epoch > 0) {
      const change = changes[epoch - 1];
      durations[change.step] += change.delta;
      commits.push({
        project_id, sha: sha(epoch + 1), parent: sha(epoch),
        committed_at: new Date(at(epoch * 10).getTime() - 1), demo_replay: epoch === 4,
        dep_changes: [{ name: change.dep, from: '1.0.0', to: '2.0.0' }],
      });
    }
    // Each ten-run block repeats the same five-sample, zero-median jitter.
    for (let n = 0; n < 10; n++) {
      const jitter = ((n % 5) - 2) * 100;
      const values = Object.fromEntries(Object.entries(durations).map(([step, duration]) => [step, duration + jitter]));
      runs.push(run(project_id, epoch * 10 + n, values, { commit: epoch + 1 }));
    }
  }
  runs.push(run(project_id, 40.5, { ...baseline, install: 9_000_000 }, { commit: 5, status: 'failed' }));
  runs.push(...Array.from({ length: 20 }, (_, n) => run(project_id, n, { install: 9_000_000 }, { branch: 'unrelated', commit: 1 })));
  await db.collection('commits').insertMany(commits);
  await db.collection('runs').insertMany(runs);

  const published = [];
  const impacts = createImpacts({ db, emit: (event, data) => published.push({ event, data }) });
  await impacts.recomputeImpacts(project_id);
  const first = await impacts.listImpacts(project_id);
  assert.equal(first.count, 6);
  for (const expected of changes) {
    const measured = first.impacts.find(row => row.dep === expected.dep);
    assert.equal(measured.delta_ms, expected.delta, expected.dep);
    assert.deepEqual(measured.runs_compared, { before: 10, after: 5 });
    assert.equal(measured.finding_id, null);
    if (expected.delta !== 0) assert.equal(measured.step, expected.step);
  }
  assert.equal(first.impacts.filter(row => Math.abs(row.delta_ms) < 5000).length, 2);
  assert.equal(first.impacts.find(row => row.dep === 'puppeteer').demo_replay, true);
  console.log('\nDependency impact measurements (actual MongoDB $merge results)');
  console.table(first.impacts.map(({ dep, step, before_ms, after_ms, delta_ms }) => ({ dep, step, before_ms, after_ms, delta_ms })));

  const stableRows = rows => rows.map(({ computed_at, ...row }) => row);
  const secondFactory = createImpacts({ db });
  await Promise.all([impacts.recomputeImpacts(project_id), secondFactory.recomputeImpacts(project_id)]);
  assert.deepEqual(stableRows((await impacts.listImpacts(project_id)).impacts), stableRows(first.impacts));
  assert.ok(published.some(item => item.event === 'impacts.updated' && item.data.project_id === project_id));

  // A commit never built on the default branch must not borrow unrelated runs.
  await db.collection('commits').insertOne({
    project_id, sha: sha(99), parent: sha(1), committed_at: at(25),
    dep_changes: [{ name: 'unbuilt-side-branch', from: '1', to: '2' }],
  });
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).count, 6, 'an unbuilt commit has no measurable after window');

  // Four remaining post-commit runs are not a complete measurement window.
  await db.collection('runs').deleteMany({ project_id, branch: 'main', commit_sha: sha(7), started_at: { $gte: at(64) } });
  await impacts.recomputeImpacts(project_id);
  const incomplete = await impacts.listImpacts(project_id);
  assert.equal(incomplete.count, 5);
  assert.equal(incomplete.impacts.some(row => row.dep === 'typescript'), false);

  await db.collection('commits').deleteOne({ project_id, sha: sha(5) });
  await db.collection('runs').deleteMany({ project_id, commit_sha: sha(5) });
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).impacts.some(row => row.dep === 'puppeteer'), false);
  console.log('Impact boundaries passed: zero/negative impacts, failed/other-branch runs, concurrent rebuilds, unbuilt commits, incomplete windows, and stale-row removal.');
}

const mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
let client;
try {
  client = await MongoClient.connect(mongo.getUri());
  const db = client.db('buildcliff_step2_prototype');
  const build = await db.admin().command({ buildInfo: 1 });
  console.log(`Step 2 prototype: real MongoDB ${build.version}; isolated disposable database.`);
  await prototypeDetector(db);
  await prototypeImpacts(db);
  console.log('\nPASS: both Step 2 aggregation prototypes verified.');
} finally {
  await client?.close();
  await mongo.stop();
}
