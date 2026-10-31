import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateExplanation} from '../../backend/src/engine/llm.mjs';

const finding = {
  step: 'install', before_ms: 70000, after_ms: 270000, delta_ms: 200000, delta_pct: 285.7,
  runs_before: 10, runs_after: 5, commits_in_range: 1, culprit_sha: 'a'.repeat(40),
  confidence: {level: 'High', reasons: [{code: 'DEP_MATCHES_STEP', label: 'Dependency changed in the affected step'}]},
  suspects: [{sha: 'a'.repeat(40), message: 'Update browser dependency', score: 92,
    dep_changes: [{name: 'puppeteer', from: '21.0.0', to: '22.0.0'}]}],
};
const commit = {...finding.suspects[0], diff_summary: 'Updates the browser package and regenerates its lockfile.'};
const validText = {suggested_fix: 'Compare an isolated dependency revert with the same runner and cache.', channel_summary: 'Install time increased; validate the top suspect with a controlled rerun.'};
const validContent = JSON.stringify(validText);
const response = (content = validContent, {finishReason = 'stop', refusal = null} = {}) => ({
  ok: true,
  json: async () => ({choices: [{message: {content, refusal}, finish_reason: finishReason}]}),
});
const assertExplanation = (result, source) => {
  assert.deepEqual(Object.keys(result).sort(), ['suggested_fix', 'channel_summary', 'source', 'generated_at'].sort());
  assert.equal(result.source, source);
  assert.ok(result.suggested_fix.trim());
  assert.ok(result.channel_summary.trim());
  assert.ok(result.generated_at instanceof Date);
  assert.ok(Number.isFinite(result.generated_at.getTime()));
};
const withoutTime = ({generated_at, ...result}) => result;

test('missing or blank credentials use the template without making a network request', async () => {
  for (const apiKey of ['', '   ']) {
    let requests = 0;
    const result = await generateExplanation(finding, commit, {apiKey, fetch: () => {
      requests++;
      throw new Error('Unexpected network request');
    }});
    assertExplanation(result, 'template');
    assert.equal(requests, 0);
  }
});

test('template output remains deterministic across uncertain or missing evidence without mutating facts', async () => {
  const scenarios = [
    {...finding, confidence: {level: 'Low'}, commits_in_range: 3},
    {...finding, confidence: {level: 'Medium'}},
    {...finding, commits_in_range: 2},
    {...finding, suspects: [], commits_in_range: 0, culprit_sha: null, confidence: {level: 'Low'}},
  ];
  for (const input of scenarios) {
    const before = structuredClone(input);
    const first = await generateExplanation(input, commit, {apiKey: ''});
    const second = await generateExplanation(input, commit, {apiKey: ''});
    assertExplanation(first, 'template');
    assert.deepEqual(withoutTime(first), withoutTime(second));
    if (!input.suspects.length) assert.ok(!first.channel_summary.includes(commit.sha.slice(0, 7)));
    assert.deepEqual(input, before);
  }
});

test('valid complete schema yields only explanatory text and code-owned metadata without mutating attribution', async () => {
  const beforeFinding = structuredClone(finding);
  const beforeCommit = structuredClone(commit);
  const start = Date.now();
  const result = await generateExplanation(finding, commit, {apiKey: 'test-only', fetch: async () => response(JSON.stringify({
    suggested_fix: ` ${validText.suggested_fix} `,
    channel_summary: ` ${validText.channel_summary} `,
  }))});
  assertExplanation(result, 'llm');
  assert.ok(result.generated_at.getTime() >= start && result.generated_at.getTime() <= Date.now());
  assert.deepEqual(finding, beforeFinding);
  assert.deepEqual(commit, beforeCommit);
});

test('request enforces strict two-text output with bounded nano reasoning and completion budget', async () => {
  let request;
  await generateExplanation(finding, commit, {apiKey: 'test-only', fetch: async (_url, options) => {
    request = JSON.parse(options.body);
    return response();
  }});
  assert.equal(request.reasoning_effort, 'minimal');
  assert.ok(Number.isInteger(request.max_completion_tokens));
  assert.ok(request.max_completion_tokens >= 1024 && request.max_completion_tokens <= 4096);
  assert.equal(Object.hasOwn(request, 'temperature'), false);
  assert.equal(Object.hasOwn(request, 'max_tokens'), false);
  assert.equal(request.response_format.type, 'json_schema');
  const {strict, schema} = request.response_format.json_schema;
  assert.equal(strict, true);
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.toSorted(), ['channel_summary', 'suggested_fix']);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['channel_summary', 'suggested_fix']);
  for (const property of Object.values(schema.properties)) {
    assert.equal(property.type, 'string');
    assert.ok(property.maxLength > 0 && property.maxLength <= 2000);
  }
});

test('evidence is selected, size-bounded, and cannot include arbitrary fields or override the ranked suspect', async () => {
  const excluded = 'excluded-private-value';
  const input = structuredClone(finding);
  input.step = 's'.repeat(2000) + excluded;
  input.raw_logs = excluded;
  input.before_ms = excluded.repeat(1000);
  input.confidence.level = excluded;
  input.confidence.secret = excluded;
  input.confidence.reasons = Array.from({length: 30}, () => ({code: 'c'.repeat(1000) + excluded, label: 'l'.repeat(1000) + excluded, secret: excluded}));
  input.suspects[0].message = 'm'.repeat(1000) + excluded;
  input.suspects[0].secret = excluded;
  input.suspects[0].dep_changes = Array.from({length: 30}, () => ({name: 'd'.repeat(1000) + excluded, from: 'f'.repeat(1000) + excluded, to: 't'.repeat(1000) + excluded, secret: excluded}));
  input.suspects.push({sha: 'b'.repeat(40), message: excluded});
  const fullCommit = {...commit, message: excluded, secret: excluded, diff_summary: 'x'.repeat(12000) + excluded};
  const before = structuredClone(input);
  let evidence;
  const result = await generateExplanation(input, fullCommit, {apiKey: 'test-only', fetch: async (_url, options) => {
    const request = JSON.parse(options.body);
    const serialized = request.messages.find(message => message.role === 'user').content;
    assert.ok(serialized.length < 12000);
    assert.equal(serialized.includes(excluded), false);
    evidence = JSON.parse(serialized);
    return response();
  }});
  assertExplanation(result, 'llm');
  assert.equal(evidence.before_ms, null);
  assert.ok(evidence.step.length <= 80);
  assert.equal(evidence.top_suspect.sha, finding.suspects[0].sha);
  assert.ok(evidence.top_suspect.message.length <= 240);
  assert.ok(evidence.top_suspect.diff_summary.length <= 2000);
  assert.ok(evidence.top_suspect.dep_changes.length <= 8);
  assert.ok(evidence.confidence.reasons.length <= 8);
  for (const dep of evidence.top_suspect.dep_changes) {
    assert.ok(dep.name.length <= 120 && dep.from.length <= 80 && dep.to.length <= 80);
  }
  for (const reason of evidence.confidence.reasons) assert.ok(reason.code.length <= 80 && reason.label.length <= 240);
  assert.deepEqual(input, before);
});

test('an unrelated full commit cannot replace or enrich the deterministic top suspect', async () => {
  let evidence;
  await generateExplanation(finding, {sha: 'b'.repeat(40), diff_summary: 'unselected-diff'}, {apiKey: 'test-only', fetch: async (_url, options) => {
    evidence = JSON.parse(JSON.parse(options.body).messages.find(message => message.role === 'user').content);
    return response();
  }});
  assert.equal(evidence.top_suspect.sha, finding.suspects[0].sha);
  assert.equal(evidence.top_suspect.diff_summary, null);
});

test('provider failures and invalid, refused, truncated, or oversized output use the same deterministic fallback', async t => {
  const fallback = await generateExplanation(finding, commit, {apiKey: ''});
  const providers = {
    network: async () => {throw new Error('Network failure');},
    rateLimited: async () => ({ok: false, status: 429}),
    serverError: async () => ({ok: false, status: 500}),
    invalidEnvelope: async () => ({ok: true, json: async () => ({choices: []})}),
    brokenBody: async () => ({ok: true, json: async () => {throw new Error('Body failed');}}),
    invalidJson: async () => response('not JSON'),
    missingContent: async () => response(null),
    emptyFix: async () => response(JSON.stringify({...validText, suggested_fix: ' '})),
    emptySummary: async () => response(JSON.stringify({...validText, channel_summary: ''})),
    wrongFixType: async () => response(JSON.stringify({...validText, suggested_fix: 12})),
    wrongSummaryType: async () => response(JSON.stringify({...validText, channel_summary: {text: 'Unexpected object'}})),
    missingField: async () => response(JSON.stringify({suggested_fix: 'Compare runs.'})),
    nullObject: async () => response('null'),
    array: async () => response('[]'),
    refusal: async () => response(validContent, {refusal: 'Cannot comply'}),
    truncation: async () => response(validContent, {finishReason: 'length'}),
    contentFilter: async () => response(validContent, {finishReason: 'content_filter'}),
    toolCall: async () => response(validContent, {finishReason: 'tool_calls'}),
    missingFinishReason: async () => response(validContent, {finishReason: null}),
    oversizedFix: async () => response(JSON.stringify({...validText, suggested_fix: 'x'.repeat(1601)})),
    oversizedSummary: async () => response(JSON.stringify({...validText, channel_summary: 'x'.repeat(801)})),
    oversizedContent: async () => response(' '.repeat(20001) + validContent),
  };
  for (const [field, value] of Object.entries({culprit_sha: 'untrusted', suspects: [], confidence: {level: 'High'}, source: 'llm', generated_at: 'yesterday', extra: 'untrusted'})) {
    providers[`extra_${field}`] = async () => response(JSON.stringify({...validText, [field]: value}));
  }
  for (const [name, fetch] of Object.entries(providers)) await t.test(name, async () => {
    const before = structuredClone(finding);
    const result = await generateExplanation(finding, commit, {apiKey: 'test-only', fetch});
    assertExplanation(result, 'template');
    assert.deepEqual(withoutTime(result), withoutTime(fallback));
    assert.deepEqual(finding, before);
  });
});

test('deadline aborts stalled headers even when the transport ignores its signal', async () => {
  let signal;
  const result = await generateExplanation(finding, commit, {apiKey: 'test-only', timeoutMs: 10, fetch: (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }});
  assertExplanation(result, 'template');
  assert.equal(signal.aborted, true);
});

test('the same deadline covers stalled response bodies and aborts the transport', async () => {
  let signal;
  const result = await generateExplanation(finding, commit, {apiKey: 'test-only', timeoutMs: 10, fetch: async (_url, options) => {
    signal = options.signal;
    return {ok: true, json: () => new Promise(() => {})};
  }});
  assertExplanation(result, 'template');
  assert.equal(signal.aborted, true);
});

test('provider errors cancel unread HTTP bodies rather than leaving the connection open', {timeout: 3000}, async t => {
  const disconnected = Promise.withResolvers();
  const server = createServer((_request, response) => {
    response.once('close', () => disconnected.resolve());
    response.writeHead(503, {'content-type': 'text/plain'});
    response.write('Unavailable; intentionally unfinished response body');
  });
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const result = await generateExplanation(finding, commit, {
    apiKey: 'test-only',
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    timeoutMs: 50,
  });
  assertExplanation(result, 'template');
  await disconnected.promise;
});
