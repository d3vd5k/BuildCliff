import test from 'node:test';
import assert from 'node:assert/strict';
import { getDemoStatus, startReplay, resetDemo } from '../../backend/src/services/demoService.js';
import { setDbForTesting } from '../../backend/src/db/index.js';

test('getDemoStatus reports replay status accurately', async () => {
  let queryFilter = null;
  const mockDb = {
    collection: (name) => ({
      countDocuments: async (filter) => {
        queryFilter = filter;
        return name === 'runs' ? 5 : 0;
      },
    }),
  };

  try {
    setDbForTesting(mockDb);
    const status = await getDemoStatus('demo-app');
    assert.equal(status.project_id, 'demo-app');
    assert.equal(status.replay_applied, true);
    assert.equal(status.replay_in_progress, false);
    assert.deepEqual(queryFilter, { project_id: 'demo-app', demo_replay: true });
  } finally {
    setDbForTesting(null);
  }
});

test('startReplay rejects with REPLAY_ALREADY_APPLIED when replay runs exist', async () => {
  const mockDb = {
    collection: () => ({
      countDocuments: async () => 5,
    }),
  };

  try {
    setDbForTesting(mockDb);
    await startReplay('demo-app');
    assert.fail('should have thrown REPLAY_ALREADY_APPLIED');
  } catch (err) {
    assert.equal(err.code, 'REPLAY_ALREADY_APPLIED');
    assert.match(err.message, /already been applied/);
  } finally {
    setDbForTesting(null);
  }
});

test('resetDemo removes demo_replay items and returns deletion counts', async () => {
  const mockDb = {
    collection: () => ({
      deleteMany: async () => ({ deletedCount: 3 }),
      findOne: async () => ({ assumptions: {} }),
      find: () => ({ toArray: async () => [] }),
      aggregate: () => ({ toArray: async () => [] }),
      createIndex: async () => {},
    }),
  };

  try {
    setDbForTesting(mockDb);
    const result = await resetDemo('demo-app');
    assert.equal(result.status, 'reset');
    assert.equal(result.deleted.runs, 3);
    assert.equal(result.deleted.commits, 3);
  } finally {
    setDbForTesting(null);
  }
});
