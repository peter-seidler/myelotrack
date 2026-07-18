/**
 * Append-only PHI access trail. Every request that reaches a PHI route is
 * recorded (who, what, when, from where). In this prototype the sink is the
 * repository's in-memory audit log; in production it must be an append-only,
 * tamper-evident store (see docs/database-schema.md → auditLog).
 */
export function audit(req, res, next) {
  res.on('finish', () => {
    const repo = req.app.locals.repo;
    if (!repo?.recordAudit) return;
    repo.recordAudit({
      actor: 'user', // real auth would resolve the principal here
      action: methodToAction(req.method),
      route: `${req.method} ${req.baseUrl}${req.path}`,
      status: res.statusCode,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      at: new Date(),
    });
  });
  next();
}

function methodToAction(method) {
  switch (method) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'read';
  }
}
