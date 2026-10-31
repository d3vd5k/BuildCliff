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
    engine = createEngine({ db, llm: { apiKey: '' } });
    const handler = createAnalyticsHandler(engine);
    let requestError;
    server = createServer(async (request, response) => {
      try {
        if (!(await handler(request, response))) {
          response.writeHead(404);
          response.end();
        }
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
    const sha = n => n.toString(16).padStart(40, '0');
    const start = Date.now() - 24 * 60 * 60 * 1000;
    const at = n => new Date(start + n * 60_000);
    const commit = (project_id, n, parent, extra = {}) => ({
      project_id, sha: sha(n), parent: parent === null ? null : sha(parent),
      committed_at: at(parent === null ? -1 : 9 + (n % 10) / 10), author: 'Step 4 verification', message: `Synthetic commit ${n}`,
      files_changed: [], dep_changes: [], lines_changed: 0, diff_summary: null, demo_replay: false,
      ...extra,
    });
    const strongEvidence = {
      files_changed: ['package-lock.json', 'Dockerfile'],
      dep_changes: [{ name: 'puppeteer', from: '21.0.0', to: '22.0.0' }],
    };
    const scenarios = [
      {
        project_id: 'clear', before: 1, after: 2, candidates: 1, confidence: 'High',
        commits: [
          commit('clear', 1, null), commit('clear', 2, 1, strongEvidence),
          // Strong but unrelated: a timestamp is not a proven suspect range.
          commit('clear', 3, 1, strongEvidence),
        ],
      },
      {
        project_id: 'ambiguous', before: 11, after: 14, candidates: 3, confidence: 'Low',
        commits: [
          commit('ambiguous', 11, null), commit('ambiguous', 12, 11, strongEvidence),
          commit('ambiguous', 13, 12, strongEvidence), commit('ambiguous', 14, 13, strongEvidence),
        ],
      },
      { project_id: 'missing', before: 21, after: 22, candidates: 0, confidence: 'Low', commits: [] },
      {
        project_id: 'incomplete', before: 31, after: 33, candidates: 0, confidence: 'Low',
        commits: [commit('incomplete', 31, null), commit('incomplete', 33, 32, strongEvidence)],
      },
    ];
    const results = [];
    for (const scenario of scenarios) {
      const { project_id } = scenario;
      await db.collection('projects').insertOne({
        project_id, default_branch: 'main',
        assumptions: { runner_cost_per_min_usd: 0.008, engineer_cost_per_hour_usd: 60, blocking_fraction: 0.5 },
      });
      if (scenario.commits.length) await db.collection('commits').insertMany(scenario.commits);
      await db.collection('runs').insertMany(Array.from({ length: 15 }, (_, n) => ({
        project_id, branch: 'main', run_id: `${project_id}_${String(n).padStart(4, '0')}`,
        commit_sha: sha(n < 10 ? scenario.before : scenario.after), started_at: at(n),
        status: 'success', demo_replay: false,
        steps: [{ name: 'install', duration_ms: n < 10 ? 70000 : 270000 }],
      })));
      assert.deepEqual(await engine.detect(project_id), { created: 1, updated: 0 });
      const latest = await fetch(`${base}/api/findings/latest?project_id=${project_id}&step=install`);
      if (requestError) throw requestError;
      assert.equal(latest.status, 200);
      const payload = await latest.json();
      assert.equal(payload.has_active_regression, true);
      const finding = payload.finding;
      assert.equal(finding.confidence.level, scenario.confidence, project_id);
      assert.equal(finding.commits_in_range, scenario.candidates, project_id);
      assert.equal(finding.suspects.length, scenario.candidates, project_id);
      assert.equal(finding.change_point.run_id, `${project_id}_0010`);
      assert.equal('_id' in finding, false);
      if (project_id === 'clear') assert.equal(finding.culprit_sha, sha(2));
      if (project_id === 'ambiguous') {
        assert.deepEqual(finding.suspects.map(suspect => suspect.sha), [sha(12), sha(13), sha(14)]);
        assert.ok(finding.confidence.reasons.some(reason => reason.code === 'SMALL_SCORE_MARGIN' && reason.polarity === 'negative'));
      }
      if (!scenario.candidates) {
        assert.equal(finding.culprit_sha, null);
        assert.ok(finding.confidence.reasons.some(reason => reason.code === 'NO_COMMIT_DATA'));
      }
      const byId = await fetch(`${base}/api/findings/${encodeURIComponent(finding.finding_id)}`);
      assert.equal(byId.status, 200);
      assert.equal((await byId.json()).finding_id, finding.finding_id);
      assert.deepEqual(await engine.detect(project_id), { created: 0, updated: 0 });
      assert.equal(await db.collection('findings').countDocuments({ project_id }), 1);
      results.push({ scenario: project_id, candidates: scenario.candidates, confidence: finding.confidence.level, score: finding.confidence.score });
    }
    console.table(results);
    console.log('PASS: persisted attribution/confidence and real findings HTTP responses verified using the configured database.');
  } finally {
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      try { await engine?.drainExplanations(); }
      finally {
        if (db) {
          await db.dropDatabase();
          console.log(`Removed disposable verification database: ${databaseName}`);
        }
      }
    } finally {
      await client.close();
    }
  }
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  // Driver errors can contain connection details; never print the URI, raw
  // provider error, or stack. Assertion messages contain synthetic fixture data.
  if (error.code === 'ERR_ASSERTION') console.error(error.message);
  else console.error(`Verification failed (${error.name ?? 'Error'}, code ${error.code ?? 'unknown'}). Check Atlas connectivity and permissions for the disposable database.`);
}
