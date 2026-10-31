import { MongoClient } from 'mongodb';
import { config } from '../config/index.js';

// Shared Mongo connection. A owns getDb() (contract section 6); B calls it.
let client = null;
let db = null;

/** Connect (or return the existing connection). */
export async function connect() {
  if (db) return db;
  client = new MongoClient(config.mongodbUri, {
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  db = client.db(config.mongodbDb);
  return db;
}

/** Returns the shared database handle. Throws if not connected. */
export function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

/** Returns the underlying client (for change-stream resume tokens etc.). */
export function getClient() {
  if (!client) throw new Error('Database not connected. Call connect() first.');
  return client;
}

export async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}
