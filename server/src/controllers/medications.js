import { asyncHandler, badRequest } from '../lib/async-handler.js';

const repo = (req) => req.app.locals.repo;
const VALID_STATUS = ['taken', 'skipped', 'missed', 'late'];

/** GET /api/v1/medications */
export const list = asyncHandler(async (req, res) => {
  const meds = await repo(req).listMedications();
  res.json({ data: meds });
});

/** POST /api/v1/medications/:id/doses — log a dose event. */
export const logDose = asyncHandler(async (req, res) => {
  const { status = 'taken', scheduledFor, takenAt, note } = req.body || {};
  if (!VALID_STATUS.includes(status)) {
    throw badRequest(`status must be one of: ${VALID_STATUS.join(', ')}`);
  }
  const dose = await repo(req).logDose(req.params.id, {
    status,
    scheduledFor,
    takenAt,
    note,
  });
  if (!dose) throw badRequest(`unknown medication: ${req.params.id}`);
  res.status(201).json({ data: dose });
});
