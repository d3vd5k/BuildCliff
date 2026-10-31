import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateExplanation } from '../src/engine/llm.mjs';

function checkExplanation(explanation, startedAt, finishedAt) {
  assert.deepEqual(Object.keys(explanation).sort(), ['channel_summary', 'generated_at', 'source', 'suggested_fix']);
  assert.equal(explanation.source, 'llm', 'Live Gateway explanation required; template fallback is not a successful smoke.');
  assert.equal(typeof explanation.suggested_fix, 'string');
  assert.ok(explanation.suggested_fix.trim().length > 0 && explanation.suggested_fix.length <= 1600);
  assert.equal(typeof explanation.channel_summary, 'string');
  assert.ok(explanation.channel_summary.trim().length > 0 && explanation.channel_summary.length <= 800);
  assert.ok(explanation.generated_at instanceof Date);
  assert.ok(Number.isFinite(explanation.generated_at.getTime()));
  assert.ok(explanation.generated_at.getTime() >= startedAt && explanation.generated_at.getTime() <= finishedAt);
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    console.error('Missing AI_GATEWAY_API_KEY. Set it privately in your local .env. This live smoke requires Vercel AI Gateway; no template fallback is accepted.');
    process.exitCode = 1;
    return;
  }
  const model = process.env.AI_GATEWAY_MODEL ?? 'openai/gpt-5-nano';
  const sha = 'a'.repeat(40);
  const topCommit = {
    sha, message: 'Upgrade browser dependency', files_changed: ['package-lock.json'],
    dep_changes: [{ name: 'puppeteer', from: '21.11.0', to: '22.0.0' }],
    diff_summary: 'Lockfile updates puppeteer from 21.11.0 to 22.0.0.',
  };
  const high = {
    step: 'install', before_ms: 70000, after_ms: 270000, delta_ms: 200000,
    delta_pct: 285.7, runs_before: 10, runs_after: 5, commits_in_range: 1,
    culprit_sha: sha, suspects: [{ ...topCommit, rank: 1, score: 100 }],
    confidence: { level: 'High', reasons: [{ code: 'SOLE_COMMIT', label: 'One candidate commit in the regression window.' }] },
  };
  const low = {
    ...structuredClone(high), commits_in_range: 3,
    suspects: [structuredClone(high.suspects[0]), ...['b', 'c'].map(id => ({ sha: id.repeat(40), rank: id === 'b' ? 2 : 3, score: 100, message: 'Change package cache configuration', dep_changes: [] }))],
    confidence: { level: 'Low', reasons: [{ code: 'MULTIPLE_CANDIDATES', label: 'Three plausible candidates; attribution is uncertain.' }] },
  };
  console.log(`Live Vercel AI Gateway smoke; model: ${model}. At most two application requests; no application-level retries.`);
  for (const [label, finding] of [['High confidence', high], ['Low confidence', low]]) {
    const originalFinding = structuredClone(finding);
    const originalCommit = structuredClone(topCommit);
    const startedAt = Date.now();
    const start = performance.now();
    const explanation = await generateExplanation(finding, topCommit);
    const elapsed = performance.now() - start;
    checkExplanation(explanation, startedAt, Date.now());
    assert.deepEqual(finding, originalFinding, 'Explanation must not mutate deterministic facts or ranking.');
    assert.deepEqual(topCommit, originalCommit, 'Explanation must not mutate commit evidence.');
    console.log(`\n${label}; model: ${model}; actual elapsed: ${elapsed.toFixed(0)} ms`);
    console.log(`Suggested fix: ${explanation.suggested_fix}`);
    console.log(`Channel summary: ${explanation.channel_summary}`);
  }
  console.log('\nPASS: two real Gateway explanations, bounded text, code-generated metadata, and unchanged deterministic evidence. Review the text above for quality and uncertainty.');
}

try {
  await main();
} catch (error) {
  process.exitCode = 1;
  if (error?.code === 'ERR_ASSERTION') console.error(`Gateway smoke assertion failed: ${error.message}`);
  else console.error('Gateway smoke failed. Check private Gateway credentials, model availability, and network connectivity. Error details are suppressed to protect secrets.');
}
