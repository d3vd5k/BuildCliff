import { Router } from 'express';
import { addClient, removeClient } from '../services/streamService.js';
import { DEMO_PROJECT_ID } from '@buildcliff/shared';

export const streamRouter = Router();

// GET /api/stream?project_id=demo-app  (Server-Sent Events)
streamRouter.get('/', (req, res) => {
  const projectId = req.query.project_id || DEMO_PROJECT_ID;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx etc.)
  });
  res.write(': connected\n\n');

  addClient(res, projectId);

  // Clean up on disconnect.
  req.on('close', () => removeClient(res));
  req.on('error', () => removeClient(res));
});
