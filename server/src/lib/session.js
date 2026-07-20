import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless signed session tokens: `base64url(payload).base64url(hmacSHA256)`.
 * The payload carries the subject (user id) and an expiry. Verification is
 * constant-time and rejects tampered or expired tokens. Not a JWT library —
 * deliberately tiny and dependency-free.
 */
const b64url = (buf) => Buffer.from(buf).toString('base64url');

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/** Issue a session token for a subject. */
export function issueSession(subject, secret, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!secret) throw new Error('session secret is not configured');
  const payload = { sub: subject, exp: nowSeconds() + ttlSeconds };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Verify a token; returns the subject or null if invalid/expired. */
export function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [payloadB64, sig] = String(token).split('.');
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.exp || payload.exp < nowSeconds()) return null;
  return payload.sub ?? null;
}

// Wrapped so it's easy to see the single time source.
function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
