import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { ingestRouter } from './routes/ingest.js';
import { runsRouter } from './routes/runs.js';
import { projectsRouter } from './routes/projects.js';
import { streamRouter } from './routes/stream.js';
import { demoRouter } from './routes/demo.js';
import { createAnalyticsHandler } from './routes/analytics.mjs';
import { getEngine } from './engine/index.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // All endpoints live under /api (contract section 0)
  app.use('/api/health', healthRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/runs', runsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/stream', streamRouter);
  app.use('/api/demo', demoRouter);

  // Analytics endpoints owned by B: /api/findings, /api/compare, /api/dependency-impacts
  const analyticsHandler = createAnalyticsHandler({
    listFindings: (...args) => getEngine().listFindings(...args),
    latestFinding: (...args) => getEngine().latestFinding(...args),
    getFinding: (...args) => getEngine().getFinding(...args),
    compare: (...args) => getEngine().compare(...args),
    listImpacts: (...args) => getEngine().listImpacts(...args),
  });

  app.use(async (req, res, next) => {
    try {
      const handled = await analyticsHandler(req, res);
      if (handled) return;
      next();
    } catch (err) {
      next(err);
    }
  });

  // Centralized error shape (contract section 4.1)
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Unknown route: ${req.method} ${req.path}`,
        field: null,
      },
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[unhandled]', err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', field: null },
    });
  });

  return app;
}
