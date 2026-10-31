import { Router } from 'express';
import { startReplay, resetDemo, getDemoStatus } from '../services/demoService.js';
import { sendError } from '../utils/errors.js';
import { DEMO_PROJECT_ID } from '@buildcliff/shared';

export const demoRouter = Router();

// GET /api/demo
demoRouter.get('/', async (req, res) => {
  try {
    const projectId = req.query.project_id || DEMO_PROJECT_ID;
    const status = await getDemoStatus(projectId);
    res.json(status);
  } catch (err) {
    console.error('[demo/get]', err);
    sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});

// POST /api/demo/replay
demoRouter.post('/replay', async (req, res) => {
  try {
    const projectId = req.query.project_id || DEMO_PROJECT_ID;
    const result = await startReplay(projectId);
    res.status(202).json(result);
  } catch (err) {
    if (err.code === 'REPLAY_IN_PROGRESS' || err.code === 'REPLAY_ALREADY_APPLIED') {
      return sendError(res, err.code, err.message, null);
    }
    console.error('[demo/replay]', err);
    sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});

// POST /api/demo/reset
demoRouter.post('/reset', async (req, res) => {
  try {
    const projectId = req.query.project_id || DEMO_PROJECT_ID;
    const result = await resetDemo(projectId);
    res.json(result);
  } catch (err) {
    if (err.code === 'REPLAY_IN_PROGRESS') {
      return sendError(res, err.code, err.message, null);
    }
    console.error('[demo/reset]', err);
    sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});
