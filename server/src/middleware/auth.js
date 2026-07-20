import { config } from '../config/index.js';
import { verifySession } from '../lib/session.js';

const COOKIE_NAME = 'mt_session';

/** Parse the Cookie header into a plain object (no cookie-parser dependency). */
export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const idx = part.indexOf('=');
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      return [k, v];
    }),
  );
}

/** Read a session token from the cookie or an Authorization: Bearer header. */
export function readSessionToken(req) {
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

/** Set / clear the session cookie (httpOnly, SameSite=Lax). */
export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}
export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Gate PHI routes. When auth is disabled (default single-tenant), it's a no-op
 * that tags the request with the singleton user. When enabled, a valid session
 * is required or the request is rejected 401.
 */
export function requireAuth(req, res, next) {
  if (!config.auth.required) {
    req.authUserId = 'user_1';
    return next();
  }
  const subject = verifySession(readSessionToken(req), config.auth.sessionSecret);
  if (!subject) {
    res.status(401).json({ error: 'unauthorized', message: 'Sign in required' });
    return;
  }
  req.authUserId = subject;
  next();
}
