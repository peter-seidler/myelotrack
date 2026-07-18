import { asyncHandler, badRequest } from '../lib/async-handler.js';

const repo = (req) => req.app.locals.repo;
const KNOWN_SOURCES = ['msk', 'capital-health', 'apple-health'];

/** GET /api/v1/integrations/status — connection health per source. */
export const status = asyncHandler(async (req, res) => {
  res.json({ data: await repo(req).integrationsStatus() });
});

/**
 * POST /api/v1/integrations/:source/sync — trigger an on-demand pull.
 * Prototype: marks the connection as freshly synced. Live sync requires the
 * SMART OAuth flow (see integrations/fhir + docs/architecture.md).
 */
export const sync = asyncHandler(async (req, res) => {
  const { source } = req.params;
  if (!KNOWN_SOURCES.includes(source)) throw badRequest(`unknown source: ${source}`);
  const result = await repo(req).touchIntegrationSync(source);
  if (!result) throw badRequest(`no connection configured for: ${source}`);
  res.json({ data: result });
});
