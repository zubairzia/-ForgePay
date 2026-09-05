const express = require('express');
const router = express.Router();

// Repayment entry flow — search/allocation-preview/post all happen
// client-side via fetch() against the /api/v1/credit-accounts/:id/repayments
// endpoints (preview and post share the exact same server-side
// computeAllocation, so the preview can never drift from what gets posted).
// Optional ?creditAccountId= pre-fills the account when deep-linked from the
// dashboard or a credit account's detail page.
router.get('/repayments/create', (req, res) => {
  res.render('repayments/create', { creditAccountId: req.query.creditAccountId || '' });
});

module.exports = router;
