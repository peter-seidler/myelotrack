import { asyncHandler, badRequest } from '../lib/async-handler.js';

const repo = (req) => req.app.locals.repo;

/** GET /api/v1/symptoms?from=&to= */
export const list = asyncHandler(async (req, res) => {
  const entries = await repo(req).listSymptoms({
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ data: entries });
});

/** POST /api/v1/symptoms — create or replace today's MPN-SAF entry. */
export const create = asyncHandler(async (req, res) => {
  const { items, weightKg, note, date } = req.body || {};
  if (!items || typeof items !== 'object') {
    throw badRequest('`items` (MPN-SAF scores) is required');
  }
  const total = Object.values(items).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const entry = await repo(req).upsertSymptomEntry({
    items,
    total,
    weightKg,
    note,
    date,
  });
  res.status(201).json({ data: entry });
});
