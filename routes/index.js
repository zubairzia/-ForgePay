const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const { ensureCsrfToken, verifyCsrfToken } = require('../middleware/csrf.middleware');

const authWebRoutes = require('./web/auth.web');
const webRoutes = require('./web');
const apiV1Routes = require('./api/v1');

// /api/v1 is mounted FIRST and matched exactly by prefix, so a JSON API
// request is fully handled here and never touches the web-only middleware
// below. Mounting order matters: router.use('/', mw) prefix-matches EVERY
// path, /api/v1/* included -- if the web block were registered first, its
// ensureCsrfToken/verifyCsrfToken would run unconditionally ahead of this
// one, rejecting every API POST/PUT/PATCH for a missing _csrf field no
// JSON client ever sends. (Caught exactly this way in verification: a
// curl POST to /api/v1/credit-accounts with a valid session came back 403
// "Invalid or missing CSRF token" before this reordering.)
router.use('/api/v1', requireAuth, apiV1Routes);

// The only web pages reachable without a session: /register, /login,
// /logout. ensureCsrfToken runs here too -- the login/register forms need
// a token before any authenticated session exists.
router.use('/', ensureCsrfToken, authWebRoutes);

// Everything else requires a real, session-derived tenant. There is no
// more X-Tenant-Id header and no more hardcoded company_id — req.tenantId
// now comes from req.session.user.companyId (see
// middleware/auth.middleware.js's requireAuth). Companies (tenants) used
// to be exempted here because a tenant had to be creatable before tenant
// context existed; registration (above) replaces that entirely, so
// Companies is now just another module inside routes/web/index.js /
// routes/api/v1/index.js like everything else.
router.use('/', ensureCsrfToken, requireAuth, verifyCsrfToken, webRoutes);

module.exports = router;
