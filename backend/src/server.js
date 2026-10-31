import { createApp } from './app.js';
import { connect, close } from './db/index.js';
import { startChangeStreams } from './services/streamService.js';
import { config } from './config/index.js';

async function main() {
  await connect();
  startChangeStreams();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`BuildCliff server running on http://localhost:${config.port}/api`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await close();
  process.exit(0);
});
