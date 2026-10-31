import { Router } from 'express';
import { getDb } from '../db/index.js';

export const healthRouter = Router();

// GET /api/health -> { "status": "ok", "db": "connected" }
healthRouter.get('/', async (req, res) => {
  try {
    const db = getDb();
    await db.command({ ping: 1 });
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'disconnected' });
  }
});
