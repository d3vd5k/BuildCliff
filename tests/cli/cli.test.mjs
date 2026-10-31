import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import highFinding from '../../mocks/finding_high.json' with { type: 'json' };

const exec = promisify(execFile);
const CLI_PATH = new URL('../../cli/src/index.js', import.meta.url).pathname;

test('CLI --help exits 0 with usage instructions', async () => {
  const { stdout, stderr } = await exec(process.execPath, [CLI_PATH, '--help']);
  assert.equal(stderr, '');
  assert.match(stdout, /Usage: buildcliff/);
  assert.match(stdout, /why-slow/);
});

test('CLI unknown command exits 2 with error message', async () => {
  try {
    await exec(process.execPath, [CLI_PATH, 'unknown-cmd']);
    assert.fail('should have failed with exit code 2');
  } catch (err) {
    assert.equal(err.code, 2);
    assert.match(err.stderr, /Unknown command: unknown-cmd/);
  }
});

test('CLI why-slow exits 0 on clean state', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      project_id: 'demo-app',
      has_active_regression: false,
      finding: null,
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const { stdout, stderr } = await exec(process.execPath, [CLI_PATH, 'why-slow'], {
      env: { ...process.env, BUILDCLIFF_API_URL: `http://127.0.0.1:${port}/api` },
    });
    assert.equal(stderr, '');
    assert.match(stdout, /Clean: no active regression found/);
  } finally {
    server.close();
  }
});

test('CLI why-slow exits 1 when regression detected and formats output', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      project_id: 'demo-app',
      has_active_regression: true,
      finding: highFinding,
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await exec(process.execPath, [CLI_PATH, 'why-slow'], {
      env: { ...process.env, BUILDCLIFF_API_URL: `http://127.0.0.1:${port}/api` },
    });
    assert.fail('should have exited with code 1');
  } catch (err) {
    assert.equal(err.code, 1);
    assert.match(err.stdout, /BUILDCLIFF REGRESSION DETECTED: \[INSTALL\]/);
    assert.match(err.stdout, /Confidence: High/);
    assert.match(err.stdout, /Cost:/);
    assert.match(err.stdout, /Step breakdown:/);
    assert.match(err.stdout, /Suggested Fix:/);
  } finally {
    server.close();
  }
});

test('CLI why-slow --json outputs raw JSON', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      project_id: 'demo-app',
      has_active_regression: true,
      finding: highFinding,
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await exec(process.execPath, [CLI_PATH, 'why-slow', '--json'], {
      env: { ...process.env, BUILDCLIFF_API_URL: `http://127.0.0.1:${port}/api` },
    });
    assert.fail('should have exited with code 1');
  } catch (err) {
    assert.equal(err.code, 1);
    const parsed = JSON.parse(err.stdout);
    assert.equal(parsed.has_active_regression, true);
    assert.equal(parsed.finding.finding_id, highFinding.finding_id);
  } finally {
    server.close();
  }
});
