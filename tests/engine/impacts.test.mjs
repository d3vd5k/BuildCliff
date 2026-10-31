import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasDatabase } from './helpers/atlas.mjs';
import { createEngine } from '../../backend/src/engine/index.mjs';
import { createCompare } from '../../backend/src/engine/compare.mjs';
import { createImpactFixture } from '../../backend/scripts/fixtures/impacts.mjs';
import { createImpacts } from '../../backend/src/engine/impacts.mjs';

const sha = n => n.toString(16).padStart(40, '0');
const at = n => new Date(Date.UTC(2026, 9, 1, 0, n));


test('an impact requires five measured default-branch runs of the commit or its descendants', async t => {
  const db = await atlasDatabase(t);
  const project_id = 'boundary';
  await db.collection('projects').insertOne({ project_id, default_branch: 'main' });
  await db.collection('commits').insertMany([
    { project_id, sha: sha(1), parent: null, committed_at: at(-1), dep_changes: [] },
    { project_id, sha: sha(2), parent: sha(1), committed_at: at(10), dep_changes: [{ name: 'browser', from: '1', to: '2' }] },
    { project_id, sha: sha(3), parent: sha(2), committed_at: at(20), dep_changes: [] },
  ]);
  const run = (n, commit, duration, branch = 'main') => ({
    project_id, branch, run_id: `${branch}_${n}`, commit_sha: sha(commit),
    status: 'success', started_at: at(n), steps: [{ name: 'install', duration_ms: duration }],
  });
  await db.collection('runs').insertMany([
    ...Array.from({ length: 20 }, (_, n) => run(n, 1, 70000)),
    ...Array.from({ length: 5 }, (_, n) => run(n + 10, 2, 270000, 'feature')),
  ]);
  const impacts = createImpacts({ db });
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).count, 0, 'timestamps or feature-branch runs are not evidence that main built this commit');

  await db.collection('runs').insertMany(Array.from({ length: 4 }, (_, n) => run(n + 21, 3, 270000)));
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).count, 0, 'four descendant runs cannot fill the after window');

  await db.collection('runs').insertOne(run(25, 3, 270000));
  await impacts.recomputeImpacts(project_id);
  const measured = await impacts.listImpacts(project_id);
  assert.equal(measured.count, 1, 'a descendant build can anchor the dependency change');
  assert.equal(measured.impacts[0].before_ms, 70000);
  assert.equal(measured.impacts[0].after_ms, 270000);
  assert.equal(measured.impacts[0].delta_ms, 200000);
  assert.deepEqual(measured.impacts[0].runs_compared, { before: 10, after: 5 });
  assert.deepEqual(measured.impacts[0].compare, { a: 'main_19', b: 'main_21' });
  const comparison = await createCompare({ db }).compare({ project_id, ...measured.impacts[0].compare });
  assert.equal(comparison.total.delta_ms, 200000);

  await db.collection('runs').deleteOne({ project_id, run_id: 'main_25' });
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).count, 0, 'incomplete windows must remove previously materialized measurements');
});

test('all dependency bumps retain zero and negative impacts, comparison targets, links, and rebuild isolation', async t => {
  const db = await atlasDatabase(t);
  const fixture = createImpactFixture('six', { branch: 'release' });
  const project_id = fixture.project.project_id;
  await db.collection('projects').insertOne(fixture.project);
  await db.collection('commits').insertMany(fixture.commits);
  await db.collection('runs').insertMany(fixture.runs);
  await db.collection('runs').insertMany([
    { ...fixture.runs[10], run_id: 'failed-outlier', status: 'failed', steps: [{ name: 'build', duration_ms: 9_000_000 }] },
    { ...fixture.runs[10], run_id: 'other-branch', branch: 'main', steps: [{ name: 'build', duration_ms: 9_000_000 }] },
    { ...fixture.runs[10], run_id: 'other-project', project_id: 'other', steps: [{ name: 'build', duration_ms: 9_000_000 }] },
  ]);
  const events = [];
  const emit = (name, data) => events.push({ name, data });
  const impacts = createImpacts({ db, emit });
  assert.equal(await impacts.recomputeImpacts(project_id), 6);
  const initial = await impacts.listImpacts(project_id);
  assert.equal(initial.impacts.filter(row => Math.abs(row.delta_ms) < 5000).length, 2);
  assert.ok(initial.impacts.every(row => row.finding_id === null), 'bumps do not require findings');
  assert.deepEqual(initial.impacts.map(row => row.delta_ms), [200000, 50000, 40000, 0, 0, -60000]);
  const compare = createCompare({ db }).compare;
  for (const bump of fixture.bumps) {
    const measured = initial.impacts.find(row => row.dep === bump.dep);
    assert.equal(measured.delta_ms, bump.delta_ms, bump.dep);
    assert.deepEqual(measured.compare, bump.compare, bump.dep);
    if (bump.delta_ms) assert.equal(measured.step, bump.step);
    const compared = await compare({ project_id, branch: fixture.project.default_branch, ...measured.compare });
    assert.equal(compared.diff.find(row => row.step === measured.step).delta_ms, bump.delta_ms);
  }
  const engine = createEngine({ db, emit, llm: { apiKey: '' } });
  await engine.detect(project_id);
  const linked = await impacts.listImpacts(project_id);
  assert.equal(linked.impacts.find(row => row.dep === 'puppeteer').finding_id, `six:release:install:${fixture.bumps[3].compare.b}`);
  assert.equal(linked.impacts.find(row => row.dep === 'lodash').finding_id, null);
  const stableRows = rows => rows.map(({ computed_at, ...row }) => row);
  const second = createImpacts({ db, emit });
  await Promise.all([impacts.recomputeImpacts(project_id), second.recomputeImpacts(project_id)]);
  assert.deepEqual(stableRows((await impacts.listImpacts(project_id)).impacts), stableRows(linked.impacts));
  assert.ok(events.some(event => event.name === 'impacts.updated' && event.data.project_id === project_id));

  await db.collection('dependency_impacts').insertOne({ impact_id: 'foreign', project_id: 'other', computed_at: new Date(0) });
  await db.collection('commits').deleteMany({ project_id, demo_replay: true });
  await db.collection('runs').deleteMany({ project_id, demo_replay: true });
  await db.collection('findings').deleteMany({ project_id, demo_replay: true });
  await impacts.recomputeImpacts(project_id);
  const reset = await impacts.listImpacts(project_id);
  assert.equal(reset.count, 5);
  assert.equal(reset.impacts.some(row => row.dep === 'puppeteer'), false);
  assert.equal(await db.collection('dependency_impacts').countDocuments({ project_id: 'other' }), 1);
});

test('a link must match the measured step and default branch, not merely contain the same suspect SHA', async t => {
  const db = await atlasDatabase(t);
  const project_id = 'links';
  await db.collection('projects').insertOne({ project_id, default_branch: 'main' });
  await db.collection('commits').insertMany([
    { project_id, sha: sha(1), parent: null, dep_changes: [], committed_at: at(-1) },
    { project_id, sha: sha(2), parent: sha(1), dep_changes: [{ name: 'browser', from: '1', to: '2' }], committed_at: at(9.5) },
  ]);
  await db.collection('runs').insertMany(Array.from({ length: 15 }, (_, n) => ({
    project_id, branch: 'main', run_id: `link_${n}`, commit_sha: sha(n < 10 ? 1 : 2), status: 'success', started_at: at(n),
    steps: [{ name: 'install', duration_ms: n < 10 ? 70000 : 270000 }],
  })));
  await db.collection('findings').insertOne({
    project_id, branch: 'main', step: 'test', finding_id: 'links:main:test:unrelated', status: 'active',
    detected_at: at(20), suspects: [{ sha: sha(2), rank: 1 }],
  });
  const impacts = createImpacts({ db });
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).impacts[0].finding_id, null);
  await db.collection('findings').insertMany([
    { project_id, branch: 'main', step: 'install', finding_id: 'links:main:install:link_10', status: 'resolved', detected_at: at(15), suspects: [{ sha: sha(2), rank: 1 }] },
    { project_id, branch: 'other', step: 'install', finding_id: 'links:other:install:foreign', status: 'active', detected_at: at(30), suspects: [{ sha: sha(2), rank: 1 }] },
  ]);
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).impacts[0].finding_id, 'links:main:install:link_10');
});

test('comparison targets use successful target-step runs rather than skipped, failed, or incomplete anchors', async t => {
  const db = await atlasDatabase(t);
  const project_id = 'steps';
  await db.collection('projects').insertOne({ project_id, default_branch: 'main' });
  await db.collection('commits').insertMany([
    { project_id, sha: sha(1), parent: null, dep_changes: [], committed_at: at(-1) },
    { project_id, sha: sha(2), parent: sha(1), dep_changes: [{ name: 'browser', from: '1', to: '2' }], committed_at: at(9.5) },
  ]);
  const run = (n, status = 'success', stepStatus = 'success') => ({
    project_id, branch: 'main', run_id: `step_${n}`, commit_sha: sha(n < 10 ? 1 : 2), status, started_at: at(n),
    steps: [{ name: 'install', duration_ms: n < 10 ? 70000 : 270000, status: stepStatus }],
  });
  await db.collection('runs').insertMany([
    ...Array.from({ length: 10 }, (_, n) => run(n)), run(10, 'success', 'skipped'), run(11, 'success', 'failed'), run(12, 'failed'),
    ...Array.from({ length: 5 }, (_, n) => run(n + 13)),
  ]);
  const impacts = createImpacts({ db });
  await impacts.recomputeImpacts(project_id);
  assert.deepEqual((await impacts.listImpacts(project_id)).impacts[0].compare, { a: 'step_9', b: 'step_13' });
  await db.collection('runs').deleteOne({ project_id, run_id: 'step_17' });
  assert.equal(await impacts.recomputeImpacts(project_id), 0);
  assert.deepEqual((await impacts.listImpacts(project_id)).impacts, []);
});

test('negative half-percent rounding and zero baselines remain meaningful for speedups and multi-dependency bumps', async t => {
  const db = await atlasDatabase(t);
  const project_id = 'rounding';
  await db.collection('projects').insertOne({ project_id, default_branch: 'main' });
  await db.collection('commits').insertMany([
    { project_id, sha: sha(1), parent: null, dep_changes: [], committed_at: at(-1) },
    { project_id, sha: sha(2), parent: sha(1), dep_changes: [{ name: 'one', from: '1', to: '2' }, { name: 'two', from: '1', to: '2' }], committed_at: at(9.5) },
  ]);
  await db.collection('runs').insertMany(Array.from({ length: 15 }, (_, n) => ({
    project_id, branch: 'main', run_id: `round_${n}`, commit_sha: sha(n < 10 ? 1 : 2), status: 'success', started_at: at(n),
    steps: [{ name: 'install', duration_ms: n < 10 ? 40000 : 35100 }],
  })));
  const impacts = createImpacts({ db });
  assert.equal(await impacts.recomputeImpacts(project_id), 2);
  const result = await impacts.listImpacts(project_id);
  assert.deepEqual(result.impacts.map(row => row.delta_pct), [-12.3, -12.3]);
  const comparison = await createCompare({ db }).compare({ project_id, ...result.impacts[0].compare });
  assert.equal(comparison.diff[0].delta_pct, -12.3);
  await db.collection('runs').updateMany({ project_id, commit_sha: sha(1) }, { $set: { 'steps.0.duration_ms': 0 } });
  assert.equal(await impacts.recomputeImpacts(project_id), 2);
  assert.deepEqual((await impacts.listImpacts(project_id)).impacts.map(row => row.delta_pct), [null, null]);
  await db.collection('runs').updateMany({ project_id }, { $set: { 'steps.0.duration_ms': 0 } });
  assert.equal(await impacts.recomputeImpacts(project_id), 2);
  assert.deepEqual((await impacts.listImpacts(project_id)).impacts.map(row => [row.dep, row.delta_ms, row.delta_pct]), [['one', 0, 0], ['two', 0, 0]]);
});
