const express = require('express');
const router = express.Router();
const { requireRole } = require('../../middleware/auth.middleware');
const { VIEW_BACK_OFFICE, VIEW_CUSTOMERS_ACCOUNTS } = require('../../middleware/roleGroups');

// Basic page routes for modules that don't have full CRUD web pages yet
// (they're either placeholder pages or only have a JSON API so far).
// Each just renders its index view inside the shared header/sidebar layout,
// matching the pattern used by customers.web.js.

// Vendor payments (outbound) are back-office, same as vendors/items.
router.get('/paymentsmade', requireRole(...VIEW_BACK_OFFICE), (req, res) => {
  res.render('paymentsmade/index');
});

// Customer payments are money coming in — same viewers as repayments.
router.get('/payments', requireRole(...VIEW_CUSTOMERS_ACCOUNTS), (req, res) => {
  res.render('payments/index');
});

module.exports = router;
