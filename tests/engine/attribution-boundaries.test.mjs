import test from 'node:test';
import assert from 'node:assert/strict';
import { commitsBetween } from '../../backend/src/engine/compare.mjs';
import { rankSuspects } from '../../backend/src/engine/attribution.mjs';
import { scoreConfidence } from '../../backend/src/engine/confidence.mjs';

const sha = n => n.toString(16).padStart(40, '0');
const commit = (n, extra = {}) => ({
  project_id: 'demo-app', sha: sha(n), parent: sha(n - 1),
  author: 'Demo', message: `Commit ${n}`, committed_at: new Date(Date.UTC(2026, 9, 1, 0, n)),
  files_changed: [], dep_changes: [], lines_changed: 0, diff_summary: null,
  ...extra,
});
const before = [69000, 70000, 70500, 71000, 68000, 70000, 69500, 72000, 70000, 71000];
const after = [269000, 270000, 271000, 268000, 272000];

// A unit-level document fixture, not a database integration substitute. The
// assertions exercise ancestry traversal, isolation, and cycle termination.
function documentStore(documents) {
  return { collection: () => ({
    findOne: async ({ project_id, sha }) => documents.find(document => document.project_id === project_id && document.sha === sha) ?? null,
  }) };
}

test('ancestry excludes the last-good commit and unrelated branches, regardless of timestamps', async () => {
  const documents = [
    commit(1, { parent: null }), commit(2, { committed_at: new Date('2026-10-03') }),
    commit(3, { committed_at: new Date('2026-10-02') }),
    commit(4, { parent: sha(1), committed_at: new Date('2026-10-02T12:00:00Z') }),
    commit(3, { project_id: 'other', parent: sha(4) }),
  ];
  assert.deepEqual((await commitsBetween(documentStore(documents), 'demo-app', sha(1), sha(3))).map(document => document.sha), [sha(2), sha(3)]);
  assert.deepEqual(await commitsBetween(documentStore(documents), 'demo-app', sha(2), sha(2)), []);
});

test('missing, disconnected, and cyclic ancestry never promotes a partial path to a sole suspect', async () => {
  const scenarios = [
    [commit(1, { parent: null }), commit(3)],
    [commit(1, { parent: null }), commit(3, { parent: null })],
    [commit(1, { parent: null }), commit(2, { parent: sha(3) }), commit(3)],
    [commit(1, { parent: null }), commit(3, { parent: sha(3) })],
    [commit(1, { parent: null }), commit(2, { project_id: 'other' }), commit(3)],
  ];
  for (const documents of scenarios) {
    const range = await commitsBetween(documentStore(documents), 'demo-app', sha(1), sha(3));
    assert.deepEqual(range, []);
    const confidence = scoreConfidence({ before, after, suspects: rankSuspects(range, 'install'), step: 'install' });
    assert.equal(confidence.level, 'Low');
    assert.ok(confidence.reasons.some(reason => reason.code === 'NO_COMMIT_DATA' && reason.polarity === 'negative'));
  }
});

test('ordinary cache implementation files cannot receive cache-key-change credit', () => {
  const sources = [
    commit(2, { files_changed: ['src/cache.ts', 'src/cache.ts', 'docs/cache.md'] }),
    commit(3, { files_changed: ['.github/workflows/build.yml'], diff_summary: 'Change the cache key for build artifacts.' }),
  ];
  const ranked = rankSuspects(sources, 'build');
  assert.equal(ranked[0].sha, sha(3), 'explicit CI/cache evidence must outrank an ordinary source change');
  const ordinary = ranked.find(suspect => suspect.sha === sha(2));
  assert.ok(ordinary.reasons.some(reason => reason.code === 'STEP_RELATED_FILES'));
  assert.equal(ordinary.reasons.some(reason => reason.code === 'CACHE_KEY_CHANGED'), false);
});

test('multiple manifests and duplicate paths cannot inflate one evidence category', () => {
  const base = commit(2, { files_changed: ['package-lock.json'], dep_changes: [{ name: 'webpack', from: '5', to: '6' }] });
  const expanded = { ...base, files_changed: ['package-lock.json', 'package-lock.json', 'package.json', 'web/package-lock.json'] };
  const rival = commit(3, { files_changed: ['Dockerfile'] });
  const original = rankSuspects([base, rival], 'build');
  const duplicated = rankSuspects([expanded, rival], 'build');
  assert.equal(duplicated[0].score, original[0].score);
  assert.equal(duplicated[0].reasons.filter(reason => reason.code === 'LOCKFILE_CHANGED').length, 1);
});

test('three equally strong candidates remain Low even when every absolute evidence score is high', () => {
  const sources = [2, 3, 4].map(n => commit(n, {
    files_changed: ['package-lock.json', 'Dockerfile'],
    dep_changes: [{ name: 'puppeteer', from: '21', to: '22' }],
  }));
  const suspects = rankSuspects(sources, 'install');
  assert.deepEqual(suspects.map(suspect => suspect.score), [100, 100, 100]);
  const confidence = scoreConfidence({ before, after, suspects, step: 'install' });
  assert.equal(confidence.level, 'Low');
  assert.ok(confidence.score < 45);
  assert.ok(confidence.reasons.some(reason => reason.code === 'MULTIPLE_CANDIDATES' && reason.polarity === 'negative'));
  assert.ok(confidence.reasons.some(reason => reason.code === 'SMALL_SCORE_MARGIN' && reason.polarity === 'negative'));
});

test('clear evidence margins can distinguish a strong candidate from multiple weak alternatives', () => {
  const suspects = rankSuspects([
    commit(2, { files_changed: ['package-lock.json', 'Dockerfile'], dep_changes: [{ name: 'puppeteer', from: '21', to: '22' }] }),
    commit(3, { files_changed: ['README.md'] }),
    commit(4, { files_changed: ['docs/usage.md'] }),
  ], 'install');
  const confidence = scoreConfidence({ before, after, suspects, step: 'install' });
  assert.equal(confidence.level, 'High');
  assert.equal(suspects[0].sha, sha(2));
  assert.ok(confidence.reasons.some(reason => reason.code === 'LARGE_SCORE_MARGIN'));
});

test('explicit cache-key files and CI cache summaries retain cache evidence without guessing from a cache filename', () => {
  const keyFile = rankSuspects([commit(2, { files_changed: ['.cache-key'] })], 'build')[0];
  assert.ok(keyFile.reasons.some(reason => reason.code === 'CACHE_KEY_CHANGED'));
  const ordinaryWorkflow = rankSuspects([commit(3, { files_changed: ['.github/workflows/cache.yml'] })], 'build')[0];
  assert.ok(ordinaryWorkflow.reasons.some(reason => reason.code === 'CI_CONFIG_CHANGED'));
  assert.equal(ordinaryWorkflow.reasons.some(reason => reason.code === 'CACHE_KEY_CHANGED'), false);
});

test('a close pair of strong candidates is also ambiguous, while moderate sole evidence remains Medium', () => {
  const suspects = rankSuspects([
    commit(2, { files_changed: ['package-lock.json', 'Dockerfile', 'src/index.ts'], lines_changed: 1000 }),
    commit(3, { files_changed: ['package-lock.json', 'Dockerfile', 'src/index.ts'] }),
  ], 'build');
  assert.equal(suspects[0].score - suspects[1].score, 5);
  assert.equal(scoreConfidence({ before, after, suspects, step: 'build' }).level, 'Low');
  const moderate = rankSuspects([commit(4, { files_changed: ['Dockerfile'] })], 'build');
  assert.equal(scoreConfidence({ before, after, suspects: moderate, step: 'build' }).level, 'Medium');
});
