import { createApp } from './app.js';
import { connect, close } from './db/index.js';
import { startChangeStreams } from './services/streamService.js';
import { resumeExplanations, drainExplanations } from './engine/index.js';
import { drainReplay } from './services/demoService.js';
import { config } from './config/index.js';

let serverInstance = null;

async function main() {
  await connect();
  startChangeStreams();

  try {
    await resumeExplanations();
  } catch (err) {
    console.warn('[server] resumeExplanations warning:', err.message);
  }

  const app = createApp();
  serverInstance = app.listen(config.port, () => {
    console.log(`BuildCliff server running on http://localhost:${config.port}/api`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

async function shutdown() {
  console.log('\nShutting down BuildCliff server...');
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }
  try {
    await drainReplay();
  } catch (err) {
    console.warn('[server] error draining replay:', err.message);
  }
  try {
    await drainExplanations();
  } catch (err) {
    console.warn('[server] error draining explanations:', err.message);
  }
  await close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
