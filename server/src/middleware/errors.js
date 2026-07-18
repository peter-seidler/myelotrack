/** 404 handler for unmatched routes. */
export function notFound(req, res) {
  res
    .status(404)
    .json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

/**
 * Central error handler. Express recognizes it by its four arguments.
 * Never leak internals to the client; log server-side.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: err.code || 'internal_error',
    message: status >= 500 ? 'Internal server error' : err.message,
  });
}
