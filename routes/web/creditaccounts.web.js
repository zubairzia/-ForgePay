const express = require('express');
const router = express.Router();

// List page.
router.get('/credit-accounts', (req, res) => {
  res.render('creditaccounts/index');
});

// Guided create flow — all data loading/preview/submit happens client-side
// via fetch() against the /api/v1/credit-accounts endpoints (preview and
// create share the exact same server-side computeCreditAccountPlan, so the
// numbers shown here can never drift from what actually gets persisted).
router.get('/credit-accounts/create', (req, res) => {
  res.render('creditaccounts/create');
});

// Detail page.
router.get('/credit-accounts/:id/view', (req, res) => {
  res.render('creditaccounts/view', { id: req.params.id });
});

module.exports = router;
