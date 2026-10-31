// Seed script: connects to Mongo, clears A's collections, inserts deterministic
// seed data, writes the replay fixture JSON for inspection, then triggers B's
// detect() and recomputeImpacts().
// Run with: npm run seed

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { connect, close } from '../db/index.js';
import { COLLECTIONS } from '@buildcliff/shared';
import { generateSeedData, buildReplayFixture } from './generate.js';
import { detect, recomputeImpacts, drainExplanations } from '../engine/index.js';
import { setupSchema } from '../db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'replay_fixture.json');

async function main() {
  const db = await connect();
  await setupSchema(db);
  const { project, runs, commits, events } = generateSeedData();

  // Clear all collections for a clean, repeatable slate.
  console.log('Clearing collections...');
  for (const name of COLLECTIONS) {
    await db.collection(name).deleteMany({});
  }

  console.log('Inserting seed data...');
  await db.collection('projects').insertOne(project);
  await db.collection('runs').insertMany(runs);
  await db.collection('commits').insertMany(commits);
  await db.collection('events').insertMany(events);

  // Write the replay fixture for inspection (the demo service reads it at runtime).
  const fixture = buildReplayFixture();
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  console.log(`Wrote replay fixture -> ${FIXTURE_PATH}`);

  // Trigger B's engine so findings + impacts populate
  console.log('Triggering detection and impact recomputation...');
  try {
    await detect(project.project_id);
  } catch (err) {
    console.warn('detect() warning:', err.message);
  }
  try {
    await recomputeImpacts(project.project_id);
  } catch (err) {
    console.warn('recomputeImpacts() warning:', err.message);
  }

  console.log(
    `Seed complete: ${runs.length} runs, ${commits.length} commits, ${events.length} events, 1 project.`
  );
  await drainExplanations();
  await close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
