const db = require('../db');

/**
 * Gates a route behind a subscription plan. Looks up the current tenant's
 * plan (see notes/migration_plan_gating.sql) and blocks the request if it
 * doesn't meet the minimum required tier.
 *
 * Used for procurement-side modules (Vendors, Bills, Expenses, Purchase
 * Orders, Vendor Credits) that a customer-lending SaaS buyer only needs
 * if they also track their own suppliers — a Pro-tier add-on rather than
 * core functionality.
 */
const PLAN_RANK = { free: 0, pro: 1 };

async function getCompanyPlan(tenantId) {
  const result = await db.query('SELECT plan FROM companies WHERE id = $1', [tenantId]);
  return result.rows[0]?.plan || 'free';
}

// Makes the current tenant's plan available as `plan` in every EJS view
// (sidebar included) so gated modules can be hidden from nav instead of
// just blocked at the route.
function attachPlan() {
  return async function attachPlanMiddleware(req, res, next) {
    try {
      res.locals.plan = await getCompanyPlan(req.tenantId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requirePlan(minPlan, moduleName = 'This feature') {
  return async function planMiddleware(req, res, next) {
    try {
      const plan = await getCompanyPlan(req.tenantId);
      res.locals.plan = plan;

      if ((PLAN_RANK[plan] ?? 0) >= PLAN_RANK[minPlan]) {
        return next();
      }

      const isApiRequest = req.originalUrl.startsWith('/api/');
      if (isApiRequest) {
        return res.status(402).json({
          success: false,
          message: `${moduleName} requires the ${minPlan} plan.`,
          requiredPlan: minPlan,
        });
      }

      return res.status(402).render('errors/upgrade-required', {
        moduleName,
        requiredPlan: minPlan,
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requirePlan, attachPlan, getCompanyPlan };
