import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { MongoClient } from 'mongodb';
import { createEngine } from '../src/engine/index.mjs';
import { createAnalyticsHandler } from '../src/routes/analytics.mjs';
import { createImpactFixture } from './fixtures/impacts.mjs';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) {
    console.error('Missing MONGODB_URI. Add the Atlas Drivers URI to your local .env. No local database fallback is used.');
    process.exitCode = 1;
    return;
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  const databaseName = `buildcliff_verify_${crypto.randomUUID().replaceAll('-', '')}`;
  let db;
  let server;
  let engine;
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    db = client.db(databaseName);
    console.log(`Connected using configured MongoDB URI. Disposable verification database: ${databaseName}`);
    const fixture = createImpactFixture('impacts', { branch: 'release' });
    const project_id = fixture.project.project_id;
    await db.collection('projects').insertOne(fixture.project);
    await db.collection('commits').insertMany(fixture.commits);
    await db.collection('runs').insertMany(fixture.runs);
    await db.collection('commits').insertOne({
      project_id, sha: 'f'.repeat(40), parent: fixture.commits[0].sha,
      committed_at: fixture.runs[25].started_at, dep_changes: [{ name: 'unbuilt', from: '1', to: '2' }],
    });
    await db.collection('runs').insertMany([
      { ...fixture.runs[10], run_id: 'failed-outlier', status: 'failed', steps: [{ name: 'build', duration_ms: 9_000_000 }] },
      { ...fixture.runs[10], run_id: 'wrong-branch', branch: 'main', steps: [{ name: 'build', duration_ms: 9_000_000 }] },
      { ...fixture.runs[10], run_id: 'wrong-project', project_id: 'other', steps: [{ name: 'build', duration_ms: 9_000_000 }] },
    ]);
    const events = [];
    const emit = (name, data) => events.push({ name, data });
    engine = createEngine({ db, emit, llm: { apiKey: '' } });
    const handler = createAnalyticsHandler(engine);
    let requestError;
    server = createServer(async (request, response) => {
      try {
        if (!(await handler(request, response))) { response.writeHead(404); response.end(); }
      } catch (error) {
        requestError = error;
        response.writeHead(500);
        response.end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function get(path, expectedStatus = 200) {
      const response = await fetch(`${base}${path}`);
      if (requestError) throw requestError;
      assert.equal(response.status, expectedStatus);
      return response.json();
    }
    const list = () => get(`/api/dependency-impacts?project_id=${project_id}`);
    const comparison = row => get(`/api/compare?${new URLSearchParams({ project_id, branch: fixture.project.default_branch, ...row.compare })}`);
    assert.equal(await engine.recomputeImpacts(project_id), 6);
    const initial = await list();
    assert.equal(initial.count, 6);
    assert.deepEqual(initial.impacts.map(row => row.delta_ms), [200000, 50000, 40000, 0, 0, -60000]);
    assert.equal(initial.impacts.filter(row => Math.abs(row.delta_ms) < 5000).length, 2);
    assert.ok(initial.impacts.every(row => row.finding_id === null), 'measurements must not depend on findings');
    for (const bump of fixture.bumps) {
      const row = initial.impacts.find(impact => impact.dep === bump.dep);
      assert.equal(row.delta_ms, bump.delta_ms, bump.dep);
      assert.deepEqual(row.compare, bump.compare, bump.dep);
      assert.equal('_id' in row, false);
      if (bump.delta_ms) assert.equal(row.step, bump.step);
      const compared = await comparison(row);
      assert.equal(compared.mode, 'runs');
      assert.equal(compared.diff.find(step => step.step === row.step).delta_ms, bump.delta_ms);
    }
    assert.equal((await get('/api/dependency-impacts?project_id=missing', 404)).error.code, 'NOT_FOUND');

    await engine.detect(project_id);
    await engine.drainExplanations();
    const linked = await list();
    const cliff = linked.impacts.find(row => row.dep === 'puppeteer');
    assert.equal(cliff.finding_id, `impacts:release:install:${fixture.bumps[3].compare.b}`);
    const finding = await get(`/api/findings/${encodeURIComponent(cliff.finding_id)}`);
    assert.equal(finding.step, cliff.step);
    assert.equal(finding.culprit_sha, cliff.commit_sha);
    assert.equal(linked.impacts.find(row => row.dep === 'lodash').finding_id, null);
    const stable = rows => rows.map(({ computed_at, ...row }) => row);
    const other = createEngine({ db, emit, llm: { apiKey: '' } });
    await Promise.all([engine.recomputeImpacts(project_id), other.recomputeImpacts(project_id)]);
    const repeated = await list();
    assert.deepEqual(stable(repeated.impacts), stable(linked.impacts));
    assert.equal(events.at(-1).name, 'impacts.updated');
    assert.equal(events.at(-1).data.computed_at.toISOString(), repeated.computed_at);
    console.table(repeated.impacts.map(({ dep, step, delta_ms, finding_id, compare }) => ({ dep, step, delta_ms, linked_finding: finding_id !== null, before_run: compare.a, after_run: compare.b })));

    // Reproduce A's deletion effects only in this disposable database. This is
    // not a claim to have exercised A's still-missing demo/reset HTTP endpoint.
    await db.collection('commits').deleteMany({ project_id, demo_replay: true });
    await db.collection('runs').deleteMany({ project_id, demo_replay: true });
    await db.collection('findings').deleteMany({ project_id, demo_replay: true });
    assert.equal(await engine.recomputeImpacts(project_id), 5);
    const reset = await list();
    assert.equal(reset.impacts.some(row => row.dep === 'puppeteer'), false);
    for (const row of reset.impacts) await comparison(row);
    await db.collection('commits').deleteMany({ project_id });
    assert.equal(await engine.recomputeImpacts(project_id), 0);
    assert.deepEqual(await list(), { project_id, computed_at: null, count: 0, impacts: [] });
    console.log('PASS: six actual impact rows, zero/speedup retention, finding/compare navigation, branch isolation, concurrent rebuilds, and reset/empty cleanup verified.');
  } finally {
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      try { await engine?.drainExplanations(); }
      finally { if (db) { await db.dropDatabase(); console.log(`Removed disposable verification database: ${databaseName}`); } }
    } finally { await client.close(); }
  }
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  if (error.code === 'ERR_ASSERTION') console.error(error.message);
  else console.error(`Verification failed (${error.name ?? 'Error'}, code ${error.code ?? 'unknown'}). Check Atlas connectivity and disposable-database permissions.`);
}
