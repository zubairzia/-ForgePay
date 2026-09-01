/**
 * Resolves the current tenant (company) for every request and attaches it
 * as req.tenantId, so every controller/service downstream can scope its
 * queries correctly instead of hardcoding company_id = 1.
 *
 * This is a MINIMAL placeholder: it currently reads a tenant id from a
 * header, which is fine for local testing with curl/Postman but is NOT
 * how you should resolve tenants once real auth exists. Once you add
 * login, replace the header lookup with: req.tenantId = req.user.companyId
 * (set by your auth middleware after verifying the session/JWT).
 *
 * Wire this in BEFORE any route that touches tenant-scoped data:
 *   app.use('/api/v1', tenantMiddleware, apiV1Routes);
 */
module.exports = function tenantMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      message: 'Missing tenant context. Expected X-Tenant-Id header (temporary — replace with auth-derived tenant once login exists).',
    });
  }

  req.tenantId = tenantId;
  next();
};
