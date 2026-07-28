import path from 'node:path';
import express from 'express';
import { cors } from './middleware/cors.js';
import { audit } from './middleware/audit.js';
import { securityHeaders } from './middleware/security.js';
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
  // Behind Cloud Run (and any TLS-terminating proxy): trust X-Forwarded-* so
  // req.secure / req.protocol reflect the real client, which HSTS and WebAuthn
  // origin checks depend on.
  app.set('trust proxy', true);
  app.locals.repo = repo;
  // Image storage is optional: only available once an encryption key is set.
  // Without it, image uploads are rejected but the rest of the API works.
  app.locals.storage =
    deps.storage ?? (config.fieldEncryptionKey ? createStorage() : null);

  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  app.use(cors);

  // Liveness probe — no PHI, not audited.
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', backend: repo.kind });
  });

  // All PHI routes are audited.
  app.use('/api/v1', audit, apiRouter());

  // Single-origin production: serve the built PWA from the same host as the
  // API. Static assets first, then an SPA fallback to index.html for client
  // routes — but never for /api or /healthz, so unknown API paths still 404 as
  // JSON below. Skipped entirely in dev/tests (webDir unset).
  if (config.webDir) {
    app.use(express.static(config.webDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/healthz') return next();
      res.sendFile(path.join(config.webDir, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
