/**
 * Session-based auth guards. Replaces middleware/tenant.middleware.js (the
 * X-Tenant-Id header) and the hardcoded webTenantMiddleware that used to
 * live in routes/index.js entirely -- req.tenantId now comes from
 * req.session.user.companyId, set at login, never from anything the
 * client can influence on a per-request basis.
 */

// Rejects any request with no authenticated session. JSON for API routes,
// a redirect for everything else -- detected by path prefix, since this
// runs at the top of routes/index.js before the api/web routers split the
// request any further.
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    req.tenantId = req.session.user.companyId;
    // Available to every EJS render without each controller passing it
    // explicitly -- views/partials/sidebar.ejs uses this for the
    // email/role footer and the logout form.
    res.locals.user = req.session.user;
    return next();
  }

  // req.originalUrl, not req.path: req.path is relative to whichever
  // router is currently handling the request, and gets the matched mount
  // prefix stripped at every level of nesting (e.g. inside
  // repayments.routes.js, mounted three routers deep under /api/v1, it's
  // just "/" or "/preview" -- no "/api/v1" left to detect). originalUrl is
  // always the full path from the actual incoming request, unaffected by
  // how deep the current router is nested.
  if (req.originalUrl.startsWith('/api/v1')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  return res.redirect('/login');
};

// requireRole('owner', 'finance_manager') -- must run after requireAuth,
// since it reads req.user. 403s rather than redirecting: the user IS
// authenticated, they just don't have permission for this specific action.
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    if (req.originalUrl.startsWith('/api/v1')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    const err = new Error('You do not have permission to perform this action');
    err.status = 403;
    return next(err);
  }
  next();
};

module.exports = { requireAuth, requireRole };
