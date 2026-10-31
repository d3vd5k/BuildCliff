import { Router } from 'express';
import { ingestRun, ingestCommit } from '../services/ingestService.js';
import { sendError } from '../utils/errors.js';

export const ingestRouter = Router();

// POST /api/ingest/run
ingestRouter.post('/run', async (req, res) => {
  try {
    const result = await ingestRun(req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[ingest/run]', err);
    return sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});

// POST /api/ingest/commit
ingestRouter.post('/commit', async (req, res) => {
  try {
    const result = await ingestCommit(req.body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[ingest/commit]', err);
    return sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', null);
  }
});
