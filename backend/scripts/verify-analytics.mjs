import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { MongoClient } from 'mongodb';
import { createEngine } from '../src/engine/index.mjs';
import { createAnalyticsHandler } from '../src/routes/analytics.mjs';

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
    const events = [];
    engine = createEngine({ db, emit: (name, finding) => events.push({ name, finding }), llm: { apiKey: '' } });
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
    const project_id = 'analytics';
    const rates = { runner_cost_per_min_usd: 0.008, engineer_cost_per_hour_usd: 60, blocking_fraction: 0.5 };
    const now = Date.now();
    const start = now - 86400000;
    const at = n => new Date(start + n * 60000);
    const sha = n => n.toString(16).padStart(40, '0');
    const step = (name, duration_ms, status = 'success') => ({ name, duration_ms, status });
    await db.collection('projects').insertMany([
      { project_id, default_branch: 'main', assumptions: rates },
      { project_id: 'single-runs', default_branch: 'main', assumptions: rates },
    ]);
    await db.collection('commits').insertMany([
      { project_id, sha: sha(1), parent: null, author: 'A', message: 'Baseline', committed_at: at(-1), files_changed: [], dep_changes: [] },
      { project_id, sha: sha(2), parent: sha(1), author: 'B', message: 'Upgrade browser', committed_at: at(9.5), files_changed: ['package-lock.json'], dep_changes: [{ name: 'puppeteer', from: '21', to: '22' }] },
      { project_id: 'single-runs', sha: sha(11), parent: null, author: 'A', message: 'Before', committed_at: at(-1), files_changed: [], dep_changes: [] },
      { project_id: 'single-runs', sha: sha(12), parent: sha(11), author: 'B', message: 'After', committed_at: at(9.5), files_changed: ['package-lock.json'], dep_changes: [{ name: 'webpack', from: '5', to: '6' }] },
    ]);
    const successful = Array.from({ length: 15 }, (_, n) => ({
      project_id, branch: 'main', run_id: `run_${String(n).padStart(4, '0')}`, status: 'success',
      commit_sha: sha(n < 10 ? 1 : 2), started_at: at(n), demo_replay: false,
      steps: [step('checkout', 8000), step('install', n < 10 ? 70000 : 270000), step('build', n < 10 ? 95000 : 96000), step('test', 120000), step('deploy', 30000)],
    }));
    const failed = Array.from({ length: 125 }, (_, n) => ({
      ...successful[0], run_id: `failed_${n}`, status: 'failed', branch: 'other', started_at: at(n),
    }));
    await db.collection('runs').insertMany([
      ...successful, ...failed,
      { ...successful[0], run_id: 'ancient', status: 'failed', started_at: new Date(now - 15 * 86400000) },
      { ...successful[0], run_id: 'future', status: 'failed', started_at: new Date(now + 86400000) },
      { project_id: 'single-runs', branch: 'main', run_id: 'a', status: 'failed', commit_sha: sha(11), started_at: at(9),
        steps: [step('install', 1000, 'failed'), step('build', 0), step('removed', 400), step('skipped', 100, 'skipped')] },
      { project_id: 'single-runs', branch: 'main', run_id: 'b', status: 'success', commit_sha: sha(12), started_at: at(10),
        steps: [step('install', 3000), step('build', 200), step('added', 500), step('skipped', 0, 'skipped')] },
    ]);
    assert.equal(await engine.getRunsPerWeek(project_id), 70);
    assert.deepEqual(await engine.detect(project_id), { created: 1, updated: 0 });
    await engine.drainExplanations();
    const latest = await get('/api/findings/latest?project_id=analytics');
    const finding = latest.finding;
    assert.equal(finding.cost.engineer_cost_usd_per_week, 116.67);
    assert.equal(finding.cost.runner_cost_usd_per_week, 1.87);
    assert.equal(finding.cost.total_cost_usd_per_week, 118.53);
    assert.equal(finding.cost.recovered_hours_per_week_if_reverted, 3.89);

    const typical = await get(`/api/compare?project_id=analytics&finding_id=${encodeURIComponent(finding.finding_id)}`);
    assert.equal(typical.mode, 'finding');
    assert.equal(typical.a.run_ids.length, 10);
    assert.equal(typical.b.run_ids.length, 5);
    assert.equal(typical.a.total_ms, 323000);
    assert.equal(typical.b.total_ms, 524000);
    assert.equal(typical.total.delta_ms, 201000);
    assert.equal(typical.commits_between[0].is_suspect, true);
    assert.equal(typical.dependency_changes[0].name, 'puppeteer');
    assert.equal((await get('/api/compare?project_id=analytics')).total.delta_ms, 201000);

    const runs = await get('/api/compare?project_id=single-runs&a=a&b=b');
    assert.equal(runs.mode, 'runs');
    assert.equal(runs.a.total_ms, 1500);
    assert.equal(runs.b.total_ms, 3700);
    assert.equal(runs.total.delta_ms, 2200);
    assert.equal(runs.diff.find(row => row.step === 'added').delta_pct, null);
    assert.equal(runs.diff.find(row => row.step === 'skipped').delta_ms, -100);
    assert.equal(runs.commits_between[0].is_suspect, false);
    assert.equal(runs.commits_between[0].suspect_rank, null);
    const reversed = await get('/api/compare?project_id=single-runs&a=b&b=a');
    assert.equal(reversed.total.delta_ms, -2200);
    assert.equal(reversed.commits_between[0].sha, sha(12));
    assert.equal((await get('/api/compare?project_id=analytics&a=run_0009', 400)).error.code, 'VALIDATION_ERROR');
    assert.equal((await get('/api/compare?project_id=analytics&a=a&b=b', 404)).error.code, 'NOT_FOUND');
    assert.equal((await get('/api/compare?project_id=single-runs&branch=release&a=a&b=b', 404)).error.code, 'NOT_FOUND');

    const retired = { ...finding, finding_id: 'analytics:main:install:retired', status: 'resolved', change_point: { ...finding.change_point, run_id: 'retired' } };
    await db.collection('findings').insertOne(retired);
    // A owns the settings endpoint: save assumptions directly, then exercise B's
    // actual recomputation hook instead of inventing an endpoint for this smoke.
    await db.collection('projects').updateOne({ project_id }, { $set: { assumptions: { ...rates, engineer_cost_per_hour_usd: 80, blocking_fraction: 0.6 } } });
    assert.equal(await engine.recomputeCosts(project_id), 1);
    const changed = (await get('/api/findings/latest?project_id=analytics')).finding;
    assert.equal(changed.cost.engineer_cost_usd_per_week, 186.67);
    assert.equal(changed.cost.total_cost_usd_per_week, 188.53);
    assert.equal(changed.cost.recovered_hours_per_week_if_reverted, 3.89);
    assert.equal((await engine.getFinding(retired.finding_id)).cost.total_cost_usd_per_week, 118.53);
    const event = events.at(-1);
    assert.equal(event.name, 'finding.updated');
    assert.equal(event.finding.llm.source, 'template');
    assert.equal(event.finding.cost.total_cost_usd_per_week, 188.53);
    assert.equal('_id' in event.finding, false);
    console.table([
      { comparison: 'typical 10/5', delta_ms: typical.total.delta_ms },
      { comparison: 'individual runs', delta_ms: runs.total.delta_ms },
      { comparison: 'reversed runs', delta_ms: reversed.total.delta_ms },
    ]);
    console.table([
      { assumptions: 'initial', engineer_usd_per_week: finding.cost.engineer_cost_usd_per_week, total_usd_per_week: finding.cost.total_cost_usd_per_week },
      { assumptions: 'updated', engineer_usd_per_week: changed.cost.engineer_cost_usd_per_week, total_usd_per_week: changed.cost.total_cost_usd_per_week },
    ]);
    console.log('PASS: persisted costs, assumptions recomputation, and both real comparison HTTP modes verified using the configured database.');
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
  else console.error(`Verification failed (${error.name ?? 'Error'}, code ${error.code ?? 'unknown'}). Check Atlas connectivity and permissions for the disposable database.`);
}
