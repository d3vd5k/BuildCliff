import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createImpacts } from '../../backend/src/engine/impacts.mjs';

const sha = n => n.toString(16).padStart(40, '0');
const at = n => new Date(Date.UTC(2026, 9, 1, 0, n));

test('an impact requires five measured default-branch runs of the commit or its descendants', async t => {
  let mongo;
  const uri = process.env.MONGODB_URI ?? (mongo = await MongoMemoryServer.create({
    binary: { version: '8.0.17' },
  })).getUri();
  const client = await MongoClient.connect(uri);
  const db = client.db(`impact_${crypto.randomUUID().replaceAll('-', '')}`);
  t.after(async () => { await db.dropDatabase(); await client.close(); await mongo?.stop(); });
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

  await db.collection('runs').deleteOne({ project_id, run_id: 'main_25' });
  await impacts.recomputeImpacts(project_id);
  assert.equal((await impacts.listImpacts(project_id)).count, 0, 'incomplete windows must remove previously materialized measurements');
});
