import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompare } from '../../backend/src/engine/compare.mjs';
import { documentDb } from './helpers/documents.mjs';

const sha = n => n.toString(16).padStart(40, '0');
const at = n => new Date(Date.UTC(2026, 9, 1) + n * 60000);
const commits = () => [
  { project_id: 'p', sha: sha(1), parent: null, author: 'A', message: 'Before', committed_at: at(-1), dep_changes: [] },
  { project_id: 'p', sha: sha(2), parent: sha(1), author: 'B', message: 'Upgrade', committed_at: at(9.5), dep_changes: [{ name: 'tool', from: '1', to: '2' }] },
  { project_id: 'p', sha: sha(3), parent: sha(1), author: 'C', message: 'Unrelated', committed_at: at(9.7), dep_changes: [] },
];

function runTables() {
  return {
    projects: [{ project_id: 'p' }, { project_id: 'other' }], commits: commits(), findings: [],
    runs: [
      { project_id: 'p', branch: 'main', run_id: 'a', commit_sha: sha(1), status: 'failed', started_at: at(9), steps: [
        { name: 'install', duration_ms: 1000, status: 'failed' },
        { name: 'build', duration_ms: 0 }, { name: 'removed', duration_ms: 400 },
        { name: 'skipped', duration_ms: 100, status: 'skipped' },
      ] },
      { project_id: 'p', branch: 'main', run_id: 'b', commit_sha: sha(2), status: 'success', started_at: at(10), steps: [
        { name: 'install', duration_ms: 3000 }, { name: 'build', duration_ms: 200 },
        { name: 'added', duration_ms: 500 }, { name: 'skipped', duration_ms: 0, status: 'skipped' },
      ] },
      { project_id: 'other', branch: 'main', run_id: 'foreign', commit_sha: sha(2), started_at: at(10), steps: [] },
    ],
  };
}

function findingTables() {
  const runs = Array.from({ length: 15 }, (_, n) => ({
    project_id: 'p', branch: 'main', run_id: `r${String(n).padStart(3, '0')}`,
    commit_sha: sha(n < 10 ? 1 : 2), status: 'success', started_at: at(n),
    steps: [{ name: 'install', duration_ms: (n < 10 ? 70000 : 270000) + (n % 2) * 2000 }, { name: 'build', duration_ms: 90000 + (n % 3) * 1000 }],
  }));
  runs.push(
    { ...runs[9], run_id: 'failed', status: 'failed', started_at: at(9.1) },
    { ...runs[9], run_id: 'skipped', started_at: at(9.2), steps: [{ name: 'install', duration_ms: 0, status: 'skipped' }] },
    { ...runs[9], run_id: 'step-failed', started_at: at(9.3), steps: [{ name: 'install', duration_ms: 999999, status: 'failed' }] },
    { ...runs[9], run_id: 'missing-step', started_at: at(9.4), steps: [{ name: 'test', duration_ms: 1000 }] },
    { ...runs[9], run_id: 'other-branch', branch: 'release', started_at: at(9.5) },
    { ...runs[9], run_id: 'other-project', project_id: 'other', started_at: at(9.6) },
  );
  const finding = {
    project_id: 'p', branch: 'main', step: 'install', finding_id: 'p:main:install:r010',
    status: 'active', detected_at: at(15), change_point: { run_id: 'r010', commit_sha: sha(2) },
    breakdown: { before_ms: { install: 71000, build: 91000 }, after_ms: { install: 270000, build: 91000 } },
    suspects: [{ sha: sha(2), rank: 1 }],
  };
  return {
    projects: [{ project_id: 'p' }, { project_id: 'other' }], commits: commits(), runs: runs.reverse(),
    findings: [finding, { ...finding, finding_id: 'resolved', status: 'resolved', detected_at: at(30) },
      { ...finding, branch: 'release', finding_id: 'release-finding', detected_at: at(50) },
      { ...finding, project_id: 'other', finding_id: 'foreign-finding', detected_at: at(40) }],
  };
}

test('individual runs retain measured failed/skipped steps and handle added, removed, and zero-baseline steps', async () => {
  const result = await createCompare({ db: documentDb(runTables()) }).compare({ project_id: 'p', a: 'a', b: 'b' });
  assert.equal(result.mode, 'runs');
  assert.equal(result.a.total_ms, 1500);
  assert.equal(result.b.total_ms, 3700);
  assert.deepEqual(result.diff, [
    { step: 'install', a_ms: 1000, b_ms: 3000, delta_ms: 2000, delta_pct: 200 },
    { step: 'added', a_ms: 0, b_ms: 500, delta_ms: 500, delta_pct: null },
    { step: 'build', a_ms: 0, b_ms: 200, delta_ms: 200, delta_pct: null },
    { step: 'skipped', a_ms: 100, b_ms: 0, delta_ms: -100, delta_pct: -100 },
    { step: 'removed', a_ms: 400, b_ms: 0, delta_ms: -400, delta_pct: -100 },
  ]);
  assert.deepEqual(result.total, { a_ms: 1500, b_ms: 3700, delta_ms: 2200, delta_pct: 146.7 });
  assert.deepEqual(result.commits_between.map(commit => [commit.sha, commit.is_suspect, commit.suspect_rank]), [[sha(2), false, null]]);
  assert.deepEqual(result.dependency_changes, [{ name: 'tool', from: '1', to: '2', commit_sha: sha(2) }]);
});

test('reversing a run comparison reverses duration changes but retains the proven chronological commit range', async () => {
  const compare = createCompare({ db: documentDb(runTables()) }).compare;
  const result = await compare({ project_id: 'p', a: 'b', b: 'a' });
  assert.deepEqual(result.total, { a_ms: 3700, b_ms: 1500, delta_ms: -2200, delta_pct: -59.5 });
  assert.deepEqual(result.commits_between.map(commit => commit.sha), [sha(2)]);
  assert.equal(result.diff.find(row => row.step === 'install').delta_pct, -66.7);
  const identical = await compare({ project_id: 'p', a: 'a', b: 'a' });
  assert.equal(identical.total.delta_ms, 0);
  assert.ok(identical.diff.every(row => row.delta_ms === 0 && row.delta_pct === 0));
  assert.deepEqual(identical.commits_between, []);
});

test('finding mode uses exactly the detector-successful 10/5 window and flags proven suspects', async () => {
  const compare = createCompare({ db: documentDb(findingTables()) }).compare;
  const result = await compare({ project_id: 'p', finding_id: 'p:main:install:r010' });
  assert.equal(result.mode, 'finding');
  assert.deepEqual(result.a.run_ids, Array.from({ length: 10 }, (_, n) => `r${String(n).padStart(3, '0')}`));
  assert.deepEqual(result.b.run_ids, ['r010', 'r011', 'r012', 'r013', 'r014']);
  assert.equal(result.a.steps_ms.install, 71000);
  assert.equal(result.b.steps_ms.install, 270000);
  assert.equal(result.total.delta_ms, 199000);
  assert.deepEqual(result.commits_between.map(commit => [commit.sha, commit.is_suspect, commit.suspect_rank]), [[sha(2), true, 1]]);
  const newestActive = await compare({ project_id: 'p' });
  assert.equal(newestActive.total.delta_ms, 199000);
  assert.equal(newestActive.mode, 'finding');
});

test('incomplete finding windows fail rather than manufacture typical medians', async () => {
  const tables = findingTables();
  tables.runs = tables.runs.filter(run => run.run_id !== 'r000');
  const compare = createCompare({ db: documentDb(tables) }).compare;
  await assert.rejects(compare({ project_id: 'p', finding_id: 'p:main:install:r010' }), error => error.status === 400 && error.code === 'VALIDATION_ERROR');
});

test('invalid comparison modes are rejected and lookups cannot cross project or branch boundaries', async () => {
  const compare = createCompare({ db: documentDb(runTables()) }).compare;
  for (const options of [
    { a: 'a' }, { b: 'b' }, { finding_id: 'f', a: 'a', b: 'b' }, { a: '', b: 'b' }, { a: 2, b: 'b' },
  ]) {
    await assert.rejects(compare({ project_id: 'p', ...options }), error => error.status === 400 && error.code === 'VALIDATION_ERROR');
  }
  for (const options of [
    { project_id: 'missing', a: 'a', b: 'b' }, { project_id: 'p', a: 'a', b: 'missing' },
    { project_id: 'p', a: 'a', b: 'foreign' }, { project_id: 'p', branch: 'release', a: 'a', b: 'b' },
    { project_id: 'p', finding_id: 'missing' }, { project_id: 'p' },
  ]) {
    await assert.rejects(compare(options), error => error.status === 404 && error.code === 'NOT_FOUND');
  }
  const findingCompare = createCompare({ db: documentDb(findingTables()) }).compare;
  await assert.rejects(findingCompare({ project_id: 'p', finding_id: 'foreign-finding' }), error => error.status === 404 && error.code === 'NOT_FOUND');
  await assert.rejects(findingCompare({ project_id: 'p', finding_id: 'release-finding' }), error => error.status === 404 && error.code === 'NOT_FOUND');
});
