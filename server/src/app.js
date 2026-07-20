import express from 'express';
import { cors } from './middleware/cors.js';
import { audit } from './middleware/audit.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { apiRouter } from './routes/index.js';
import { config } from './config/index.js';
import { createStorage } from './storage/index.js';

/**
 * Build the Express app around a repository. Kept as a factory (no side
 * effects, no listen) so tests can spin up an app with a fresh repo.
 *
 * @param {object} repo - a data repository (see repositories/index.js)
 * @param {object} [deps] - optional overrides (e.g. a test storage instance)
 * @returns {import('express').Express}
 */
export function createApp(repo, deps = {}) {
  const app = express();
  app.locals.repo = repo;
  // Image storage is optional: only available once an encryption key is set.
  // Without it, image uploads are rejected but the rest of the API works.
  app.locals.storage =
    deps.storage ?? (config.fieldEncryptionKey ? createStorage() : null);

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
