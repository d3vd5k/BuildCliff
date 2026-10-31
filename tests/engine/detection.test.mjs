import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasDatabase } from './helpers/atlas.mjs';
import { createEngine } from '../../backend/src/engine/index.mjs';

const assumptions = { runner_cost_per_min_usd: 0.008, engineer_cost_per_hour_usd: 60, blocking_fraction: 0.5 };
const sha = n => n.toString(16).padStart(40, '0');

async function database(t) {
  const db = await atlasDatabase(t);
  await db.collection('projects').insertOne({ project_id: 'demo-app', default_branch: 'main', assumptions });
  return db;
}

function run(n, duration, commit = sha(1), extra = {}) {
  return {
    project_id: 'demo-app', branch: 'main', run_id: `run_${String(n).padStart(4, '0')}`,
    commit_sha: commit, status: 'success', demo_replay: commit === sha(2),
    started_at: new Date(Date.now() - (200 - n) * 60_000),
    steps: [
      { name: 'checkout', duration_ms: 8000 },
      { name: 'install', duration_ms: duration },
      { name: 'build', duration_ms: 95000 },
      { name: 'test', duration_ms: 120000 },
      { name: 'deploy', duration_ms: 30000 },
    ],
    ...extra,
  };
}

async function commits(db) {
  await db.collection('commits').insertMany([
    { project_id: 'demo-app', sha: sha(1), parent: null, author: 'A', message: 'Baseline',
      committed_at: new Date(Date.now() - 300 * 60_000), files_changed: [], dep_changes: [] },
    { project_id: 'demo-app', sha: sha(2), parent: sha(1), author: 'B', message: 'Upgrade browser',
      committed_at: new Date(Date.now() - 190 * 60_000),
      files_changed: ['package.json', 'package-lock.json'],
      dep_changes: [{ name: 'puppeteer', from: '21.0.0', to: '22.0.0' }],
      diff_summary: 'Upgrades the browser dependency.', demo_replay: true },
  ]);
}

test('replay confirms only after five slow runs; concurrent engines remain idempotent and recovery resolves', async t => {
  const db = await database(t);
  await commits(db);
  const events = [];
  const emit = (event, data) => events.push({ event, data });
  const engine = createEngine({ db, emit, llm: { apiKey: '' } });
  await db.collection('runs').insertMany(Array.from({ length: 10 }, (_, n) => run(n, 70000 + (n % 3) * 100)));
  assert.deepEqual(await engine.detect('demo-app'), { created: 0, updated: 0 });
  for (let n = 10; n < 14; n++) {
    await db.collection('runs').insertOne(run(n, 270000, sha(2)));
    assert.equal((await engine.detect('demo-app')).created, 0);
  }
  await db.collection('runs').insertOne(run(14, 270000, sha(2)));
  const other = createEngine({ db, emit, llm: { apiKey: '' } });
  const results = await Promise.all([engine.detect('demo-app'), engine.detect('demo-app'), other.detect('demo-app')]);
  assert.equal(results.reduce((sum, result) => sum + result.created, 0), 1);
  assert.equal(await db.collection('findings').countDocuments(), 1);
  await engine.drainExplanations();
  const latest = await engine.latestFinding();
  assert.equal(latest.has_active_regression, true);
  const finding = latest.finding;
  assert.equal(finding.change_point.run_id, 'run_0010');
  assert.equal(finding.culprit_sha, sha(2));
  assert.equal(finding.confidence.level, 'High');
  assert.equal(finding.runs_before, 10);
  assert.equal(finding.runs_after, 5);
  assert.equal(finding.llm.source, 'template');
  assert.equal(finding.breakdown.before_ms.install, 70100);
  assert.equal(finding.breakdown.after_ms.install, 270000);
  assert.equal(events.filter(event => event.event === 'finding.created').length, 1);
  assert.equal('_id' in finding, false);
  await db.collection('runs').insertMany(Array.from({ length: 15 }, (_, n) => run(n + 15, 270000, sha(2))));
  assert.equal((await engine.detect('demo-app')).created, 0, 'a persistent plateau must not create additional cliffs');
  await db.collection('runs').insertMany(Array.from({ length: 5 }, (_, n) => run(n + 30, 69000, sha(2))));
  assert.equal((await engine.detect('demo-app')).updated, 1);
  assert.equal((await engine.latestFinding()).has_active_regression, false);
  assert.equal((await engine.getFinding(finding.finding_id)).status, 'resolved');
});

test('failed runs and unsuccessful steps cannot confirm a regression; projects and branches stay isolated', async t => {
  const db = await database(t);
  await commits(db);
  const engine = createEngine({ db, llm: { apiKey: '' } });
  await db.collection('runs').insertMany([
    ...Array.from({ length: 10 }, (_, n) => run(n, 70000)),
    ...Array.from({ length: 4 }, (_, n) => run(n + 10, 270000, sha(2))),
    run(14, 270000, sha(2), { status: 'failed' }),
    run(15, 270000, sha(2), { branch: 'other' }),
    run(16, 270000, sha(2), { project_id: 'other' }),
    run(17, 270000, sha(2), { steps: [{ name: 'install', duration_ms: 270000, status: 'skipped' }] }),
  ]);
  await engine.detect('demo-app');
  assert.equal(await db.collection('findings').countDocuments(), 0);
  await db.collection('runs').insertOne(run(18, 270000, sha(2)));
  assert.equal((await engine.detect('demo-app')).created, 1);
  assert.equal((await engine.latestFinding({ branch: 'other' })).has_active_regression, false);
});

test('thresholds require both relative and absolute jumps, plus all five samples separated from baseline', async t => {
  const db = await database(t);
  const engine = createEngine({ db, llm: { apiKey: '' } });
  const cases = [
    ['below-absolute', 10000, [29999, 29999, 29999, 29999, 29999], false],
    ['below-relative', 100000, [124999, 124999, 124999, 124999, 124999], false],
    ['one-not-persistent', 70000, [270000, 270000, 70000, 270000, 270000], false],
    ['exact-threshold', 80000, [100000, 100000, 100000, 100000, 100000], true],
    ['zero-baseline', 0, [20000, 20000, 20000, 20000, 20000], true],
  ];
  for (const [branch, baseline, after, expected] of cases) {
    await db.collection('runs').insertMany([
      ...Array.from({ length: 10 }, (_, n) => run(n, baseline, sha(1), { branch, run_id: `${branch}_${n}` })),
      ...after.map((duration, n) => run(n + 10, duration, sha(2), { branch, run_id: `${branch}_${n + 10}` })),
    ]);
    await engine.detect('demo-app');
    const latest = await engine.latestFinding({ branch });
    assert.equal(latest.has_active_regression, expected, branch);
    if (branch === 'zero-baseline') assert.equal(latest.finding.delta_pct, null);
  }
});

test('a noisy slow plateau has one cliff, while a later independent increase remains detectable', async t => {
  const db = await database(t);
  const engine = createEngine({ db, llm: { apiKey: '' } });
  await db.collection('runs').insertMany([
    ...Array.from({ length: 10 }, (_, n) => run(n, 70000)),
    ...[245000, 246000, 247000, 248000, 249000].map((duration, n) => run(n + 10, duration)),
  ]);
  assert.equal((await engine.detect('demo-app')).created, 1);
  // Both blocks fit within ±10% of a single 270s plateau. A rolling baseline
  // still containing 70s runs must not manufacture another regression.
  await db.collection('runs').insertMany(Array.from({ length: 15 }, (_, n) => run(n + 15, 285000 + (n % 5) * 1000)));
  assert.equal((await engine.detect('demo-app')).created, 0, 'a mixed old/new baseline must not split one noisy plateau');
  await db.collection('runs').insertMany(Array.from({ length: 5 }, (_, n) => run(n + 30, 400000)));
  assert.equal((await engine.detect('demo-app')).created, 1);
  const findings = await db.collection('findings').find({ step: 'install' }).sort({ 'change_point.started_at': 1 }).toArray();
  assert.deepEqual(findings.map(finding => finding.after_ms), [247000, 400000]);
  assert.equal((await engine.detect('demo-app')).created, 0);
});

test('a genuinely larger second plateau is not hidden by overlapping baselines', async t => {
  const db = await database(t);
  const engine = createEngine({ db, llm: { apiKey: '' } });
  await db.collection('runs').insertMany([
    ...Array.from({ length: 10 }, (_, n) => run(n, 70000)),
    ...Array.from({ length: 5 }, (_, n) => run(n + 10, 245000)),
    ...Array.from({ length: 5 }, (_, n) => run(n + 15, 400000)),
  ]);
  assert.equal((await engine.detect('demo-app')).created, 2);
  const findings = await db.collection('findings').find().sort({ 'change_point.started_at': 1 }).toArray();
  assert.deepEqual(findings.map(finding => finding.after_ms), [245000, 400000]);
});

test('fractional baseline medians produce internally consistent integer finding statistics', async t => {
  const db = await database(t);
  const engine = createEngine({ db, llm: { apiKey: '' } });
  await db.collection('runs').insertMany([
    ...Array.from({ length: 10 }, (_, n) => run(n, n < 5 ? 80000 : 80001)),
    ...Array.from({ length: 5 }, (_, n) => run(n + 10, 100001)),
  ]);
  await engine.detect('demo-app');
  const { finding } = await engine.latestFinding();
  assert.equal(finding.before_ms, 80001);
  assert.equal(finding.after_ms, 100001);
  assert.equal(finding.delta_ms, finding.after_ms - finding.before_ms);
  assert.equal(finding.delta_ms, 20000);
  assert.equal(finding.delta_pct, 25);
  assert.equal(finding.breakdown.before_ms.install, finding.before_ms);
});

test('the fifth run arriving during a pending detection is examined by the queued ingest hook', async t => {
  const db = await database(t);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let paused = false;
  const engine = createEngine({
    db, llm: { apiKey: '' },
    emit: async event => {
      if (event === 'impacts.updated' && !paused) {
        paused = true;
        entered.resolve();
        await release.promise;
      }
    },
  });
  await db.collection('runs').insertMany([
    ...Array.from({ length: 10 }, (_, n) => run(n, 70000)),
    ...Array.from({ length: 4 }, (_, n) => run(n + 10, 270000)),
  ]);
  const fourth = engine.detect('demo-app');
  try {
    await entered.promise;
    await db.collection('runs').insertOne(run(14, 270000));
    const fifth = engine.detect('demo-app');
    const repeated = engine.detect('demo-app');
    release.resolve();
    assert.deepEqual(await fourth, { created: 0, updated: 0 });
    assert.deepEqual(await fifth, { created: 1, updated: 0 });
    assert.deepEqual(await repeated, { created: 0, updated: 0 });
    assert.equal(await db.collection('findings').countDocuments(), 1);
  } finally {
    release.resolve();
    await fourth;
  }
});

test('out-of-order ingestion and tied timestamps retain independent per-branch and per-step windows', async t => {
  const db = await database(t);
  const engine = createEngine({ db, llm: { apiKey: '' } });
  const fixtures = ['main', 'release'].flatMap(branch => Array.from({ length: 15 }, (_, n) => {
    const document = run(n, n < 10 ? 70000 : 270000, sha(1), {
      branch, run_id: `${branch}_run_${String(n).padStart(4, '0')}`,
      started_at: new Date(Date.UTC(2026, 9, 1, 0, Math.floor(n / 2))),
    });
    if (branch === 'main' && n >= 10) document.steps.find(step => step.name === 'build').duration_ms = 145000;
    return document;
  }));
  await db.collection('runs').insertMany(fixtures.reverse());
  assert.equal((await engine.detect('demo-app')).created, 3);
  const findings = await db.collection('findings').find().sort({ branch: 1, step: 1 }).toArray();
  assert.deepEqual(findings.map(finding => [finding.branch, finding.step, finding.change_point.run_id]), [
    ['main', 'build', 'main_run_0010'],
    ['main', 'install', 'main_run_0010'],
    ['release', 'install', 'release_run_0010'],
  ]);
  assert.equal(findings[0].before_ms, 95000);
  assert.equal(findings[0].after_ms, 145000);
  assert.equal(findings[1].before_ms, 70000);
  assert.equal(findings[2].before_ms, 70000);
  assert.equal((await engine.detect('demo-app')).created, 0);
});

test('the strict p75 boundary and unrounded medians govern eligibility', async t => {
  const db = await database(t);
  const engine = createEngine({ db, llm: { apiKey: '' } });
  const fixtures = [
    ...Array.from({ length: 10 }, (_, n) => run(n, n < 5 ? 80000 : 80001, sha(1), {
      branch: 'fractional', run_id: `fractional_${n}`,
    })),
    ...Array.from({ length: 5 }, (_, n) => run(n + 10, 100000, sha(1), {
      branch: 'fractional', run_id: `fractional_${n + 10}`,
    })),
    ...Array.from({ length: 10 }, (_, n) => run(n, n < 6 ? 70000 : 90000, sha(1), {
      branch: 'p75', run_id: `p75_${n}`,
    })),
    ...[90000, 270000, 270000, 270000, 270000].map((duration, n) => run(n + 10, duration, sha(1), {
      branch: 'p75', run_id: `p75_${n + 10}`,
    })),
  ];
  await db.collection('runs').insertMany(fixtures);
  assert.deepEqual(await engine.detect('demo-app'), { created: 0, updated: 0 });
  assert.equal(await db.collection('findings').countDocuments(), 0);
});

test('provider latency does not block detection and reset/replay cannot receive an old explanation', async t => {
  const db = await database(t);
  await commits(db);
  await db.collection('runs').insertMany([
    ...Array.from({ length: 10 }, (_, n) => run(n, 70000)),
    ...Array.from({ length: 5 }, (_, n) => run(n + 10, 270000, sha(2))),
  ]);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const freshUpdate = Promise.withResolvers();
  const events = [];
  let requests = 0;
  const engine = createEngine({ db, emit: (name, data) => {
    events.push({ name, data });
    if (name === 'finding.updated' && data.llm?.source === 'llm') freshUpdate.resolve();
  }, llm: {
    apiKey: 'controlled-provider-key', timeoutMs: 30000,
    fetch: async () => {
      requests++;
      const version = requests === 1 ? 'old' : 'new';
      if (requests === 1) { entered.resolve(); await release.promise; }
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify({ suggested_fix: `${version} experiment`, channel_summary: `${version} observation` }),
      } }] }) };
    },
  } });
  try {
    assert.deepEqual(await engine.detect('demo-app'), { created: 1, updated: 0 });
    await entered.promise;
    const original = (await engine.latestFinding()).finding;
    assert.equal(original.llm, null, 'detection must return while the provider is still gated');
    assert.deepEqual(await engine.detect('demo-app'), { created: 0, updated: 0 });
    assert.equal(requests, 1);
    // Model reset/replay's derived-record replacement after source history has
    // been restored: same finding_id, newly generated MongoDB identity.
    await db.collection('findings').deleteOne({ finding_id: original.finding_id });
    assert.equal((await engine.detect('demo-app')).created, 1);
    await freshUpdate.promise;
    release.resolve();
    await engine.drainExplanations();
    const current = (await engine.latestFinding()).finding;
    assert.equal(current.finding_id, original.finding_id);
    assert.equal(current.llm.suggested_fix, 'new experiment');
    assert.equal(current.culprit_sha, original.culprit_sha);
    assert.deepEqual(current.confidence, original.confidence);
    assert.equal(await db.collection('findings').countDocuments(), 1);
    assert.equal(events.filter(event => event.name === 'finding.created').length, 2);
    assert.equal(events.filter(event => event.name === 'finding.updated' && event.data.llm?.source === 'llm').length, 1);
  } finally {
    release.resolve();
    await engine.drainExplanations();
  }
});
