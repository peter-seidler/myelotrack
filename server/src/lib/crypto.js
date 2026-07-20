import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for secrets at rest (OAuth tokens). AES-256-GCM with
 * a random 96-bit IV per value; output is a self-describing string:
 *
 *   v1:<iv b64>:<authTag b64>:<ciphertext b64>
 *
 * The key is 32 bytes. In production it comes from config (FIELD_ENCRYPTION_KEY,
 * base64); tests pass one explicitly. Never log plaintext or the key.
 */
const ALGO = 'aes-256-gcm';

/** Parse a base64 key and validate it's 32 bytes. */
export function parseKey(base64Key) {
  if (!base64Key) throw new Error('encryption key is not configured');
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error(`encryption key must be 32 bytes (got ${key.length})`);
  }
  return key;
}

/** Encrypt a UTF-8 string. Returns the self-describing token string. */
export function encryptSecret(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a value produced by encryptSecret. Throws on tampering/format. */
export function decryptSecret(payload, key) {
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('malformed ciphertext');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Encrypt a Buffer. Returns iv(12) ‖ authTag(16) ‖ ciphertext as one Buffer. */
export function encryptBuffer(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

/** Decrypt a Buffer produced by encryptBuffer. Throws on tampering. */
export function decryptBuffer(payload, key) {
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ct = payload.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Generate a fresh 32-byte key as base64 (for provisioning / tests). */
export const generateKey = () => randomBytes(32).toString('base64');
