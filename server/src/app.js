import express from 'express';
import { cors } from './middleware/cors.js';
import { audit } from './middleware/audit.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { apiRouter } from './routes/index.js';

/**
 * Build the Express app around a repository. Kept as a factory (no side
 * effects, no listen) so tests can spin up an app with a fresh repo.
 *
 * @param {object} repo - a data repository (see repositories/index.js)
 * @returns {import('express').Express}
 */
export function createApp(repo) {
  const app = express();
  app.locals.repo = repo;

  app.use(express.json({ limit: '1mb' }));
  app.use(cors);

  // Liveness probe — no PHI, not audited.
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', backend: repo.kind });
  });

  // All PHI routes are audited.
  app.use('/api/v1', audit, apiRouter());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
