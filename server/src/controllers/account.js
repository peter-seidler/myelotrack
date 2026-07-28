import { asyncHandler } from '../lib/async-handler.js';
import { clearSessionCookie } from '../middleware/auth.js';

const repo = (req) => req.app.locals.repo;

// Bump when the export shape changes, so downstream readers can adapt.
const EXPORT_SCHEMA_VERSION = 1;

/**
 * GET /api/v1/account/export — download the patient's full record.
 *
 * Deliberately NOT wrapped in the usual `{ data }` envelope: this is a
 * self-contained document meant to be saved to disk, so the file is clean,
 * portable JSON. Served with Content-Disposition so a browser downloads it.
 */
export const exportData = asyncHandler(async (req, res) => {
  const records = await repo(req).exportData();
  const filename = `myelotrack-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json({
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    app: 'MyeloTrack',
    records,
  });
});

/**
 * DELETE /api/v1/account — erase all of the patient's PHI (right to be
 * forgotten). Purges encrypted pallor blobs from object storage first, then
 * drops every PHI record, and ends the session. The passkey credential is kept
 * so the patient can sign back into a now-empty app.
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const r = repo(req);
  const storage = req.app.locals.storage;

  // Best-effort blob purge before the records that point at them are gone.
  if (storage?.delete) {
    const photos = await r.listPallor();
    for (const p of photos) {
      if (p.storage?.key) {
        try {
          await storage.delete(p.storage.key);
        } catch (err) {
          console.error('[account] pallor blob purge failed', p.storage.key, err);
        }
      }
    }
  }

  const deleted = await r.deleteAllData();
  clearSessionCookie(res);
  res.json({ data: { deleted } });
});
