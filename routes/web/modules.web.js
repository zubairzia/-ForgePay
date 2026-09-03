const express = require('express');
const router = express.Router();
const { requirePlan } = require('../../middleware/plan.middleware');

// Basic page routes for modules that don't have full CRUD web pages yet
// (they're either placeholder pages or only have a JSON API so far).
// Each just renders its index view inside the shared header/sidebar layout,
// matching the pattern used by customers.web.js.

// Procurement-side modules — gated behind the Pro plan. Irrelevant to a
// customer-lending SaaS buyer unless they also track their own suppliers.
router.get('/vendors', requirePlan('pro', 'Vendors'), (req, res) => {
  res.render('vendors/index');
});

router.get('/bills', requirePlan('pro', 'Bills'), (req, res) => {
  res.render('bills/index');
});

router.get('/purchaseorders', requirePlan('pro', 'Purchase Orders'), (req, res) => {
  res.render('purchaseorders/index');
});

router.get('/expenses', requirePlan('pro', 'Expenses'), (req, res) => {
  res.render('expenses/index');
});

router.get('/vendorcredits', requirePlan('pro', 'Vendor Credits'), (req, res) => {
  res.render('vendorcredits/index');
});

router.get('/invoices', (req, res) => {
  res.render('invoices/index');
});

router.get('/items', (req, res) => {
  res.render('items/index');
});

router.get('/paymentsmade', (req, res) => {
  res.render('paymentsmade/index');
});

router.get('/payments', (req, res) => {
  res.render('payments/index');
});

router.get('/creditnotes', (req, res) => {
  res.render('creditnotes/index');
});

module.exports = router;
