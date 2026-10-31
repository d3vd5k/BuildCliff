// Schema setup: creates collections, validators and indexes (contract section 2).
// Run with: npm run schema
// Safe to run repeatedly — uses createCollection-or-collMod and createIndex (idempotent).

import { connect, close } from './index.js';

// --- Collection list (contract section 2) ---
const COLLECTIONS = ['projects', 'runs', 'commits', 'events', 'findings', 'dependency_impacts'];

// --- runs validator (contract section 2.2) ---
// Required: run_id, project_id, branch, commit_sha, status, started_at,
// steps (non-empty, numeric duration_ms >= 0).
const RUNS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['run_id', 'project_id', 'branch', 'commit_sha', 'status', 'started_at', 'steps'],
    properties: {
      run_id: { bsonType: 'string', description: 'required string' },
      project_id: { bsonType: 'string' },
      branch: { bsonType: 'string' },
      commit_sha: { bsonType: 'string' },
      status: { enum: ['success', 'failed'] },
      started_at: { bsonType: 'date' },
      total_ms: { bsonType: ['int', 'long', 'double'], minimum: 0 },
      steps: {
        bsonType: 'array',
        minItems: 1,
        items: {
          bsonType: 'object',
          required: ['name', 'duration_ms'],
          properties: {
            name: { bsonType: 'string' },
            // Accept int/long/double so JS numbers pass; API layer enforces integer semantics.
            duration_ms: { bsonType: ['int', 'long', 'double'], minimum: 0 },
            status: { enum: ['success', 'failed', 'skipped'] },
          },
        },
      },
    },
  },
};

/** Create a collection (or ensure it exists), applying a validator if given. */
async function ensureCollection(db, name, validator) {
  const opts = validator
    ? { validator, validationLevel: 'strict', validationAction: 'error' }
    : {};
  try {
    await db.createCollection(name, opts);
    console.log(`  created collection: ${name}`);
  } catch (err) {
    if (err.codeName === 'NamespaceExists') {
      // Collection already exists; apply/update the validator via collMod.
      if (validator) {
        await db.command({
          collMod: name,
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        });
      }
      console.log(`  collection exists: ${name}`);
    } else {
      throw err;
    }
  }
}

async function main() {
  const db = await connect();
  console.log('Creating collections and validators...');

  for (const name of COLLECTIONS) {
    const validator = name === 'runs' ? RUNS_VALIDATOR : null;
    await ensureCollection(db, name, validator);
  }

  console.log('Creating indexes...');
  // Unique natural keys (contract section 2)
  await db.collection('projects').createIndex({ project_id: 1 }, { unique: true });
  await db.collection('runs').createIndex({ run_id: 1 }, { unique: true });
  await db.collection('commits').createIndex({ sha: 1 }, { unique: true });
  await db.collection('events').createIndex({ event_id: 1 }, { unique: true });
  await db.collection('findings').createIndex({ finding_id: 1 }, { unique: true });
  await db.collection('dependency_impacts').createIndex({ impact_id: 1 }, { unique: true });

  // Compound index on runs for timeline queries (contract section 2.2)
  await db.collection('runs').createIndex({ project_id: 1, branch: 1, started_at: 1 });
  // Helpful secondary indexes
  await db.collection('runs').createIndex({ project_id: 1, demo_replay: 1 });
  await db.collection('commits').createIndex({ project_id: 1, committed_at: 1 });

  console.log('Schema setup complete.');
  await close();
}

main().catch((err) => {
  console.error('Schema setup failed:', err);
  process.exit(1);
});
