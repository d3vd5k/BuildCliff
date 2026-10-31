import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../backend/src/app.js';

test('createApp returns an Express app with standard error handling on 404', async () => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/non-existent-route`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error?.code, 'NOT_FOUND');
    assert.match(body.error?.message, /Unknown route/);
  } finally {
    server.close();
  }
});

test('POST /api/ingest/run validates missing required fields before database check', async () => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    // Missing body
    const res1 = await fetch(`http://127.0.0.1:${port}/api/ingest/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res1.status, 400);
    const body1 = await res1.json();
    assert.equal(body1.error?.code, 'VALIDATION_ERROR');
    assert.equal(body1.error?.field, 'project_id');

    // Missing steps
    const res2 = await fetch(`http://127.0.0.1:${port}/api/ingest/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'demo-app',
        run_id: 'run_0001',
        commit_sha: 'a'.repeat(40),
        started_at: new Date().toISOString(),
      }),
    });
    assert.equal(res2.status, 400);
    const body2 = await res2.json();
    assert.equal(body2.error?.code, 'VALIDATION_ERROR');
    assert.equal(body2.error?.field, 'steps');

    // Invalid step duration
    const res3 = await fetch(`http://127.0.0.1:${port}/api/ingest/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'demo-app',
        run_id: 'run_0001',
        commit_sha: 'a'.repeat(40),
        started_at: new Date().toISOString(),
        steps: [{ name: 'install', duration_ms: -50 }],
      }),
    });
    assert.equal(res3.status, 400);
    const body3 = await res3.json();
    assert.equal(body3.error?.code, 'VALIDATION_ERROR');
    assert.equal(body3.error?.field, 'steps.0.duration_ms');
  } finally {
    server.close();
  }
});

test('POST /api/ingest/commit validates missing required fields before database check', async () => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ingest/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: 'demo-app' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error?.code, 'VALIDATION_ERROR');
    assert.equal(body.error?.field, 'sha');
  } finally {
    server.close();
  }
});
