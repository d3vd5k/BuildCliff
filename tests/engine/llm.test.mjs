import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateExplanation} from '../../backend/src/engine/llm.mjs';

const high = JSON.parse(await readFile(new URL('../../mocks/finding_high.json', import.meta.url), 'utf8'));
const low = JSON.parse(await readFile(new URL('../../mocks/finding_low.json', import.meta.url), 'utf8'));
const commit = {...high.suspects[0], diff_summary: 'Updates the browser package and regenerates its lockfile.'};
const response = content => ({ok: true, json: async () => ({choices: [{message: {content}}]})});
const assertExplanation = (result, source) => {
  assert.deepEqual(Object.keys(result).sort(), ['suggested_fix', 'channel_summary', 'source', 'generated_at'].sort());
  assert.equal(result.source, source);
  assert.ok(result.suggested_fix.trim());
  assert.ok(result.channel_summary.trim());
  assert.ok(result.generated_at instanceof Date);
};

test('missing API key produces a concrete dependency revert and cache template', async () => {
  const result = await generateExplanation(high, commit, {apiKey: '', fetch: () => {throw new Error('Must not fetch');}});
  assertExplanation(result, 'template');
  assert.match(result.suggested_fix, /puppeteer.*22\.0\.0.*21\.0\.0/);
  assert.match(result.suggested_fix, /cache/i);
  assert.match(result.channel_summary, /70s.*270s/);
  assert.match(result.channel_summary, /strongest suspect/);
  assert.match(result.channel_summary, /confirm with a controlled revert/);
});

test('ambiguous and missing-commit templates do not claim a culprit', async () => {
  const ambiguous = await generateExplanation(low, low.suspects[0], {apiKey: ''});
  assertExplanation(ambiguous, 'template');
  assert.match(ambiguous.suggested_fix, /Do not assume/);
  assert.match(ambiguous.channel_summary, /3 candidate.*Low confidence/);
  const noCommits = {...high, commits_in_range: 0, suspects: [], culprit_sha: null, confidence: {level: 'Low'}};
  const missing = await generateExplanation(noCommits, commit, {apiKey: ''});
  assert.match(missing.channel_summary, /No commit data.*cause is unknown/);
  assert.match(missing.suggested_fix, /Collect the commits/);
  assert.doesNotMatch(missing.channel_summary, /a3f9c1d/);
});

test('OpenAI-compatible success sends bounded evidence and accepts explanation only', async () => {
  let request;
  const findingBefore = structuredClone(high);
  const result = await generateExplanation(high, {...commit, diff_summary: 'x'.repeat(12000), secret_extra: 'not-selected'}, {
    apiKey: 'test-key', baseUrl: 'https://provider.example/v1/', model: 'chosen-model', timeoutMs: 500,
    fetch: async (url, options) => {
      request = {url, ...options, body: JSON.parse(options.body)};
      return response(JSON.stringify({suggested_fix: ' Revert the dependency in an isolated run. ', channel_summary: ' install gained 200s; validate the suspect. ', culprit_sha: 'untrusted', suspects: [], confidence: {level: 'High'}, source: 'untrusted', generated_at: 'yesterday'}));
    },
  });
  assertExplanation(result, 'llm');
  assert.equal(result.suggested_fix, 'Revert the dependency in an isolated run.');
  assert.equal(request.url, 'https://provider.example/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.equal(request.body.model, 'chosen-model');
  assert.deepEqual(request.body.response_format, {type: 'json_object'});
  assert.ok(request.signal instanceof AbortSignal);
  const evidence = JSON.parse(request.body.messages[1].content);
  assert.equal(evidence.step, 'install');
  assert.equal(evidence.top_suspect.diff_summary.length, 2000);
  assert.equal(evidence.top_suspect.dep_changes[0].name, 'puppeteer');
  assert.equal(evidence.top_suspect.secret_extra, undefined);
  assert.equal(evidence.cost, undefined);
  assert.deepEqual(high, findingBefore);
});

test('a full completions URL is used without duplicating the path', async () => {
  let requested;
  await generateExplanation(high, commit, {apiKey: 'test', baseUrl: 'https://provider.example/v1/chat/completions', fetch: async url => {
    requested = url;
    return response('{"suggested_fix":"Test a dependency revert.","channel_summary":"Timing increased; validate with reruns."}');
  }});
  assert.equal(requested, 'https://provider.example/v1/chat/completions');
});

test('provider errors, malformed responses, and empty fields all fall back', async t => {
  const providers = {
    network: async () => {throw new Error('Network failure');},
    http: async () => ({ok: false, status: 429}),
    invalidEnvelope: async () => ({ok: true, json: async () => ({choices: []})}),
    invalidJson: async () => response('not JSON'),
    emptyFix: async () => response('{"suggested_fix":" ","channel_summary":"Measured change."}'),
    emptySummary: async () => response('{"suggested_fix":"Revert.","channel_summary":""}'),
    wrongType: async () => response('{"suggested_fix":12,"channel_summary":"Measured change."}'),
    nullObject: async () => response('null'),
    brokenBody: async () => ({ok: true, json: async () => {throw new Error('Body failed');}}),
  };
  for (const [name, fetch] of Object.entries(providers)) await t.test(name, async () => {
    const result = await generateExplanation(high, commit, {apiKey: 'test', fetch});
    assertExplanation(result, 'template');
    assert.match(result.suggested_fix, /puppeteer/);
  });
});

test('deadline falls back and aborts even when injected fetch ignores its signal', async () => {
  let signal;
  const result = await generateExplanation(high, commit, {apiKey: 'test', timeoutMs: 5, fetch: (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }});
  assertExplanation(result, 'template');
  assert.equal(signal.aborted, true);
});

test('deadline also covers a response body that never resolves', async () => {
  const result = await generateExplanation(high, commit, {apiKey: 'test', timeoutMs: 5, fetch: async () => ({ok: true, json: () => new Promise(() => {})})});
  assertExplanation(result, 'template');
});
