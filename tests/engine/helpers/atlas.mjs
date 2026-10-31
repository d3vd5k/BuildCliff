import { before, after } from 'node:test';
import { MongoClient } from 'mongodb';
import { createExplanationWorker } from '../../../backend/src/engine/explanations.mjs';

let client;
before(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) throw new Error('Missing MONGODB_URI: integration tests require Atlas; no local database fallback is used.');
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
  } catch (error) {
    // Connection errors can contain private URI details. Keep diagnostics safe.
    throw new Error(`Atlas connection failed (${error.name}, code ${error.code ?? 'unknown'}). Check local credentials and network access.`);
  }
});
after(async () => { await client?.close(); });

export async function atlasDatabase(t) {
  const db = client.db(`buildcliff_test_${crypto.randomUUID().replaceAll('-', '')}`);
  t.after(async () => {
    try { await createExplanationWorker({ db }).drain(); }
    finally { await db.dropDatabase(); }
  });
  return db;
}
