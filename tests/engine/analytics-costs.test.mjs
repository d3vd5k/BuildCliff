import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCost, createCosts } from '../../backend/src/engine/costs.mjs';
import { documentDb } from './helpers/documents.mjs';

const rates = { runner_cost_per_min_usd: 0.008, engineer_cost_per_hour_usd: 60, blocking_fraction: 0.5 };
const NOW = Date.UTC(2026, 9, 31, 12);
const FORTNIGHT = 14 * 24 * 60 * 60 * 1000;

test('costs use full-precision intermediate hours rather than rounded displayed hours', () => {
  const cost = calculateCost(200000, 70, rates);
  assert.equal(cost.extra_ci_hours_per_week, 3.89);
  assert.equal(cost.engineer_wait_hours_per_week, 1.94);
  assert.equal(cost.engineer_cost_usd_per_week, 116.67);
  assert.equal(cost.runner_cost_usd_per_week, 1.87);
  assert.equal(cost.total_cost_usd_per_week, 118.53);
  assert.equal(cost.recovered_hours_per_week_if_reverted, 3.89);
});

test('small positive waiting costs survive hour rounding, while zero rates and no activity remain zero', () => {
  const small = calculateCost(1000, 3, rates);
  assert.equal(small.extra_ci_hours_per_week, 0);
  assert.equal(small.engineer_cost_usd_per_week, 0.03);
  const free = calculateCost(200000, 70, { ...rates, runner_cost_per_min_usd: 0, blocking_fraction: 0 });
  assert.equal(free.engineer_wait_hours_per_week, 0);
  assert.equal(free.total_cost_usd_per_week, 0);
  assert.equal(free.recovered_hours_per_week_if_reverted, 3.89);
  for (const [delta, frequency] of [[200000, 0], [0, 70]]) {
    const cost = calculateCost(delta, frequency, rates);
    assert.equal(cost.total_cost_usd_per_week, 0);
    assert.equal(cost.recovered_hours_per_week_if_reverted, 0);
  }
});

test('weekly frequency includes all project runs inside the inclusive past fortnight, not future or foreign runs', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const db = documentDb({
    projects: [{ project_id: 'p', assumptions: rates }],
    runs: [
      { project_id: 'p', started_at: new Date(NOW - 3600000), status: 'success', branch: 'main' },
      { project_id: 'p', started_at: new Date(NOW - 86400000), status: 'failed', branch: 'main' },
      { project_id: 'p', started_at: new Date(NOW - FORTNIGHT), status: 'success', branch: 'release' },
      { project_id: 'p', started_at: new Date(NOW - FORTNIGHT - 1) },
      { project_id: 'p', started_at: new Date(NOW + 1) },
      { project_id: 'other', started_at: new Date(NOW - 1000) },
    ],
  });
  assert.equal(await createCosts({ db }).getRunsPerWeek('p'), 1.5);
});

test('assumptions recomputation updates only active project findings and emits the atomic current document', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const tables = {
    projects: [{ project_id: 'p', assumptions: { ...rates, engineer_cost_per_hour_usd: 80, blocking_fraction: 0.6 } }],
    runs: [{ project_id: 'p', started_at: new Date(NOW - 1000) }, { project_id: 'p', started_at: new Date(NOW - 2000) }],
    findings: [
      { _id: 'internal', project_id: 'p', finding_id: 'active', status: 'active', delta_ms: 60000, cost: null, llm: null },
      { project_id: 'p', finding_id: 'resolved', status: 'resolved', delta_ms: 60000, cost: { total_cost_usd_per_week: 9 } },
      { project_id: 'other', finding_id: 'foreign', status: 'active', delta_ms: 60000, cost: { total_cost_usd_per_week: 11 } },
    ],
  };
  const db = documentDb(tables, { beforeWrite: () => {
    // Simulate explanation completion after the cost reader took its snapshot.
    tables.findings[0].llm = { source: 'template', suggested_fix: 'Controlled rerun', channel_summary: 'Measured regression' };
  } });
  const events = [];
  const costs = createCosts({ db, emit: (name, finding) => events.push({ name, finding }) });
  assert.equal(await costs.recomputeCosts('p'), 1);
  assert.equal(tables.findings[0].cost.runs_per_week, 1);
  assert.equal(tables.findings[0].cost.engineer_cost_usd_per_week, 0.8);
  assert.equal(tables.findings[0].cost.total_cost_usd_per_week, 0.81);
  assert.equal(tables.findings[1].cost.total_cost_usd_per_week, 9);
  assert.equal(tables.findings[2].cost.total_cost_usd_per_week, 11);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'finding.updated');
  assert.equal(events[0].finding.llm?.source, 'template', 'the event must not overwrite a completed explanation with its stale null snapshot');
  assert.equal('_id' in events[0].finding, false);
});

test('a finding resolved before the atomic cost write is neither updated nor published', async () => {
  const tables = {
    projects: [{ project_id: 'p', assumptions: rates }], runs: [],
    findings: [{ project_id: 'p', finding_id: 'f', status: 'active', delta_ms: 60000, cost: null }],
  };
  const db = documentDb(tables, { beforeWrite: () => { tables.findings[0].status = 'resolved'; } });
  const events = [];
  assert.equal(await createCosts({ db, emit: (...event) => events.push(event) }).recomputeCosts('p'), 0);
  assert.equal(tables.findings[0].cost, null);
  assert.deepEqual(events, []);
});

test('unknown projects return contract errors instead of silently reporting zero frequency', async () => {
  const costs = createCosts({ db: documentDb({ projects: [], runs: [], findings: [] }) });
  for (const operation of [costs.getRunsPerWeek, costs.recomputeCosts]) {
    await assert.rejects(operation('missing'), error => error.status === 404 && error.code === 'NOT_FOUND');
  }
});
