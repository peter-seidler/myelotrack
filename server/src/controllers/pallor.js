import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { asyncHandler, badRequest } from '../lib/async-handler.js';

const repo = (req) => req.app.locals.repo;
const storage = (req) => req.app.locals.storage;

/** Multipart middleware: a single optional `image` field, held in memory. */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
}).single('image');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** GET /api/v1/pallor */
export const list = asyncHandler(async (req, res) => {
  res.json({ data: await repo(req).listPallor() });
});

/**
 * POST /api/v1/pallor — record a pallor reading. Accepts either JSON metadata
 * (pallorScore/eye/…) or multipart/form-data with an `image` file, which is
 * encrypted and written to object storage; only the storage key + digest are
 * persisted (never the bytes).
 */
export const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const pallorScore = body.pallorScore != null ? Number(body.pallorScore) : null;
  if (
    pallorScore != null &&
    (Number.isNaN(pallorScore) || pallorScore < 0 || pallorScore > 1)
  ) {
    throw badRequest('pallorScore must be between 0 and 1');
  }

  let storageBlock;
  if (req.file) {
    if (!ALLOWED_TYPES.has(req.file.mimetype)) {
      throw badRequest(`unsupported image type: ${req.file.mimetype}`);
    }
    if (!storage(req)) {
      throw badRequest('image storage is not configured (set FIELD_ENCRYPTION_KEY)');
    }
    const objectKey = `u/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    const stored = await storage(req).put(objectKey, req.file.buffer);
    storageBlock = { ...stored, contentType: req.file.mimetype };
  }

  const entry = await repo(req).addPallorPhoto({
    pallorScore,
    eye: body.eye,
    capturedAt: body.capturedAt,
    note: body.note,
    storage: storageBlock,
  });
  res.status(201).json({ data: entry });
});

/**
 * GET /api/v1/pallor/:id/image — stream a stored image, decrypted on the fly.
 * (A production build would instead hand back a short-lived signed URL.)
 */
export const image = asyncHandler(async (req, res) => {
  const photo = await repo(req).getPallorPhoto(req.params.id);
  if (!photo?.storage?.key) throw badRequest('no image for this reading');
  if (!storage(req)) throw badRequest('image storage is not configured');
  const buffer = await storage(req).get(photo.storage.key);
  if (!buffer) throw badRequest('image not found in storage');
  res.setHeader('Content-Type', photo.storage.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
});
