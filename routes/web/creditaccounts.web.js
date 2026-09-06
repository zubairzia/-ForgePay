const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_CUSTOMERS_ACCOUNTS, MANAGE_CUSTOMERS_ACCOUNTS, MANAGERS } = require('../../middleware/roleGroups');

// List page.
router.get('/credit-accounts', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), (req, res) => {
  res.render('creditaccounts/index');
});

// Guided create flow — all data loading/preview/submit happens client-side
// via fetch() against the /api/v1/credit-accounts endpoints (preview and
// create share the exact same server-side computeCreditAccountPlan, so the
// numbers shown here can never drift from what actually gets persisted).
router.get('/credit-accounts/create', requireRole(...MANAGE_CUSTOMERS_ACCOUNTS), (req, res) => {
  res.render('creditaccounts/create');
});

// Detail page.
router.get('/credit-accounts/:id/view', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), (req, res) => {
  res.render('creditaccounts/view', { id: req.params.id });
});

// Reschedule flow — same preview-before-persist pattern as create: the
// preview panel and the actual reschedule both call
// computeReschedulePlan via /api/v1/credit-accounts/:id/reschedule[/preview].
router.get('/credit-accounts/:id/reschedule', requireRole(...MANAGERS), (req, res) => {
  res.render('creditaccounts/reschedule', { id: req.params.id });
});

module.exports = router;
