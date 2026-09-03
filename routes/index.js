const express = require('express');
const router = express.Router();
const tenantMiddleware = require('../middleware/tenant.middleware');
const { attachPlan } = require('../middleware/plan.middleware');

// UI Routes (EJS pages)
// TEMPORARY: hardcoded tenant until real login/session exists, mirroring
// the 'X-Tenant-Id: 1' header hardcoded in public/js/customers.js. Browser
// page navigations don't carry custom headers, so req.tenantId was left
// undefined here, and lookups scoped by company_id never matched.
// TODO: once auth/session exists, resolve req.tenantId here too
// (from req.session.user.companyId) instead of hardcoding it.
const webTenantMiddleware = (req, res, next) => {
  req.tenantId = '1';
  next();
};

const webRoutes = require('./web');

// API Routes — every /api/v1 request now requires a resolved tenant
// before it reaches a controller. See middleware/tenant.middleware.js
// for why this exists and what still needs to change once real auth
// is added.
const apiV1Routes = require('./api/v1');

// Mount routes
router.use('/', webTenantMiddleware, attachPlan(), webRoutes);
router.use('/api/v1', tenantMiddleware, apiV1Routes);

module.exports = router;