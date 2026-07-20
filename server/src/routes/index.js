import { Router } from 'express';
import * as symptoms from '../controllers/symptoms.js';
import * as medications from '../controllers/medications.js';
import * as labs from '../controllers/labs.js';
import * as pallor from '../controllers/pallor.js';
import * as integrations from '../controllers/integrations.js';
import * as auth from '../controllers/auth.js';
import { requireAuth } from '../middleware/auth.js';

/** Mount the v1 API surface (see docs/architecture.md). */
export function apiRouter() {
  const r = Router();

  // --- Auth (public: this is how you sign in) ---
  r.get('/auth/me', auth.me);
  r.post('/auth/logout', auth.logout);
  r.get('/auth/registration/options', auth.registrationOptions);
  r.post('/auth/registration/verify', auth.registrationVerify);
  r.get('/auth/authentication/options', auth.authenticationOptions);
  r.post('/auth/authentication/verify', auth.authenticationVerify);

  // Everything below requires a session when AUTH_REQUIRED=true (no-op otherwise).
  r.use(requireAuth);

  r.get('/symptoms', symptoms.list);
  r.post('/symptoms', symptoms.create);

  r.get('/medications', medications.list);
  r.post('/medications/:id/doses', medications.logDose);

  r.get('/labs/analytes', labs.analytes);
  r.get('/labs', labs.list);

  r.get('/pallor', pallor.list);
  r.post('/pallor', pallor.uploadImage, pallor.create);
  r.get('/pallor/:id/image', pallor.image);

  r.get('/integrations/status', integrations.status);
  r.get('/integrations/:source/connect', integrations.connect);
  r.get('/integrations/:source/callback', integrations.callback);
  r.post('/integrations/:source/sync', integrations.sync);

  return r;
}
