/**
 * Baseline security response headers. Dependency-free and conservative — no
 * Content-Security-Policy here (the PWA's inline styles + service worker make a
 * strict CSP its own task); this covers the cheap, high-value headers.
 *
 * HSTS is only emitted when the request actually arrived over TLS (directly or
 * via a trusted proxy such as Cloud Run), so local http dev is unaffected.
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
