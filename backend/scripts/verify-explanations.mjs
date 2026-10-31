import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { MongoClient } from 'mongodb';
import { createEngine } from '../src/engine/index.mjs';
import { createAnalyticsHandler } from '../src/routes/analytics.mjs';

function checkExplanation(explanation, serialized = false) {
  assert.ok(explanation, 'A persisted live explanation is required.');
  assert.deepEqual(Object.keys(explanation).sort(), ['channel_summary', 'generated_at', 'source', 'suggested_fix']);
  assert.equal(explanation.source, 'llm', 'Template fallback is not a successful live Gateway smoke.');
  assert.equal(typeof explanation.suggested_fix, 'string');
  assert.ok(explanation.suggested_fix.trim().length > 0 && explanation.suggested_fix.length <= 1600);
  assert.equal(typeof explanation.channel_summary, 'string');
  assert.ok(explanation.channel_summary.trim().length > 0 && explanation.channel_summary.length <= 800);
  if (serialized) assert.equal(typeof explanation.generated_at, 'string');
  else assert.ok(explanation.generated_at instanceof Date);
  assert.ok(Number.isFinite(new Date(explanation.generated_at).getTime()));
}

// JSON normalizes MongoDB Date fields and HTTP date strings identically.
function facts(finding) {
  const { _id, llm, ...deterministic } = finding;
  return JSON.parse(JSON.stringify(deterministic));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim() || !process.env.AI_GATEWAY_API_KEY?.trim()) {
    console.error('Missing required MONGODB_URI and/or AI_GATEWAY_API_KEY. Set both privately in your local .env. This smoke requires Atlas and Vercel AI Gateway; no local database or template fallback is accepted.');
    process.exitCode = 1;
    return;
  }
  const model = process.env.AI_GATEWAY_MODEL ?? 'openai/gpt-5-nano';
  const databaseName = `buildcliff_verify_${crypto.randomUUID().replaceAll('-', '')}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  let db;
  let server;
  let engine;
  let gatewayRequests = 0;
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    db = client.db(databaseName);
    console.log(`Connected using configured Atlas URI. Disposable verification database: ${databaseName}`);
    console.log(`Live Vercel AI Gateway model: ${model}. At most one application request; no application-level retries.`);
    const events = [];
    engine = createEngine({
      db,
      emit: (name, finding) => events.push({ name, finding: structuredClone(finding) }),
      // Observe real native fetch, keeping default Gateway model/key/timeout configuration.
      llm: { fetch: (url, options) => {
        assert.equal(String(url), 'https://ai-gateway.vercel.sh/v1/chat/completions');
        assert.equal(gatewayRequests, 0, 'Only one paid explanation request is allowed.');
        gatewayRequests++;
        return fetch(url, options);
      } },
    });
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
    async function get(path) {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) });
      if (requestError) throw requestError;
      assert.equal(response.status, 200);
      return response.json();
    }
    const project_id = 'explanation-smoke';
    const start = Date.now() - 86400000;
    const at = n => new Date(start + n * 60000);
    const sha = n => n.toString(16).padStart(40, '0');
    const step = (name, duration_ms) => ({ name, duration_ms, status: 'success' });
    await db.collection('projects').insertOne({
      project_id, default_branch: 'main',
      assumptions: { runner_cost_per_min_usd: 0.008, engineer_cost_per_hour_usd: 60, blocking_fraction: 0.5 },
    });
    await db.collection('commits').insertMany([
      { project_id, sha: sha(1), parent: null, author: 'Synthetic A', message: 'Baseline', committed_at: at(-1), files_changed: [], dep_changes: [] },
      { project_id, sha: sha(2), parent: sha(1), author: 'Synthetic B', message: 'Upgrade browser dependency', committed_at: at(9.5), files_changed: ['package-lock.json'], dep_changes: [{ name: 'puppeteer', from: '21.11.0', to: '22.0.0' }] },
    ]);
    await db.collection('runs').insertMany(Array.from({ length: 15 }, (_, n) => ({
      project_id, branch: 'main', run_id: `run_${String(n).padStart(4, '0')}`, status: 'success',
      commit_sha: sha(n < 10 ? 1 : 2), started_at: at(n), demo_replay: false,
      steps: [step('checkout', 8000), step('install', n < 10 ? 70000 : 270000), step('build', 95000), step('test', 120000), step('deploy', 30000)],
    })));

    const began = Date.now();
    const started = performance.now();
    assert.deepEqual(await engine.detect(project_id), { created: 1, updated: 0 });
    const detectionElapsed = performance.now() - started;
    const created = events.filter(event => event.name === 'finding.created');
    assert.equal(created.length, 1);
    const initial = created[0].finding;
    assert.equal(initial.llm, null, 'finding.created must expose the pending explanation state.');
    assert.equal(initial.before_ms, 70000);
    assert.equal(initial.after_ms, 270000);
    assert.equal(initial.delta_ms, 200000);
    assert.equal(initial.runs_before, 10);
    assert.equal(initial.runs_after, 5);
    assert.equal(initial.commits_in_range, 1);
    assert.equal(initial.suspects[0].sha, sha(2));
    assert.equal(initial.culprit_sha, sha(2));
    // Do not require an immediate GET to remain null: a fast provider may finish already.
    await engine.drainExplanations();
    const elapsed = performance.now() - started;
    const stored = await db.collection('findings').findOne({ finding_id: initial.finding_id });
    assert.ok(stored);
    checkExplanation(stored.llm);
    assert.ok(stored.llm.generated_at.getTime() >= began && stored.llm.generated_at.getTime() <= Date.now());
    assert.deepEqual(facts(stored), facts(initial), 'Explanations must not change facts, ranking, confidence, cost, or timings.');
    assert.equal(gatewayRequests, 1);
    const latest = await get(`/api/findings/latest?project_id=${project_id}`);
    assert.equal(latest.has_active_regression, true);
    const byId = await get(`/api/findings/${encodeURIComponent(initial.finding_id)}`);
    for (const finding of [latest.finding, byId]) {
      checkExplanation(finding.llm, true);
      assert.deepEqual(facts(finding), facts(initial));
      assert.deepEqual(finding.llm, JSON.parse(JSON.stringify(stored.llm)));
    }
    const updates = events.filter(event => event.name === 'finding.updated');
    assert.equal(updates.length, 1);
    checkExplanation(updates[0].finding.llm);
    assert.deepEqual(facts(updates[0].finding), facts(initial));
    assert.deepEqual(updates[0].finding.llm, stored.llm);

    assert.deepEqual(await engine.detect(project_id), { created: 0, updated: 0 });
    await engine.drainExplanations();
    assert.equal(gatewayRequests, 1, 'Repeated detection must not regenerate a completed explanation.');
    const repeated = await db.collection('findings').findOne({ finding_id: initial.finding_id });
    assert.deepEqual(repeated, stored);
    assert.equal(events.filter(event => event.name === 'finding.created').length, 1);
    assert.equal(events.filter(event => event.name === 'finding.updated').length, 1);
    console.log(`Detection returned in ${detectionElapsed.toFixed(0)} ms; detection plus drained explanation: ${elapsed.toFixed(0)} ms; model: ${model}.`);
    console.log(`Suggested fix: ${stored.llm.suggested_fix}`);
    console.log(`Channel summary: ${stored.llm.channel_summary}`);
    console.log('PASS: real Atlas persistence, real Gateway explanation, pending/updated engine events, actual analytics HTTP reads, deterministic evidence preservation, and repeat-detection deduplication.');
    console.log('Not exercised: A-owned ingest, production server/SSE transport, or C UI. Events above use the engine emit callback.');
  } finally {
    // Settle provider/database work before shutting down its resources, even on assertion failure.
    try {
      if (engine) await engine.drainExplanations();
    } finally {
      try {
        if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } finally {
        try {
          if (db) {
            await db.dropDatabase();
            console.log(`Removed disposable verification database: ${databaseName}`);
          }
        } finally {
          await client.close();
        }
      }
    }
  }
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  if (error?.code === 'ERR_ASSERTION') console.error(`Explanation smoke assertion failed: ${error.message}`);
  else console.error('Explanation smoke failed. Check private Atlas/Gateway credentials, Atlas permissions, model availability, and network connectivity. Error details are suppressed to protect secrets.');
}
