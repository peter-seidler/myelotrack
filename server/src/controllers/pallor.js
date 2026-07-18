import { asyncHandler, badRequest } from '../lib/async-handler.js';

const repo = (req) => req.app.locals.repo;

/** GET /api/v1/pallor */
export const list = asyncHandler(async (req, res) => {
  res.json({ data: await repo(req).listPallor() });
});

/**
 * POST /api/v1/pallor — record a pallor reading's metadata.
 * A real build uploads the image (multipart) to an encrypted object store and
 * persists only the storage key + score here.
 */
export const create = asyncHandler(async (req, res) => {
  const { pallorScore, eye, capturedAt, note } = req.body || {};
  if (pallorScore != null && (pallorScore < 0 || pallorScore > 1)) {
    throw badRequest('pallorScore must be between 0 and 1');
  }
  const entry = await repo(req).addPallorPhoto({ pallorScore, eye, capturedAt, note });
  res.status(201).json({ data: entry });
});
