import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config/index.js';
import { parseKey, encryptBuffer, decryptBuffer } from '../lib/crypto.js';

/**
 * Encrypted object storage for pallor images. PHI is never written in the
 * clear: blobs are AES-256-GCM encrypted with FIELD_ENCRYPTION_KEY before they
 * touch disk (or the in-memory map in tests). The DB stores only the key,
 * sha256, size, and content type — never the bytes.
 *
 * Backends: "memory" (tests), "local" (filesystem), and "gcs" (Google Cloud
 * Storage, the production target on Cloud Run). All three share this interface
 * and all encrypt the bytes before they leave the process — GCS encrypts at
 * rest too, but our field-level encryption keeps the object opaque regardless.
 */
export function createStorage(opts = {}) {
  const backend = opts.backend || config.storageBackend;
  const bucket = opts.bucket || config.storageBucket;
  const keyB64 = opts.fieldEncryptionKey ?? config.fieldEncryptionKey;
  if (!keyB64) {
    throw new Error('FIELD_ENCRYPTION_KEY is required to store images at rest');
  }
  const key = parseKey(keyB64);

  const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

  if (backend === 'gcs') {
    // Lazy-load the GCS client (an optional dependency) so the memory/local
    // paths never require it. On Cloud Run, Application Default Credentials
    // authenticate the runtime service account with no key files.
    let bucketRef = null;
    const gcsBucket = async () => {
      if (!bucketRef) {
        const { Storage } = await import('@google-cloud/storage');
        bucketRef = new Storage().bucket(bucket);
      }
      return bucketRef;
    };
    return {
      backend: 'gcs',
      bucket,
      async put(objectKey, buffer) {
        const file = (await gcsBucket()).file(objectKey);
        await file.save(encryptBuffer(buffer, key), {
          resumable: false,
          contentType: 'application/octet-stream',
          metadata: { cacheControl: 'no-store' },
        });
        return { bucket, key: objectKey, sha256: sha256(buffer), bytes: buffer.length };
      },
      async get(objectKey) {
        try {
          const [enc] = await (await gcsBucket()).file(objectKey).download();
          return decryptBuffer(enc, key);
        } catch (err) {
          if (err.code === 404) return null;
          throw err;
        }
      },
      async delete(objectKey) {
        try {
          await (await gcsBucket()).file(objectKey).delete();
        } catch (err) {
          if (err.code !== 404) throw err;
        }
      },
    };
  }

  if (backend === 'memory') {
    const blobs = new Map();
    return {
      backend,
      bucket,
      async put(objectKey, buffer) {
        blobs.set(objectKey, encryptBuffer(buffer, key));
        return { bucket, key: objectKey, sha256: sha256(buffer), bytes: buffer.length };
      },
      async get(objectKey) {
        const enc = blobs.get(objectKey);
        if (!enc) return null;
        return decryptBuffer(enc, key);
      },
      async delete(objectKey) {
        blobs.delete(objectKey);
      },
    };
  }

  // Default: local filesystem.
  const root = opts.dir || config.storageDir;
  const pathFor = (objectKey) => join(root, objectKey);
  return {
    backend: 'local',
    bucket,
    async put(objectKey, buffer) {
      const filePath = pathFor(objectKey);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, encryptBuffer(buffer, key));
      return { bucket, key: objectKey, sha256: sha256(buffer), bytes: buffer.length };
    },
    async get(objectKey) {
      try {
        const enc = await readFile(pathFor(objectKey));
        return decryptBuffer(enc, key);
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(objectKey) {
      try {
        await unlink(pathFor(objectKey));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    },
  };
}
