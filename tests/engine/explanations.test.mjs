import test from 'node:test';
import assert from 'node:assert/strict';
import high from '../../mocks/finding_high.json' with { type: 'json' };
import { createExplanationWorker } from '../../backend/src/engine/explanations.mjs';
import { documentDb } from './helpers/documents.mjs';

const finding = extra => ({ ...structuredClone(high), _id: 'generation-1', llm: null, ...extra });
const response = label => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ suggested_fix: `${label} experiment`, channel_summary: `${label} observation` }) } }] }) });

test('slow explanations do not hold scheduling; shared factories deduplicate paid work and publish current state', async t => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve());
  const tables = { findings: [finding()], commits: [] };
  const db = documentDb(tables);
  const events = [];
  let requests = 0;
  const options = { db, emit: (name, data) => events.push({ name, data }), llm: {
    apiKey: 'unit-test-key', timeoutMs: 1000,
    fetch: async () => { requests++; entered.resolve(); await release.promise; return response('completed'); },
  } };
  const worker = createExplanationWorker(options);
  const second = createExplanationWorker(options);
  assert.equal(worker.schedule(tables.findings[0]), true);
  await entered.promise;
  assert.equal(tables.findings[0].llm, null);
  assert.equal(second.schedule(tables.findings[0]), false);
  assert.equal(await second.resume(high.project_id), 0);
  tables.findings[0].status = 'resolved';
  tables.findings[0].cost = { total_cost_usd_per_week: 123 };
  release.resolve();
  await second.drain();
  assert.equal(requests, 1, 'multiple same-Db factories must not spend credits for duplicate work');
  assert.equal(tables.findings[0].llm.source, 'llm');
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'finding.updated');
  assert.equal(events[0].data.status, 'resolved');
  assert.equal(events[0].data.cost.total_cost_usd_per_week, 123);
  assert.equal('_id' in events[0].data, false);
  assert.equal(events[0].data.culprit_sha, high.culprit_sha);
  assert.deepEqual(events[0].data.suspects, high.suspects);
});

test('an old response cannot overwrite a reset/recreated finding with the same public ID', async t => {
  const entered = Promise.withResolvers();
  const oldResponse = Promise.withResolvers();
  const published = Promise.withResolvers();
  t.after(() => oldResponse.resolve());
  const tables = { findings: [finding()], commits: [] };
  const events = [];
  let requests = 0;
  const worker = createExplanationWorker({
    db: documentDb(tables), emit: (name, data) => { events.push({ name, data }); published.resolve(); },
    llm: { apiKey: 'unit-test-key', timeoutMs: 1000, fetch: async () => {
      requests++;
      if (requests === 1) { entered.resolve(); await oldResponse.promise; return response('old'); }
      return response('new');
    } },
  });
  worker.schedule(tables.findings[0]);
  await entered.promise;
  tables.findings.splice(0, 1, finding({ _id: 'generation-2' }));
  worker.schedule(tables.findings[0]);
  await published.promise;
  oldResponse.resolve();
  await worker.drain();
  assert.equal(tables.findings[0]._id, 'generation-2');
  assert.equal(tables.findings[0].llm.suggested_fix, 'new experiment');
  assert.equal(events.length, 1, 'the discarded generation must not publish another update');
});

test('startup resumption fills persisted null explanations, respects project scope, and leaves completed work alone', async () => {
  const completed = { source: 'template', suggested_fix: 'existing', channel_summary: 'existing', generated_at: new Date(0) };
  const tables = { findings: [
    finding(), finding({ _id: 'resolved', finding_id: 'resolved', status: 'resolved' }),
    finding({ _id: 'other', project_id: 'other', finding_id: 'other' }),
    finding({ _id: 'done', finding_id: 'done', llm: completed }),
  ], commits: [] };
  const worker = createExplanationWorker({ db: documentDb(tables), llm: { apiKey: '' } });
  assert.equal(await worker.resume(high.project_id), 2);
  await worker.drain();
  assert.equal(tables.findings[0].llm.source, 'template');
  assert.equal(tables.findings[1].llm.source, 'template');
  assert.equal(tables.findings[2].llm, null);
  assert.deepEqual(tables.findings[3].llm, completed);
  assert.equal(await worker.resume(), 1);
  await worker.drain();
  assert.equal(tables.findings[2].llm.source, 'template');
  assert.equal(await worker.resume(), 0);
});

test('a response cannot replace an explanation already completed by another process', async t => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve());
  const tables = { findings: [finding()], commits: [] };
  const events = [];
  const worker = createExplanationWorker({ db: documentDb(tables), emit: (...event) => events.push(event), llm: {
    apiKey: 'unit-test-key', timeoutMs: 1000,
    fetch: async () => { entered.resolve(); await release.promise; return response('late'); },
  } });
  worker.schedule(tables.findings[0]);
  await entered.promise;
  const winner = { source: 'llm', suggested_fix: 'winning experiment', channel_summary: 'winning observation', generated_at: new Date() };
  tables.findings[0].llm = winner;
  release.resolve();
  await worker.drain();
  assert.deepEqual(tables.findings[0].llm, winner);
  assert.deepEqual(events, []);
});

test('failed persistence stays recoverable and is surfaced by drain instead of being silently swallowed', async t => {
  t.mock.method(console, 'error', () => {});
  const tables = { findings: [finding()], commits: [] };
  const unavailable = new Error('synthetic write outage');
  let fail = true;
  const worker = createExplanationWorker({
    db: documentDb(tables, { beforeWrite: () => { if (fail) throw unavailable; } }), llm: { apiKey: '' },
  });
  await worker.resume();
  await assert.rejects(worker.drain(), error => error === unavailable);
  assert.equal(tables.findings[0].llm, null);
  fail = false;
  assert.equal(await worker.resume(), 1);
  await worker.drain();
  assert.equal(tables.findings[0].llm.source, 'template');
});

test('publication failure does not erase saved output or regenerate paid work', async t => {
  t.mock.method(console, 'error', () => {});
  const tables = { findings: [finding()], commits: [] };
  const unavailable = new Error('synthetic publication outage');
  const worker = createExplanationWorker({ db: documentDb(tables), llm: { apiKey: '' }, emit: () => { throw unavailable; } });
  await worker.resume();
  await assert.rejects(worker.drain(), error => error === unavailable);
  assert.equal(tables.findings[0].llm.source, 'template');
  assert.equal(await worker.resume(), 0);
  await worker.drain();
});
