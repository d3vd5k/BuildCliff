import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSuspects, dependencyMatchesStep} from '../../backend/src/engine/attribution.mjs';
import {scoreConfidence} from '../../backend/src/engine/confidence.mjs';

const commit = (overrides = {}) => ({
  sha: 'a'.repeat(40), author: 'Priya Shah', message: 'Update dependency',
  committed_at: new Date('2026-10-31T09:38:40Z'),
  files_changed: ['package.json', 'package-lock.json'],
  dep_changes: [{name: 'puppeteer', from: '21.0.0', to: '22.0.0'}],
  lines_changed: 412, diff_summary: 'Updates a browser dependency and its lockfile.', ...overrides,
});
const before = [69000, 70000, 70500, 71000, 68000, 70000, 69500, 72000, 70000, 71000];
const after = [269000, 270000, 271000, 268000, 272000];

 test('single lockfile and matching dependency score 92 without path double-counting', () => {
  const source = commit();
  const [suspect] = rankSuspects([source], 'install');
  assert.equal(suspect.score, 92);
  assert.equal(suspect.rank, 1);
  assert.deepEqual(suspect.reasons.map(reason => reason.code), ['LOCKFILE_CHANGED', 'DEP_BUMPED', 'SOLE_COMMIT_IN_RANGE']);
  assert.equal(source.rank, undefined);
});

test('dependency-step matching does not claim unknown packages affect build', () => {
  assert.equal(dependencyMatchesStep('some-new-package', 'install'), true);
  assert.equal(dependencyMatchesStep('some-new-package', 'build'), false);
  assert.equal(dependencyMatchesStep('puppeteer', 'build'), false);
  assert.equal(dependencyMatchesStep('puppeteer', 'test'), true);
  assert.equal(dependencyMatchesStep('webpack', 'build'), true);
  assert.equal(dependencyMatchesStep('@playwright/test', 'test'), true);
  assert.equal(dependencyMatchesStep('vercel', 'deploy'), true);
  const [suspect] = rankSuspects([commit({dep_changes: [{name: 'some-new-package', from: '1', to: '2'}]})], 'build');
  assert.equal(suspect.score, 62);
  assert.ok(!suspect.reasons.some(reason => reason.code === 'DEP_BUMPED'));
});

test('three equally plausible commits rank deterministically and read Low', () => {
  const sources = [
    commit({sha: 'c'.repeat(40), files_changed: ['Dockerfile'], dep_changes: []}),
    commit({sha: 'b'.repeat(40), files_changed: ['.github/workflows/build.yml'], dep_changes: []}),
    commit({files_changed: [], dep_changes: [{name: 'webpack', from: '5.95', to: '5.96'}]}),
  ];
  const suspects = rankSuspects(sources, 'build');
  assert.deepEqual(suspects.map(suspect => [suspect.sha[0], suspect.score, suspect.rank]), [['a', 30, 1], ['b', 30, 2], ['c', 30, 3]]);
  assert.deepEqual(rankSuspects([...sources].reverse(), 'build'), suspects);
  const confidence = scoreConfidence({before, after, suspects, step: 'build'});
  assert.equal(confidence.level, 'Low');
  assert.ok(confidence.reasons.some(reason => reason.code === 'MULTIPLE_CANDIDATES'));
  assert.ok(confidence.reasons.some(reason => reason.code === 'SMALL_SCORE_MARGIN'));
});

test('persistent separated jump plus a matching sole suspect reads High', () => {
  const confidence = scoreConfidence({before, after, suspects: rankSuspects([commit()], 'install'), step: 'install'});
  assert.equal(confidence.level, 'High');
  assert.deepEqual(confidence.reasons.map(reason => reason.code), ['JUMP_PERSISTS', 'CLEAN_SEPARATION', 'SOLE_COMMIT', 'DEP_MATCHES_STEP']);
});

test('missing commits and insufficient timing evidence never read High', () => {
  const missing = scoreConfidence({before, after, suspects: [], step: 'install'});
  assert.equal(missing.level, 'Low');
  assert.ok(missing.reasons.some(reason => reason.code === 'NO_COMMIT_DATA'));
  const suspects = rankSuspects([commit()], 'install');
  const sparse = scoreConfidence({before: before.slice(0, 3), after, suspects, step: 'install'});
  assert.equal(sparse.level, 'Low');
  assert.ok(sparse.reasons.some(reason => reason.code === 'FEW_BASELINE_RUNS'));
  assert.equal(scoreConfidence({before, after: after.slice(0, 4), suspects, step: 'install'}).level, 'Low');
  assert.notEqual(scoreConfidence({before, after: [...after.slice(0, 4), 69000], suspects, step: 'install'}).level, 'High');
  assert.equal(scoreConfidence({before: [], after: [], suspects, step: 'install'}).score, 0);
});

test('CI cache path and description contribute once; large diff requires 1000 lines', () => {
  const [cached] = rankSuspects([commit({files_changed: ['.github/workflows/build.yml'], dep_changes: [], diff_summary: 'Changes the cache key for build artifacts.'})], 'build');
  assert.deepEqual(cached.reasons.map(reason => reason.code), ['CACHE_KEY_CHANGED', 'SOLE_COMMIT_IN_RANGE']);
  assert.equal(cached.score, 52);
  const [large] = rankSuspects([commit({lines_changed: 1000})], 'install');
  assert.equal(large.score, 97);
  const [capped] = rankSuspects([commit({files_changed: ['package-lock.json', 'Dockerfile', '.github/workflows/ci.yml'], lines_changed: 1000})], 'install');
  assert.equal(capped.score, 100);
  const [related] = rankSuspects([commit({files_changed: ['src/index.ts'], dep_changes: []})], 'build');
  assert.ok(related.reasons.some(reason => reason.code === 'STEP_RELATED_FILES'));
});

