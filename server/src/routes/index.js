import { Router } from 'express';
import * as symptoms from '../controllers/symptoms.js';
import * as medications from '../controllers/medications.js';
import * as labs from '../controllers/labs.js';
import * as pallor from '../controllers/pallor.js';
import * as integrations from '../controllers/integrations.js';

/** Mount the v1 API surface (see docs/architecture.md). */
export function apiRouter() {
  const r = Router();

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
