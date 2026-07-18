import { asyncHandler } from '../lib/async-handler.js';

const repo = (req) => req.app.locals.repo;

/** GET /api/v1/labs?analyte=&source= — aggregated results across care teams. */
export const list = asyncHandler(async (req, res) => {
  const results = await repo(req).listLabs({
    analyte: req.query.analyte,
    source: req.query.source,
  });
  res.json({ data: results });
});

/** GET /api/v1/labs/analytes — distinct analytes seen. */
export const analytes = asyncHandler(async (req, res) => {
  res.json({ data: await repo(req).listAnalytes() });
});
